// Recover original positive cables and actual bank-wide BUSY before inversion.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {H,read,pins,K,loadBase} from './frame.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate} from '../dispatch-external-bindings-v1/transport-functions.mjs';
const P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),write=(n,v)=>writeFileSync(new URL(n,H),JSON.stringify(v,null,2)+'\n');
const ledger=read('../program-global-delivery-v1/remaining-cuts.json'),bindings=read('../dispatch-external-bindings-v1/bindings.json'),scope=read('../dispatch-global-colocation-v1/reference-scope.json'),routes=read('../master-bank-quiet-routes-v1/design.json'),adapters=read('../master-bank-quiet-adapters-v1/design.json'),tail=read('../memory/fabric-colocation-v2/bank-tail-repaired-bodies.json'),classification=read('../memory/fabric-colocation-v2/bank-tail-classification.json');
const old=new Map([...scope.blocks,...scope.foreign_context].map(r=>[K(r.position),r.block]));
for(const r of [...adapters.blocks,...routes.blocks]){if(old.has(K(r.position)))assert.deepEqual(old.get(K(r.position)),r.block);old.set(K(r.position),r.block);}
const owned=new Set(routes.blocks.filter(r=>active(r.block)).map(r=>K(r.position))),{world}=loadBase(),translation=P(0,-8,40),adapterRows=adapters.blocks.map(r=>({...r,position:A(r.position,translation),part:'original_bank_quiet_adapter'})),selected=[],sources=[];
assert.equal(adapterRows.length,32);for(const r of adapterRows)assert(!world.has(K(r.position)),'Adapter collision '+K(r.position));
for(let bank=0;bank<4;bank++){
 const index=[292,293,295,296][bank],binding=bindings.incoming.find(r=>r.transfer_index===index),c=binding.old_connection,adapter=adapters.adapters[bank];assert.equal(ledger.dispatch.transfers[index].status,'external_source_transfer_pending');assert.deepEqual(adapter.destination,c.source);
 const cone=new Set(),todo=[c.normalizer];for(let i=0;i<todo.length;i++){const p=todo[i],k=K(p);if(k===K(c.source)||cone.has(k))continue;assert(owned.has(k),'Foreign old source '+k);cone.add(k);todo.push(...inputs(old,p));}
 const f=evaluate(old,cone).get(c.normalizer);assert.deepEqual(f,{roots:[c.source],table:2});assert(inputs(old,c.destination).some(p=>K(p)===K(c.normalizer)));
 const busy=tail.tailPorts.bank_busy_any.positions[bank],originalBusy=tail.tailPorts.bank_busy_any.original_positions[bank];assert.deepEqual(originalBusy,adapter.source);assert.deepEqual(busy,A(originalBusy,translation));assert.equal(world.get(K(busy)).id,'minecraft:redstone_wire');
 const quiet=A(adapter.destination,translation),target=ledger.dispatch.transfers[index].shared_retained_target;assert.deepEqual(world.get(K(target)),binding.receiver.block);
 const record=classification.rows[bank];assert.deepEqual(record.outputs[0],busy);const actualRoots=record.sources.slice(0,3);assert.deepEqual(actualRoots.map(r=>r.name),['active','tail','reset']);for(const r of actualRoots)assert(active(world.get(K(r.position))),'Missing real bank status '+K(r.position));
 const currentAdapter=Object.fromEntries(Object.entries(adapter).map(([k,v])=>[k,v&&typeof v==='object'&&'x' in v?A(v,translation):v]));sources.push({bank,busy,quiet,actual_status_sources:actualRoots,adapter:currentAdapter});
 selected.push({name:'bank_'+bank+'_quiet_to_global_sampler',bank,transfer_index:index,source:c.source,target:c.destination,immediate_source:c.normalizer,cut_source:c.normalizer,old_route_function:f,original_transport_vertices:cone.size,required_new_function:'positive_single_source',new_source:quiet,new_destination:target,original_binding:binding});
}
write('source-functions.json',{status:'actual_original_bank_quiet_deliveries_positive',selected,sources,adapter_blocks:adapterRows,source_sha256:pins,limits:['Actual bank ACTIVE/finaltail/resetblocked drivers will be held only for conditional logic checks; their sequential behavior is not supplied by test clamps at runtime.','Four exact original inverters are translated, not silently replaced with READY-low or owner-only idle. All state/timing/native acceptance remains open.']});
console.log(JSON.stringify({base_cells:world.size,adapters:32,selected:selected.map(c=>({bank:c.bank,source:c.new_source,target:c.new_destination,original_vertices:c.original_transport_vertices})),actual_status_roots:sources.map(r=>r.actual_status_sources)}));
