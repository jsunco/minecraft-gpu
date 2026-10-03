// Bounded effective-input comparison for the newly joined local fabric group.
// Rules are the frozen channel-colocation-v1/check-effective.mjs rules.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K} from '../../control-commit-v2/route.mjs';
import {key as packedKey,encode,repeater,findFeedback} from '../../repeater-feedback-census-v1/dependencies.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),d=read('local-design.json'),base=read('local-bodies.json');
const W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block';
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),N=v=>P(-v.x,-v.y,-v.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},HOR=Object.values(D),DIR=[...HOR,P(0,1,0),P(0,-1,0)];
const solid=b=>b?.id.endsWith('_concrete'),active=b=>b&&!solid(b),edge=(a,b)=>K(a)+'>'+K(b);
function emitted(w,s,t){const b=w.get(K(s));if(!b)return false;if([R,C].includes(b.id))return K(A(s,D[b.properties.facing]))===K(t);if([T,WT].includes(b.id))return K(t)!==K(A(s,b.id===T?P(0,-1,0):D[b.properties.facing]));return[W,RB,'minecraft:lever'].includes(b.id);}
function sources(w,p,wire){const out=[];for(const v of DIR){const q=A(p,v),b=w.get(K(q));if(!b)continue;const strong=([R,C].includes(b.id)&&emitted(w,q,p))||([T,WT].includes(b.id)&&v.y===-1);if(strong||!wire&&b.id===W&&v.y!==-1)out.push(q);}return out;}
function inputs(w,p){const b=w.get(K(p)),out=[];if(!active(b))return out;
 const raw=(q,wire=false)=>{const b=w.get(K(q));if(solid(b))out.push(...sources(w,q,wire));else if(emitted(w,q,p))out.push(q);};
 if(b.id===W){for(const v of DIR){const q=A(p,v);if(w.get(K(q))?.id!==W)raw(q,true);}for(const v of HOR){const q=A(p,v),hi=A(q,P(0,1,0)),lo=A(q,P(0,-1,0));if(w.get(K(q))?.id===W)out.push(q);if(solid(w.get(K(q)))&&!solid(w.get(K(A(p,P(0,1,0)))))&&w.get(K(hi))?.id===W)out.push(hi);if(!solid(w.get(K(q)))&&w.get(K(lo))?.id===W)out.push(lo);}}
 else if([R,C].includes(b.id)){const v=D[b.properties.facing];raw(A(p,N(v)));for(const s of HOR){if(s.x*v.x+s.z*v.z)continue;const q=A(p,s),qb=w.get(K(q));if([R,C].includes(qb?.id)&&emitted(w,q,p))out.push(q);else if(b.id===C&&[W,RB].includes(qb?.id))out.push(q);}}
 else if([T,WT].includes(b.id)){const q=A(p,b.id===T?P(0,-1,0):D[b.properties.facing]);assert(solid(w.get(K(q))),'Torch support '+K(p));out.push(...sources(w,q,false));}
 return [...new Map(out.map(p=>[K(p),p])).values()];
}
const world=new Map(d.blocks.map(v=>[K(v.position),v.block])),body=new Map(base.blocks.map(v=>[K(v.position),v.block]));assert.equal(world.size,d.blocks.length);assert.equal(body.size,142464);
const owners=new Map(base.blocks.map(v=>[K(v.position),v.part])),local=new Map(base.modules.map(m=>[m.name,new Map()]));
for(const v of base.blocks)local.get(v.part).set(K(v.position),v.block);
const expected=new Map(),bodyEdges=[];for(const v of base.blocks)if(active(v.block)){const ins=inputs(local.get(v.part),v.position);expected.set(K(v.position),new Set(ins.map(K)));for(const q of ins)bodyEdges.push(edge(q,v.position));}
const allowed=new Set(bodyEdges);for(const e of d.edges){allowed.add(edge(e.from,e.to));if(world.get(K(e.from))?.id===W&&world.get(K(e.to))?.id===W)allowed.add(edge(e.to,e.from));}
const bad=[],lost=[],missingEdges=[],badSupports=[];let activeCells=0,newDependencies=0,keptDependencies=0;
for(const v of d.blocks){const p=v.position,k=K(p);assert(p.y>=-64&&p.y<=319);if([W,R,C,T].includes(v.block.id)&&!solid(world.get(K(A(p,P(0,-1,0))))))badSupports.push(p);if(!active(v.block))continue;activeCells++;const after=inputs(world,p),set=new Set(after.map(K));
 for(const q of after){if(!allowed.has(edge(q,p)))bad.push({source:q,target:p,source_block:world.get(K(q)),target_block:v.block,source_owner:owners.get(K(q))??'new_cable',target_owner:v.part});else if(expected.get(k)?.has(K(q)))keptDependencies++;else newDependencies++;}
 for(const q of expected.get(k)??[])if(!set.has(q))lost.push({source:q,target:p});
}
for(const e of d.edges)if(!inputs(world,e.to).some(p=>K(p)===K(e.from)))missingEdges.push(e);
function checkDAG(nodes,adj,cost,start,end){
 let serial=0;const number=new Map(),low=new Map(),stack=[],onStack=new Set(),components=[];
 function visit(v){number.set(v,serial);low.set(v,serial++);stack.push(v);onStack.add(v);for(const q of adj.get(v)??[]){if(!number.has(q)){visit(q);low.set(v,Math.min(low.get(v),low.get(q)));}else if(onStack.has(q))low.set(v,Math.min(low.get(v),number.get(q)));}if(low.get(v)===number.get(v)){const c=[];let q;do{q=stack.pop();onStack.delete(q);c.push(q);}while(q!==v);components.push(c);}}
 for(const v of nodes)if(!number.has(v))visit(v);
 for(const c of components)if(c.length>1||adj.get(c[0])?.has(c[0]))assert(!c.some(k=>cost.get(k)>0),'Positive-device cycle');
 const component=new Map();components.forEach((c,i)=>c.forEach(k=>component.set(k,i)));
 const edges=components.map(()=>new Set()),indegree=components.map(()=>0);for(const[v,qs]of adj)for(const q of qs){const a=component.get(v),b=component.get(q);if(a!==b&&!edges[a].has(b)){edges[a].add(b);indegree[b]++;}}
 const queue=indegree.flatMap((v,i)=>v===0?[i]:[]),delay=components.map(()=>-Infinity);delay[component.get(start)]=0;
 for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of edges[a]){delay[b]=Math.max(delay[b],delay[a]+Math.max(...components[b].map(k=>cost.get(k))));if(--indegree[b]===0)queue.push(b);}}
 assert.equal(queue.length,components.length);assert(Number.isFinite(delay[component.get(end)]),'Missing source-to-matching-sink path');
 return {vertices:nodes.length,zero_cost_components:components.filter(c=>c.length>1).length,nominal_max_source_to_sink:delay[component.get(end)]};
}
const routes=[];for(const r of d.connections){let wire=0,max=0,ticks=0;for(const p of[r.tap,...r.path,r.arrival]){const b=world.get(K(p));assert(b);if(b.id===R){ticks+=2*Number(b.properties.delay);wire=0;}else{assert.equal(b.id,W);max=Math.max(max,++wire);}}assert(max<=13);
 const positions=[r.source,r.tap,...r.path,r.arrival,r.destination],keys=new Set(positions.map(K)),adj=new Map([...keys].map(k=>[k,new Set()])),cost=new Map();
 for(const p of positions){const b=world.get(K(p));cost.set(K(p),b.id===R?2*Number(b.properties.delay):0);for(const q of inputs(world,p))if(keys.has(K(q)))adj.get(K(q)).add(K(p));}
 const dag=checkDAG([...keys],adj,cost,K(r.source),K(r.destination));assert.equal(dag.nominal_max_source_to_sink,ticks);
 routes.push({name:r.name,nominal_route_ticks:ticks,maximum_wire_run:max,minimum_possible_rear_power:16-max,points:r.path.length,dag});}
