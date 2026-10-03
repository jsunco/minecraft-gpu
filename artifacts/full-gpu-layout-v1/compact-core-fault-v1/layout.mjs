import assert from 'node:assert/strict';
import {P,K,V,F} from '../control-commit-v2/route.mjs';
export {P,K,V,F};
export const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete';
export const add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>P(p.x,p.y-1,p.z);
export const step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
export function translatedConnections(e,delta){return e.connections.map(r=>{
 const source=r.source_moves_with_cluster?add(r.source,delta):r.source,destination=r.destination_moves_with_cluster?add(r.destination,delta):r.destination;
 const sd=Object.keys(V).find(d=>K(step(r.source,d))===K(r.tap)),ad=Object.keys(V).find(d=>K(step(r.arrival,d))===K(r.destination));assert(sd&&ad,r.name);
 return {...r,source,destination,source_direction:sd,arrival_direction:ad,tap:step(source,sd),start:step(source,sd,2),arrival:step(destination,ad,-1),end:step(destination,ad,-2),preserve_start:e.protected_source_prefixes.includes(r.name),preserve_end:e.protected_destination_suffixes.includes(r.name),internal:r.source_is_component&&r.destination_is_component};
});}
export function basePatch(e,base,delta,{parentMap,removedMap}={}){
 const parent=parentMap??new Map(base.blocks.map(v=>[K(v.position),v])),oldRemoved=removedMap??new Map(base.removed.map(v=>[K(v.position),v])),map=new Map(),rows=[],edges=[];
 function put(v){const k=K(v.position),q=map.get(k)??parent.get(k);if(q){assert.deepEqual(q.block,v.block,'Patch collision '+k);assert(q===map.get(k)||v.block.id===S,'Unexpected borrowed active cell '+k);return;}map.set(k,v);rows.push(v);}
 const solid=p=>put({position:p,block:{id:S},part:'relocated_support'}),device=(p,id,properties,part)=>{solid(under(p));put({position:p,block:{id,...properties?{properties}:{}},part});};
 for(const v of e.cluster_cells)put({...v,position:add(v.position,delta),part:'relocated_cluster'});
 const connections=translatedConnections(e,delta);
 // Preserve the entire short internal connection, including its existing
 // diode spacing. This is not an abstract wire shortcut.
 for(const r of connections.filter(r=>r.internal)){
  const old=e.connections.find(v=>v.name===r.name),keys=new Set([...old.path,old.tap,old.arrival].flatMap(p=>[K(p),K(under(p))]));
  for(const k of keys){const v=oldRemoved.get(k);assert(v,k);put({...v,position:add(v.position,delta),part:r.name});}
  r.path=old.path.map(p=>add(p,delta));
 }
 for(const r of connections.filter(r=>!r.internal)){
  if(!r.preserve_start){device(r.tap,'minecraft:repeater',{facing:F[r.source_direction],delay:'1'},r.name);device(r.start,W,null,r.name);}
  if(!r.preserve_end){device(r.arrival,'minecraft:repeater',{facing:F[r.arrival_direction],delay:'1'},r.name);device(r.end,W,null,r.name);}
 }
 for(const r of connections){for(const p of [r.source,r.destination,r.start,r.end])assert.equal((map.get(K(p))??parent.get(K(p)))?.block.id,W,'Missing dust boundary '+r.name+' '+K(p));
  for(const [a,b] of [[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from:a,to:b,route:r.name});
  if(r.internal)for(let i=1;i<r.path.length;i++)edges.push({from:r.path[i-1],to:r.path[i],route:r.name});
 }
 return {blocks:rows,map,connections,edges};
}
