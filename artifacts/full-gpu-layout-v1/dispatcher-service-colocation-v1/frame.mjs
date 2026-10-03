// One-way immutable assembly inputs. Pending rows are only routing obstacles.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFrame as priorFrame,pins as priorPins} from '../loader-program-colocation-v1/service-owner-open-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
export const K=p=>`${p.x},${p.y},${p.z}`;
export function read(n,sha){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(sha)assert.equal(h,sha);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return JSON.parse(b);}
export function loadBase(){
 const b=priorFrame();Object.assign(pins,priorPins);
 const owner=read('../loader-program-colocation-v1/service-owner-open-delivery-v1/delta.json','dc843e8f7651d1fb5b949405f0a1e31926e3bd1f2bf4f0c64dbfce0a313167c8');
 for(const r of owner.new_cells){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);}
 b.rows.push(...owner.new_cells);assert.equal(b.world.size,1748616);
 const payload=read('../loader-program-colocation-v1/service-payload-open-delivery-v1/delta.json','5b9ffc7d353f7942324cc5638c724a0c3bbccc32b8bc0ef5460a3fb257209b3d');
 for(const r of payload.new_cells){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);}b.rows.push(...payload.new_cells);assert.equal(b.world.size,1752880);return b;
}
export function loadFrame({reserve=true}={}){
 const b=loadBase(),placement=read('placement.json');
 for(const r of placement.blocks){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);}for(const r of placement.blocks)b.rows.push(r);
 if(reserve){const reservation=read('memory-address1-reservation.json');for(const r of reservation.blocks){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);}}
 return {...b,placement};
}
