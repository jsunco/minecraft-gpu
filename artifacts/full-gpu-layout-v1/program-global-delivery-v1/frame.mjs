// Frozen accepted parent only; any concurrent work is an explicit obstacle copy.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFrame as parentFrame,pins as parentPins} from '../dispatcher-service-colocation-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
export const K=p=>`${p.x},${p.y},${p.z}`;
export function read(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return JSON.parse(b);}
export function loadBase(){
 const b=parentFrame({reserve:false});Object.assign(pins,parentPins);
 const quiet=read('../dispatcher-service-colocation-v1/delta.json','e92925dde9b91d7fa9dc4ca84bcf34dbab2d429487dee7eacb0ff2e76f9af6c6');
 const address=read('../memory/fabric-colocation-v2/channel1-address-delta.json','6c0ea7556d6990404774bc9e874e199977c8bf566ccca61f5e14bb394b7a3125');
 for(const r of [...quiet.new_cells,...address.blocks]){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);b.rows.push(r);}
 assert.equal(b.world.size,2000594);return b;
}
export function loadFrame({reserve=true}={}){
 const b=loadBase();
 if(reserve){assert(existsSync(new URL('active-reservation.json',H)),'Need exact concurrent ACTIVE reservation before routing');const r=read('active-reservation.json');for(const v of r.blocks){assert(!b.world.has(K(v.position)));b.world.set(K(v.position),v.block);}b.reservation=r;}
 return b;
}
