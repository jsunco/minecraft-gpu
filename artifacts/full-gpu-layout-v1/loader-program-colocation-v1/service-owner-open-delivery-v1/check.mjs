// Complete actual-input screen and full source-specific owner-open functions.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {H,ROOT,K,read,loadFrame,pins} from './frame.mjs';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from '../../memory/fabric-colocation-v2/settled-network.mjs';
import {evaluate} from '../../dispatch-external-bindings-v1/transport-functions.mjs';
import {checkFeedback} from '../service-mask-memory-composition-v1/feedback.mjs';
const P=(x,y,z)=>({x,y,z}),A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},solid=b=>b?.id.endsWith('_concrete');
const frame=loadFrame(),base=frame.world,world=new Map(base),d=read('delta.json'),functions=read('source-functions.json');
assert.equal(d.connections.length,4);assert.equal(d.new_cells.length,3360);
for(const row of d.new_cells){assert(!world.has(K(row.position)),'Collision');world.set(K(row.position),row.block);}
const rows=[...frame.rows,...d.new_cells],newKeys=new Set(d.new_cells.filter(v=>active(v.block)).map(v=>K(v.position))),extra=new Map(d.connections.map(c=>[K(c.destination),K(c.normalizer)])),edges=new Set();
for(const r of d.routes)for(let i=1;i<r.path.length;i++){edges.add(K(r.path[i-1])+'>'+K(r.path[i]));edges.add(K(r.path[i])+'>'+K(r.path[i-1]));}
let receivers=0,supports=0,actualInputs=0,preservedInputs=0,newInputs=0;
for(const row of rows){const p=row.position,k=K(p),b=row.block;let support;
 if(b.id===WT)support=A(p,D[b.properties.facing]);else if([W,R,C,T,'minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);
 if(support){assert(solid(world.get(K(support))),'Unsupported device '+k);supports++;}
 if(!active(b))continue;receivers++;const actual=inputs(world,p).map(K).sort();actualInputs+=actual.length;
 if(base.has(k)){const prior=inputs(base,p).map(K);preservedInputs+=prior.length;assert.deepEqual(actual,[...new Set([...prior,...(extra.has(k)?[extra.get(k)]:[])])].sort(),'Unexpected old input '+k);}
 else {assert(newKeys.has(k));for(const q of actual)assert(edges.has(q+'>'+k),'Foreign cable contact '+q+'>'+k);newInputs+=actual.length;}
}
for(const r of d.routes)for(let i=1;i<r.path.length;i++)assert(inputs(world,r.path[i]).some(p=>K(p)===K(r.path[i-1])),'Broken route '+r.name+' '+i);
const transport=evaluate(world,newKeys);for(const c of d.connections)assert.deepEqual(transport.get(c.normalizer),{roots:[c.root],table:2});
const roots=[functions.records[0].binding.current_held_boundaries[0].position,...functions.records.map(r=>r.binding.current_held_boundaries[1].position)],targets=d.connections.map(c=>c.destination),union=new Map();
for(const p of targets)for(const q of backwardCone(world,p,roots))union.set(K(q),q);
const positions=[...union.values()],feedback={...checkFeedback(world,positions,roots),scope:'Four complete actual owner_open source cones plus new witness cables; shared open_address and four retained busy snapshots held. Intentional storage transitions and phase timing excluded.'},ev=makeSettledEvaluator(world,positions,roots),cases=[];let high;
for(let phase=0;phase<=1;phase++)for(let busy=0;busy<16;busy++){
 const power=new Map([[K(roots[0]),phase*15],...roots.slice(1).map((p,i)=>[K(p),(busy>>i&1)*15])]),v=ev(power),outputs=[];
 for(let i=0;i<4;i++){const expected=phase&&!(busy>>i&1)?15:0,c=d.connections[i];assert.equal(v.power.get(K(c.root))??0,expected);assert.equal(v.power.get(K(c.destination))??0,expected);outputs.push(v.power.get(K(c.root))??0,v.power.get(K(c.destination))??0);}
 cases.push({phase,busy,outputs});if(phase&&busy===0)high=v;
}
const rears=[];for(const row of d.new_cells)if(row.block.id===R){const p=row.position,v=D[row.block.properties.facing],ins=inputs(world,p);assert(ins.every(q=>(q.x-p.x)*v.x+(q.z-p.z)*v.z<0),'Cable side lock');const rear=Math.max(0,...ins.map(q=>high.power.get(K(q))??0));assert(rear>0,'Dead repeater '+K(p));rears.push({position:p,rear});}
const negative=[],opposite={east:'west',west:'east',north:'south',south:'north'};
for(const c of d.connections){for(const [kind,p]of [['arrival',c.normalizer],['source_isolator',c.source_isolator]]){const b=world.get(K(p));world.set(K(p),{...b,properties:{...b.properties,facing:opposite[b.properties.facing]}});if(kind==='arrival')assert(!inputs(world,c.destination).some(q=>K(q)===K(p)));else assert(!inputs(world,p).some(q=>K(q)===K(c.root)));world.set(K(p),b);negative.push({name:c.name,kind:'reverse_actual_'+kind,position:p});}
 const support=P(c.normalizer.x,c.normalizer.y-1,c.normalizer.z),b=world.get(K(support));world.delete(K(support));assert(!solid(world.get(K(support))));world.set(K(support),b);negative.push({name:c.name,kind:'delete_arrival_support',position:support});
 const wrong=d.connections[(d.connections.indexOf(c)+1)%4].root;assert.notDeepEqual(transport.get(c.normalizer),{roots:[wrong],table:2});negative.push({name:c.name,kind:'reject_other_channel_source',actual:c.root,wrong});
}
function cost(rows){const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)},materials={},columns=new Set();for(const v of rows){for(const a of ['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}materials[v.block.id]=(materials[v.block.id]??0)+1;columns.add(Math.floor(v.position.x/16)+','+Math.floor(v.position.z/16));}return {cells:rows.length,box,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y],occupied_columns:columns.size,materials};}
const completeCost=cost(rows);assert(completeCost.legal_y_translation[0]<=completeCost.legal_y_translation[1]);
for(const n of ['frame.mjs','prepare.mjs','route.mjs','check.mjs','../../memory/fabric-colocation-v2/cut-inputs.mjs','../../memory/fabric-colocation-v2/settled-network.mjs','../service-mask-memory-composition-v1/feedback.mjs','../../dispatch-external-bindings-v1/transport-functions.mjs']){const p=new URL(n,H);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(readFileSync(p)).digest('hex');}
const report={status:'passed_actual_four_owner_open_deliveries',metrics:{base_cells:base.size,new_cells:d.new_cells.length,total_cells:world.size,new_routes:4,path_vertices:d.routes.reduce((n,r)=>n+r.path.length,0),receivers,supports,actual_inputs:actualInputs,preserved_inputs:preservedInputs,new_route_inputs:newInputs,combined_held_cases:cases.length,output_observations:cases.length*8,minimum_new_repeater_rear:Math.min(...rears.map(v=>v.rear)),negative_cases:negative.length,witness_input_bound_total:12,witness_input_remaining:25},source_boundaries:roots,cases,transport:transport.metrics,full_function_feedback:feedback,new_rears:rears,negative,cost:{complete:completeCost,addition:cost(d.new_cells)},source_sha256:{...d.source_sha256,...pins},limits:['Complete actual-map compatibility includes exact channel0 address reservation, frozen channel3, loading panels, program body/quiet and mask composition.','Actual shared open_address and four retained busy snapshots are explicit held boundaries; loader/witness state transitions, phase freshness, pulse behavior and timing remain open.','Four exact channel-specific source functions are observed; no alias substitutes a common phase or an equal-valued source.','No vanilla execution or whole-GPU completion claim. All25 remaining witness inputs, global quiet fanout and loader/panel cuts remain explicit.']};
writeFileSync(new URL('checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.metrics));console.log(JSON.stringify(report.cost));
