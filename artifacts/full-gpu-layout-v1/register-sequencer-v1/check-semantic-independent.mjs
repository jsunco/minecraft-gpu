// Independent semantic review only. No constructors/native calls or author writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {step,checkMicroprogram} from './microprogram.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
const d=read('next-state/design.json'),matrix=read('microdecode/design.json');
function next(s,a,b,r,q,k){switch(s){case 4:return a===15?5:3;case 9:return a===12?10:6;case 12:return 30;case 19:return r?19:20;case 20:return q?(k===1?21:k===2?27:10):20;case 26:case 29:return 10;case 30:return b?13:31;case 31:return q?31:20;default:return s+1;}}
let transitions=0;
for(let s=0;s<32;s++)for(let a=0;a<16;a++)for(let b=0;b<2;b++)for(let r=0;r<2;r++)for(let q=0;q<2;q++)for(let k=0;k<4;k++){
 const input={is_12:+(a===12),is_15:+(a===15),boot:b,reset_request:r,event_request:q,event_kind_0:k&1,event_kind_1:k>>1};
 for(const [name,states]of Object.entries(matrix.groups))input[name]=+states.includes(s);
 let actual=0;for(const row of d.rows)if(row.gates.every(g=>input[g.name]===g.wanted))for(const bit of row.bits)actual|=1<<bit;
 for(let bit=0;bit<5;bit++)if(input['fixed_next_'+bit])actual|=1<<bit;
 assert.equal(actual,next(s,a,b,r,q,k));
 const got=step(s,!!b,a,{lanes:0,reset:!!r,req:!!q,kind:k,rs:0,rt:0,rd:0,reg_write:false});assert.equal(got.state,actual);
 assert.equal(got.boot,s===0?true:s===19?false:!!b);
 assert.equal(got.address,[0,5].includes(s)?0:s===4?(a+1)&15:s===9&&a!==12?(a+1)&15:a);transitions++;
}
const initial=()=>Array.from({length:4},(_,lane)=>({regs:Array.from({length:16},(_,r)=>r===14?4:r===15?lane:(17+23*r+41*lane)&255),A:0xa0+lane,B:0xb0+lane}));
function apply(memory,a,blockId,wb){for(let lane=0;lane<4;lane++){const m=memory[lane];
 if(a.capture_a[lane])m.A=m.regs[a.ra];if(a.capture_b[lane])m.B=m.regs[a.ra];
 if(a.we[lane]&&a.wa<13)m.regs[a.wa]=a.fill_ones?255:a.pass_wb?wb[lane]:0;
 if(a.assign[lane])m.regs[13]=a.fill_block?255:a.pass_block?blockId:0;
}}
let events=0,readPairs=0;
function event(kind,lanes,rd,reg_write,rs,rt){
 const memory=initial(),expected=structuredClone(memory),blockId=0x96,wb=[0x31,0x72,0xb3,0xf4];
 // Direct nonblocking RTL event oracle: read original register array before R13
 // refresh; protected addresses ignore writeback; disabled lanes keep all data.
 for(let lane=0;lane<4;lane++)if(lanes>>lane&1){const m=expected[lane];
  if(kind===1){m.A=m.regs[rs];m.B=m.regs[rt];}
  if(kind===2&&reg_write&&rd<13)m.regs[rd]=wb[lane];m.regs[13]=blockId;
 }
 let s=20,b=false,a=0,visits=0;const actionOrder=[];
 const i={kind,lanes,rd,reg_write,rs,rt,reset:false,req:true};
 while(s!==31){assert(visits++<20);const v=step(s,b,a,i);if(v.actions.capture_a.some(Boolean))actionOrder.push('A');if(v.actions.capture_b.some(Boolean))actionOrder.push('B');if(v.actions.assign.some(Boolean))actionOrder.push('R13');apply(memory,v.actions,blockId,wb);({state:s,boot:b,address:a}=v);}
 assert.deepEqual(memory,expected);if(kind===1&&lanes)assert.deepEqual(actionOrder,['A','B','R13']);
 const hold=step(31,b,a,i);assert.equal(hold.state,31);assert.equal(hold.actions.ack,true);assert(!hold.actions.we.some(Boolean));assert(!hold.actions.assign.some(Boolean));
 assert.equal(step(31,b,a,{...i,req:false}).state,20);events++;
}
for(let kind=0;kind<3;kind++)for(let lanes=0;lanes<16;lanes++)for(let rd=0;rd<16;rd++)for(const wr of [false,true])event(kind,lanes,rd,wr,13,13);
for(let rs=0;rs<16;rs++)for(let rt=0;rt<16;rt++)for(let lanes=0;lanes<16;lanes++){event(1,lanes,12,true,rs,rt);readPairs++;}
let resetVisits=null;
for(let lanes=0;lanes<16;lanes++){
 const memory=initial();let s=0,b=false,a=7;const trace=[];const i={lanes,reset:true,req:false,kind:0,rs:13,rt:13,rd:15,reg_write:false};
 while(s!==19){assert(trace.length<120);const v=step(s,b,a,i);trace.push({s,a,...v.actions});apply(memory,v.actions,0xff,[255,255,255,255]);({state:s,boot:b,address:a}=v);}
 assert.equal(trace.length,98);resetVisits=trace.length;
 assert.deepEqual(trace.filter(v=>v.s===3).map(v=>v.ra),Array.from({length:16},(_,i)=>i));
 assert.deepEqual(trace.filter(v=>v.s===7).map(v=>v.wa),Array.from({length:13},(_,i)=>i));
 for(let lane=0;lane<4;lane++)assert.deepEqual(memory[lane],{regs:[...Array(14).fill(0),4,lane],A:0,B:0});
 assert.equal(step(19,b,a,i).state,19);assert.equal(step(19,b,a,{...i,reset:false}).state,20);
}
const author=checkMicroprogram();assert.equal(author.reset_state_visits,98);assert.equal(author.event_combinations,1536);
console.log(JSON.stringify({status:'independent_semantic_checks_passed',conditional_transitions:transitions,event_runs:events,all_read_address_pairs_across_lane_masks:readPairs,reset_lane_masks:16,reset_state_visits:resetVisits,native_calls:0,geometry_contact_review:false}));
