import assert from 'node:assert/strict';
import {inputs} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
export const K=p=>`${p.x},${p.y},${p.z}`;
const P=k=>{const[x,y,z]=k.split(',').map(Number);return{x,y,z};};
export function evaluate(w,transport){
 const nodes=[...transport].map(P),idx=new Map(nodes.map((p,i)=>[K(p),i])),edges=nodes.map(()=>[]),rev=nodes.map(()=>[]),roots=[],rootMap=new Map(),external=[];
 for(let i=0;i<nodes.length;i++)for(const p of inputs(w,nodes[i])){const j=idx.get(K(p));if(j!==undefined){edges[j].push(i);rev[i].push(j);}else{let r=rootMap.get(K(p));if(r===undefined){r=roots.length;rootMap.set(K(p),r);roots.push(p);}external.push([r,i]);}}
 const seen=new Uint8Array(nodes.length),order=[];
 for(let s=0;s<nodes.length;s++)if(!seen[s]){seen[s]=1;const st=[[s,0]];while(st.length){const f=st.at(-1);if(f[1]<edges[f[0]].length){const j=edges[f[0]][f[1]++];if(!seen[j]){seen[j]=1;st.push([j,0]);}}else{order.push(f[0]);st.pop();}}}
 const comp=new Int32Array(nodes.length).fill(-1),members=[];
 for(let o=order.length-1;o>=0;o--){const s=order[o];if(comp[s]!==-1)continue;const ci=members.length,todo=[s],m=[];comp[s]=ci;for(let n=0;n<todo.length;n++){const i=todo[n];m.push(i);for(const j of rev[i])if(comp[j]===-1){comp[j]=ci;todo.push(j);}}members.push(m);}
 assert(members.every(m=>m.length===1||m.every(i=>w.get(K(nodes[i])).id==='minecraft:redstone_wire')),'Non-wire cycle');
 const incoming=members.map(()=>new Set()),outgoing=members.map(()=>new Set()),rootInputs=members.map(()=>new Set()),indeg=new Int32Array(members.length);
 for(let i=0;i<nodes.length;i++)for(const j of edges[i])if(comp[i]!==comp[j]){incoming[comp[j]].add(comp[i]);outgoing[comp[i]].add(comp[j]);}
 for(const[r,i]of external)rootInputs[comp[i]].add(r);for(let i=0;i<members.length;i++)indeg[i]=incoming[i].size;
 const queue=[];for(let i=0;i<members.length;i++)if(!indeg[i])queue.push(i);const expr=[];
 for(let qi=0;qi<queue.length;qi++){const ci=queue[qi],ids=[...new Set([...rootInputs[ci],...[...incoming[ci]].flatMap(j=>expr[j].root_ids)])].sort((a,b)=>a-b);assert(ids.length<=2,'Unexpected multiple source cone');const pos=new Map(ids.map((r,i)=>[r,i]));const invert=members[ci].some(i=>['minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(w.get(K(nodes[i])).id));let table=0;
  for(let a=0;a<1<<ids.length;a++){let value=[...rootInputs[ci]].some(r=>a&(1<<pos.get(r)))||[...incoming[ci]].some(j=>{const e=expr[j];let b=0;for(let k=0;k<e.root_ids.length;k++)if(a&(1<<pos.get(e.root_ids[k])))b|=1<<k;return e.table&(1<<b);});if(invert)value=!value;if(value)table|=1<<a;}
  expr[ci]={root_ids:ids,table};for(const j of outgoing[ci])if(!--indeg[j])queue.push(j);}
 assert.equal(queue.length,members.length);
 return{get(p){const i=idx.get(K(p));assert.notEqual(i,undefined,'Missing transport endpoint '+K(p));const e=expr[comp[i]];return{roots:e.root_ids.map(r=>roots[r]),table:e.table};},metrics:{vertices:nodes.length,edges:edges.reduce((n,e)=>n+e.length,0),roots:roots.length,wire_components:members.filter(m=>m.length>1).length,torch_vertices:nodes.filter(p=>['minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(w.get(K(p)).id)).length}};
}
