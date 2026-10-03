import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {definition,evaluate} from './logic.mjs';
import {checkMatrix} from '../control-lsu-v2/check-matrix.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
const def=definition(),matrix=makeMatrix(def),matrixChecks=checkMatrix(matrix),key=p=>`${p.x},${p.y},${p.z}`,map=new Map(matrix.blocks.map(b=>[key(b.position),b.block]));
for(const p of matrix.products)for(const gate of p.gates){const c=map.get(key(gate.comparator)),side=map.get(key(gate.mask));assert.equal(c.id,'minecraft:comparator');assert.equal(c.properties.mode,'subtract');assert.equal(c.properties.facing,'west');assert.equal(side.id,'minecraft:repeater');assert.equal(side.properties.facing,'north');}
let cases=0;
for(let bits=0;bits<2**def.inputs.length;bits++){
 const v=Object.fromEntries(def.inputs.map((n,i)=>[n,!!(bits&2**i)]));
 const live=!v.initialize&&!v.release_complete;
 const boundary=v.idle||v.done||(v.update&&v.commit_complete)||v.abort_safe;
 const roundTrip=v.idle_mask_arrived&&v.update_mask_arrived;
 const expected={pending_D:live&&(v.reset_request||v.pending),candidate_D:live&&v.pending&&roundTrip&&boundary,parked_D:live&&v.pending&&(v.parked||(v.candidate&&roundTrip&&boundary)),entry_mask:v.reset_request||v.pending||v.initialize,service_ready:!v.initialize&&!v.release_complete&&v.pending&&v.parked&&roundTrip&&v.program_quiet&&!v.program_ready&&v.rf_quiet&&v.lsu_quiet};
 assert.deepEqual(evaluate(v),expected);
 // Independent settled interpretation of the physical subtract gates and
 // positive two-inversion-per-level OR towers; no Minecraft scheduler model.
 const actual={};for(const out of def.outputs)actual[out]=matrix.products.filter(p=>p.outputs.includes(out)).some(p=>p.gates.every(g=>{const inhibit=g.want?!v[g.name]:v[g.name];return Math.max(0,15-15*inhibit)>0;}));
 assert.deepEqual(actual,expected);cases++;
}
let coldPairs=0;const transfer=(s,phase,initialize)=>phase==='A'?{...s,next:initialize?0:s.current}:{...s,current:s.next};
for(let current=0;current<8;current++)for(let next=0;next<8;next++)for(const phases of [['A','B'],['B','A','B']]){let s={current,next};for(const phase of phases)s=transfer(s,phase,true);assert.deepEqual(s,{current:0,next:0});coldPairs++;}
assert.equal(transfer({current:0,next:7},'B',true).current,7,'B before initialized A copies old NEXT');
let traces=0;
for(const initial of [0,1,2,3,4,5,6,7]){
 let state={pending:!!(initial&1),candidate:!!(initial&2),parked:!!(initial&4)};
 const tick=v=>{const r=evaluate({...state,...v});state={pending:r.pending_D,candidate:r.candidate_D,parked:r.parked_D};return r;};
 const base={reset_request:false,release_complete:false,initialize:true,idle:true,done:false,update:false,commit_complete:false,idle_mask_arrived:true,update_mask_arrived:true,abort_safe:false,program_quiet:true,program_ready:false,rf_quiet:true,lsu_quiet:true};
 tick(base);assert.deepEqual(state,{pending:false,candidate:false,parked:false});
 tick({...base,initialize:false,reset_request:true});assert.equal(state.pending,true);assert.equal(state.parked,false);
 tick({...base,initialize:false});assert.equal(state.candidate,true);assert.equal(state.parked,false);
 tick({...base,initialize:false});assert.equal(state.parked,true);assert.equal(tick({...base,initialize:false}).service_ready,true);
 for(const name of ['program_quiet','rf_quiet','lsu_quiet','idle_mask_arrived','update_mask_arrived'])assert.equal(evaluate({...base,initialize:false,...state,[name]:false}).service_ready,false);
 assert.equal(evaluate({...base,initialize:false,...state,program_ready:true}).service_ready,false);
 tick({...base,initialize:false,release_complete:true});assert.deepEqual(state,{pending:false,candidate:false,parked:false});traces++;
}
// Losing a boundary during the second observation must not park. A mask return
// being high alone also cannot prove instruction retirement.
for(const name of ['idle_mask_arrived','update_mask_arrived','commit_complete']){const v={pending:true,candidate:true,parked:false,update:true,idle:false,done:false,initialize:false,release_complete:false,idle_mask_arrived:true,update_mask_arrived:true,commit_complete:true,[name]:false};assert.equal(evaluate(v).parked_D,false);}
assert.equal(evaluate({pending:true,candidate:true,idle_mask_arrived:true,update_mask_arrived:true}).parked_D,false);
const result={status:'author_reset_retirement_logic_and_physical_matrix_checks',matrix_checks:matrixChecks,settled_cases:cases,physical_products:matrix.products.length,unknown_current_next_initialized_pairs:coldPairs,unknown_entry_initialize_and_rearm_traces:traces,missing_guard_refusals:6,boundary_or_return_refusals:4,native_acceptance:false,limits:['Two observations assume complete actual A-close-B-close transfer and source/decoder setup margins; they are not a measured wait.','service_ready is a staging permission only; absent quiet/abort/release producers remain explicit physical inputs.']};
if(process.argv.includes('--save'))writeFileSync(new URL('logic-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
