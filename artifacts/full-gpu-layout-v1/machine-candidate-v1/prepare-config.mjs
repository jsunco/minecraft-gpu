// Explicit full-machine selection. Missing freezes fail; no old parent fallback.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {makeSourcePinHasher} from '../../../scripts/source-pin-hasher.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),B='artifacts/full-gpu-layout-v1/';
const plan=JSON.parse(readFileSync(new URL('selection.json',import.meta.url))),audit=makeSourcePinHasher(ROOT),instances=[],manifests=[],seen=new Set();
for(const row of plan.instances){
 assert(typeof row.name==='string'&&!seen.has(row.name));seen.add(row.name);assert(!row.removals,'Only an explicit materialized replacement may be selected');
 const component=row.component,manifestPath=B+component+'/source-manifest.json',bytes=readFileSync(resolve(ROOT,manifestPath)),manifest=JSON.parse(bytes),pins=manifest.source_sha256??manifest.files??manifest.pins;assert(pins&&Object.keys(pins).length,'Missing source closure');
 for(const[p,h]of Object.entries(pins))assert.equal(audit.hash(p),h,'Selected source drift '+p);
 const path=B+component+'/'+(row.design??'design.json');assert(pins[path],'Selected geometry must be pinned by its frozen manifest '+path);assert.equal(audit.hash(path),pins[path]);
 instances.push({name:row.name,path,sha256:pins[path],translation:row.translation,source_manifest:manifestPath,source_manifest_sha256:createHash('sha256').update(bytes).digest('hex')});manifests.push({path:manifestPath,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert(seen.has('memory')&&seen.has('core0')&&seen.has('core1')&&seen.has('dispatcher')&&seen.has('global'));
assert.equal(instances.find(v=>v.name==='core0').path,instances.find(v=>v.name==='core1').path,'Identical full-core template required');audit.assertStable();
const result={status:'explicit_selected_geometry_pending_complete_composition',instances,manifests,selection_sha256:audit.hash('artifacts/full-gpu-layout-v1/machine-candidate-v1/selection.json'),complete_gpu_layout:false,native_acceptance:false,world_mutations:0};
writeFileSync(new URL('config.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({selected_instances:instances.length,...audit.stats(),complete_gpu_layout:false}));
