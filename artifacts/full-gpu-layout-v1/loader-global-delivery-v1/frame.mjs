// Exact accepted shared frame through channel3 and any-owner deliveries.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadBase as parentBase,pins as parentPins} from '../bank-global-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
export function read(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return JSON.parse(b);}
export function loadBase(){const b=parentBase();Object.assign(pins,parentPins);const layers=[
read('../bank-global-delivery-v1/delta.json','5cf36a5ec7f3ed5aebaac22b3d937593760a603911fe7223890d3c38e2df7ca9').new_cells,
read('../loader-program-colocation-v1/service-commit-phase-delivery-v1/delta.json','c1f021ffec12b12e53e0fba86e88ee3662bb1a18ede5eef4f1ae1491bf38f19e').new_cells,
read('../memory/fabric-colocation-v2/channel3-address-delta.json','d519cfac8a7f0673fa0104df6e46a897308474d322ae0dee21389bf9a4a747c0').blocks,read('../loader-program-colocation-v1/service-any-owner-delivery-v1/delta.json','bc19d1e3a756faa001c48e0e271411278b0ea5926fbb28052ea049e9cc76bbe4').new_cells];
for(const layer of layers)for(const r of layer){assert(!b.world.has(K(r.position)));b.world.set(K(r.position),r.block);b.rows.push(r);}read('../memory/fabric-colocation-v2/channel3-address-source-manifest.json','83b1c8764e62e7c14203eecc780836298c9301c184536759f4ee8d5cbcfcd08c');read('../loader-program-colocation-v1/service-any-owner-delivery-v1/source-manifest.json','e6482bae4f290f76aa984e7f6fdd0a9476834879aa8204a2367329ee5f115e4e');assert.equal(b.world.size,2128184);return b;}
export const loadFrame=loadBase;