// Same narrow census as the full reference: actual output→rear dust paths,
// not a proof excluding arbitrary multi-device cycles.
const packed=new Map(d.blocks.map(v=>[packedKey(v.position),encode(v.block)])),feedback=[];let repeatersChecked=0;
for(const[k,v]of packed)if(repeater(v)){repeatersChecked++;const w=findFeedback(packed,k);if(w)feedback.push(w);}
let negatives=0;const first=d.connections[0],old=world.get(K(first.arrival)),travel=D[old.properties.facing],opposite=Object.keys(D).find(f=>K(D[f])===K(N(travel)));
world.set(K(first.arrival),{...old,properties:{...old.properties,facing:opposite}});assert(!inputs(world,first.destination).some(q=>K(q)===K(first.arrival)));world.set(K(first.arrival),old);negatives++;
const staircase=d.edges.find(e=>e.to.y===e.from.y+1&&world.get(K(e.from))?.id===W&&world.get(K(e.to))?.id===W);assert(staircase);const cap=A(staircase.from,P(0,1,0));assert(!world.has(K(cap)));world.set(K(cap),{id:'minecraft:light_gray_concrete'});assert(!inputs(world,staircase.to).some(p=>K(p)===K(staircase.from)));world.delete(K(cap));negatives++;
assert.throws(()=>checkDAG(['a','b','c'],new Map([['a',new Set(['b'])],['b',new Set(['c'])],['c',new Set(['a'])]]),new Map([['a',0],['b',2],['c',0]]),'a','c'),/Positive-device cycle/);negatives++;
const hashes={};for(const n of['place-local.mjs','check-local.mjs','local-design.json','local-bodies.json','local-paths.json'])hashes[n]=createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const fail=bad.length||lost.length||missingEdges.length||badSupports.length||feedback.length;
const out={status:fail?'local_group_refused':'local_group_static_checks_passed',metrics:d.metrics,activeCells,keptDependencies,newDependencies,bad,lost,missingEdges,badSupports,routes,repeatersChecked,feedback,negative_cases:negatives,source_sha256:hashes,limits:d.limits,native_acceptance:false,complete_fabric:false};
writeFileSync(new URL('local-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,source_sha256:undefined,routes:undefined,bad:bad.slice(0,20),lost:lost.slice(0,10),missingEdges:missingEdges.slice(0,10),feedback:feedback.slice(0,5)}));assert(!fail,'Unexpected input, missing dependency, unsupported block or local output feedback');
