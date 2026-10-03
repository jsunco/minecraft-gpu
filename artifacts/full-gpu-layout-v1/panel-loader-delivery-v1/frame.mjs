// Exact accepted shared assembly, including READY, held returns and live BUSY.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadBase as parentBase,pins as parentPins} from '../global-loader-return-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
export function bytes(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return b;}
export const read=(n,h)=>JSON.parse(bytes(n,h));
export function loadBase(){const b=parentBase();Object.assign(pins,parentPins);for(const[n,m,h]of[
 ['../memory/fabric-colocation-v2/bank-ready-collectors-v1/','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125','a250536391aaab40afa270de503a677e57574fcc7283e5c44c851f51c6495967'],
 ['../global-loader-return-v1/','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07','7a5a780a41e84b0967539e80841431d8971f52fb1c52dc5c2831289c7e2d2070'],
 ['../loader-program-colocation-v1/service-live-busy-delivery-v1/','35b6f3385a71bdb9e413c7bf62b335b242c048fd93d4e437c43a362ecd182adf','b6e76efe345a848db44cf462a5fdbbc9d3e649a5f92dfecac91ab5462c5efbdf']
 ]){read(n+'source-manifest.json',m);for(const r of read(n+'delta.json',h).new_cells){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);b.rows.push(r);}}assert.equal(b.world.size,2192096);return b;}
export const loadFrame=loadBase;
