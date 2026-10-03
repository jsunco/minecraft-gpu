// Accepted base plus exact complete foreign reservations, with no double count.
import assert from 'node:assert/strict';
import {loadFrame as accepted,read,pins,K} from './frame.mjs';
export {pins};
export function loadFrame(){const frame=accepted();read('../../memory/fabric-colocation-v2/bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125');const reservations=read('foreign-reservations.json');for(const r of reservations.reservations){const d=read(r.snapshot,r.sha256);assert.equal(d.new_cells.length,r.new_cells);for(const row of d.new_cells){const k=K(row.position);assert(!frame.world.has(k),'Foreign collision '+k);frame.world.set(k,row.block);frame.rows.push(row);}}assert.equal(frame.world.size,2188176);return frame;}
