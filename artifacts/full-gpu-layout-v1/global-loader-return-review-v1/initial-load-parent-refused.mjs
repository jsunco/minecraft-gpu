// Direct assembly of immutable layers, independent of the reviewed family's frame helper.
import assert from'node:assert/strict';import{read,insert,K}from'./independent-network.mjs';
export function loadParent(){
const base=new Map(),layers=[
['../memory/fabric-colocation-v2/channel3-write-data-design.json','blocks'],
['../loader-bank-panels-v1/delta.json','blocks'],
['../program-service-composition-v1/new-program-obstacles.json','blocks'],
['../program-service-composition-v1/cable-delta.json','blocks'],
['../loader-program-colocation-v1/service-mask-memory-composition-v1/composed-delta.json','placed_loader','placed_masks','new_cells'],
['../memory/fabric-colocation-v2/channel0-address-delta.json','blocks'],
['../memory/fabric-colocation-v2/channel1-address-delta.json','blocks'],
['../loader-program-colocation-v1/service-owner-open-delivery-v1/delta.json','new_cells'],
['../loader-program-colocation-v1/service-payload-open-delivery-v1/delta.json','new_cells'],
['../dispatcher-service-colocation-v1/placement.json','blocks'],
['../dispatcher-service-colocation-v1/delta.json','new_cells'],
['../program-global-delivery-v1/delta.json','new_cells'],
['../loader-program-colocation-v1/service-active-witness-delivery-v1/delta.json','new_cells'],
['../memory/fabric-colocation-v2/channel2-address-delta.json','blocks'],
['../bank-global-delivery-v1/delta.json','new_cells'],
['../loader-program-colocation-v1/service-commit-phase-delivery-v1/delta.json','new_cells'],
['../memory/fabric-colocation-v2/channel3-address-delta.json','blocks'],
['../loader-program-colocation-v1/service-any-owner-delivery-v1/delta.json','new_cells'],
['../loader-global-delivery-v1/delta.json','new_cells']];let rows=[];
for(const [name,...fields]of layers){const d=read(name);for(const field of fields){insert(base,d[field]);rows.push(...d[field]);}if(d.replacements){assert.equal(d.replacements.length,8);for(const r of d.replacements){assert.deepEqual(base.get(K(r.position)),r.before);base.set(K(r.position),r.after);}}}
assert.equal(base.size,2135072);assert.equal(rows.length,base.size);rows=rows.map(r=>({position:r.position,block:base.get(K(r.position))}));return{base,rows};
}
