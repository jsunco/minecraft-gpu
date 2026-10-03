// Accepted shared frame; new foreign drafts are distinct, exact reservations.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFrame as parentFrame,pins as parentPins} from '../service-any-owner-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
export function bytes(n,expected){const p=new URL(n,H),b=readFileSync(p),h=createHash('sha256').update(b).digest('hex');if(expected)assert.equal(h,expected,n);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=h;return b;}
export const read=(n,h)=>JSON.parse(bytes(n,h));
export function loadFrame(){const parent=parentFrame({includeForeign:true});Object.assign(pins,parentPins);read('../../loader-global-delivery-v1/source-manifest.json','9b2aeb1a9a719f21354db91a9fc0cc8d02b35bde96019dcfc141eed1b017ada3');read('../service-any-owner-delivery-v1/source-manifest.json','e6482bae4f290f76aa984e7f6fdd0a9476834879aa8204a2367329ee5f115e4e');for(const r of [...read('../service-any-owner-delivery-v1/delta.json').new_cells,...read('../../loader-global-delivery-v1/delta.json').new_cells]){assert(!parent.world.has(K(r.position)));parent.world.set(K(r.position),r.block);parent.rows.push(r);}assert.equal(parent.world.size,2135072);return parent;}
