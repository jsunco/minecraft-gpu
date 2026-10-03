// Whole-map preservation and actual program quiet gate with both delivery paths.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {H,ROOT,K,read,loadBase,pins} from './frame.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from './settled-program-network.mjs';
import {evaluate} from '../dispatch-external-bindings-v1/transport-functions.mjs';
import {checkFeedback} from '../loader-program-colocation-v1/service-mask-memory-composition-v1/feedback.mjs';
const P=(x,y,z)=>({x,y,z}),A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},solid=b=>b?.id.endsWith('_concrete'),write=(n,d)=>writeFileSync(new URL(n,H),JSON.stringify(d,null,2)+'\n');
const reserve=process.env.RESERVE==='1',frame=loadBase(),base=frame.world,world=new Map(base),d=read('delta.json'),f=read('source-functions.json');
assert.equal(d.connections.length,1);const c=d.connections[0];assert.deepEqual(c.root,f.selected[0].new_source);assert.deepEqual(c.destination,f.selected[0].new_destination);
const rows=[...frame.rows,...d.new_cells];let obstacleCells=0;
if(reserve){const reservation=read('active-reservation.json');obstacleCells=reservation.blocks.length;for(const r of reservation.blocks){assert(!base.has(K(r.position)));base.set(K(r.position),r.block);world.set(K(r.position),r.block);rows.push(r);}}
for(const r of d.new_cells){assert(!world.has(K(r.position)),'Collision');world.set(K(r.position),r.block);}
const newKeys=new Set(d.new_cells.filter(v=>active(v.block)).map(v=>K(v.position))),edges=new Set();
for(const r of d.routes)for(let i=1;i<r.path.length;i++){edges.add(K(r.path[i-1])+'>'+K(r.path[i]));edges.add(K(r.path[i])+'>'+K(r.path[i-1]));}
let receivers=0,supports=0,actualInputs=0,preservedInputs=0,newInputs=0,changedReceivers=0;
for(const r of rows){const p=r.position,k=K(p),b=r.block;let support;
 if(b.id===WT)support=A(p,D[b.properties.facing]);else if([W,R,C,T,'minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);
 if(support){assert(solid(world.get(K(support))),'Unsupported '+k);supports++;}if(!active(b))continue;
 const actual=inputs(world,p).map(K).sort();receivers++;actualInputs+=actual.length;
 if(base.has(k)){const prior=inputs(base,p).map(K);preservedInputs+=prior.length;if(k===K(c.destination)){prior.push(K(c.normalizer));changedReceivers++;}assert.deepEqual(actual,[...new Set(prior)].sort(),'Changed retained input '+k);}
 else{assert(newKeys.has(k));for(const q of actual)assert(edges.has(q+'>'+k),'Foreign cable contact '+q+'>'+k);newInputs+=actual.length;}
}
assert.equal(changedReceivers,1);
for(const r of d.routes)for(let i=1;i<r.path.length;i++)assert(inputs(world,r.path[i]).some(p=>K(p)===K(r.path[i-1])),'Broken route '+i);
const transport=evaluate(world,newKeys);assert.deepEqual(transport.get(c.normalizer),{roots:[c.root],table:2});
const roots=f.actual_program_boundary_sources,targets=[c.root,f.existing_loader_destination,c.destination],union=new Map();
for(const p of targets)for(const q of backwardCone(world,p,roots))union.set(K(q),q);
const positions=[...union.values()],feedback={...checkFeedback(world,positions,roots),scope:'Actual program quiet NOR3 and both loader/global deliveries, with real ACTIVE/finaltail/resetblocked outputs held; controller/sampler transitions excluded.'},ev=makeSettledEvaluator(world,positions,roots),cases=[];let high;
for(let a=0;a<8;a++){const powers=new Map(roots.map((p,i)=>[K(p),(a>>i&1)*15])),v=ev(powers),out=targets.map(p=>v.power.get(K(p))??0);assert(out.every(value=>value===(a===0?15:0)));cases.push({assignment:a,outputs:out});if(!a)high=v;}
const cablePositions=backwardCone(world,c.destination,[c.root]),cableEv=makeSettledEvaluator(world,cablePositions,[c.root]),strengthCases=[];
for(let n=0;n<=15;n++){const v=cableEv(new Map([[K(c.root),n]]));assert.equal(v.power.get(K(c.destination))??0,n?15:0);strengthCases.push({strength:n,arrival:v.power.get(K(c.normalizer))??0,destination:v.power.get(K(c.destination))??0});}
const rears=[];for(const r of d.new_cells)if(r.block.id===R){const p=r.position,v=D[r.block.properties.facing],ins=inputs(world,p);assert(ins.every(q=>(q.x-p.x)*v.x+(q.z-p.z)*v.z<0),'Cable side lock');const rear=Math.max(0,...ins.map(q=>high.power.get(K(q))??0));assert(rear>0,'Dead repeater '+K(p));rears.push({position:p,rear});}
const negative=[],opposite={east:'west',west:'east',north:'south',south:'north'};
for(const row of d.new_cells.filter(r=>r.block.id===R)){
 const p=row.position,k=K(p);world.set(k,{...row.block,properties:{...row.block.properties,facing:opposite[row.block.properties.facing]}});let refused=false;
 try{const pos=backwardCone(world,c.destination,[c.root]),value=makeSettledEvaluator(world,pos,[c.root])(new Map([[K(c.root),15]]));refused=(value.power.get(K(c.destination))??0)!==15;}catch{refused=true;}assert(refused,'Reversed cable diode survived '+k);world.set(k,row.block);negative.push({kind:'reverse_actual_cable_repeater',position:p});
}
const gateMutations=[];
for(const record of f.actual_program_gate_mutations){const p=record.position,k=K(p),saved=world.get(k);assert.equal(saved.id,C);assert.equal(saved.properties.mode,'subtract');world.set(k,{...saved,properties:{...saved.properties,mode:'compare'}});let refused=false;
 try{const bad=makeSettledEvaluator(world,positions,roots);for(let a=0;a<8&&!refused;a++){const v=bad(new Map(roots.map((p,i)=>[K(p),(a>>i&1)*15])));refused=targets.some(p=>(v.power.get(K(p))??0)!==(a===0?15:0));}}catch{refused=true;}assert(refused,'Bad quiet gate survived');world.set(k,saved);gateMutations.push({position:p,kind:'subtract_to_compare',refused});
}
const support=P(c.normalizer.x,c.normalizer.y-1,c.normalizer.z),saved=world.get(K(support));world.delete(K(support));assert(!solid(world.get(K(support))));world.set(K(support),saved);negative.push({kind:'delete_actual_arrival_support',position:support});
function cost(rows){const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)},materials={},columns=new Set();for(const r of rows){for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],r.position[a]);box.to[a]=Math.max(box.to[a],r.position[a]);}materials[r.block.id]=(materials[r.block.id]??0)+1;columns.add(Math.floor(r.position.x/16)+','+Math.floor(r.position.z/16));}return {cells:rows.length,box,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y],occupied_columns:columns.size,materials};}
const fullCost=cost(rows);assert(fullCost.legal_y_translation[0]<=fullCost.legal_y_translation[1]);
for(const n of ['frame.mjs','prepare.mjs','route.mjs','check.mjs','settled-program-network.mjs','../memory/fabric-colocation-v2/cut-inputs.mjs','../memory/fabric-colocation-v2/settled-network.mjs','../loader-program-colocation-v1/service-mask-memory-composition-v1/feedback.mjs','../dispatch-external-bindings-v1/transport-functions.mjs']){const p=new URL(n,H);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(readFileSync(p)).digest('hex');}
const report={status:reserve?'passed_exact_concurrent_obstacle_compatibility_only':'passed_actual_program_quiet_to_global_delivery',metrics:{accepted_base_cells:2000594,new_cells:d.new_cells.length,uncredited_concurrent_obstacle_cells:obstacleCells,total_cells:world.size,new_routes:1,path_vertices:d.routes[0].path.length,receivers,supports,actual_inputs:actualInputs,preserved_inputs:preservedInputs,new_route_inputs:newInputs,changed_receivers:changedReceivers,program_gate_cases:8,program_output_observations:24,cable_strength_cases:16,minimum_new_repeater_rear:Math.min(...rears.map(r=>r.rear)),cable_mutations:negative.length,gate_mutations:gateMutations.length},roots,targets,cases,strength_cases:strengthCases,feedback,transport:transport.metrics,rears,negative,gate_mutations:gateMutations,cost:{complete:fullCost,addition:cost(d.new_cells)},source_sha256:{...d.source_sha256,...pins},limits:['The three real program ACTIVE/finaltail/resetblocked outputs are held boundaries; their state generation and global/loader sampling transitions remain open.','Only one external program-quiet delivery is drawn; source-aware static/numeric checks do not prove phase freshness, pulse width, timing or native execution.','Concurrent ACTIVE/address2 rows are only obstacles until separately frozen and recomposed; do not add them as accepted geometry here.','Partial shared frame excludes the two core instances and other unfinished master routes; no complete density selection or whole-layout/native acceptance.']};write(reserve?'reservation-checks.json':'checks.json',report);console.log(JSON.stringify(report.metrics));console.log(JSON.stringify(fullCost));
