import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {decodeSlice,inside,CORRIDOR,shaFile} from './obstacles.mjs';
import {fileURLToPath} from 'node:url';
const url=new URL('corridor-obstacles.json',import.meta.url),d=JSON.parse(readFileSync(url,'utf8'));
assert.deepEqual(d.bounds,CORRIDOR);assert.equal(d.all_y,true);assert.equal(d.native_acceptance,false);
const seen=new Map(),counts=Object.fromEntries(d.instances.map(i=>[i.name,0]));
for(const row of decodeSlice(d)){
 const p=row.position,k=[p.x,p.y,p.z].join(',');assert(inside(p,CORRIDOR));assert(p.y>=-64&&p.y<=319);assert(!seen.has(k));assert.equal(typeof row.block.id,'string');seen.set(k,row);counts[row.instance]++;
}
assert.equal(seen.size,d.cell_count);assert.deepEqual(counts,d.counts);
for(const key of ['-2232,233,-863','-2332,233,-804','-1212,200,-664']){assert.equal(seen.get(key)?.instance,'dispatch');assert.equal(seen.get(key)?.block.id,'minecraft:redstone_wire');}
assert.equal(inside({x:-2460,y:-64,z:-1175},CORRIDOR),true);
assert.equal(inside({x:-390,y:319,z:750},CORRIDOR),true);
assert.equal(inside({x:-391,y:0,z:751},CORRIDOR),false);
assert.equal(inside({x:-389,y:0,z:0},CORRIDOR),false);
assert.throws(()=>[...decodeSlice({...d,cells:[[0,0,0,d.palette.length,0]]})]);
assert.throws(()=>[...decodeSlice({...d,cells:[[0,0,0,0,d.instances.length]]})]);
const report={status:'compact_slice_checked',slice_sha256:await shaFile(fileURLToPath(url)),cell_count:d.cell_count,counts,palette_states:d.palette.length,corrected_endpoints:3,boundary_cases:4,invalid_index_refusals:2,source_pins:Object.keys(d.source_sha256).length,native_acceptance:false};
writeFileSync(new URL('slice-checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
