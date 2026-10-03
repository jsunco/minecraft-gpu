// Exact actual-source preservation and complete possible-input review for this derivative.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate,K} from '../../dispatch-external-bindings-v1/transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={},P=(x,y,z)=>({x,y,z});
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const d=read('connected-candidate.json'),base=read('body-placement.json'),func=read('source-functions.json'),scope=read('../../loader-program-colocation-v1/reference-scope.json');
const local=p=>P(p.x+600,p.y-11,p.z-1100);
const w=new Map(d.blocks.map(v=>[K(v.position),v.block])),old=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(local(v.position)),v.block])),orig=new Map(base.blocks.map(v=>[K(v.original_position),v])),at=new Map(base.blocks.map(v=>[K(v.position),v]));
assert.equal(w.size,d.blocks.length);assert.equal(base.blocks.length,300557);assert.equal(d.connections.length,3);
for(const v of base.blocks)assert.deepEqual(w.get(K(v.position)),old.get(K(v.original_position)),'Changed current original cell');
const edges=new Set(),routeAt=new Set();
for(const r of d.routes)for(let i=0;i<r.path.length;i++){routeAt.add(K(r.path[i]));if(i){edges.add(K(r.path[i-1])+'>'+K(r.path[i]));edges.add(K(r.path[i])+'>'+K(r.path[i-1]));}}
let bodyReceivers=0,bodyInputs=0,allReceivers=0,allInputs=0,cableInputs=0;
for(const v of d.blocks){
 const k=K(v.position);if(v.body)assert.deepEqual(v,at.get(k));if(!active(v.block))continue;allReceivers++;const actual=inputs(w,v.position).map(K).sort();allInputs+=actual.length;
 if(v.body){bodyReceivers++;const expected=inputs(old,v.original_position).filter(p=>orig.has(K(p))).map(p=>K(orig.get(K(p)).position));bodyInputs+=expected.length;for(const c of d.connections)if(K(c.destination)===k)expected.push(K(c.normalizer));assert.deepEqual(actual,[...new Set(expected)].sort(),'Altered actual body input '+k);}
 else{assert(routeAt.has(k));for(const p of actual)assert(edges.has(p+'>'+k),'New undeclared cable input '+p+'>'+k);cableInputs+=actual.length;}
}
const direction={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};
let supports=0;
for(const v of d.blocks){const p=v.position,b=v.block;let support=null;if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch','minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);if(b.id==='minecraft:redstone_wall_torch'){const t=direction[b.properties.facing];support=P(p.x+t.x,p.y,p.z+t.z);}if(support){assert(w.get(K(support))?.id.endsWith('_concrete'),'Missing actual support '+K(p));supports++;}}
const allowed=new Set(d.added.filter(v=>active(v.block)).map(v=>K(v.position))),graph=evaluate(w,allowed),pairs=[],negatives=[];
let minimumRear=15;
for(const c of d.connections){
 const o=func.selected.find(o=>'local_'+o.name===c.name),r=d.routes.find(r=>r.name===c.name);assert(o);assert.deepEqual(c.source,o.new_source);assert.deepEqual(c.destination,o.new_destination);assert.deepEqual(graph.get(c.normalizer),{roots:[c.source],table:2});
 let power=15,nominal=0;
 for(let i=1;i<r.path.length;i++){const p=r.path[i],b=w.get(K(p));assert(inputs(w,p).some(q=>K(q)===K(r.path[i-1])),'Missing real predecessor');if(b.id==='minecraft:redstone_wire'){power--;assert(power>0);}else if(b.id==='minecraft:repeater'){assert(power>0);minimumRear=Math.min(minimumRear,power);power=15;nominal+=2*Number(b.properties.delay);}else assert.fail('Unexpected route device');}
 for(const endpoint of ['source_isolator','normalizer']){const mw=new Map(w),k=K(c[endpoint]),before=mw.get(k);mw.set(k,{...before,properties:{...before.properties,facing:{east:'west',west:'east',north:'south',south:'north'}[before.properties.facing]}});if(endpoint==='normalizer')assert(!inputs(mw,c.destination).some(p=>K(p)===k));else assert.notDeepEqual(evaluate(mw,allowed).get(c.normalizer),{roots:[c.source],table:2});negatives.push({route:c.name,case:'reverse_actual_'+endpoint});}
 if(c.receiver_delivery==='strongly_powered_existing_support'){const mw=new Map(w);mw.delete(K(c.receiving_anchor));assert(!inputs(mw,c.destination).some(p=>K(p)===K(c.normalizer)));negatives.push({route:c.name,case:'remove_actual_strong_receiver_support'});}
 pairs.push({name:c.name,original_source:o.source,original_receiver:o.target,source:c.source,receiver:c.destination,normalizer:c.normalizer,receiver_delivery:c.receiver_delivery,truth_table:2,points:r.path.length,new_cells:d.new_cells.filter(v=>v.part===c.name).length,conditional_nominal_device_ticks:nominal});
}
const bodyCheck=read('body-checks.json');assert.equal(bodyCheck.status,'actual_program_quiet_body_and_transport_settled_pass');
// Retained data and storage identities are checked independently of transport truth.
assert.equal(func.retained_program_sources.length,4096);
for(const c of func.retained_program_sources)assert.equal(w.get(K(c.position)).id,c.value?'minecraft:redstone_block':'minecraft:light_gray_concrete');
assert.equal(func.retained_payload_stores.length,25);
for(const c of func.retained_payload_stores)for(const name of ['storage','lock'])assert.deepEqual(w.get(K(c[name])),old.get(K(c[name])));
for(const change of func.exact_current_corrections)assert.deepEqual(w.get(K(change.position)),change.current);
const pendingCuts=func.original_incident_cuts.map((c,i)=>{
 const mapped={index:i,status:'pending_external_master_connection',original_selected_world:c};
 for(const n of ['source','target'])if(c[n+'_group']==='program/preserved_program'){
   const match=orig.get(K(local(c[n])));assert(match,'External cut at removed transport: '+K(local(c[n])));mapped['new_program_'+n]=match.position;
 }
 return mapped;
});
const metrics=blocks=>{const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}return{cells:blocks.length,box,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),occupied_chunk_columns:new Set(blocks.map(v=>Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16))).size};};
pins['artifacts/full-gpu-layout-v1/program-rom-colocation-v1/quiet-connected-v1/check.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const report={status:'program_quiet_relocation_passes_scoped_author_static_checks',metrics:{body_cells:base.blocks.length,new_cells:d.new_cells.length,complete_cells:d.blocks.length,retained_payload_stores:25,configuration_bits:4096,current_corrections:func.exact_current_corrections.length,bodyReceivers,bodyInputs,allReceivers,allInputs,cableInputs,supports,route_vertices:d.routes.reduce((n,r)=>n+r.path.length,0),minimum_conservative_repeater_rear:minimumRear,original_incident_cuts:pendingCuts.length,pending_incident_cuts:pendingCuts.length,negative_cases:negatives.length,old_same_scope:metrics(func.old_comparable_blocks),current_same_scope:metrics(d.blocks),saved_same_scope_cells:func.old_comparable_cells-d.blocks.length},actual_new_transport_graph:graph.metrics,combined_quiet_graph:bodyCheck.graph,combined_settled_cases:8,combined_output_checks:24,outputs:bodyCheck.outputs,pairs,negative_cases:negatives,source_sha256:pins,limits:['Only program quiet matrix and three physical transports are refolded; the existing ROM/controller footprint and all current repairs remain unchanged.','Every original source/configuration/store identity is present; program state and arbitrary program execution are not simulated by this test.','The original selected-world program external cuts remain pending with new local endpoints. No other worker placement or whole-machine assembly is included.','Conditional positive transport assumes stable source values; no delay sums are setup/hold or event/timing acceptance.','Native execution, critical circuits, original kernels and unmodified Minecraft remain separate gates.'],native_acceptance:false,complete_gpu_layout:false};
writeFileSync(new URL('checks.json',H),JSON.stringify(report,null,2)+'\n');
writeFileSync(new URL('endpoint-map.json',H),JSON.stringify({coordinate_frame:'program_local',whole_machine_transform:null,ports:base.ports,quiet_transform:base.body_transforms.quiet,source_sha256:pins},null,2)+'\n');
writeFileSync(new URL('remaining-cuts.json',H),JSON.stringify({program_external_boundaries:pendingCuts,source_sha256:pins},null,2)+'\n');
console.log(JSON.stringify(report.metrics));
