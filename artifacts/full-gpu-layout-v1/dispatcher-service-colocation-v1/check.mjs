// Verify exact translations and the complete new source-specific quiet transport.
// Settled source-clamped evidence is explicitly distinct from sampler timing.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {H,ROOT,K,read,loadBase,pins} from './frame.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from '../memory/fabric-colocation-v2/settled-network.mjs';
import {evaluate} from '../dispatch-external-bindings-v1/transport-functions.mjs';
import {checkFeedback} from '../loader-program-colocation-v1/service-mask-memory-composition-v1/feedback.mjs';
const P=(x,y,z)=>({x,y,z}),A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},solid=b=>b?.id.endsWith('_concrete'),write=(n,d)=>writeFileSync(new URL(n,H),JSON.stringify(d,null,2)+'\n');
const reserve=process.env.RESERVE==='1';
const frame=loadBase(),base=frame.world,world=new Map(base),placement=read('placement.json'),parent=read('../dispatch-global-colocation-v8-dcr-cold-v1/connected-candidate.json'),d=read('delta.json'),functions=read('source-functions.json');
const local=new Map(parent.blocks.map(r=>[K(r.position),r.block])),translated=new Map(placement.blocks.map(r=>[K(r.position),r])),extra=new Map(d.connections.map(c=>[K(c.destination),K(c.normalizer)])),edges=new Set();
assert.equal(parent.blocks.length,202786);assert.equal(d.connections.length,1);assert.equal(functions.selected.length,1);
const rows=[...frame.rows,...placement.blocks,...d.new_cells],priorRows=[...placement.blocks];
if(reserve){const reservation=read('memory-address1-reservation.json');assert.equal(reservation.blocks.length,4206);for(const r of reservation.blocks){assert(!base.has(K(r.position)));base.set(K(r.position),r.block);world.set(K(r.position),r.block);rows.push(r);}}
for(const row of [...placement.blocks,...d.new_cells]){assert(!world.has(K(row.position)),'Collision');world.set(K(row.position),row.block);}
const newKeys=new Set(d.new_cells.filter(v=>active(v.block)).map(v=>K(v.position)));
for(const r of d.routes)for(let i=1;i<r.path.length;i++){edges.add(K(r.path[i-1])+'>'+K(r.path[i]));edges.add(K(r.path[i])+'>'+K(r.path[i-1]));}
let receivers=0,supports=0,actualInputs=0,preservedInputs=0,newInputs=0,translatedInputs=0;
for(const row of rows){const p=row.position,k=K(p),b=row.block;let support;
 if(b.id===WT)support=A(p,D[b.properties.facing]);else if([W,R,C,T,'minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);
 if(support){assert(solid(world.get(K(support))),'Unsupported device '+k);supports++;}
 if(!active(b))continue;receivers++;const actual=inputs(world,p).map(K).sort();actualInputs+=actual.length;
 let prior;
 if(translated.has(k)){const r=translated.get(k);assert.deepEqual(local.get(K(r.local_position)),b);assert.deepEqual(A(r.local_position,placement.translation),p);prior=inputs(local,r.local_position).map(q=>K(A(q,placement.translation)));translatedInputs+=prior.length;}
 else if(base.has(k)){prior=inputs(base,p).map(K);preservedInputs+=prior.length;}
 if(prior){assert.deepEqual(actual,[...new Set([...prior,...(extra.has(k)?[extra.get(k)]:[])])].sort(),'Unexpected retained input '+k);}
 else {assert(newKeys.has(k));for(const q of actual)assert(edges.has(q+'>'+k),'Foreign cable contact '+q+'>'+k);newInputs+=actual.length;}
}
for(const r of d.routes)for(let i=1;i<r.path.length;i++)assert(inputs(world,r.path[i]).some(p=>K(p)===K(r.path[i-1])),'Broken route '+r.name+' '+i);
const c=d.connections[0],f=functions.selected[0];assert.deepEqual(c.root,f.new_source);assert.deepEqual(c.destination,f.new_destination);assert.equal(f.transfer_index,291);
const transport=evaluate(world,newKeys);assert.deepEqual(transport.get(c.normalizer),{roots:[c.root],table:2});
const roots=[c.root],positions=backwardCone(world,c.destination,roots),feedback={...checkFeedback(world,positions,roots),scope:"Actual service quiet matrix output held; complete cable to the translated global sampler input. Source witness closure and sampler state transitions excluded."},ev=makeSettledEvaluator(world,positions,roots),cases=[],rears=[];
let high;
for(let strength=0;strength<=15;strength++){const v=ev(new Map([[K(c.root),strength]])),expected=strength?15:0;assert.equal(v.power.get(K(c.normalizer))??0,expected);assert.equal(v.power.get(K(c.destination))??0,expected);cases.push({source_strength:strength,arrival:v.power.get(K(c.normalizer))??0,receiver:v.power.get(K(c.destination))??0});if(strength===15)high=v;}
for(const row of d.new_cells)if(row.block.id===R){const p=row.position,v=D[row.block.properties.facing],ins=inputs(world,p);assert(ins.every(q=>(q.x-p.x)*v.x+(q.z-p.z)*v.z<0),'Cable side lock');const rear=Math.max(0,...ins.map(q=>high.power.get(K(q))??0));assert(rear>0,'Dead repeater '+K(p));rears.push({position:p,rear});}
const negative=[],opposite={east:'west',west:'east',north:'south',south:'north'};
for(const [kind,p]of [['arrival',c.normalizer],['source_isolator',c.source_isolator]]){const b=world.get(K(p));world.set(K(p),{...b,properties:{...b.properties,facing:opposite[b.properties.facing]}});if(kind==='arrival')assert(!inputs(world,c.destination).some(q=>K(q)===K(p)));else assert(!inputs(world,p).some(q=>K(q)===K(c.root)));world.set(K(p),b);negative.push({kind:'reverse_actual_'+kind,position:p});}
const support=P(c.normalizer.x,c.normalizer.y-1,c.normalizer.z),sb=world.get(K(support));world.delete(K(support));assert(!solid(world.get(K(support))));world.set(K(support),sb);negative.push({kind:'delete_actual_arrival_support',position:support});
for(const [i,p]of d.routes[0].path.entries()){if(i!==Math.floor(d.routes[0].path.length/2))continue;const b=world.get(K(p));world.delete(K(p));assert(!inputs(world,d.routes[0].path[i+1]).some(q=>K(q)===K(p)));world.set(K(p),b);negative.push({kind:'delete_actual_midroute_device',position:p});}
assert.notDeepEqual(transport.get(c.normalizer),{roots:[functions.selected[0].original_export_source],table:2});negative.push({kind:'reject_old_disconnected_export_as_current_root'});
function cost(rows){const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)},materials={},columns=new Set();for(const v of rows){for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}materials[v.block.id]=(materials[v.block.id]??0)+1;columns.add(Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16));}return {cells:rows.length,box,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y],occupied_columns:columns.size,materials};}
const completeCost=cost(rows);assert(completeCost.legal_y_translation[0]<=completeCost.legal_y_translation[1]);
for(const n of ['frame.mjs','prepare.mjs','route.mjs','check.mjs','../memory/fabric-colocation-v2/cut-inputs.mjs','../memory/fabric-colocation-v2/settled-network.mjs','../loader-program-colocation-v1/service-mask-memory-composition-v1/feedback.mjs','../dispatch-external-bindings-v1/transport-functions.mjs']){const p=new URL(n,H);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(readFileSync(p)).digest('hex');}
const report={status:reserve?'passed_exact_pending4206_compatibility_only':'passed_exact_dispatcher_service_composition_and_quiet_delivery',metrics:{accepted_base_cells:1752880,translated_cells:202786,quiet_cable_cells:d.new_cells.length,pending_obstacle_cells:reserve?4206:0,total_cells:world.size,new_routes:1,path_vertices:d.routes[0].path.length,receivers,supports,actual_inputs:actualInputs,preserved_base_inputs:preservedInputs,translated_inputs:translatedInputs,new_route_inputs:newInputs,held_source_strength_cases:cases.length,output_observations:cases.length*2,minimum_new_repeater_rear:Math.min(...rears.map(v=>v.rear)),negative_cases:negative.length,dispatch_incoming_transfers_pending:17,dispatch_direct_foreign_pending:31,witness_inputs_bound:16,witness_inputs_pending:21},actual_root:c.root,actual_receiver:c.destination,cases,transport:transport.metrics,feedback,new_rears:rears,negative,cost:{complete:completeCost,addition:cost(d.new_cells),translated_body:cost(placement.blocks)},source_sha256:{...d.source_sha256,...pins},limits:['The real quiet matrix output is a held boundary; remaining witness inputs and sequential global sampler behavior are not proved.','Exact original dispatcher geometry is translated, with every actual receiver input and support checked; translation does not resolve the other foreign inputs.','No complete-machine density or timing acceptance; current translation scores only one quiet route.','Pending memory rows are counted only in the separately labeled compatibility receipt; no acceptance credit.','No Minecraft calls, native execution, complete connected GPU layout or GPU completion claim.']};
write(reserve?'reservation-checks.json':'checks.json',report);console.log(JSON.stringify(report.metrics));console.log(JSON.stringify(report.cost.complete));
