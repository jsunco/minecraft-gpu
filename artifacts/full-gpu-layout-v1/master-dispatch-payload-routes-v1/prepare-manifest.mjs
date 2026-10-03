// Finite explicit source set; reviewer files and the manifest itself stay outside it.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const H=new URL('.',import.meta.url),ROOT=new URL('../../../',H),P='artifacts/full-gpu-layout-v1/master-dispatch-payload-routes-v1/';
const read=f=>JSON.parse(readFileSync(new URL(f,H))),sha=p=>createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex');
const files={...read('obstacles.json').source_sha256};
for(const[p,h]of Object.entries(files))assert.equal(sha(p),h,p);
const dataP='artifacts/full-gpu-layout-v1/master-program-data-v1/';assert.equal(sha(dataP+'source-manifest.json'),'eed8c2dd343db1c83434cff4bc2b19669eb33a40fbd8d8ad39990d48976e8678');const dataM=JSON.parse(readFileSync(new URL(dataP+'source-manifest.json',ROOT)));for(const[p,h]of Object.entries(dataM.files)){assert.equal(sha(p),h,p);assert(!files[p]||files[p]===h,p);files[p]=h;}files[dataP+'source-manifest.json']=sha(dataP+'source-manifest.json');
for(const f of ['prepare-obstacles.mjs','consumer-additions.json','obstacles.json','design.json','connections.json','check.mjs','check-power.py','check-all-parents.mjs','checks.json','power-checks.json','all-parent-checks.json','README.md','prepare-manifest.mjs'])files[P+f]=sha(P+f);
for(const p of ['artifacts/full-gpu-layout-v1/master-program-data-v1/design.json','hardware/full-gpu-master-dispatch-payload-routes-v1.mjs','hardware/full-gpu-signal-descent.mjs','hardware/gpu-layout-assembly.mjs','scripts/check-route-delay.mjs','artifacts/byte-operand-routing-v1/review-evidence/RedstoneWireBlock.javap.txt','artifacts/full-gpu-layout-v1/master-memory-address-adapter-v1/source-manifest.json','artifacts/full-gpu-layout-v1/master-memory-address-adapter-v1/design.json','artifacts/full-gpu-layout-v1/register-sequencer-v1/connected-controller/check-strength-independent.mjs']){const h=sha(p);assert(!files[p]||files[p]===h,p);files[p]=h;}
const manifest={status:'frozen_offline_route_candidate',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),added_blocks:181496,actual_connections:24,new_retained_bits:0,native_acceptance:false};
if(process.argv.includes('--check'))assert.deepEqual(read('source-manifest.json'),manifest);else writeFileSync(new URL('source-manifest.json',H),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'source_pins_checked',files:Object.keys(files).length,manifest_sha256:sha(P+'source-manifest.json')}));
