// Retained ACTIVE identity and current physical fanout before new geometry.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {H,K,read,loadFrame,pins} from './frame.mjs';
import {inputs} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from '../../memory/fabric-colocation-v2/settled-network.mjs';
import {checkFeedback} from '../service-mask-memory-composition-v1/feedback.mjs';
const {world}=loadFrame(),endpoints=read('../service-payload-open-delivery-v1/endpoint-map.json'),recovered=read('../service-witness-input-bindings-v1/source-functions.json'),state=read('../../memory/fabric-colocation-v2/active-busy-body.json');
const selected=endpoints.pending_witness_bindings.filter(v=>v.role==='active'),records=[];
assert.equal(selected.length,4);
for(const binding of selected){
 const prior=recovered.bindings.find(v=>v.name===binding.name),roots=binding.current_held_boundaries.map(v=>v.position),held=new Set(roots.map(K));
 assert.equal(roots.length,1);assert.equal(binding.current_held_boundaries[0].role,'retained_ACTIVE_Q');
 const source=binding.shared_current_producer,identity=state.blocks.find(v=>K(v.position)===K(source));assert(identity);
 assert.deepEqual(identity.original_position,prior.original.roots[0].position);assert.deepEqual(world.get(K(source)),identity.block);
 const positions=backwardCone(world,source,roots),oldMap=new Map(prior.current.cone.map(v=>[K(v.position),v]));assert.equal(positions.length,oldMap.size);
 for(const p of positions){const old=oldMap.get(K(p));assert(old);assert.deepEqual(world.get(K(p)),old.block);assert.deepEqual((held.has(K(p))?[]:inputs(world,p)).map(K).sort(),old.inputs.map(K).sort());}
 const ev=makeSettledEvaluator(world,positions,roots),cases=[];
 for(let bit=0;bit<2;bit++){const v=ev(new Map([[K(roots[0]),15*bit]]));assert.equal(v.power.get(K(source))??0,bit*15);cases.push({retained_ACTIVE_Q:bit,output:v.power.get(K(source))??0});}
 const fanout=[];for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++){const p={x:source.x+x,y:source.y+y,z:source.z+z};if(inputs(world,p).some(q=>K(q)===K(source)))fanout.push({position:p,block:world.get(K(p))});}
 for(const v of binding.current_direct_fanout){assert.deepEqual(world.get(K(v.position)),v.block);assert(fanout.some(r=>K(r.position)===K(v.position)));}
 const feedback={...checkFeedback(world,positions,roots),scope:'Retained ACTIVE-Q is the explicit state boundary. The intentionally retained SR latch and its transitions are outside this observation proof.'};
 records.push({binding,retained_state_identity:identity,original_function:prior.original,current_source_cone:positions.map(p=>({position:p,block:world.get(K(p)),inputs:held.has(K(p))?[]:inputs(world,p)})),current_cases:cases,actual_current_fanout:fanout,feedback});
}
const report={status:'four_actual_retained_ACTIVE_observations_prepared_before_routing',base_cells:world.size,records,source_sha256:pins,limits:['The original exported solid/torch tower is not assumed present. Use the actual mapped positive Q wire and preserve its entire existing fanout.','ACTIVE-Q is intentional retained state. Held observation checks do not validate SR transitions, clear priority, loading/reset timing or native behavior.','Current active memory/root occupied-row snapshots must be added before routing.']};
writeFileSync(new URL('source-functions.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,source_functions:records.length,cases:8,state_identities:4,actual_fanout_receivers:records.reduce((n,r)=>n+r.actual_current_fanout.length,0)}));
