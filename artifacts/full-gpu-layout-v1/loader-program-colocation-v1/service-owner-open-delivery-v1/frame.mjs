// Exact immutable composition plus a pinned read-only address reservation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={};
export const K=p=>`${p.x},${p.y},${p.z}`;
export function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
export function loadFrame(){
 const memory=read('../../memory/fabric-colocation-v2/channel3-write-data-design.json'),panels=read('../../loader-bank-panels-v1/delta.json'),program=read('../../program-service-composition-v1/new-program-obstacles.json'),quiet=read('../../program-service-composition-v1/cable-delta.json'),composition=read('../service-mask-memory-composition-v1/composed-delta.json'),address=read('address-reservation.json');
 const rows=[...memory.blocks,...panels.blocks,...program.blocks,...quiet.blocks,...composition.placed_loader,...composition.placed_masks,...composition.new_cells,...address.blocks],world=new Map(rows.map(v=>[K(v.position),v.block]));
 assert.equal(rows.length,world.size);assert.equal(rows.length,1745256);
 for(const r of composition.replacements){assert.deepEqual(world.get(K(r.position)),r.before);world.set(K(r.position),r.after);}
 return {world,rows:rows.map(r=>({...r,block:world.get(K(r.position))})),composition};
}
