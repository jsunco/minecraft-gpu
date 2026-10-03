import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chunkRectangles,inventory} from '../../../scripts/full-gpu-geometry-inventory.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
let coverageCases=0;
function check(keys){const input=new Set(keys),rects=chunkRectangles(input),seen=new Set();for(const r of rects){assert(r.columns<=256);assert.equal(r.native_block_bounds.from.x,16*r.from.x);assert.equal(r.native_block_bounds.to.z,16*r.to.z+15);for(let x=r.from.x;x<=r.to.x;x++)for(let z=r.from.z;z<=r.to.z;z++){const k=x+','+z;assert(input.has(k));assert(!seen.has(k));seen.add(k);}}assert.deepEqual([...seen].sort(),[...input].sort());coverageCases++;return rects;}
check([]);assert.equal(check(['-2,-1']).length,1);assert.equal(check(['0,0','1,0','0,1','1,1']).length,1);
const horizontal=Array.from({length:600},(_,i)=>(i-300)+',-5');assert.equal(check(horizontal).length,3);
const tall=Array.from({length:700},(_,i)=>'-1,'+(i-350));assert.equal(check(tall).length,3);
check(['-1,-1','0,-1','1,-1','-1,0','1,0','-1,1','0,1','1,1']);
for(let salt=1;salt<=32;salt++){const keys=[];for(let x=-40;x<=40;x++)for(let z=-35;z<=35;z++)if(((x*177+z*59+salt*23)**2%43)<11)keys.push(x+','+z);check(keys);}
const dir=mkdtempSync(join(tmpdir(),'tinygpu-inventory-'));let negativeRefusals=0;
try{
 const path=join(dir,'fixture.json'),blocks=[[-17,-64,-1],[-16,-63,-1],[-1,0,0],[0,319,0]].map(([x,y,z])=>({position:{x,y,z},block:{id:'minecraft:light_gray_concrete'}})),bytes=Buffer.from(JSON.stringify({blocks}));writeFileSync(path,bytes);
 const c={name:'fixture',path,sha256:sha(bytes),translation:{x:0,y:0,z:0}},r=await inventory({instances:[c]});assert.equal(r.actual_unique_cells,4);assert.equal(r.occupied_chunk_columns,4);assert.deepEqual(r.bounds,{from:{x:-17,y:-64,z:-1},to:{x:0,y:319,z:0}});assert.deepEqual(r.span,{x:18,y:384,z:2});assert.equal(r.materials['minecraft:light_gray_concrete'],4);assert.equal(r.bounding_volume,13824);
 for(const config of[{instances:[c,{...c,name:'overlap'}]},{instances:[{...c,sha256:'0'.repeat(64)}]},{instances:[{...c,translation:{x:0,y:1,z:0}}]},{instances:[{...c,removals:[]}]}]){await assert.rejects(inventory(config));negativeRefusals++;}
 const shifted=await inventory({instances:[c,{...c,name:'second',translation:{x:100,y:0,z:100}}]});assert.equal(shifted.actual_unique_cells,8);assert.equal(shifted.materials['minecraft:light_gray_concrete'],8);
 const result={status:'offline_geometry_inventory_tool_checks_only',coverage_cases:coverageCases,actual_coordinate_fixture_count:2,negative_refusals:negativeRefusals,script_sha256:sha(readFileSync('scripts/full-gpu-geometry-inventory.mjs')),complete_gpu_layout:false,native_calls:0,world_mutations:0};writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{rmSync(dir,{recursive:true});}
