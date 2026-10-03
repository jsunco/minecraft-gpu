import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {shaFile,sourceBindings} from './obstacles.mjs';
const P='artifacts/full-gpu-layout-v1/floorplan-v2/';
const own=['README.md','frame-config.json','check-sparse.mjs','sparse-checks.json','prepare.mjs','placement.json','check-terminals.mjs','terminal-checks.json','obstacles.mjs','corridor-obstacles.json','check-slice.mjs','slice-checks.json','manifest.mjs'];
const source_sha256=await sourceBindings();
const placement=JSON.parse(readFileSync(new URL('placement.json',import.meta.url),'utf8'));
for(const[p,h]of Object.entries(placement.source_sha256)){assert(!source_sha256[p]||source_sha256[p]===h);assert.equal(await shaFile(p),h,p);source_sha256[p]=h;}
for(const f of own)source_sha256[P+f]=await shaFile(P+f);
const d={status:'frozen_offline_actual_sparse_obstacle_frame_interfaces_partial',source_sha256:Object.fromEntries(Object.entries(source_sha256).sort(([a],[b])=>a.localeCompare(b))),component_blocks:5615575,core_copies:2,shared_panel_copies:1,external_routes_drawn:0,complete_gpu_layout:false,native_acceptance:false};
const url=new URL('source-manifest.json',import.meta.url);
if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(url,'utf8')),d);else writeFileSync(url,JSON.stringify(d,null,2)+'\n');
console.log(JSON.stringify({status:process.argv.includes('--check')?'exact_sources_verified':'frozen',pins:Object.keys(d.source_sha256).length,manifest_sha256:await shaFile(P+'source-manifest.json')}));
