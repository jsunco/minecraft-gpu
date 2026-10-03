// Exact frozen owner-open composition. Later foreign additions require snapshots.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadFrame as loadParent,pins as parentPins} from '../service-owner-open-delivery-v1/frame.mjs';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={};
export const K=p=>`${p.x},${p.y},${p.z}`;
export function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
export function loadFrame({includePartial=true}={}){
 const parent=loadParent(),delta=read('../service-owner-open-delivery-v1/delta.json');Object.assign(pins,parentPins);
 for(const r of delta.new_cells){assert(!parent.world.has(K(r.position)));parent.world.set(K(r.position),r.block);}
 const foreign=includePartial?read('channel1-address-reservation.json'):{blocks:[]};assert.equal(foreign.blocks.length,includePartial?4206:0);for(const r of foreign.blocks){assert(!parent.world.has(K(r.position)));parent.world.set(K(r.position),r.block);}const rows=[...parent.rows,...delta.new_cells,...foreign.blocks];assert.equal(rows.length,parent.world.size);assert.equal(rows.length,1748616+(includePartial?4206:0));
 return {world:parent.world,rows};
}
