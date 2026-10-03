import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {makeFullLaneAluRoutingV2} from '../../../hardware/full-lane-alu-routing-v2.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-v2/',enc=v=>JSON.stringify(v,null,2)+'\n';
export function prepare({check=false}={}){
 const d=makeFullLaneAluRoutingV2(),f=resolve(root,prefix+'design.json');
 if(check)assert.equal(readFileSync(f,'utf8'),enc(d));else writeFileSync(f,enc(d));
 const parent=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/alu/source-manifest.json')));
 const files=[...Object.keys(parent.source_sha256),'artifacts/full-gpu-layout-v1/alu/source-manifest.json','hardware/full-lane-alu-routing-v2.mjs',...['README.md','prepare.mjs','check-routing.py','routing-check.json','design.json'].map(n=>prefix+n)];
 const source_sha256=Object.fromEntries(files.map(n=>[n,createHash('sha256').update(readFileSync(resolve(root,n))).digest('hex')]));
 for(const [n,h]of Object.entries(parent.source_sha256))assert.equal(source_sha256[n],h,'Frozen parent '+n);
 const m={status:'rejected_density_partial_ALU_checkpoint_not_buildable',source_sha256,blocks:d.metrics.blocks,logical_state_bits:57,physical_state_bits:54,physical_control_bits:38,exposed_microcontrol_bits:25,missing_microcontrol_bits:13,independent_review:false,native_calls:0,build_plans_emitted:false};
 const out=resolve(root,prefix+'source-manifest.json');if(check)assert.deepEqual(JSON.parse(readFileSync(out)),m);else writeFileSync(out,enc(m));return{status:m.status,source_pins:files.length,blocks:m.blocks};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
