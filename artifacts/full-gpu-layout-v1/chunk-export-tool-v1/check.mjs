import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {exportChunks,decodeChunk} from '../../../scripts/full-gpu-chunk-export.mjs';
const temp=mkdtempSync(join(tmpdir(),'tinygpu-export-')),sha=b=>createHash('sha256').update(b).digest('hex');
const source={blocks:[{position:{x:-17,y:-64,z:-1},block:{id:'minecraft:light_gray_concrete'}},{position:{x:0,y:0,z:16},block:{id:'minecraft:repeater',properties:{facing:'west',delay:'4'}}},{position:{x:15,y:319,z:15},block:{id:'minecraft:redstone_wire',properties:{power:'0'}}}]};
const design=join(temp,'design.json'),bytes=Buffer.from(JSON.stringify(source));writeFileSync(design,bytes);
const config={instances:[{name:'left',path:design,sha256:sha(bytes),translation:{x:0,y:0,z:0}},{name:'right',path:design,sha256:sha(bytes),translation:{x:80,y:0,z:-64}}]},cfg=join(temp,'config.json');writeFileSync(cfg,JSON.stringify(config));
const out=join(temp,'export'),m=await exportChunks(cfg,out);assert.equal(m.actual_unique_cells,6);assert.equal(m.chunks.length,6);
const actual=[];for(const f of m.chunks){const b=readFileSync(join(out,f.path));assert.equal(sha(b),f.sha256);actual.push(...decodeChunk(JSON.parse(b)));}
const expected=config.instances.flatMap(c=>source.blocks.map(r=>({position:Object.fromEntries(['x','y','z'].map(a=>[a,r.position[a]+c.translation[a]])),block:r.block})));const key=x=>JSON.stringify(x.position);actual.sort((a,b)=>key(a).localeCompare(key(b)));expected.sort((a,b)=>key(a).localeCompare(key(b)));assert.deepEqual(actual,expected);
let negatives=0;await assert.rejects(exportChunks(cfg,out));negatives++;
for(const [name,change]of[['stale',c=>c.instances[0].sha256='0'.repeat(64)],['overlap',c=>c.instances[1].translation={x:0,y:0,z:0}],['height',c=>c.instances[0].translation.y=1],['implicit-removal',c=>c.instances[0].removals=[]]]){const c=structuredClone(config);change(c);const p=join(temp,name+'.json');writeFileSync(p,JSON.stringify(c));await assert.rejects(exportChunks(p,join(temp,name)));negatives++;}
const sample=JSON.parse(readFileSync(join(out,m.chunks[0].path)));for(const change of [c=>c.cells.push(c.cells[0]),c=>c.cells[0][0]=-1,c=>c.cells[0][3]=99,c=>c.palette[0].nbt={}]){const c=structuredClone(sample);change(c);assert.throws(()=>decodeChunk(c));negatives++;}
const report={status:'lossless_offline_export_fixture_checks_pass',exact_cells_roundtripped:actual.length,chunk_files:6,translated_instances:2,negative_refusals:negatives,full_machine_export_created:false,native_acceptance:false,world_mutations:0};writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
