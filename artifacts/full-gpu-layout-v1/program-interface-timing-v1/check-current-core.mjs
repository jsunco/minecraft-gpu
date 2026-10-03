import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),ROOT=new URL('../../../',H),core='artifacts/full-gpu-layout-v1/control-reset-epoch-v1/',K=p=>`${p.x},${p.y},${p.z}`;
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex'),read=p=>JSON.parse(readFileSync(new URL(p,ROOT)));
const mp=core+'source-manifest.json';assert.equal(sha(mp),'b247c56b203ae01f441ad53b755b93bdde7784795be41eea446b57d2337b98ca');const manifest=read(mp),pins=manifest.files??manifest.source_sha256;
assert.equal(sha(core+'design.json'),pins[core+'design.json']);
const subset=JSON.parse(readFileSync(new URL('frontend-cells.json',H))),wanted=new Map(subset.blocks.map(v=>[K(v.position),v.block]));let n=0;
for(const v of read(core+'design.json').blocks)if(wanted.has(K(v.position))){assert.deepEqual(v.block,wanted.get(K(v.position)),K(v.position));wanted.delete(K(v.position));n++;}
assert.equal(wanted.size,0);
const out={status:'timing_path_cells_match_latest_frozen_core',exact_cells:n,core_manifest_sha256:sha(mp),core_design_sha256:pins[core+'design.json'],subset_sha256:createHash('sha256').update(readFileSync(new URL('frontend-cells.json',H))).digest('hex'),native_acceptance:false,limits:['Exact path cells match; surrounding load/contact checks remain the component and later master-composition obligations.']};
writeFileSync(new URL('current-core-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
