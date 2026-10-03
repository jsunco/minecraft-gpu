import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{makeAluPhaseLoop}from'../../../../hardware/full-gpu-alu-phase-loop.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-control/phase-loop-v1/',read=p=>readFileSync(resolve(root,p)),sha=p=>createHash('sha256').update(read(p)).digest('hex'),enc=v=>JSON.stringify(v,null,2)+'\n';
export function prepare({check=false}={}){
 const d=makeAluPhaseLoop();assert.deepEqual(d,JSON.parse(read(prefix+'design.json')));
 const parents=['artifacts/full-gpu-layout-v1/alu-control/source-manifest.json','artifacts/full-gpu-layout-v1/alu-v5/source-manifest.json'];let map={};
 for(const p of parents){const manifest=JSON.parse(read(p));for(const[n,h]of Object.entries(manifest.source_sha256)){assert.equal(sha(n),h,n);map[n]=h;}map[p]=sha(p);}
 const review='artifacts/full-gpu-layout-v1/register-sequencer-v1/counter-phases/independent-review.json';for(const[p,h]of Object.entries(JSON.parse(read(review)).source_sha256)){assert.equal(sha(p),h,p);map[p]=h;}map[review]=sha(review);
 for(const p of ['hardware/full-gpu-alu-phase-loop.mjs','hardware/full-gpu-alu-loop-counter.mjs','hardware/full-gpu-pc-incrementer.mjs','docs/CORE_INTEGRATION_PROTOCOL.md',...['README.md','prepare.mjs','design.json','check-counter.mjs','check-routing.py','checks.json'].map(n=>prefix+n)])map[p]=sha(p);
 const result={status:'connected_retained_phase_group_offline_not_complete_ALU_controller',source_sha256:map,metrics:d.metrics,command_outputs_unchanged:41,parent_command_plane_unchanged:20766,retained_controller_bits:4,native_calls:0,complete_state_loop:false,independent_review:false,missing:d.missing};
 if(check)assert.equal(read(prefix+'source-manifest.json').toString(),enc(result));else writeFileSync(resolve(root,prefix+'source-manifest.json'),enc(result));return{source_pins:Object.keys(map).length,manifest_sha256:sha(prefix+'source-manifest.json'),...d.metrics};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
