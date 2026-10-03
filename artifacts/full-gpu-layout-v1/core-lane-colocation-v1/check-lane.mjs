// Actual effective-input comparison, against full reference geometry.
// No pulse simulation or physical timing acceptance.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {P,K,V} from '../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),d=read('lane0-draft.json'),bodies=read('bodies.json');
const W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',S='minecraft:light_gray_concrete',solid=b=>b?.id.endsWith('_concrete'),add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),pair=(a,b)=>K(a)+'>'+K(b);
const base=readLargeDesign(fileURLToPath(new URL('../compact-core-fault-v1/design.json',H))),orig=new Map(base.blocks.map(v=>[K(v.position),v.block]));
const oldRows=bodies.blocks.filter(v=>v.body.startsWith('lane0/')),moved=new Map(oldRows.map(v=>[K(v.position),add(v.position,d.transforms[v.body.split('/')[1]])])),post=new Map(d.blocks.map(v=>[K(v.position),v.block]));
assert.equal(post.size,d.blocks.length);for(const v of oldRows){assert.deepEqual(orig.get(K(v.position)),v.block);assert.deepEqual(post.get(K(moved.get(K(v.position)))),v.block);}
const expected=new Set(),expectedEdges=[];for(const v of oldRows)if(active(v.block))for(const q of inputs(orig,v.position))if(moved.has(K(q))){const from=moved.get(K(q)),to=moved.get(K(v.position));expected.add(pair(from,to));expectedEdges.push({from,to});}
const cable=new Set();for(const e of d.edges){cable.add(pair(e.from,e.to));if(post.get(K(e.from))?.id===W&&post.get(K(e.to))?.id===W)cable.add(pair(e.to,e.from));}
const allowed=new Set([...expected,...cable]),actual=new Set(),unexpected=[],missingRoute=[],lostBody=[];let audited=0,supports=0;
for(const v of d.blocks){const p=v.position;assert(p.y>=-64&&p.y<=319);if([W,R,C,T].includes(v.block.id)){assert(solid(post.get(K(P(p.x,p.y-1,p.z)))),'Support '+K(p));supports++;}if(!active(v.block))continue;audited++;
 for(const q of inputs(post,p)){const e=pair(q,p);actual.add(e);if(!allowed.has(e))unexpected.push({from:q,to:p,from_block:post.get(K(q)),to_block:v.block,from_part:d.blocks.find(r=>K(r.position)===K(q))?.part,to_part:v.part||v.body});}}
for(const e of d.edges)if(!actual.has(pair(e.from,e.to)))missingRoute.push(e);
for(const e of expectedEdges)if(!actual.has(pair(e.from,e.to)))lostBody.push(e);
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};let stores=0;for(const v of d.blocks){if(v.block.id!==R)continue;const dr=D[v.block.properties.facing];if(Object.values(D).some(s=>{if(s.x*dr.x+s.z*dr.z)return false;const q=add(v.position,s),qb=post.get(K(q));return[R,C].includes(qb?.id)&&K(add(q,D[qb.properties.facing]))===K(v.position);} ))stores++;}assert.equal(stores,231);
const routes=d.connections.filter(r=>r.path).map(r=>{let max=0,run=0,nominal=0;for(const p of[r.tap,...r.path,r.arrival]){const b=post.get(K(p));assert(b);if(b.id===R){nominal+=2*Number(b.properties.delay);run=0;}else{assert.equal(b.id,W);max=Math.max(max,++run);}}assert(max<=12,r.name+' strength');return{name:r.name,was_missing:r.was_missing_in_reference,path_cells:r.path.length,maximum_dust_run:max,minimum_normalized_rear_power:16-max,nominal_cable_ticks:nominal};});
// Every cable starts at an actual normalized isolated body output. This is
// source capacity, not a claim the source value is currently high.
for(const r of d.connections.filter(r=>r.path)){const qs=inputs(post,r.source);assert.equal(qs.length,1,r.name+' source count');assert.equal(post.get(K(qs[0])).id,R,r.name+' normalized source');assert.deepEqual(inputs(post,r.tap),[r.source],r.name+' source tap');assert.deepEqual(inputs(post,r.arrival),[r.end],r.name+' final driver');}
let negativeProbes=0;const chosen=d.connections[0],old=post.get(K(chosen.arrival)),opposite={west:'east',east:'west',north:'south',south:'north'};post.set(K(chosen.arrival),{...old,properties:{...old.properties,facing:opposite[old.properties.facing]}});assert(!inputs(post,chosen.destination).some(p=>K(p)===K(chosen.arrival)));post.set(K(chosen.arrival),old);negativeProbes++;
const stair=d.edges.find(e=>e.to.y===e.from.y+1&&post.get(K(e.from))?.id===W&&post.get(K(e.to))?.id===W),cap=P(stair.from.x,stair.from.y+1,stair.from.z);assert(!post.has(K(cap)));post.set(K(cap),{id:S});assert(!inputs(post,stair.to).some(p=>K(p)===K(stair.from)));post.delete(K(cap));negativeProbes++;
const failure=unexpected.length||missingRoute.length||lostBody.length;
const report={status:failure?'refused':'actual_data_slice_dependency_screen_passed',body_cells:oldRows.length,total_cells:d.blocks.length,added_cells:d.added_cells,stores,supports,audited_receivers:audited,reference_internal_dependencies:expected.size,routed_edges:d.edges.length,actual_dependencies:actual.size,negative_probes:negativeProbes,normalized_source_checks:routes.length,unexpected,missingRoute,lostBody,routes,source_sha256:Object.fromEntries(['lane0-draft.json','bodies.json','check-lane.mjs','place-lane.mjs','lane0-paths.json'].map(n=>[n,createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex')])),scope:['Full reference world queried for each old lane receiver, not a cropped reference graph. All effective dependencies between relocated body cells must survive.','All effective new inputs must equal a preserved body dependency or actual declared noninverting cable edge.','External shared control and writeback immediate/select source cables remain pending; no complete-lane or whole-core claim.'],native_acceptance:false};
writeFileSync(new URL('lane0-checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,unexpected:unexpected.slice(0,25),missingRoute:missingRoute.slice(0,25),lostBody:lostBody.slice(0,25)},null,2));assert(!failure,'Unaccounted actual input or missing body/path edge');
