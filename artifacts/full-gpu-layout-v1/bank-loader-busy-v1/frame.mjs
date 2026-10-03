// Latest accepted shared frame; no world interface.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{loadBase as parentBase,pins as parentPins}from'../panel-loader-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
export function bytes(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return b;}
export const read=(n,h)=>JSON.parse(bytes(n,h));
export function loadBase(){const b=parentBase();Object.assign(pins,parentPins);const frozen=read('parent-reservation.json');for(const a of frozen.layers){read(a.manifest,a.manifest_sha256);for(const r of read(a.delta,a.delta_sha256).new_cells){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);b.rows.push(r);}}assert.equal(b.world.size,2261124);return b;}
export const loadFrame=loadBase;
