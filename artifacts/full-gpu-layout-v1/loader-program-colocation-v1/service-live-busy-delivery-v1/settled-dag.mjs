// Settled source-aware levels in a component DAG. Multi-node components must
// contain only wires; intentional state/phase outputs are explicit held roots.
// This avoids irrelevant initialization glitches in an acyclic settled proof.
import assert from 'node:assert/strict';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch',RB='minecraft:redstone_block',D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
export function makeSettledEvaluator(map,positions,boundary){
 const ix=new Map(positions.map((p,i)=>[K(p),i])),keys=positions.map(K),held=new Set(boundary.map(p=>ix.get(K(p))));assert(!held.has(undefined));
 const rows=positions.map(p=>{const b=map.get(K(p));assert(active(b));return{p,b};}),incoming=positions.map(()=>[]),out=positions.map(()=>[]),spec=[];
 for(let i=0;i<rows.length;i++){const {p,b}=rows[i],qs=held.has(i)?[]:inputs(map,p),d=D[b.properties?.facing];for(const q of qs){const j=ix.get(K(q));assert.notEqual(j,undefined);incoming[i].push(j);out[j].push(i);}const rear=incoming[i].filter(j=>!d||(positions[j].x-p.x)*d[0]+(positions[j].z-p.z)*d[1]<0),side=incoming[i].filter(j=>!rear.includes(j));if(b.id===R&&!held.has(i))assert.equal(side.length,0,'Unmodeled lock');spec.push({rear,side});}
 const seen=new Uint8Array(rows.length),order=[];for(let i=0;i<rows.length;i++)if(!seen[i]){seen[i]=1;const stack=[[i,0]];while(stack.length){const r=stack.at(-1);if(r[1]<out[r[0]].length){const j=out[r[0]][r[1]++];if(!seen[j]){seen[j]=1;stack.push([j,0]);}}else{order.push(r[0]);stack.pop();}}}
 const component=new Int32Array(rows.length).fill(-1),groups=[];for(let n=order.length-1;n>=0;n--){const i=order[n];if(component[i]>=0)continue;const group=[i],ci=groups.length;component[i]=ci;for(let at=0;at<group.length;at++)for(const j of incoming[group[at]])if(component[j]<0){component[j]=ci;group.push(j);}if(group.length>1||out[i].includes(i))assert(group.every(j=>rows[j].b.id===W),'Nonwire feedback');groups.push(group);}
 // Kosaraju's discovery above orders source SCCs before their consumers.
 for(let i=0;i<rows.length;i++)for(const j of incoming[i])assert(component[j]<=component[i]);
 const max=(list,p)=>{let v=0;for(const i of list)v=Math.max(v,p[i]);return v;};
 return values=>{const power=new Uint8Array(rows.length);let events=0;for(const i of held)power[i]=values.get(keys[i])??0;
  for(let ci=0;ci<groups.length;ci++){const group=groups[ci];if(group.length>1){const buckets=Array.from({length:16},()=>[]);for(const i of group){let v=0;for(const j of incoming[i])if(component[j]!==ci)v=Math.max(v,power[j]-(rows[j].b.id===W?1:0));power[i]=v;if(v)buckets[v].push(i);}for(let level=15;level>0;level--)for(const i of buckets[level]){if(power[i]!==level)continue;events++;for(const j of out[i])if(component[j]===ci&&power[j]<level-1){power[j]=level-1;buckets[level-1].push(j);}}continue;}
   const i=group[0];if(held.has(i))continue;events++;const b=rows[i].b,s=spec[i];let v=0;if(b.id===W){for(const j of incoming[i])v=Math.max(v,power[j]-(rows[j].b.id===W?1:0));}else if(b.id===R)v=max(s.rear,power)>0?15:0;else if(b.id===T||b.id===WT)v=max(incoming[i],power)>0?0:15;else if(b.id===RB)v=15;else if(b.id===C){const rear=max(s.rear,power),side=max(s.side,power);v=b.properties?.mode==='subtract'?Math.max(0,rear-side):rear>=side?rear:0;}else throw Error('Unsupported device '+b.id);power[i]=v;
  }return{power:new Map(keys.map((k,i)=>[k,power[i]])),events};
 };
}
