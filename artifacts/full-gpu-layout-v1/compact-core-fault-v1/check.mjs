// Actual-cell differential power/contact audit for both selected core frames.
// Same conservative local dependency rules as program-rom-timing-v1/check.py;
// these establish potential inputs, not Minecraft event/pulse correctness.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import{createHash}from'node:crypto';
import {readLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {P,K,add,W,S} from './layout.mjs';
const read=n=>readLargeDesign(fileURLToPath(new URL(n,import.meta.url))),d=read('trial-design.json'),base=read('obstacles.json'),foreign=read('foreign-obstacles.json'),e=read('extraction.json');
const R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block';
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},H=Object.values(D),DIR=[...H,P(0,1,0),P(0,-1,0)],neg=v=>P(-v.x,-v.y,-v.z),solid=b=>b?.id.endsWith('_concrete'),active=b=>b&&!solid(b),pair=(a,b)=>K(a)+'>'+K(b);
const removed=new Set(d.removed.map(v=>K(v.position))),added=new Set(d.blocks.map(v=>K(v.position))),moved=new Map(e.cluster_cells.map(v=>[K(v.position),K(add(v.position,d.candidate.translation))]));
function emitted(w,src,dst){const b=w.get(K(src));if(!b)return false;if([R,C].includes(b.id))return K(add(src,D[b.properties.facing]))===K(dst);if([T,WT].includes(b.id)){const support=add(src,b.id===T?P(0,-1,0):D[b.properties.facing]);return K(dst)!==K(support);}return [W,RB,'minecraft:lever'].includes(b.id);}
function solidSources(w,p,wireConsumer){const out=[];for(const v of DIR){const q=add(p,v),b=w.get(K(q));if(!b)continue;const strong=([R,C].includes(b.id)&&emitted(w,q,p))||([T,WT].includes(b.id)&&v.y===-1);if(strong||(!wireConsumer&&b.id===W&&v.y!==-1))out.push(q);}return out;}
function inputs(w,p){const b=w.get(K(p)),out=[];if(!active(b))return out;const raw=(q,wireConsumer=false)=>{const v=w.get(K(q));if(solid(v))out.push(...solidSources(w,q,wireConsumer));else if(emitted(w,q,p))out.push(q);};
 if(b.id===W){for(const v of DIR){const q=add(p,v);if(w.get(K(q))?.id!==W)raw(q,true);}for(const v of H){const q=add(p,v),above=add(q,P(0,1,0)),below=add(q,P(0,-1,0));if(w.get(K(q))?.id===W)out.push(q);if(solid(w.get(K(q)))&&!solid(w.get(K(add(p,P(0,1,0)))))&&w.get(K(above))?.id===W)out.push(above);if(!solid(w.get(K(q)))&&w.get(K(below))?.id===W)out.push(below);}}
 else if([R,C].includes(b.id)){const v=D[b.properties.facing];raw(add(p,neg(v)));for(const s of H){if(s.x*v.x+s.z*v.z)continue;const q=add(p,s),qb=w.get(K(q));if([R,C].includes(qb?.id)&&emitted(w,q,p))out.push(q);else if(b.id===C&&[W,RB].includes(qb?.id))out.push(q);}}
 else if([T,WT].includes(b.id)){const q=add(p,b.id===T?P(0,-1,0):D[b.properties.facing]);assert(solid(w.get(K(q))),'Torch support '+K(p));out.push(...solidSources(w,q,false));}
 return [...new Map(out.map(q=>[K(q),q])).values()];
}
const oldRows=[...base.blocks,...d.removed],orig=new Map(oldRows.map(v=>[K(v.position),v.block])),post=new Map([...base.blocks,...d.blocks].map(v=>[K(v.position),v.block]));assert.equal(orig.size,oldRows.length);assert.equal(post.size,base.blocks.length+d.blocks.length);
for(const v of d.blocks){assert(v.position.y>=-64&&v.position.y<=319);if([W,R,C,T].includes(v.block.id))assert(solid(post.get(K(add(v.position,P(0,-1,0))))),'New support '+K(v.position));}
// Every modified-neighborhood receiver is queried with the complete world map.
const foreignActive=new Set(foreign.blocks.filter(v=>active(v.block)).map(v=>K(v.position)));
const affected=new Map();for(const v of [...d.removed,...d.blocks])for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const p=P(v.position.x+dx,v.position.y+dy,v.position.z+dz);if(active(orig.get(K(p)))||active(post.get(K(p)))||foreignActive.has(K(p)))affected.set(K(p),p);}
const allowed=new Set(d.edges.flatMap(v=>{const out=[pair(v.from,v.to)];if(post.get(K(v.from))?.id===W&&post.get(K(v.to))?.id===W)out.push(pair(v.to,v.from));return out;}));
// Cluster-internal Boolean circuitry is preserved as actual blocks. Its old
// effective power inputs, including through supports, must translate exactly.
for(const v of e.cluster_cells)if(active(v.block))for(const q of inputs(orig,v.position))if(moved.has(K(q)))allowed.add(moved.get(K(q))+'>'+moved.get(K(v.position)));
function frame(name){const extras=foreign.blocks.filter(v=>v.relative_to_core===name);const before=new Map(orig),after=new Map(post);for(const v of extras){assert(!before.has(K(v.position)),'Foreign original collision');assert(!after.has(K(v.position)),'Foreign replacement collision');before.set(K(v.position),v.block);after.set(K(v.position),v.block);}
 const receivers=new Map(affected);for(const edge of d.edges)assert(inputs(after,edge.to).some(q=>K(q)===K(edge.from)),'Authored edge has no actual dependency '+pair(edge.from,edge.to));
 const bad=[],changedKept=[];let audited=0,allowedNew=0,unchanged=0;
 for(const[k,p]of receivers){const bi=active(before.get(k))?inputs(before,p):[],ai=active(after.get(k))?inputs(after,p):[];const bset=new Set(bi.map(K));
  for(const q of ai){const qk=K(q),edge=pair(q,p);if(!added.has(k)&&!added.has(qk)){if(!bset.has(qk))changedKept.push({source:q,target:p,kind:'introduced_between_survivors'});else unchanged++;}
   else if(!allowed.has(edge))bad.push({source:q,target:p,source_block:after.get(qk),target_block:after.get(k),kind:'unaccounted_new_effective_input'});else allowedNew++;
  }
  if(!removed.has(k)&&!added.has(k)){const aset=new Set(ai.map(K));for(const q of bi)if(!removed.has(K(q))&&!aset.has(K(q)))changedKept.push({source:q,target:p,kind:'lost_between_survivors'});}
  audited++;
 }
 return {frame:name,foreign_cells:extras.length,audited_receivers:audited,unchanged_survivor_dependencies:unchanged,allowed_new_dependencies:allowedNew,unexpected_new_dependencies:bad,changed_survivor_dependencies:changedKept};
}
const frames=['core0','core1'].map(frame),fail=frames.some(v=>v.unexpected_new_dependencies.length||v.changed_survivor_dependencies.length);
// Real-route negative probes: reversing an endpoint diode or capping a rising
// stair must remove its required actual path, independent of authored edges.
let negativeProbes=0;const chosen=d.connections.find(r=>!r.internal),oldArrival=post.get(K(chosen.arrival)),travel=D[oldArrival.properties.facing],opposite=Object.keys(D).find(k=>K(D[k])===K(neg(travel)));
post.set(K(chosen.arrival),{...oldArrival,properties:{...oldArrival.properties,facing:opposite}});assert(!inputs(post,chosen.destination).some(q=>K(q)===K(chosen.arrival)));post.set(K(chosen.arrival),oldArrival);negativeProbes++;
const stair=d.edges.find(v=>v.to.y===v.from.y+1&&post.get(K(v.from))?.id===W&&post.get(K(v.to))?.id===W);assert(stair);const cap=add(stair.from,P(0,1,0));assert(!post.has(K(cap)));post.set(K(cap),{id:S});assert(!inputs(post,stair.to).some(q=>K(q)===K(stair.from)));post.delete(K(cap));negativeProbes++;
const routes=[];for(const r of d.connections){let run=0,max=0,nominal=0;for(const p of[r.tap,...r.path,r.arrival]){const b=post.get(K(p));assert(b);if(b.id===R){nominal+=2*Number(b.properties.delay);run=0;}else if(b.id===W){run++;max=Math.max(max,run);}else assert.fail('Unexpected cable block '+K(p));}assert(max<=12,'Unrefreshable cable '+r.name);routes.push({name:r.name,points:r.path.length,maximum_wire_run:max,minimum_possible_rear_power:16-max,nominal_ticks_including_tap:nominal});}
const out={status:fail?'relocation_contact_refused':'relocation_actual_cell_dependency_screen_passed',metrics:d.metrics,frames,routes,negative_probes:negativeProbes,source_sha256:{...d.source_sha256,...Object.fromEntries(['trial-design.json','check.mjs'].map(n=>['artifacts/full-gpu-layout-v1/compact-core-fault-v1/'+n,createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex')]))},native_acceptance:false,complete_gpu_layout:false,limits:['Conservative possible-dependency graph includes directional diodes, dust stairs, strong conductor paths, torch supports and comparator/repeater side inputs. It does not simulate pulse order, burnout or live Minecraft events.','Every candidate routed cable is noninverting with at most12 consecutive dust nodes; this is possible strength capacity, not a proof its source is active.','Timing and source closure still require separate versioned checks.']};
writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,frames:frames.map(v=>({...v,unexpected_new_dependencies:v.unexpected_new_dependencies.slice(0,20),changed_survivor_dependencies:v.changed_survivor_dependencies.slice(0,20)})),routes}));assert(!fail,'Unaccounted replacement power dependency');
