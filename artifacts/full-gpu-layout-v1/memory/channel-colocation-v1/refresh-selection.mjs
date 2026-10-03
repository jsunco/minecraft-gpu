// Explicit refresh when only distant core copies and the cold memory change.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
import{readLargeDesign}from'../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),ROOT=fileURLToPath(new URL('../../../../',H)),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const path=ROOT+'/artifacts/full-gpu-layout-v1/machine-candidate-v1/config.json',bytes=readFileSync(path),cfg=JSON.parse(bytes),old=JSON.parse(readFileSync(new URL('selected-frame.json',H))),foreign=readLargeDesign(fileURLToPath(new URL('foreign-obstacles.json',H))),inside=p=>['x','y','z'].every(a=>foreign.bounds.from[a]<=p[a]&&p[a]<=foreign.bounds.to[a]),seen=new Map(),changes=[];
assert.deepEqual(cfg.instances.map(v=>v.name),old.instances.map(v=>v.name));
for(const c of cfg.instances){if(c.name==='memory')continue;const prior=old.instances.find(v=>v.name===c.name);if(JSON.stringify(c)===JSON.stringify(prior)){assert.equal(hash(ROOT+'/'+c.path),c.sha256);continue;}
 assert(['core0','core1'].includes(c.name),'Unexpected foreign instance replacement');assert.deepEqual(c.translation,prior.translation);assert(!foreign.blocks.some(v=>v.instance===c.name));assert.equal(hash(ROOT+'/'+c.path),c.sha256);
 if(!seen.has(c.path))seen.set(c.path,readLargeDesign(ROOT+'/'+c.path));const d=seen.get(c.path);let n=0;for(const v of d.blocks){const p=Object.fromEntries(['x','y','z'].map(a=>[a,v.position[a]+c.translation[a]]));if(inside(p))n++;}assert.equal(n,0,'Replacement core enters relocation halo');changes.push({name:c.name,before:prior,after:c,actual_cells_read:d.blocks.length,new_foreign_cells:n});
}
assert.equal(hash(path),createHash('sha256').update(bytes).digest('hex'));writeFileSync(new URL('selected-frame-v2.json',H),bytes);
const source_sha256={};for(const n of['refresh-selection.mjs','selected-frame.json','selected-frame-v2.json','foreign-obstacles.json'])source_sha256['artifacts/full-gpu-layout-v1/memory/channel-colocation-v1/'+n]=hash(new URL(n,H));for(const v of cfg.instances.filter(v=>v.name!=='memory'))source_sha256[v.path]=v.sha256;
writeFileSync(new URL('selection-refresh.json',H),JSON.stringify({status:'foreign_rows_unchanged_after_explicit_distant_core_replacement',changes,foreign_rows:foreign.blocks.length,source_sha256,native_acceptance:false},null,2)+'\n');console.log(JSON.stringify({changed_instances:changes.map(v=>v.name),new_foreign_rows:0}));
