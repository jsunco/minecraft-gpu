// Deterministic offline package writer/checker. Explicit source list excludes reviews.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {makeFullLaneAluNetlist} from '../../../hardware/full-lane-alu-netlist.mjs';
import {makeFullLaneAluLayout} from '../../../hardware/full-lane-alu-layout.mjs';
import {makeFullLaneAluAdapters} from '../../../hardware/full-lane-alu-adapters.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu/',encode=v=>JSON.stringify(v,null,2)+'\n';
export function prepare({check=false}={}){
 const outputs={'netlist.json':makeFullLaneAluNetlist(),'layout-increment.json':makeFullLaneAluLayout(),'layout-adapters.json':makeFullLaneAluAdapters()};
 for(const [n,v]of Object.entries(outputs)){const f=resolve(root,prefix+n),text=encode(v);if(check)assert.equal(readFileSync(f,'utf8'),text,n);else writeFileSync(f,text);}
 const files=[...['README.md','prepare.mjs','microcode.mjs','check-offline.mjs','check-adapters.mjs','physical-control-interface.json','netlist.json','layout-increment.json','layout-increment-full-floor.json','layout-adapters.json','offline-check.json','adapter-check.json'].map(n=>prefix+n),
  'hardware/full-lane-alu-netlist.mjs','hardware/full-lane-alu-layout.mjs','hardware/full-lane-alu-adapters.mjs',
  'hardware/serial-bank-coupon.mjs','hardware/compact-adder.mjs','hardware/serial_arithmetic_model.py',
  'reference/tiny-gpu/src/alu.sv','reference/tiny-gpu/src/pc.sv','reference/tiny-gpu/src/decoder.sv',
  'artifacts/serial-bank-coupon-v1/source-manifest.json','artifacts/serial-bank-coupon-v1/geometry-independent-review.json',
  'artifacts/serial-arithmetic-model-v1/independent-review.json','artifacts/compact-byte-mode-design-v1/design.json'];
 const source_sha256=Object.fromEntries(files.map(n=>[n,createHash('sha256').update(readFileSync(resolve(root,n))).digest('hex')]));
 const m={status:'offline_partial_ALU_checkpoint_not_buildable',source_sha256,logical_state_bits:57,logical_exhaustive_legal_cases:327424,division_zero_fault_cases:256,latest_partial_blocks:outputs['layout-adapters.json'].metrics.blocks,physical_state_bits:54,missing_control_state_bits:3,independent_review:false,native_calls:0,build_plans_emitted:false};
 const f=resolve(root,prefix+'source-manifest.json');if(check)assert.deepEqual(JSON.parse(readFileSync(f)),m);else writeFileSync(f,encode(m));return{status:m.status,source_pins:files.length,blocks:m.latest_partial_blocks};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
