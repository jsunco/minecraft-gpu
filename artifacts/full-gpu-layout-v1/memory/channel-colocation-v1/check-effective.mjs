// Independent effective-input differential over complete memory and selected foreign cells.
// Rule implementation adapted from frozen compact-core-fault-v1/check.mjs.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import{createHash}from'node:crypto';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {P,K,add,W,S} from './layout.mjs';
const H=new URL('./',import.meta.url),read=n=>readLargeDesign(fileURLToPath(new URL(n,H))),d=read('trial-design.json'),base=read('extracted-map.json'),foreign=read('foreign-obstacles.json'),local=read('local-qualified.json');
const R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block';
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},HORIZ=Object.values(D),DIR=[...HORIZ,P(0,1,0),P(0,-1,0)],neg=v=>P(-v.x,-v.y,-v.z),solid=b=>b?.id.endsWith('_concrete'),active=b=>b&&!solid(b),pair=(a,b)=>K(a)+'>'+K(b);
const removed=new Set(d.removed.map(v=>K(v.position))),added=new Set(d.blocks.map(v=>K(v.position)));
function emitted(w,src,dst){const b=w.get(K(src));if(!b)return false;if([R,C].includes(b.id))return K(add(src,D[b.properties.facing]))===K(dst);if([T,WT].includes(b.id)){const support=add(src,b.id===T?P(0,-1,0):D[b.properties.facing]);return K(dst)!==K(support);}return [W,RB,'minecraft:lever'].includes(b.id);}
function solidSources(w,p,wireConsumer){const out=[];for(const v of DIR){const q=add(p,v),b=w.get(K(q));if(!b)continue;const strong=([R,C].includes(b.id)&&emitted(w,q,p))||([T,WT].includes(b.id)&&v.y===-1);if(strong||(!wireConsumer&&b.id===W&&v.y!==-1))out.push(q);}return out;}
function inputs(w,p){const b=w.get(K(p)),out=[];if(!active(b))return out;const raw=(q,wireConsumer=false)=>{const v=w.get(K(q));if(solid(v))out.push(...solidSources(w,q,wireConsumer));else if(emitted(w,q,p))out.push(q);};
 if(b.id===W){for(const v of DIR){const q=add(p,v);if(w.get(K(q))?.id!==W)raw(q,true);}for(const v of HORIZ){const q=add(p,v),above=add(q,P(0,1,0)),below=add(q,P(0,-1,0));if(w.get(K(q))?.id===W)out.push(q);if(solid(w.get(K(q)))&&!solid(w.get(K(add(p,P(0,1,0)))))&&w.get(K(above))?.id===W)out.push(above);if(!solid(w.get(K(q)))&&w.get(K(below))?.id===W)out.push(below);}}
 else if([R,C].includes(b.id)){const v=D[b.properties.facing];raw(add(p,neg(v)));for(const s of HORIZ){if(s.x*v.x+s.z*v.z)continue;const q=add(p,s),qb=w.get(K(q));if([R,C].includes(qb?.id)&&emitted(w,q,p))out.push(q);else if(b.id===C&&[W,RB].includes(qb?.id))out.push(q);}}
 else if([T,WT].includes(b.id)){const q=add(p,b.id===T?P(0,-1,0):D[b.properties.facing]);assert(solid(w.get(K(q))),'Torch support '+K(p));out.push(...solidSources(w,q,false));}
 return [...new Map(out.map(q=>[K(q),q])).values()];
}

