// Accepted complete payload composition; active foreign reservations are separate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFrame as loadParent,pins as parentPins} from '../service-payload-open-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={};
export const K=p=>`${p.x},${p.y},${p.z}`;
export function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
export function loadFrame(){
 const parent=loadParent({includePartial:false}),delta=read('../service-payload-open-delivery-v1/delta.json');Object.assign(pins,parentPins);
 for(const r of delta.new_cells){assert(!parent.world.has(K(r.position)));parent.world.set(K(r.position),r.block);}
 const memory=read('channel1-address-reservation.json'),dispatcher=read('dispatcher-placement-reservation.json'),quiet=read('dispatcher-quiet-reservation.json');assert.equal(memory.blocks.length,44068);assert.equal(dispatcher.blocks.length,202786);assert.equal(quiet.new_cells.length,860);for(const r of [...memory.blocks,...dispatcher.blocks,...quiet.new_cells]){assert(!parent.world.has(K(r.position)));parent.world.set(K(r.position),r.block);}const rows=[...parent.rows,...delta.new_cells,...memory.blocks,...dispatcher.blocks,...quiet.new_cells];assert.equal(rows.length,parent.world.size);assert.equal(rows.length,2000594);
 return {world:parent.world,rows};
}
