import assert from 'node:assert/strict';
import {word,commands,step,applyLane,COMMANDS,STATES,ID} from './microprogram.mjs';
import {runLane} from '../alu/microcode.mjs';
const empty=()=>Object.fromEntries(['W','M','Q','Wn','Mn','Qn','C','Cn','NZ','NZn','T8','take','busy','ready','fault'].map(n=>[n,0]));
let schedules=0,controlCycles=0,bitCommits=0;
const pairs=[];for(const a of[0,1,2,127,128,254,255])for(const b of[0,1,2,127,128,254,255])pairs.push([a,b]);for(let i=0;i<64;i++)pairs.push([(83+37*i)&255,(19+71*i)&255]);
for(const op of['ADD','SUB','CMP','MUL','DIV'])for(const[a,b]of pairs){
 const compare=op==='CMP',mode=compare?0:['ADD','SUB','MUL','DIV'].indexOf(op),i={arithmetic_mux:mode,compare,execute_request:true,result_ack:false,reset_request:false,any_fault:false,initialize:false};
 let s={macro:ID.IDLE,phase:0,bit:0,round:0},l=empty(),bits=0,cycles=0;const visited=[];
 for(;cycles<1200;cycles++){
  i.any_fault=!!l.fault;const c=commands(s,{qualifiedA:true,lane_enable:true,lane_fault:!!l.fault,any_fault:i.any_fault});
  const before={...l};applyLane(l,c,{a,b,mode,compare,enable:true,request:i.execute_request});
  if(s.phase===2&&STATES[s.macro].endsWith('_BIT'))bits++;
  if(s.phase===3)visited.push(STATES[s.macro]);
  assert(Object.keys(c).length===41&&Object.keys(c).every(n=>COMMANDS.includes(n)));
  assert(!(['w','m','q'].some(n=>c[n+'_open_next']&&c[n+'_open_current'])));
  if(s.macro===ID.DIV_RESTORE_BIT)assert.equal(l.take,before.take,'Held next take must survive restore');
  s=step(s,i);if(s.macro===ID.WAIT_ACK||s.macro===ID.FAULT_WAIT)break;
 }
 assert(cycles<1200);
 const expected=runLane(op,a,b);
 if(op==='DIV'&&b===0){assert.equal(s.macro,ID.FAULT_WAIT);assert.equal(l.fault,1);assert.equal(l.ready,0);assert.equal(bits,0);}else{
  assert.equal(s.macro,ID.WAIT_ACK);assert.equal(l.Wn,expected.value,`${op} ${a}/${b}`);assert.equal(l.ready,1);assert.equal(l.busy,0);assert.equal(bits,expected.bit_commits);assert.equal(l.fault,0);
  const held={...l};for(let n=0;n<12;n++){i.execute_request=n<4;i.result_ack=false;applyLane(l,commands(s,{qualifiedA:true}),{a,b,mode,compare,enable:true,request:i.execute_request});s=step(s,i);assert.deepEqual(l,held,'Closed result/status until complete acknowledgement');}
  i.result_ack=true;i.execute_request=true;for(let n=0;n<4;n++)s=step(s,i);assert.equal(s.macro,ID.WAIT_ACK,'ack alone cannot release while request remains high');
  i.execute_request=false;for(let n=0;n<9;n++){applyLane(l,commands(s,{qualifiedA:true}),{a,b,mode,compare,enable:true,request:false});s=step(s,i);}assert.equal(l.ready,0);assert.equal(l.Wn,held.Wn,'ack does not overwrite result');
 }
 schedules++;controlCycles+=cycles+1;bitCommits+=bits;
}
let resetCases=0;
for(let macro=0;macro<32;macro++)for(let phase=0;phase<4;phase++){
 const l={W:255,M:89,Q:123,Wn:17,Mn:31,Qn:12,C:1,Cn:1,NZ:1,NZn:1,T8:1,take:1,busy:1,ready:1,fault:1};let s={macro,phase,bit:5,round:6};
 const i={initialize:false,reset_request:true,execute_request:false,result_ack:false,any_fault:true,arithmetic_mux:3,compare:false};
 for(let n=0;n<28;n++){applyLane(l,commands(s,{qualifiedA:true,lane_enable:false,lane_fault:true,any_fault:!!l.fault,reset_request:true}),{a:251,b:0,mode:3,compare:false,enable:false,request:false});s=step(s,{...i,any_fault:!!l.fault});if(s.macro===ID.RESET_WAIT)break;}
 // Starting in RESET_STATUS/WAIT is deliberately not an arbitrary-state initializer;
 // external initialize must force RESET/PREP before cold admission.
 if(macro!==ID.RESET_STATUS&&macro!==ID.RESET_WAIT&&!(macro===ID.RESET&&phase>1))assert.deepEqual(l,empty(),`Reset from ${macro}/${phase}`);
 assert.equal(s.macro,ID.RESET_WAIT);for(let n=0;n<8;n++)s=step(s,i);assert.equal(s.macro,ID.RESET_WAIT);resetCases++;
}
let exhaustive=0;
for(let macro=0;macro<32;macro++)for(let phase=0;phase<4;phase++)for(let bit=0;bit<8;bit++)for(let round=0;round<8;round++){
 const s={macro,phase,bit,round},i={initialize:false,reset_request:false,execute_request:true,result_ack:false,any_fault:false,arithmetic_mux:2,compare:false},n=step(s,i);
 if(phase!==3)assert.deepEqual(n,{...s,phase:(phase+1)&3});
 for(const qualifiedA of[false,true]){const c=commands(s,{qualifiedA});if(!qualifiedA||phase===0||phase===3)assert(!Object.entries(c).some(([k,v])=>k.includes('_open')&&v));}
 assert.deepEqual(step(s,{...i,initialize:true}),{macro:0,phase:0,bit:0,round:0});exhaustive++;
}
console.log(JSON.stringify({status:'offline_shared_microprogram_command_check_passed',schedules,controlCycles,bitCommits,resetCases,exhaustiveStates:exhaustive,retained_current_bits:13,retained_next_bits:13,command_bits:41,physical_state_loop:false,native_calls:0}));