const oldRows=[...base.blocks,...d.removed],orig=new Map(oldRows.map(v=>[K(v.position),v.block])),post=new Map([...base.blocks,...d.blocks].map(v=>[K(v.position),v.block]));assert.equal(orig.size,oldRows.length);assert.equal(post.size,base.blocks.length+d.blocks.length);
for(const v of foreign.blocks){const k=K(v.position);assert(!orig.has(k),'Foreign original collision '+k);assert(!post.has(k),'Foreign replacement collision '+k);orig.set(k,v.block);post.set(k,v.block);}
for(const v of d.blocks){assert(v.position.y>=-64&&v.position.y<=319);if([W,R,C,T].includes(v.block.id))assert(solid(post.get(K(add(v.position,P(0,-1,0))))),'New support '+K(v.position));}
const affected=new Map();for(const v of [...d.removed,...d.blocks])for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const p=P(v.position.x+dx,v.position.y+dy,v.position.z+dz);if(active(orig.get(K(p)))||active(post.get(K(p))))affected.set(K(p),p);}
const allowed=new Set(d.edges.flatMap(v=>{const out=[pair(v.from,v.to)];if(post.get(K(v.from))?.id===W&&post.get(K(v.to))?.id===W)out.push(pair(v.to,v.from));return out;}));
// The complete local backend is independently checked. Its dependency graph
// must translate exactly; other body-to-cable contacts are never implicit.
const lm=new Map(local.blocks.map(v=>[K(v.position),v.block]));
for(const v of local.blocks)if(active(v.block))for(const q of inputs(lm,v.position))allowed.add(pair(add(q,d.candidate.origin),add(v.position,d.candidate.origin)));
for(const edge of d.edges)assert(inputs(post,edge.to).some(q=>K(q)===K(edge.from)),'Authored edge has no actual dependency '+pair(edge.from,edge.to));
const bad=[],changedKept=[];let audited=0,allowedNew=0,unchanged=0;
for(const[k,p]of affected){const bi=active(orig.get(k))?inputs(orig,p):[],ai=active(post.get(k))?inputs(post,p):[];const bset=new Set(bi.map(K));
 for(const q of ai){const qk=K(q),edge=pair(q,p);if(!added.has(k)&&!added.has(qk)){if(!bset.has(qk))changedKept.push({source:q,target:p,kind:'introduced_between_survivors'});else unchanged++;}
  else if(!allowed.has(edge))bad.push({source:q,target:p,source_block:post.get(qk),target_block:post.get(k),kind:'unaccounted_new_effective_input'});else allowedNew++;
 }
 if(!removed.has(k)&&!added.has(k)){const aset=new Set(ai.map(K));for(const q of bi)if(!removed.has(K(q))&&!aset.has(K(q)))changedKept.push({source:q,target:p,kind:'lost_between_survivors'});}
 audited++;
}
const fail=bad.length||changedKept.length;
let negativeProbes=0;const chosen=d.connections[0],oldArrival=post.get(K(chosen.arrival)),travel=D[oldArrival.properties.facing],opposite=Object.keys(D).find(k=>K(D[k])===K(neg(travel)));
post.set(K(chosen.arrival),{...oldArrival,properties:{...oldArrival.properties,facing:opposite}});assert(!inputs(post,chosen.destination).some(q=>K(q)===K(chosen.arrival)));post.set(K(chosen.arrival),oldArrival);negativeProbes++;
const stair=d.edges.find(v=>v.to.y===v.from.y+1&&post.get(K(v.from))?.id===W&&post.get(K(v.to))?.id===W);assert(stair);const cap=add(stair.from,P(0,1,0));assert(!post.has(K(cap)));post.set(K(cap),{id:S});assert(!inputs(post,stair.to).some(q=>K(q)===K(stair.from)));post.delete(K(cap));negativeProbes++;
const routes=[];for(const r of d.connections){let run=0,max=0,nominal=0;for(const p of[r.tap,...r.path,r.arrival]){const b=post.get(K(p));assert(b);if(b.id===R){nominal+=2*Number(b.properties.delay);run=0;}else if(b.id===W){run++;max=Math.max(max,run);}else assert.fail('Unexpected cable block '+K(p));}assert(max<=13,'Unrefreshable cable '+r.name);routes.push({name:r.name,points:r.path.length,maximum_wire_run:max,minimum_possible_rear_power:16-max,nominal_ticks_including_source_tap:nominal});}
const hashes={};for(const n of['trial-design.json','extracted-map.json','foreign-obstacles.json','local-qualified.json','check-effective.mjs'])hashes['artifacts/full-gpu-layout-v1/memory/channel-colocation-v1/'+n]=createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const out={status:fail?'replacement_effective_inputs_refused':'replacement_effective_inputs_passed',metrics:d.metrics,foreign_cells:foreign.blocks.length,audited_receivers:audited,unchanged_survivor_dependencies:unchanged,allowed_new_dependencies:allowedNew,unexpected_new_dependencies:bad,changed_survivor_dependencies:changedKept,routes,negative_probes:negativeProbes,source_sha256:hashes,native_acceptance:false,complete_gpu_layout:false,limits:['Effective-input contact graph plus authored route capacity; not event, pulse or physical timing acceptance.','Selected machine sources and all foreign rows in the changed four-cell halo are bound separately.','Cold overlays must remain explicit; the six F-rail removals do not authorize arbitrary cold-input behavior.']};
writeFileSync(new URL('effective-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,routes:undefined,source_sha256:undefined,unexpected_new_dependencies:bad.slice(0,20),changed_survivor_dependencies:changedKept.slice(0,20)}));assert(!fail,'Replacement has unexpected effective dependency');
