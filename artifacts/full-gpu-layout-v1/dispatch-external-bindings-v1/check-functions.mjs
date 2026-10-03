// Source-function preparation precedes any new route construction.
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{fileURLToPath}from'node:url';
import{inputs,active}from'../memory/fabric-colocation-v2/cut-inputs.mjs';
import{K,evaluate}from'./transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
function bytes(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return b;}const read=n=>JSON.parse(bytes(n));
const bindings=read('bindings.json'),scope=read('../dispatch-global-colocation-v1/reference-scope.json'),labels=bytes('../dispatch-global-colocation-v1/cell-labels.u16le');
const w=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(v.position),v.block])),label=new Map(scope.blocks.map((v,i)=>[K(v.position),labels.readUInt16LE(2*i)]));
const wires=scope.blocks.filter(v=>label.get(K(v.position))&&v.block.id==='minecraft:redstone_wire'),powered=new Set(),followers=new Map();
for(const v of wires)for(const p of inputs(w,v.position))if(label.get(K(p))===label.get(K(v.position))){if(w.get(K(p)).id!=='minecraft:redstone_wire')powered.add(K(v.position));else{if(!followers.has(K(p)))followers.set(K(p),[]);followers.get(K(p)).push(K(v.position));}}
const pq=[...powered];for(let i=0;i<pq.length;i++)for(const k of followers.get(pq[i])??[])if(!powered.has(k)){powered.add(k);pq.push(k);}
const passive=new Set(wires.filter(v=>!powered.has(K(v.position))).map(v=>K(v.position))),transport=new Set(scope.blocks.filter(v=>active(v.block)&&(!label.get(K(v.position))||passive.has(K(v.position)))).map(v=>K(v.position)));
const old=evaluate(w,transport),prefix=[];
for(const row of bindings.incoming){const t=row.old_cut,p=transport.has(K(t.target))?t.target:t.immediate_source,e=old.get(p);assert(e.roots.some(p=>K(p)===K(t.source)));prefix.push({transfer_index:row.transfer_index,cut_source:t.source,target:t.target,transport_endpoint:p,...e,interpretation:e.roots.length===1?(e.table===2?'positive':e.table===1?'inverse':'other'):'multiple_source_function'});}
assert.equal(prefix.length,37);
const route=read('../master-control-routes-v1/design.json'),full=new Map(w);
for(const v of route.blocks){const b=full.get(K(v.position));if(b)assert.deepEqual(b,v.block,'Old route/scope mismatch');full.set(K(v.position),v.block);}
const allRoute=evaluate(full,new Set(route.blocks.filter(v=>active(v.block)).map(v=>K(v.position)))),selected=[];
for(const c of route.connections){const e=allRoute.get(c.normalizer);assert.deepEqual(e.roots,[c.source]);assert.equal(e.table,2,'Selected master control route is not positive');assert(inputs(full,c.destination).some(p=>K(p)===K(c.normalizer)));const bound=bindings.incoming.find(r=>r.old_connection.name===c.name);assert(bound?.selected_for_bounded_routing);const p=prefix.find(r=>r.transfer_index===bound.transfer_index);assert.equal(p.table,2);assert.equal(p.roots.length,1);
 selected.push({name:c.name,transfer_index:bound.transfer_index,source:c.source,target:c.destination,cut_source:c.normalizer,old_route_function:e,prefix_function:p,required_new_function:'positive_single_source',new_source:bound.producer.position,new_destination:bound.receiver.position});}
bytes('check-functions.mjs');bytes('transport-functions.mjs');bytes('../memory/fabric-colocation-v2/cut-inputs.mjs');bytes('../control-commit-v2/route.mjs');
const report={status:'all_37_foreign_cut_functions_classified_and_selected_seven_full_producer_routes_positive',prefix_metrics:old.metrics,foreign_cut_functions:prefix,selected_master_control_metrics:allRoute.metrics,selected,source_sha256:pins,limits:['All 37 classifications cover their exact old foreign cut source to retained receiver. Remote producer-to-cut functions are proved in full only for the selected seven master-control routes.','Producer state semantics, new transport timing, native behavior and unplaced remote bodies remain open.'],native_acceptance:false};
writeFileSync(new URL('function-checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({prefix:prefix.length,functions:prefix.reduce((a,r)=>(a[r.interpretation]=(a[r.interpretation]??0)+1,a),{}),selected:selected.length,selected_graph:allRoute.metrics}));
