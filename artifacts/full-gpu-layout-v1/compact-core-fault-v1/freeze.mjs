import assert from'node:assert/strict';import{readFileSync,readdirSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';
import{makeSourcePinHasher}from'../../../scripts/source-pin-hasher.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),B='artifacts/full-gpu-layout-v1/',here=B+'compact-core-fault-v1/',audit=makeSourcePinHasher(ROOT),pins={};
const read=p=>JSON.parse(readFileSync(new URL('../../../'+p,import.meta.url)));
function add(p,h){const actual=audit.hash(p);assert.equal(actual,h??actual,p);assert(!pins[p]||pins[p]===actual,'Conflicting pin');pins[p]=actual;}
const cfg=read(B+'machine-candidate-v1/config.json');
for(const c of cfg.instances){add(c.source_manifest,c.source_manifest_sha256);const m=read(c.source_manifest);for(const[p,h]of Object.entries(m.source_sha256??m.files??m.pins))add(p,h);}
for(const n of ['extraction.json','trial-design.json','checks.json']){const d=read(here+n);for(const[p,h]of Object.entries(d.source_sha256))add(p,h);}
assert.equal(read(here+'checks.json').status,'relocation_actual_cell_dependency_screen_passed');const mat=read(here+'materialization.json');add(here+'design.json',mat.design_sha256);assert.equal(mat.retained_bits,1117);
for(const n of readdirSync(new URL('./',import.meta.url))){if(n==='source-manifest.json')continue;add(here+n);}
for(const n of ['hardware/memory-layout-large-json-v2.mjs','scripts/source-pin-hasher.mjs','artifacts/full-gpu-layout-v1/control-commit-v2/route.mjs'])add(n);
audit.assertStable();const out={status:'frozen_connected_fault_relocation_geometry_pending_timing',source_sha256:Object.fromEntries(Object.entries(pins).sort()),physical_core_cells:mat.blocks,retained_bits:1117,core_cells_saved:23456,incident_connections:15,master_geometry_selected:false,complete_gpu_layout:false,native_calls:0,world_mutations:0,native_acceptance:false};
writeFileSync(new URL('source-manifest.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({manifest_sha256:audit.hash(here+'source-manifest.json'),pins:Object.keys(pins).length,...audit.stats()}));
