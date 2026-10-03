import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
const H=fileURLToPath(new URL('.',import.meta.url)),ROOT=resolve(H,'../../..'),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sources={},add=(p,h=hash(resolve(ROOT,p)))=>{if(sources[p])assert.equal(sources[p],h,p);sources[p]=h;};
add('artifacts/full-gpu-layout-v1/compact-core-fault-v1/source-manifest.json','f61eb16a13c6340a877cbde316a2edd66e3bd37c5a22adc70827117af87181e0');
for(const n of ['arcs.json','front-mode-checks.json','front-state-checks.json','sequence.json','induction.json']){
 const p=resolve(H,n),r=JSON.parse(readFileSync(p));for(const [f,h]of Object.entries(r.source_sha256))add(f,h);add(relative(ROOT,p));
}
for(const n of ['README.md','extract-arcs.py','check-mode-cuts.py','check-front-state-paths.py','check-sequence.mjs','check-induction.py','prepare-manifest.mjs'])add(relative(ROOT,resolve(H,n)));
for(const [p,h]of Object.entries(sources))assert.equal(hash(resolve(ROOT,p)),h,p);
const report=JSON.parse(readFileSync(resolve(H,'induction.json')));
assert.equal(report.full_core_timing_acceptance,false);assert.equal(report.native_acceptance,false);
const manifest={status:'source_bound_conditional_normal_FETCH_IR_certificate',source_sha256:Object.fromEntries(Object.entries(sources).sort()),parent_geometry:'artifacts/full-gpu-layout-v1/compact-core-fault-v1/design.json',parent_manifest_sha256:'f61eb16a13c6340a877cbde316a2edd66e3bd37c5a22adc70827117af87181e0',normal_transition_induction:true,cold_entry_earned:false,warm_reset_service_timing_earned:false,native_acceptance:false,full_core_timing_acceptance:false};
const p=resolve(H,'source-manifest.json');if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(p)),manifest);else writeFileSync(p,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({pins:Object.keys(sources).length,manifest_sha256:hash(p),full_core_timing_acceptance:false}));
