import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{checkMatrix}from'./logic/check-matrix.mjs';import{evaluate}from'./logic/terms.mjs';import{step,ID}from'../alu-control/microprogram.mjs';
const d=JSON.parse(readFileSync(new URL('design.json',import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,m=new Map(d.blocks.map(v=>[K(v.position),v.block])),V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
assert.equal(d.changes.length,7);let muxCases=0;
for(let i=0;i<5;i++){
 const c=d.changes[i],p=c.position;assert.equal(c.from.id,'minecraft:repeater');assert.deepEqual(m.get(K(p)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});assert.deepEqual(p,{x:1666,y:235+4*i,z:120});
 const q=d.scanPorts[i],comp={x:q.x,y:q.y,z:q.z+2};assert.deepEqual(m.get(K(comp)),{id:'minecraft:comparator',properties:{facing:'north',mode:'subtract'}});
 const col=d.columns[i];assert.equal((col.output_y-col.bottom)%4,1);
 for(let selected=0;selected<2;selected++)for(let normal=0;normal<2;normal++)for(let scan=0;scan<2;scan++){
  const normalPower=Math.max(0,15*normal-15*!selected),scanPower=Math.max(0,15*scan-15*selected);let high=scanPower>0;
  for(let y=col.bottom;y<col.top;y+=2)high=!high;
  assert.equal((normalPower>0)||high,!!(selected?normal:scan));muxCases++;
 }
}
let resetStates=0,orderedTransfers=0;
for(let bits=0;bits<16;bits++){
 let sn=!!(bits&1),s=!!(bits&2),an=!!(bits&4),a=!!(bits&8);
 const e=(init,ready,raw_A=true)=>evaluate({initialize:init,scan_ready:ready,selected:s,admitted:a,raw_A,reset_row0:true,reset_row1:false,reset_request:true,any_fault:true,normal_permit:false});
 // Held initialize reaches both DATA clamps before the full A-close-B-close transfer.
 let o=e(true,false);assert(o.initialize_hold&&!o.qualified_action_A);sn=o.select_data;an=o.admit_data;s=sn;a=an;assert(!s&&!a);orderedTransfers++;
 for(let scan=0;scan<33;scan++){o=e(false,false);assert(o.initialize_hold&&!o.qualified_action_A);sn=o.select_data;an=o.admit_data;s=sn;a=an;orderedTransfers++;}
 o=e(false,true);sn=o.select_data;an=o.admit_data;s=sn;a=an;assert(s&&!a);assert(e(false,true).initialize_hold);orderedTransfers++;
 o=e(false,true);sn=o.select_data;an=o.admit_data;s=sn;a=an;assert(s&&a);assert(!e(false,true).initialize_hold);assert(e(false,true).qualified_action_A,'RESET executes despite fault/reset request and normal_permit false');orderedTransfers++;
 assert(!evaluate({initialize:false,selected:s,admitted:a,raw_A:true,reset_row0:false,reset_row1:false,reset_request:true,any_fault:true,normal_permit:true}).qualified_action_A);
 assert(!e(true,true).qualified_action_A,'Reinitialize blanks even stale retained admission');resetStates++;
}
// Admission is IDLE-qualified. Once the retained macrostate accepts ownership,
// a permit drop cannot withdraw the held request or blank its normal steps.
let permitDropCases=0;
for(const [compare,arithmetic_mux]of[[false,0],[false,1],[false,2],[false,3],[true,1]]){
 let st={macro:ID.IDLE,phase:0,bit:0,round:0},request=true,permit=false,ack=false;
 const inp=()=>{const v=evaluate({raw_A:true,initialize:false,selected:true,admitted:true,idle:st.macro===ID.IDLE,normal_permit:permit,reset_request:false,any_fault:false});return{initialize:false,reset_request:false,any_fault:false,compare,arithmetic_mux,execute_request:request&&!v.request_inhibit,result_ack:ack,qualified:v.qualified_action_A};};
 for(let j=0;j<8;j++){assert(!inp().execute_request);st=step(st,inp());}assert.equal(st.macro,ID.IDLE);
 permit=true;for(let j=0;j<4;j++)st=step(st,inp());assert.equal(st.macro,ID.ACCEPT);permit=false;
 let n=0;while(st.macro!==ID.WAIT_ACK){assert(++n<10000);assert(inp().execute_request);assert(inp().qualified);st=step(st,inp());}
 for(let j=0;j<8;j++){st=step(st,inp());assert.equal(st.macro,ID.WAIT_ACK,'Permit drop alone never acknowledges');}
 request=false;ack=true;while(st.macro!==ID.IDLE){assert(++n<10000);st=step(st,inp());}
 request=true;ack=false;for(let j=0;j<8;j++){assert(!inp().execute_request);st=step(st,inp());assert.equal(st.macro,ID.IDLE);}permitDropCases++;
}
assert.deepEqual(m.get(K(d.requestRear)),{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
assert.deepEqual(m.get(K(d.requestMask)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
let requestTruth=0;for(let raw=0;raw<2;raw++)for(let idle=0;idle<2;idle++)for(let permit=0;permit<2;permit++){const mask=evaluate({initialize:false,selected:true,admitted:true,idle,normal_permit:permit}).request_inhibit;assert.equal(Math.max(0,15*raw-15*mask)>0,!!raw&&(!idle||!!permit));requestTruth++;}
const timing=JSON.parse(readFileSync(new URL('timing-obligations.json',import.meta.url)));assert.equal(timing.unit,'Minecraft game ticks');assert.equal(timing.numeric_bounds,null);assert.equal(timing.requirements.length,20);assert.equal(new Set(timing.requirements.map(v=>v.id)).size,20);for(const v of timing.requirements){assert.equal(v.established,false);assert.equal(v.relation,'>=');assert(v.lhs&&v.rhs);}for(const n of timing.phase_receivers)assert(d.connections.some(c=>c.name===n));
console.log(JSON.stringify({timing_requirements_unmeasured:timing.requirements.length,status:'authored_local_admission_settled_checks_passed',matrix:checkMatrix(),actual_macro_muxes:5,mux_truth_cases:muxCases,permit_drop_after_accept_modes:permitDropCases,request_mask_truth_cases:requestTruth,arbitrary_initial_barrier_states:resetStates,ordered_transfer_steps:orderedTransfers,actual_shared_scanner_reused:true,new_retained_bits:4,limits:['Ordered settled transfer model only. Initial pulse width, all physical closure/skew, scan dwell and decoder settling need separate measured verification.','The two shared phase qualifiers are factored from macro word columns; this is not evidence of a 128-combination native sweep.'],native_calls:0}));
