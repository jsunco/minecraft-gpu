// Exact finite composition source set, excluding review files and this manifest.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const H=new URL('.',import.meta.url),ROOT=fileURLToPath(new URL('../../../',H)),P='artifacts/full-gpu-layout-v1/floorplan-v3/';
const read=f=>JSON.parse(readFileSync(new URL(f,H))),sha=p=>createHash('sha256').update(readFileSync(resolve(ROOT,p))).digest('hex');
const files=read('source-bindings.json'),f=read('frame-config.json'),c=read('composition-checks.json'),ledger=read('connections.json');
assert.equal(c.status,'frozen_source_master_composition_checked');assert.equal(c.frame_sha256,sha(P+'frame-config.json'));assert.equal(ledger.total_blocks,c.total_blocks);assert.equal(ledger.routed_bit_connections,f.external_routes_drawn);
for(const[p,h]of Object.entries(files))assert.equal(sha(p),h,p);
for(const n of ['frame-config.json','check.mjs','composition-checks.json','source-bindings.json','local-ports.json','obstacles.mjs','prepare-ports.mjs','ports.json','connections.json','README.md','prepare-manifest.mjs'])files[P+n]=sha(P+n);
const out={status:'frozen_offline_partial_master_frame',total_blocks:c.total_blocks,routed_bit_connections:ledger.routed_bit_connections,files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),complete_gpu_layout:false,native_acceptance:false};
if(process.argv.includes('--check'))assert.deepEqual(read('source-manifest.json'),out);else writeFileSync(new URL('source-manifest.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:'frame_sources_checked',files:Object.keys(files).length,manifest_sha256:sha(P+'source-manifest.json'),total_blocks:out.total_blocks,routed_bit_connections:out.routed_bit_connections}));
