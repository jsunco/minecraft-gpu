// Source-function preparation precedes any new route construction.
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{inputs,active}from'../memory/fabric-colocation-v2/cut-inputs.mjs';
import{K,evaluate}from'../dispatch-external-bindings-v1/transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
function bytes(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return b;}const read=n=>JSON.parse(bytes(n));
const bindings=read('../dispatch-external-bindings-v1/bindings.json'),scope=read('../dispatch-global-colocation-v1/reference-scope.json'),labels=bytes('../dispatch-global-colocation-v1/cell-labels.u16le');
const w=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(v.position),v.block])),label=new Map(scope.blocks.map((v,i)=>[K(v.position),labels.readUInt16LE(2*i)]));
const wires=scope.blocks.filter(v=>label.get(K(v.position))&&v.block.id==='minecraft:redstone_wire'),powered=new Set(),followers=new Map();
for(const v of wires)for(const p of inputs(w,v.position))if(label.get(K(p))===label.get(K(v.position))){if(w.get(K(p)).id!=='minecraft:redstone_wire')powered.add(K(v.position));else{if(!followers.has(K(p)))followers.set(K(p),[]);followers.get(K(p)).push(K(v.position));}}
const pq=[...powered];for(let i=0;i<pq.length;i++)for(const k of followers.get(pq[i])??[])if(!powered.has(k)){powered.add(k);pq.push(k);}
const passive=new Set(wires.filter(v=>!powered.has(K(v.position))).map(v=>K(v.position))),transport=new Set(scope.blocks.filter(v=>active(v.block)&&(!label.get(K(v.position))||passive.has(K(v.position)))).map(v=>K(v.position)));
const ledger=read('../dispatch-global-colocation-v7-internal-master-v1/remaining-ledger.json');
const chosen=bindings.incoming.filter(r=>ledger.transfers[r.transfer_index].status==='external_source_transfer_pending'&&r.producer.status==='exact_retained_body_cell');assert.equal(chosen.length,12);
const route=read('../master-loader-control-routes-v1/design.json'),full=new Map(w);
for(const v of route.blocks){const b=full.get(K(v.position));if(b)assert.deepEqual(b,v.block,'Old route/scope mismatch');full.set(K(v.position),v.block);}
const fullTransport=new Set([...transport,...route.blocks.filter(v=>active(v.block)).map(v=>K(v.position))]);
const graph=evaluate(full,fullTransport),selected=[];
for(const row of chosen){const t=row.old_cut,p=fullTransport.has(K(t.target))?t.target:t.immediate_source,e=graph.get(p),source=row.old_connection.source;
 assert.deepEqual(e.roots,[source],'Wrong original producer');assert.equal(e.table,2,'Actual original transport is not positive');assert(inputs(full,t.target).some(p=>K(p)===K(t.immediate_source)));assert.equal(full.get(K(t.target)).id,'minecraft:redstone_wire');
 selected.push({name:row.old_connection.name+(row.transfer_index===216||row.transfer_index===217?'_lane_mask':''),transfer_index:row.transfer_index,source,target:t.target,cut_source:t.source,immediate_source:t.immediate_source,old_route_function:e,required_new_function:'positive_single_source',new_source:row.producer.position,new_destination:row.receiver.position,receiver_kind:'wire',source_port:row.producer.port,source_bit:row.producer.bit,receiver_port:row.receiver.port,route_folder:row.route_folder});
}
const sources=new Set(selected.map(v=>K(v.source))),fanout={transfers:ledger.transfers.filter(v=>chosen.some(r=>K(r.old_cut.source)===K(v.source))),direct_foreign_boundaries:ledger.direct_foreign_boundaries.filter(v=>sources.has(K(v.source))),named_master:bindings.additional_master_fanout_obligations};
bytes('check-source-functions.mjs');bytes('../dispatch-external-bindings-v1/transport-functions.mjs');bytes('../memory/fabric-colocation-v2/cut-inputs.mjs');bytes('../control-commit-v2/route.mjs');
const report={status:'twelve_complete_original_producer_to_receiver_functions_positive',old_combined_transport_metrics:graph.metrics,selected,fanout,source_sha256:pins,limits:['Complete actual original master-loader-control route plus body-scope transport is classified from retained producer outputs; producer storage state itself is a held boundary.','All selected receiver terminals are passive wire inputs. Every other old foreign cut and downstream fanout remains in the inherited complete ledger.','DCR raw reset delivery to the global sampler is distinct from absent NOT loader.dcr_reset_permit at the DCR subtract-comparator side.','Transport timing, native execution and remote placement remain open.'],native_acceptance:false};
writeFileSync(new URL('source-functions.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({selected:selected.length,graph:graph.metrics,sources:sources.size}));
