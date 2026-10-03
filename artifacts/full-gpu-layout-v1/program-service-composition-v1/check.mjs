// Full retained input map, source functions, exact modules and actual cable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {evaluate,K} from '../dispatch-external-bindings-v1/transport-functions.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},P=(x,y,z)=>({x,y,z}),A=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const d=read('connected-candidate.json'),base=read('body-placement.json'),func=read('source-functions.json'),pm=read('../program-rom-colocation-v1/quiet-connected-v1/endpoint-map.json');
const w=new Map(d.blocks.map(v=>[K(v.position),v.block])),before=new Map(base.blocks.map(v=>[K(v.position),v.block]));
assert.equal(before.size,1652091);assert.equal(w.size,1653081);assert.equal(d.new_cells.length,990);assert.equal(d.connections.length,1);
for(const v of base.blocks)assert.deepEqual(w.get(K(v.position)),v.block);
const c=d.connections[0],r=d.routes[0],f=func.selected[0];assert.equal(c.name,f.name);assert.deepEqual(c.source,f.new_source);assert.deepEqual(c.destination,f.new_destination);
const edges=new Set();for(let i=1;i<r.path.length;i++){edges.add(K(r.path[i-1])+'>'+K(r.path[i]));edges.add(K(r.path[i])+'>'+K(r.path[i-1]));}
let receivers=0,oldInputs=0,allInputs=0,newInputs=0,supports=0;
const solid=b=>b?.id.endsWith('_concrete'),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};
for(const v of d.blocks){const p=v.position,b=v.block,k=K(p);let support;
 if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch','minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);
 if(b.id==='minecraft:redstone_wall_torch')support=A(p,D[b.properties.facing]);
 if(support){assert(solid(w.get(K(support))),'Unsupported '+k);supports++;}
 if(!active(b))continue;receivers++;const actual=inputs(w,p).map(K).sort();allInputs+=actual.length;
 if(before.has(k)){const expected=inputs(before,p).map(K);oldInputs+=expected.length;if(k===K(c.destination))expected.push(K(c.normalizer));assert.deepEqual(actual,[...new Set(expected)].sort(),'Retained input changed '+k);}
 else{for(const q of actual)assert(edges.has(q+'>'+k),'New cross contact '+q+'>'+k);newInputs+=actual.length;}
}
const keys=new Set(d.new_cells.filter(v=>active(v.block)).map(v=>K(v.position))),graph=evaluate(w,keys);assert.deepEqual(graph.get(c.normalizer),{roots:[c.source],table:2});
let level=15,minRear=15,nominal=0;
for(let i=1;i<r.path.length;i++){const p=r.path[i],prev=r.path[i-1],b=w.get(K(p));assert(inputs(w,p).some(q=>K(q)===K(prev)));if(b.id==='minecraft:redstone_wire'){if(w.get(K(prev)).id==='minecraft:redstone_wire')level--;assert(level>0);}else if(b.id==='minecraft:repeater'){minRear=Math.min(minRear,level);assert(level>0);level=15;nominal+=2*Number(b.properties.delay);}else assert.fail('Unexpected cable device');}
const negatives=[];
for(const name of ['source_isolator','normalizer']){const q=c[name],k=K(q),b=w.get(k);w.set(k,{...b,properties:{...b.properties,facing:{east:'west',west:'east',north:'south',south:'north'}[b.properties.facing]}});try{if(name==='normalizer')assert(!inputs(w,c.destination).some(p=>K(p)===k));else assert.notDeepEqual(evaluate(w,keys).get(c.normalizer),{roots:[c.source],table:2});negatives.push({kind:'reverse_'+name,position:q});}finally{w.set(k,b);}}
const support=P(c.normalizer.x,c.normalizer.y-1,c.normalizer.z),saved=w.get(K(support));w.delete(K(support));assert(!solid(w.get(K(support))));w.set(K(support),saved);negatives.push({kind:'remove_normalizer_support',position:support});
const bounds=rows=>{const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)},cols=new Set(),materials={};for(const v of rows){for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}cols.add(Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16));materials[v.block.id]=(materials[v.block.id]??0)+1;}return{cells:rows.length,box,occupied_columns:cols.size,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),materials};};
const programCuts=read('../program-rom-colocation-v1/quiet-connected-v1/remaining-cuts.json').program_external_boundaries;
const selected=programCuts.filter(v=>K(v.original_selected_world.source)===K(f.source)&&v.original_selected_world.target_group==='loader/actual_program_quiet');assert.equal(selected.length,1);
const pc=programCuts.map(v=>({...v,status:v===selected[0]?'bound_actual_quiet_to_loader':'pending_external_master_connection',...v.new_program_source?{frame_program_source:A(v.new_program_source,base.body_transforms.program)}:{},...v.new_program_target?{frame_program_target:A(v.new_program_target,base.body_transforms.program)}:{}}));
const lc=read('../loader-program-colocation-v1/service-quiet-loader-link-v1/remaining-cuts.json').loader_control;
const selectedL=lc.filter(v=>K(v.target)===K(f.target));assert.equal(selectedL.length,1);assert.equal(selectedL[0].status,'pending');
const mappedL=lc.map(v=>({...v,status:v===selectedL[0]?'bound_actual_program_quiet_delivery':v.status}));
const report={status:'passed_whole_program_memory_service_quiet_union',metrics:{parent_cells:before.size,cable_cells:990,complete_cells:w.size,receivers,oldInputs,allInputs,newInputs,supports,new_paths:1,vertices:r.path.length,minimum_source_aware_rear:minRear,cable_only_nominal_ticks:nominal,mutations:negatives.length,old_same_cable_cells:func.original_route_cells,saved_same_cable_cells:func.original_route_cells-990,program_pending_cuts:pc.filter(v=>v.status==='pending_external_master_connection').length,loader_pending_cuts:mappedL.filter(v=>v.status==='pending').length},cost:{before:bounds(base.blocks),after:bounds(d.blocks),cable:bounds(d.new_cells)},graph:graph.metrics,negative_cases:negatives,source_sha256:pins,limits:func.limits,native_acceptance:false,complete_gpu_layout:false};
writeFileSync(new URL('checks.json',H),JSON.stringify(report,null,2)+'\n');writeFileSync(new URL('remaining-cuts.json',H),JSON.stringify({program:pc,loader:mappedL,source_sha256:pins},null,2)+'\n');
writeFileSync(new URL('endpoint-map.json',H),JSON.stringify({frame:'memory_local_with_explicit_program_and_service_transforms',program_translation:base.body_transforms.program,service_translation:base.body_transforms.service,program_ports:Object.fromEntries(Object.entries(pm.ports).map(([n,p])=>[n,{...p,positions:p.positions?.map(q=>A(q,base.body_transforms.program)),bits:p.bits?.map(b=>({bit:b.bit,position:A(b.position,base.body_transforms.program),program_local_position:b.position,actual_direct_inputs:inputs(w,A(b.position,base.body_transforms.program))}))}])),new_connection:c,source_sha256:pins},null,2)+'\n');
console.log(JSON.stringify(report.metrics));console.log(JSON.stringify(report.cost));
