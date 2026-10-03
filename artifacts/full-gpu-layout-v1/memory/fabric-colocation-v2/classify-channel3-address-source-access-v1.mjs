// Next bounded assignment only: no blocks placed and no old cuts closed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K,V,F} from './allocation-route.mjs';
import {inputs,active} from './cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from './settled-network.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const d=read('channel2-address-design.json'),plan=read('next-bank-input-bindings.json'),ledger=read('channel2-address-cut-ledger.json'),map=new Map(d.blocks.map(v=>[K(v.position),v.block]));
const W='minecraft:redstone_wire',R='minecraft:repeater',S='minecraft:light_gray_concrete',T='minecraft:redstone_torch';
const U=p=>P(p.x,p.y-1,p.z),step=(p,dir,n=1)=>P(p.x+V[dir][0]*n,p.y,p.z+V[dir][1]*n);
function departure(p){
 const b=map.get(K(p));assert([W,S].includes(b?.id));const source=b.id===S?U(p):p;if(b.id===S)assert.equal(map.get(K(source))?.id,T);
 for(const dir of ['south','north','west','east']){
  const tap=step(p,dir),start=step(p,dir,2),rows=[[tap,{id:R,properties:{facing:F[dir],delay:'1'}}],[U(tap),{id:S}],[start,{id:W}],[U(start),{id:S}]];
  if(rows.some(([q])=>map.has(K(q))))continue;
  const added=new Map(rows.map(([q,b])=>[K(q),b])),after={get:k=>added.get(k)??map.get(k)},allowed=new Set([K(source)+'>'+K(tap),K(tap)+'>'+K(start)]),affected=new Map();
  for(const [q]of rows)for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const r=P(q.x+dx,q.y+dy,q.z+dz);if(active(after.get(K(r))))affected.set(K(r),r);}
  let bad=false;for(const [k,q]of affected){const a=new Set(inputs(map,q).map(K)),b=new Set(inputs(after,q).map(K));if([...a].some(k=>!b.has(k))||[...b].some(i=>!a.has(i)&&!allowed.has(i+'>'+k))){bad=true;break;}}
  if(!bad&&inputs(after,tap).some(q=>K(q)===K(source)))return {source,sourcePad:p,tap,start,travel:dir,proposed_cells:rows.map(([position,block])=>({position,block})),checked_affected_receivers:affected.size};
 }
 return null;
}
let cases=0;const prior=read('next-channel3-address-assignment.json'),sources=[];
for(const old of prior.sources){const p=[7].includes(old.bit)?P(old.storage.x-1,old.storage.y,old.storage.z):old.proposed_departure.sourcePad,cone=backwardCone(map,p,[old.storage]);assert(cone.some(q=>K(q)===K(old.storage)));const ev=makeSettledEvaluator(map,cone,[old.storage]),levels=[];for(const n of[0,15]){const value=ev(new Map([[K(old.storage),n]])).power.get(K(p))??0;assert.equal(value,n);levels.push({stored:n,source:value});cases++;}const access=departure(p);assert(access);if(![7].includes(old.bit))assert.deepEqual(access,old.proposed_departure);sources.push({...old,proposed_departure:access,chosen_source_cone:cone,chosen_source_levels:levels,source_access_refinement:[7].includes(old.bit)?{reason:'Choose the positive wire immediately beside the same retained bit7 cell; its actual source0/15 function and isolated departure are checked directly, reducing dependence on the later exporter escape.',old_departure:old.proposed_departure,new_departure:access}:null});}
const out={...prior,status:'channel3_source_access_v1_bit7_same_retained_cell_positive_wire_proven',sources,cases,source_sha256:Object.fromEntries(['classify-channel3-address-source-access-v1.mjs','next-channel3-address-assignment.json','channel2-address-design.json','cut-inputs.mjs','settled-network.mjs','allocation-route.mjs'].map(n=>[n,hash(n)]))};writeFileSync(new URL('channel3-address-source-access-v1.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,cases,changed_bits:[7]}));
