import assert from'node:assert/strict';import{readFileSync,writeFileSync,createReadStream}from'node:fs';import{createHash}from'node:crypto';
const H='artifacts/full-gpu-layout-v1/control-reset-master-compatible-v3/',parent='artifacts/full-gpu-layout-v1/control-reset-master-compatible-v2/source-manifest.json',read=p=>JSON.parse(readFileSync(p));
const sha=async p=>{const h=createHash('sha256');for await(const x of createReadStream(p))h.update(x);return h.digest('hex');},pins={...read(parent).source_sha256};pins[parent]=await sha(parent);
for(const n of['prepare.mjs','design.json','replacement-inventory.json','check-scanner.py','scanner-checks.json','README.md','prepare-manifest.mjs'])pins[H+n]=await sha(H+n);
const checks=read(H+'scanner-checks.json');for(const[p,h]of Object.entries(checks.source_sha256)){assert(!pins[p]||pins[p]===h,'Conflicting dependency '+p);pins[p]=h;}
for(const[p,h]of Object.entries(pins))assert.equal(await sha(p),h,p);
const out={status:'frozen_author_checked_core_scanner_entry_repair',source_sha256:Object.fromEntries(Object.entries(pins).sort(([a],[b])=>a.localeCompare(b))),changed_cells:2,added_cells:0,external_ports_unchanged:true,native_acceptance:false,complete_timing_acceptance:false,complete_gpu_layout:false};
if(process.argv.includes('--check'))assert.deepEqual(read(H+'source-manifest.json'),out);else writeFileSync(H+'source-manifest.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({pins:Object.keys(pins).length,manifest_sha256:await sha(H+'source-manifest.json')}));
