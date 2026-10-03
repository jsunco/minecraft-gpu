// Local derivative adds actual redstone-block constant semantics; frozen parent stays unchanged.
// Static settled-level evaluation of an explicit acyclic active-device cone.
// This is not a tick/event simulator, pulse-width proof, or Minecraft acceptance.
import assert from 'node:assert/strict';
import {P,K} from '../memory/fabric-colocation-v2/allocation-route.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
export function makeSettledEvaluator(map,positions,boundary){
 const nodes=new Map(positions.map(p=>[K(p),p])),forced=new Set(boundary.map(K)),specs=new Map(),down=new Map();
 for(const [k,p]of nodes){assert(active(map.get(k)));const b=map.get(k),ins=forced.has(k)?[]:inputs(map,p);for(const q of ins){const qk=K(q);assert(nodes.has(qk)||forced.has(qk),'Missing settled source '+qk+' -> '+k);if(!down.has(qk))down.set(qk,[]);down.get(qk).push(k);}const d=D[b.properties?.facing],rear=ins.filter(q=>!d||(q.x-p.x)*d[0]+(q.z-p.z)*d[1]<0),side=ins.filter(q=>!rear.includes(q));specs.set(k,{b,ins,rear,side});}
 return values=>{const power=new Map([...forced].map(k=>[k,values.get(k)??0])),queue=[...nodes.keys()],waiting=new Set(queue);let events=0;const val=q=>power.get(K(q))??0,max=qs=>Math.max(0,...qs.map(val));for(let i=0;i<queue.length;i++){const k=queue[i];waiting.delete(k);if(forced.has(k))continue;assert(++events<200000,'Settled network did not converge');const {b,ins,rear,side}=specs.get(k);let n;
  if(b.id==='minecraft:redstone_block'){assert.equal(ins.length,0);n=15;}
  else if(b.id===W)n=Math.max(0,...ins.map(q=>map.get(K(q))?.id===W?val(q)-1:val(q)));
  else if(b.id===R){assert.equal(side.length,0,'Unmodeled storage/lock');n=max(rear)>0?15:0;}
  else if(b.id===C)n=b.properties.mode==='subtract'?Math.max(0,max(rear)-max(side)):(max(rear)>=max(side)?max(rear):0);
  else if([T,WT].includes(b.id))n=max(ins)>0?0:15;
  else throw Error('Unsupported settled block '+b.id);
  if(n!==(power.get(k)??0)){power.set(k,n);for(const q of down.get(k)??[])if(!waiting.has(q)){waiting.add(q);queue.push(q);}}
 }return {power,events};};
}
export function backwardCone(map,end,stops){const boundary=new Set(stops.map(K)),out=new Map(),todo=[end];for(let i=0;i<todo.length;i++){const p=todo[i],k=K(p);if(out.has(k))continue;out.set(k,p);if(boundary.has(k))continue;assert(active(map.get(k)),'Missing cone device '+k);for(const q of inputs(map,p))todo.push(q);}return [...out.values()];}
