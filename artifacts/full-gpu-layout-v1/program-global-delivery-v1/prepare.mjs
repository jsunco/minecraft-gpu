// Bind the actual existing program quiet gate output to the actual global pad.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {H,read,K,pins,loadBase} from './frame.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate} from '../dispatch-external-bindings-v1/transport-functions.mjs';
const P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),write=(n,d)=>writeFileSync(new URL(n,H),JSON.stringify(d,null,2)+'\n');
const ledger=read('../dispatcher-service-colocation-v1/remaining-cuts.json'),bindings=read('../dispatch-external-bindings-v1/bindings.json'),scope=read('../dispatch-global-colocation-v1/reference-scope.json'),routes=read('../master-loader-control-routes-v1/design.json'),program=read('../program-service-composition-v1/source-functions.json'),ports=read('../program-service-composition-v1/endpoint-map.json'),bodyProof=read('../program-service-composition-v1/body-checks.json');
const b=bindings.incoming.find(r=>r.transfer_index===290);assert.equal(b.old_connection.name,'global_program_quiet');assert.equal(ledger.dispatch.transfers[290].status,'external_source_transfer_pending');
const original=b.old_connection,old=new Map([...scope.blocks,...scope.foreign_context].map(r=>[K(r.position),r.block]));
for(const r of routes.blocks){if(old.has(K(r.position)))assert.deepEqual(old.get(K(r.position)),r.block);old.set(K(r.position),r.block);}
const oldSource=original.source;assert.deepEqual(program.selected[0].source,oldSource);
const oldProgramScope=read('../loader-program-colocation-v1/reference-scope.json');
const actualSource=oldProgramScope.foreign_context.find(r=>K(r.position)===K(oldSource))??oldProgramScope.blocks.find(r=>K(r.position)===K(oldSource));assert(actualSource,'Original program source absent');old.set(K(oldSource),actualSource.block);
const owned=new Set(routes.blocks.filter(r=>active(r.block)).map(r=>K(r.position))),cone=new Set(),todo=[original.normalizer];
for(let i=0;i<todo.length;i++){const p=todo[i],k=K(p);if(k===K(oldSource)||cone.has(k))continue;assert(owned.has(k),'Foreign original source '+k);cone.add(k);todo.push(...inputs(old,p));}
const f=evaluate(old,cone).get(original.normalizer);assert.deepEqual(f,{roots:[oldSource],table:2});assert(inputs(old,original.destination).some(p=>K(p)===K(original.normalizer)));
const {world}=loadBase(),source=program.selected[0].new_source,target=ledger.dispatch.transfers[290].shared_retained_target;
assert.deepEqual(source,P(-529,-16,-197));assert.deepEqual(target,P(268,110,-576));assert.deepEqual(world.get(K(source)),actualSource.block);assert.deepEqual(world.get(K(target)),b.receiver.block);
assert.deepEqual(ports.program_ports.channel_quiet.bits.map(r=>r.position),[source]);
const selected={name:'program_quiet_to_global_sampler',source:oldSource,target:original.destination,immediate_source:original.normalizer,cut_source:original.normalizer,old_route_function:f,required_new_function:'positive_single_source',new_source:source,new_destination:target,transfer_index:290};
write('source-functions.json',{status:'actual_original_program_quiet_delivery_positive',selected:[selected],original_transport_vertices:cone.size,original_source_successors:[...cone].map(k=>P(...k.split(',').map(Number))).filter(p=>inputs(old,p).some(q=>K(q)===K(oldSource))),original_binding:b,actual_program_boundary_sources:bodyProof.actual_boundary_sources.map(p=>P(...p)),actual_program_gate_mutations:bodyProof.actual_gate_mutations.map(r=>({...r,position:P(...r.position)})),existing_loader_destination:program.selected[0].new_destination,actual_original_source_cell:actualSource,source_sha256:pins,limits:['The existing program quiet NOR3 is evaluated with actual ACTIVE/finaltail/resetblocked driver boundaries held; no producer state-transition or program controller proof.','This new cable binds only transfer290. Remaining program and global cuts and phase timing remain explicit.']});
console.log(JSON.stringify({source,target,old_cone:cone.size,original_actual_source:actualSource.block,base_cells:world.size}));
