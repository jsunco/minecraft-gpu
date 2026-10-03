// Independent threshold-BDD evaluator on actual electrical SCCs. Wire SCCs
// are solved from level15 downwards because every wire edge loses one level.
import assert from 'node:assert/strict';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block',D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
export class BDD {
 constructor(names){this.names=names;this.nodes=[null,null];this.unique=new Map();this.memo=new Map();this.inverse=new Map([[0,1],[1,0]]);this.vars=names.map((_,i)=>this.node(i,0,1));}
 node(v,lo,hi){if(lo===hi)return lo;const key=v+','+lo+','+hi;if(this.unique.has(key))return this.unique.get(key);const id=this.nodes.length;this.nodes.push({v,lo,hi});this.unique.set(key,id);return id;}
 not(x){if(this.inverse.has(x))return this.inverse.get(x);const a=this.nodes[x],n=this.node(a.v,this.not(a.lo),this.not(a.hi));this.inverse.set(x,n);this.inverse.set(n,x);return n;}
 and(x,y){if(!x||!y)return 0;if(x===1)return y;if(y===1||x===y)return x;if(x>y)[x,y]=[y,x];const key=x+','+y;if(this.memo.has(key))return this.memo.get(key);const a=this.nodes[x],b=this.nodes[y],v=Math.min(a.v,b.v),r=this.node(v,this.and(a.v===v?a.lo:x,b.v===v?b.lo:y),this.and(a.v===v?a.hi:x,b.v===v?b.hi:y));this.memo.set(key,r);return r;}
 or(x,y){return this.not(this.and(this.not(x),this.not(y)));}
 value(x,mask){while(x>1){const n=this.nodes[x];x=mask>>n.v&1?n.hi:n.lo;}return x;}
 witness(x){assert(x);let mask=0;while(x>1){const n=this.nodes[x];if(n.lo)x=n.lo;else{mask|=1<<n.v;x=n.hi;}}return mask;}
}
export function cone(map,targets,roots){const stop=new Set(roots.map(K)),seen=new Map(),q=[...targets];for(let i=0;i<q.length;i++){const p=q[i],k=K(p);if(seen.has(k))continue;assert(active(map.get(k)),'Missing active device '+k);seen.set(k,p);if(!stop.has(k))q.push(...inputs(map,p));}return [...seen.values()];}
export function symbolic(map,positions,seeds,bdd=new BDD(Object.keys(seeds))){
 const keys=positions.map(K),ix=new Map(keys.map((k,i)=>[k,i])),rows=positions.map(p=>map.get(K(p))),held=new Map(Object.entries(seeds).map(([n,p])=>[ix.get(K(p)),bdd.vars[bdd.names.indexOf(n)]]));assert(!held.has(undefined));
 const incoming=positions.map((p,i)=>held.has(i)?[]:inputs(map,p).map(q=>{const n=ix.get(K(q));assert.notEqual(n,undefined,'Cone misses input '+K(q));return n;})),out=positions.map(()=>[]);incoming.forEach((qs,i)=>qs.forEach(q=>out[q].push(i)));
 const visited=new Set(),order=[];for(let i=0;i<positions.length;i++)if(!visited.has(i)){visited.add(i);const todo=[[i,0]];while(todo.length){const t=todo.at(-1);if(t[1]<out[t[0]].length){const q=out[t[0]][t[1]++];if(!visited.has(q)){visited.add(q);todo.push([q,0]);}}else{order.push(t[0]);todo.pop();}}}
 const components=[],component=new Int32Array(positions.length).fill(-1);for(let n=order.length-1;n>=0;n--){const i=order[n];if(component[i]>=0)continue;const c=components.length,q=[i];component[i]=c;for(let j=0;j<q.length;j++)for(const s of incoming[q[j]])if(component[s]<0){component[s]=c;q.push(s);}assert(q.length===1||q.every(v=>rows[v].id===W),'Non-wire feedback');components.push(q);}
 for(let i=0;i<incoming.length;i++)for(const j of incoming[i])assert(component[j]<=component[i]);
 const levels=positions.map(()=>new Uint32Array(17)),merge=(a,ids,k)=>ids.reduce((v,i)=>bdd.or(v,levels[i][k]),a);let wireComponents=0;
 for(let ci=0;ci<components.length;ci++){const group=components[ci];if(group.length>1){wireComponents++;for(let k=15;k>=1;k--)for(const i of group){let v=0;for(const j of incoming[i])v=bdd.or(v,levels[j][k+(rows[j].id===W?1:0)]);levels[i][k]=v;}continue;}
  const i=group[0],b=rows[i];if(held.has(i)){for(let k=1;k<=15;k++)levels[i][k]=held.get(i);continue;}const dir=D[b.properties?.facing],rear=dir?incoming[i].filter(j=>(positions[j].x-positions[i].x)*dir[0]+(positions[j].z-positions[i].z)*dir[1]<0):incoming[i],side=incoming[i].filter(j=>!rear.includes(j));if(b.id===R)assert.equal(side.length,0,'Unheld repeater lock');
  if(b.id===W){for(let k=1;k<=15;k++)for(const j of incoming[i])levels[i][k]=bdd.or(levels[i][k],levels[j][k+(rows[j].id===W?1:0)]);}
  else if(b.id===R||b.id===T||b.id===WT||b.id===RB){const v=b.id===RB?1:b.id===R?merge(0,rear,1):bdd.not(merge(0,incoming[i],1));for(let k=1;k<=15;k++)levels[i][k]=v;}
  else if(b.id===C){const a=Array.from({length:17},(_,k)=>k===0?1:merge(0,rear,k)),s=Array.from({length:17},(_,k)=>k===0?1:merge(0,side,k));for(let k=1;k<=15;k++)for(let n=0;n<=15;n++){const exact=bdd.and(s[n],bdd.not(s[n+1]??0)),want=b.properties?.mode==='subtract'?(a[k+n]??0):a[Math.max(k,n)];levels[i][k]=bdd.or(levels[i][k],bdd.and(exact,want));}}
  else throw Error('Unsupported unheld device '+b.id);
 }
 const at=p=>{const i=ix.get(K(p));assert.notEqual(i,undefined);return levels[i];},value=(p,mask)=>{let v=0;for(let k=1;k<=15;k++)if(bdd.value(at(p)[k],mask))v=k;return v;};return{bdd,positions,keys,incoming,components,levels,at,value,metrics:{nodes:positions.length,components:components.length,wire_components:wireComponents,bdd_nodes:bdd.nodes.length,variables:bdd.names.length,assignments:2**bdd.names.length,thresholds:15}};
}
