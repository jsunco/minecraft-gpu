// Recover the original quiet transport and compare real translated placements.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadBase,read,pins,H,ROOT,K} from './frame.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate} from '../dispatch-external-bindings-v1/transport-functions.mjs';
const P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),write=(n,d)=>writeFileSync(new URL(n,H),JSON.stringify(d,null,2)+'\n');
const parent=read('../dispatch-global-colocation-v8-dcr-cold-v1/connected-candidate.json'),bindings=read('../dispatch-external-bindings-v1/bindings.json'),ledger=read('../dispatch-global-colocation-v8-dcr-cold-v1/remaining-ledger.json');
assert.equal(parent.blocks.length,202786);
const binding=bindings.incoming.find(r=>r.old_connection?.name==='global_channel_quiet');assert(binding);assert.equal(binding.transfer_index,291);assert.equal(ledger.transfers[291].status,'external_source_transfer_pending');
const scope=read('../dispatch-global-colocation-v1/reference-scope.json'),oldRoutes=read('../master-loader-control-routes-v1/design.json'),oldLoader=read('../loader-program-colocation-v1/service-quiet-inventory-v1/reference-scope.json');
const old=new Map([...scope.blocks,...scope.foreign_context].map(r=>[K(r.position),r.block]));
const original=binding.old_connection;
const exportProof=read('../loader-program-colocation-v1/service-quiet-inventory-v1/function-checks.json').output;
assert.deepEqual(exportProof.physical_output,original.source);
const matrixSource=exportProof.original_matrix_output;
const sourceCell=oldLoader.blocks.find(r=>K(r.position)===K(matrixSource));assert(sourceCell,'Actual original quiet matrix source absent');old.set(K(sourceCell.position),sourceCell.block);
const exportRows=oldLoader.blocks.filter(r=>r.group==='current/quiet_output_export');assert.equal(exportRows.length,176);
for(const r of exportRows)old.set(K(r.position),r.block);
for(const r of oldRoutes.blocks){if(old.has(K(r.position)))assert.deepEqual(old.get(K(r.position)),r.block);old.set(K(r.position),r.block);}
const owned=new Set([...oldRoutes.blocks,...exportRows].filter(r=>active(r.block)).map(r=>K(r.position))),selectedCone=new Set(),todo=[original.normalizer];
for(let i=0;i<todo.length;i++){const p=todo[i],k=K(p);if(k===K(matrixSource)||selectedCone.has(k))continue;assert(owned.has(k),'Foreign original cable dependency '+k);selectedCone.add(k);todo.push(...inputs(old,p));}
const oldFunction=evaluate(old,selectedCone).get(original.normalizer);assert.deepEqual(oldFunction,{roots:[matrixSource],table:2});assert(inputs(old,original.destination).some(p=>K(p)===K(original.normalizer)));
const {world}=loadBase(),reservation=read('memory-address1-reservation.json');
for(const r of reservation.blocks){assert(!world.has(K(r.position)));world.set(K(r.position),r.block);}
const shared=read('../loader-program-colocation-v1/service-owner-open-delivery-v1/remaining-cuts.json').quiet_fanout;
const source=shared.shared_matrix_source;assert.deepEqual(source,P(252,36,-171));assert.equal(world.get(K(source)).id,'minecraft:redstone_wire');
const mapped=read('../loader-program-colocation-v1/service-quiet-colocation-v1/endpoint-map.json').mapping.find(r=>K(r.original)===K(matrixSource));assert(mapped);assert.deepEqual(A(mapped.current,P(-160,-32,-176)),source);assert.deepEqual(mapped.block,world.get(K(source)));
const offsets=[];for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++)if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<=2)offsets.push(P(dx,dy,dz));
const options=[];for(const z of [-512,-560,-608,-656,-704])for(const x of [-256,-128,0,128,256])for(const y of [-64,-32,-16]){
 const t=P(x,y,z),dst=A(binding.receiver.position,t),score=Math.abs(source.x-dst.x)+Math.abs(source.y-dst.y)+Math.abs(source.z-dst.z);options.push({translation:t,quiet_manhattan:score});
}
options.sort((a,b)=>a.quiet_manhattan-b.quiet_manhattan);let chosen;
for(const option of options){let refusal;
 for(const r of parent.blocks){const p=A(r.position,option.translation);for(const o of offsets)if(world.has(K(A(p,o)))){refusal={new_position:p,existing_position:A(p,o)};break;}if(refusal)break;}
 option.clearance_result=refusal?{status:'refused_conservative_two_step_neighborhood',...refusal}:{status:'clear_actual_rows_and_two_step_neighborhood'};
 if(!refusal){chosen=option;break;}
}
assert(chosen,'No provisional legal translated instance');
const blocks=parent.blocks.map(r=>({position:A(r.position,chosen.translation),block:r.block,local_position:r.position,body:r.body}));
const destination=A(binding.receiver.position,chosen.translation);
const selected={name:'service_quiet_to_global_sampler',source:matrixSource,original_export_source:original.source,target:original.destination,immediate_source:original.normalizer,cut_source:original.normalizer,old_route_function:oldFunction,required_new_function:'positive_single_source',new_source:source,new_destination:destination,transfer_index:291};
write('placement-alternatives.json',{options,chosen,limits:['The score compares this one real quiet connection; complete core/master routes are not priced or selected by this placement heuristic.','Actual full instance cells are retained. Final complete-input/support checks and full routed cost remain necessary.']});
write('placement.json',{status:'provisional_exact_dispatcher_global_translation_pending_quiet_cable',translation:chosen.translation,blocks,parent_cells:202786,base_cells:1752880,reserved_address1_cells:reservation.blocks.length,source_sha256:pins});
write('source-functions.json',{status:'actual_original_quiet_delivery_positive',selected:[selected],original_transport_vertices:selectedCone.size,original_source_cell:sourceCell,current_source:source,current_destination:destination,original_binding:binding,source_sha256:pins,limits:['Only transport from the real existing quiet-matrix output is checked; the incomplete witness inputs and sequential sampler behavior remain unproved.','One provisional dispatcher instance does not select the full machine floorplan or resolve the other foreign boundaries.']});
console.log(JSON.stringify({translation:chosen.translation,source,destination,provisional_cells:1955666,reserved_cells:reservation.blocks.length,old_vertices:selectedCone.size,alternatives_tried:options.filter(o=>o.clearance_result).length}));
