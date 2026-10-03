// Exact accepted shared frame, with a separately labeled routing obstacle.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadBase as parentBase,pins as parentPins} from '../program-global-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
export function read(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return JSON.parse(b);}
export function loadBase(){
 const b=parentBase();Object.assign(pins,parentPins);
 const layers=[
  read('../program-global-delivery-v1/delta.json','a5b19f5f9da13117c0a79b6269d0df8fb04a2be811acc651133234935d46c35d').new_cells,
  read('../loader-program-colocation-v1/service-active-witness-delivery-v1/delta.json','aca4bd75e4a26fd5e52db4b19de3dbb34e1a5ad9885712dcee984d9ce813fdc3').new_cells,
  read('../memory/fabric-colocation-v2/channel2-address-delta.json','0c7a44eb0d39c91809ae94849ccc515f1c0088b980652600d3324ebbacc019bb').blocks
 ];
 for(const layer of layers)for(const r of layer){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);b.rows.push(r);}
 assert.equal(b.world.size,2054908);return b;
}
export function loadFrame({reserve=true}={}){
 const b=loadBase();if(reserve){const d=read('commit-phase-reservation.json');for(const r of d.blocks){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);}b.reservation=d;}return b;
}
