// Full legal-height derivative of the frozen compact signal descent.
// Extends only the accepted drop bound: a 382 drop plus support occupies384 levels.
// Offline geometry only; no native timing or electrical acceptance.
import assert from 'node:assert/strict';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,V=[P(1,0,0),P(0,0,1),P(-1,0,0),P(0,0,-1)],F=['west','north','east','south'];
export function makeFullHeightSignalDescent({drop=235}={}){
 assert(Number.isInteger(drop)&&drop>=1&&drop<=382);const map=new Map(),path=[P(0,0,0)],refresh=[];let p=path[0],side=0,remaining=drop;
 const step=(delta,dy=0)=>{p=P(p.x+delta.x,p.y+dy,p.z+delta.z);path.push(p);};
 while(remaining){const direction=V[side%4];for(let n=0;n<3;n++){step(direction);if(n===1)refresh.push({index:path.length-1,direction:side%4});}const fall=Math.min(remaining,3);for(let n=0;n<fall;n++)step(direction,-1);remaining-=fall;side++;}
 // Export a normalized endpoint in the last direction, beyond the last slope.
 const direction=V[(side-1)%4];for(let n=0;n<3;n++){step(direction);if(n===1)refresh.push({index:path.length-1,direction:(side-1)%4});}
 const ids=new Map(refresh.map(r=>[r.index,r.direction]));
 const put=(position,block)=>{assert(!map.has(K(position)),'Descent collision '+K(position));map.set(K(position),{position,block});};
 for(const[i,pos]of path.entries()){put({...pos,y:pos.y-1},{id:'minecraft:light_gray_concrete'});put(pos,ids.has(i)?{id:'minecraft:repeater',properties:{facing:F[ids.get(i)],delay:'1'}}:{id:'minecraft:redstone_wire'});}
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_compact_descending_signal_route_native_unverified',blocks,path,refresh,drop,box,ports:{input:{direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:path[0],travel:P(1,0,0)}]},output:{direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:path.at(-1),source:path.at(-2),travel:direction}]}},metrics:{blocks:blocks.length,repeaters:refresh.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,limits:['One-way refreshed path geometry; fanout/arrival routes are not included.','Dust-step connectivity and both edge transport need native validation; no delay or pulse-width guarantee.']};
}
