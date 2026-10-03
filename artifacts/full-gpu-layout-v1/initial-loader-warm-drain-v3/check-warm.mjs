// Settled ordering counterexamples only; no native timing or simulated GPU.
import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{evaluate,INPUTS}from'./logic/terms.mjs';
const base=()=>({...Object.fromEntries(INPUTS.map(n=>[n,false])),cold_initialized:true,image_verified:true});let cases=0;
for(const marker of[true,false]){
 let v={...base(),image_verified:marker,load_request:true};
 // A core already accepted an instruction whose memory request has no owner yet.
 assert(evaluate(v).core_reset_request);assert(!evaluate(v).start_admitted);
 assert(!evaluate(v).runtime_block,'LOAD must permit pending allocation before core retirement');assert(!evaluate(v).owner_set);cases++;
 // Once that transaction completes, real global admission-close can assert.
 v={...v,cores_held_reset:true,global_channels_drained:true,program_drained:true,memory_admission_block:true};
 assert(evaluate(v).runtime_block&&evaluate(v).owner_set);cases++;
 // Retained loader ownership survives LOAD withdrawal and a real bank tail.
 v={...v,owner:true,load_request:false,memory_admission_block:false,bank2_busy:true};
 assert(evaluate(v).ram_grant&&evaluate(v).runtime_block&&!evaluate(v).owner_clear);cases++;
 v.bank2_busy=false;assert(evaluate(v).owner_clear);cases++;
}
for(const load of[false,true])for(const reset of[false,true]){
 const v={...base(),load_request:load,raw_reset:reset,image_verified:false};
 assert(!evaluate(v).runtime_block,'Manual marker/reset request cannot strand accepted work');assert(!evaluate(v).start_admitted);cases++;
 v.memory_admission_block=true;assert(evaluate(v).runtime_block);cases++;
}
for(const n of['owner','boot','memory_admission_block']){const v={...base(),[n]:true};assert(evaluate(v).runtime_block);cases++;}
assert(evaluate({...base(),cold_initialized:false}).runtime_block);cases++;
assert(!evaluate({...base(),raw_start:true,image_verified:false}).start_admitted);assert(evaluate({...base(),raw_start:true}).start_admitted);cases+=2;
const report={status:'settled_warm_load_and_manual_marker_ordering_checks_passed',cases,accepted_preallocation_request_not_cancelled:true,owned_loader_grant_held_until_actual_tail_clear:true,marker_affects_start_not_memory:true,native_calls:0,limits:'Global state progression, actual admission-close witness and propagation/closure timing are separate physical obligations.'};
if(process.argv.includes('--save'))writeFileSync(new URL('warm-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
