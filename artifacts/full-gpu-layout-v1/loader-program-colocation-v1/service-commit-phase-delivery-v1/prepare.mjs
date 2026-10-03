// Source semantics are classified before drawing any new wire.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {H,K,read,loadFrame,pins} from './frame.mjs';
import {inputs} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from '../../memory/fabric-colocation-v2/settled-network.mjs';
import {checkFeedback} from '../service-mask-memory-composition-v1/feedback.mjs';
const {world}=loadFrame({includeForeign:false}),endpoints=read('../service-active-witness-delivery-v1/endpoint-map.json'),recovered=read('../service-witness-input-bindings-v1/source-functions.json');
const selected=endpoints.pending_witness_bindings.filter(v=>v.role==='commit_phase'),records=[];
assert.equal(selected.length,4);
for(const binding of selected){
 const original=recovered.bindings.find(v=>v.name===binding.name),roots=binding.current_held_boundaries.map(v=>v.position),held=new Set(roots.map(K));
 const positions=backwardCone(world,binding.current_effective_source,roots),oldMap=new Map(original.current.cone.map(v=>[K(v.position),v]));
 assert.equal(positions.length,oldMap.size);
 for(const p of positions){const old=oldMap.get(K(p));assert(old);assert.deepEqual(world.get(K(p)),old.block);assert.deepEqual((held.has(K(p))?[]:inputs(world,p)).map(K).sort(),old.inputs.map(K).sort());}
 const ev=makeSettledEvaluator(world,positions,roots),cases=[];
 for(let phase=0;phase<=1;phase++){const v=ev(new Map([[K(roots[0]),15*phase]])),out=v.power.get(K(binding.current_effective_source))??0;assert.equal(out,phase*15);cases.push({open_response:phase,output:out});}
 assert.equal(world.get(K(binding.shared_current_producer))?.id,'minecraft:light_gray_concrete');
 assert.equal(binding.current_effective_source.x,binding.shared_current_producer.x);assert.equal(binding.current_effective_source.y,binding.shared_current_producer.y-1);assert.equal(binding.current_effective_source.z,binding.shared_current_producer.z);
 const fanout=[]; const source=binding.current_effective_source; for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++){const p={x:source.x+x,y:source.y+y,z:source.z+z};if(inputs(world,p).some(q=>K(q)===K(source)))fanout.push({position:p,block:world.get(K(p))});}assert.deepEqual(fanout.map(v=>K(v.position)).sort(),binding.current_direct_fanout.map(v=>K(v.position)).sort());
 for(const v of binding.current_direct_fanout){assert.deepEqual(world.get(K(v.position)),v.block);assert(inputs(world,v.position).some(p=>K(p)===K(binding.current_effective_source)));}
 const feedback={...checkFeedback(world,positions,roots),scope:'Actual positive local commit-phase tower from shared open_response; local inversion parity and existing !commit fanout retained. Phase timing and state transitions excluded.'};
 records.push({binding,original_function:original.original,current_source_cone:positions.map(p=>({position:p,block:world.get(K(p)),inputs:held.has(K(p))?[]:inputs(world,p)})),current_cases:cases,preserved_original_current_fanout:fanout,feedback});
}
const report={status:'four_actual_commit_phase_functions_checked_before_routing',base_cells:world.size,records,source_sha256:pins,limits:['Frozen prior source recovery pins the original full cold-source cones. Current cones are independently reread from the exact composed frame.','Held actual open_response source only; each distinct local positive torch tower remains required, with its actual physical delay obligation. No state transition, phase freshness or timing claim.']};
writeFileSync(new URL('source-functions.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,functions:records.length,current_cases:8,current_cone_vertices:records.reduce((n,r)=>n+r.current_source_cone.length,0)}));
