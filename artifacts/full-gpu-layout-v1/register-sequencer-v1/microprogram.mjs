// Offline semantic design of the physical register microsequencer, not runtime.
// Used to define next-state PLA and tests; it is forbidden as the running GPU.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const STATES=['INIT','PRIME_FF','PRIME_ZERO','SWEEP_SELECT','SWEEP_ADVANCE','CLEAR_ADDRESS','ZERO_SELECT','ZERO_OPEN','ZERO_CLOSE','ZERO_ADVANCE','ASSIGN_SELECT','ASSIGN_OPEN','ASSIGN_CLOSE','RESET_A_SELECT','RESET_A_OPEN','RESET_A_CLOSE','RESET_B_SELECT','RESET_B_OPEN','RESET_B_CLOSE','RESET_ACK','IDLE','A_SELECT','A_OPEN','A_CLOSE','B_SELECT','B_OPEN','B_CLOSE','WB_SELECT','WB_OPEN','WB_CLOSE','ASSIGN_FINISH','EVENT_ACK'];
export const KINDS={OTHER:0,REQUEST:1,UPDATE:2};
export function step(state,boot,address,i){
 assert(Number.isInteger(state)&&state>=0&&state<32);assert(Number.isInteger(address)&&address>=0&&address<16);
 const enabled=Array.from({length:4},(_,b)=>!!(i.lanes>>b&1));let next=state+1,counter=address,bootNext=boot;
 const a={ra:0,wa:0,pass_wb:false,fill_ones:false,pass_block:false,fill_block:false,we:[false,false,false,false],assign:[false,false,false,false],capture_a:[false,false,false,false],capture_b:[false,false,false,false],ack:false,reset_ack:false};
 // All action outputs are additionally blanked outside the stable phaseA
 // window by physical gates. This function specifies their decoded intent only.
 if(state===0){counter=0;bootNext=true;}
 if(state===1){a.fill_ones=true;a.fill_block=true;}
 if([3,4].includes(state))a.ra=address;
 if(state===4){if(address===15){counter=0;next=5;}else{counter=(address+1)&15;next=3;}}
 if(state===5)counter=0;
 if([6,7,8,9].includes(state))a.wa=address;
 if(state===7)a.we.fill(true);
 if(state===9){if(address===12)next=10;else{counter=(address+1)&15;next=6;}}
 if([10,11,12,30].includes(state))a.pass_block=!boot;
 if(state===11)a.assign=boot?[true,true,true,true]:enabled;
 if(state===12)next=30;
 if(state===14)a.capture_a.fill(true);
 if(state===17)a.capture_b.fill(true);
 if(state===19){a.reset_ack=true;next=i.reset?19:20;bootNext=false;}
 if(state===20){next=!i.req?20:i.kind===KINDS.REQUEST?21:i.kind===KINDS.UPDATE?27:10;}
 if([21,22,23].includes(state))a.ra=i.rs;
 if(state===22)a.capture_a=enabled;
 if([24,25,26].includes(state))a.ra=i.rt;
 if(state===25)a.capture_b=enabled;
 if(state===26)next=10;
 if([27,28,29].includes(state)){a.wa=i.rd;a.pass_wb=true;}
 if(state===28)a.we=enabled.map(v=>v&&i.reg_write&&i.rd<13);
 if(state===29)next=10;
 if(state===30)next=boot?13:31;
 if(state===31){a.ack=true;next=i.req?31:20;}
 return{state:next,boot:bootNext,address:counter,actions:a};
}
export function checkMicroprogram(){
 const i={lanes:0,reset:true,req:false,kind:0,rs:13,rt:13,rd:0,reg_write:true};let state=0,boot=false,address=7;const trace=[];
 for(let n=0;n<200&&state!==19;n++){const row=step(state,boot,address,i);trace.push({state,name:STATES[state],address,...row.actions});({state,boot,address}=row);}
 assert.equal(state,19);assert.deepEqual(trace.filter(x=>x.state===3).map(x=>x.address),Array.from({length:16},(_,b)=>b));assert.deepEqual(trace.filter(x=>x.state===7).map(x=>x.wa),Array.from({length:13},(_,b)=>b));
 assert(trace.filter(x=>x.state===7).every(x=>x.we.every(Boolean)&&!x.pass_wb&&!x.fill_ones));assert.equal(trace.filter(x=>x.assign.some(Boolean)).length,1);assert.equal(trace.filter(x=>x.capture_a.some(Boolean)).length,1);assert.equal(trace.filter(x=>x.capture_b.some(Boolean)).length,1);
 assert.equal(step(19,true,address,{...i,reset:true}).state,19);assert.equal(step(19,true,address,{...i,reset:false}).state,20);
 let events=0;for(const kind of Object.values(KINDS))for(let lanes=0;lanes<16;lanes++)for(let rd=0;rd<16;rd++)for(const reg_write of[false,true]){
  let s=20,b=false,c=0;const seen=[];const input={...i,reset:false,req:true,kind,lanes,rd,reg_write};
  for(let n=0;n<40&&s!==31;n++){const row=step(s,b,c,input);seen.push({state:s,...row.actions});({state:s,boot:b,address:c}=row);}assert.equal(s,31);
  for(let lane=0;lane<4;lane++){const on=!!(lanes>>lane&1);assert.equal(seen.some(r=>r.capture_a[lane]),kind===KINDS.REQUEST&&on);assert.equal(seen.some(r=>r.capture_b[lane]),kind===KINDS.REQUEST&&on);assert.equal(seen.some(r=>r.we[lane]),kind===KINDS.UPDATE&&on&&reg_write&&rd<13);assert.equal(seen.some(r=>r.assign[lane]),on);}
  if(kind===KINDS.REQUEST){const a=seen.findIndex(r=>r.state===22),b=seen.findIndex(r=>r.state===25),r=seen.findIndex(r=>r.state===11);assert(a<b&&b<r,'A/B old-R13 snapshots precede assignment');}
  assert.equal(step(31,false,0,input).state,31);assert.equal(step(31,false,0,{...input,req:false}).state,20);events++;
 }
 return{status:'software_microprogram_ordering_check_only',states:32,storage_bits_current:10,storage_bits_with_next:20,reset_state_visits:trace.length,reset_read_addresses:16,reset_gpr_writes:13,event_combinations:events,reset_trace:trace,physical_microprogram_geometry:false,native_acceptance:false,missing:['Current/next20bits placement with real clock/capture routes.','5-bit state decode, conditional next-state/boot/address selects, counter increment, allaction qualification gates.','Initialization pulse, zero clamp, reset-request edge admission and worst-path stable/blank periods.','Data/address selectors, lane-enable fanout, actual13-word/all4lane reset routes and handshake producers.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const result=checkMicroprogram();writeFileSync(new URL('./microprogram-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,reset_trace:undefined}));}
