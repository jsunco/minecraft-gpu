// Directed physical feedback screen under explicitly held source/state roots.
import assert from 'node:assert/strict';
import {inputs} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
const key=p=>`${p.x},${p.y},${p.z}`;
export function checkFeedback(world,positions,boundaries){
 const roots=new Set(boundaries.map(key)),index=new Map(positions.map((p,i)=>[key(p),i])),forward=positions.map(()=>[]),reverse=positions.map(()=>[]);
 let edgeCount=0;
 for(let i=0;i<positions.length;i++)if(!roots.has(key(positions[i])))for(const p of inputs(world,positions[i])){
  const j=index.get(key(p));assert.notEqual(j,undefined,'Incomplete held cone');forward[j].push(i);reverse[i].push(j);edgeCount++;
 }
 const seen=new Uint8Array(positions.length),order=[];
 for(let i=0;i<positions.length;i++)if(!seen[i]){seen[i]=1;const stack=[[i,0]];while(stack.length){const row=stack.at(-1);if(row[1]<forward[row[0]].length){const j=forward[row[0]][row[1]++];if(!seen[j]){seen[j]=1;stack.push([j,0]);}}else{order.push(row[0]);stack.pop();}}}
 const component=new Int32Array(positions.length).fill(-1),cycles=[];let count=0;
 for(let n=order.length-1;n>=0;n--){const i=order[n];if(component[i]>=0)continue;const members=[i];component[i]=count++;
  for(let at=0;at<members.length;at++)for(const j of reverse[members[at]])if(component[j]<0){component[j]=component[i];members.push(j);}
  if(members.length>1||forward[i].includes(i)){assert(members.every(j=>world.get(key(positions[j])).id==='minecraft:redstone_wire'),'Non-wire feedback in held mask cone');cycles.push(members.length);}
 }
 return {nodes:positions.length,edges:edgeCount,held_boundaries:boundaries.length,components:count,wire_conductance_components:cycles.length,largest_wire_component:Math.max(0,...cycles),nonwire_feedback_components:0,scope:'Actual complete mask/body/input-link/route/request gate cone with runtime_block and eight existing request rear pads held; intentional loader/witness state is outside these explicit boundaries.'};
}
