// Bounded actual-dust feedback paths. No live game or logical net-name inputs.
import assert from 'node:assert/strict';
export const W=2,S=1,R0=10,C0=20;
const WIDTH=2**21,HALF=2**20,YS=512;
export const X=WIDTH*YS,Z=YS;
export const DIR=[X,-X,Z,-Z];
export const FACING=['west','east','north','south'];
export function key({x,y,z}){assert(Number.isInteger(x)&&Number.isInteger(y)&&Number.isInteger(z));assert(x>=-HALF&&x<HALF&&z>=-HALF&&z<HALF&&y>=-64&&y<=319);return((x+HALF)*WIDTH+(z+HALF))*YS+y+64;}
export function position(k){return{x:Math.floor(k/X)-HALF,y:k%YS-64,z:Math.floor(k/YS)%WIDTH-HALF};}
export function encode(b){
 if(b.id.endsWith('_concrete'))return S;
 if(b.id==='minecraft:redstone_wire')return W;
 if(b.id==='minecraft:redstone_block')return 3;
 if(b.id==='minecraft:redstone_torch')return 4;
 if(b.id==='minecraft:redstone_wall_torch')return 5;
 if(b.id==='minecraft:lever')return 6;
 if(b.id==='minecraft:repeater'||b.id==='minecraft:comparator'){const f=FACING.indexOf(b.properties?.facing);assert(f>=0,'Missing diode facing');return(b.id.endsWith(':repeater')?R0:C0)+f;}
 assert.fail('Unsupported physical palette '+b.id);
}
export const code=(world,k)=>(world.get(k)??0)&255;
export const solid=(world,k)=>[S,3].includes(code(world,k));
export const repeater=c=>c>=R0&&c<R0+4;
export const diode=c=>repeater(c)||c>=C0&&c<C0+4;
export function wires(world,k){const out=[];for(const v of DIR){const q=k+v,c=code(world,q);
 if(c===W)out.push(q);
 if(solid(world,q)&&!solid(world,k+1)&&code(world,q+1)===W)out.push(q+1);
 if(!solid(world,q)&&code(world,q-1)===W)out.push(q-1);
}return out;}
function wireTargetsOfRear(world,k){if(code(world,k)===W)return[k];if(solid(world,k))return[...DIR.map(v=>k+v),k+1].filter(q=>code(world,q)===W);return[];}
function outputWires(world,k){if(code(world,k)===W)return[k];if(solid(world,k))return[...DIR.map(v=>k+v),k-1,k+1].filter(q=>code(world,q)===W);return[];}
export function findFeedback(world,k){const c=code(world,k);assert(repeater(c));const travel=DIR[c-R0],front=k+travel,rear=k-travel,targets=new Set(wireTargetsOfRear(world,rear));if(!targets.size)return null;
 const starts=outputWires(world,front);if(!starts.length)return null;
 const queue=[...starts],previous=new Map(starts.map(q=>[q,null])),distance=new Map(starts.map(q=>[q,0]));let target;
 for(let i=0;i<queue.length;i++){const q=queue[i],d=distance.get(q);if(targets.has(q)){target=q;break;}if(d>=14)continue;for(const r of wires(world,q)){if(previous.has(r))continue;previous.set(r,q);distance.set(r,d+1);queue.push(r);}}
 if(target===undefined)return null;
 const path=[];for(let q=target;q!==null;q=previous.get(q))path.push(q);path.reverse();
 const side=[];for(const v of DIR){if(v===travel||v===-travel)continue;const q=k+v,qc=code(world,q);if(diode(qc)&&q+DIR[qc%10]===k)side.push(q);}
 return{repeater:position(k),front:position(front),rear:position(rear),wire_path:path.map(position),wire_vertices:path.length,minimum_nominal_rear_power:16-path.length,front_via_strong_solid:solid(world,front),rear_via_weak_solid:solid(world,rear),side_lock_sources:side.map(position),scope:'Supported physical dust path of at most15 wire vertices, with no intervening diode; conditional positive feedback when the repeater is unlocked and high. Not a scheduled-event observation.'};
}
