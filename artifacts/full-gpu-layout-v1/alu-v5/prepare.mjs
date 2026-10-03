import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {makeFullLaneAluStatusV5} from '../../../hardware/full-lane-alu-status-v5.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-v5/',enc=v=>JSON.stringify(v,null,2)+'\n';
const read=p=>readFileSync(resolve(root,p)),json=p=>JSON.parse(read(p)),sha=p=>createHash('sha256').update(read(p)).digest('hex');
export function prepare({check=false}={}){
 const d=makeFullLaneAluStatusV5();
 function save(name,v){const p=prefix+name;if(check)assert.equal(read(p).toString(),enc(v),p);else writeFileSync(resolve(root,p),enc(v));}
 save('design.json',d);
 const original=json('artifacts/full-gpu-layout-v1/alu/physical-control-interface.json'),names=[...original.ports.map(p=>p.name),'status_busy_value','status_open','status_clear'];
 const refinement={status:'local_status_qualification_connected_core_event_producers_and_external_routes_pending',original_38:original,additional_status_commands:['status_busy_value','status_open','status_clear'],total_microcontrol_bits:41,receivers:names.map(name=>{const a=d.ports.filter(p=>p.name===name);assert.equal(a.length,1);return a[0];}),retained_state_bits:57,result_outputs:d.ports.filter(p=>['result','cmp_nzp','ready','fault_div_zero','busy'].includes(p.name)),mapped_high_level_inputs:d.ports.filter(p=>['arithmetic_mux','compare','lane_enable','execute_request'].includes(p.name)),core_owned_events_without_additional_lane_receivers:['reset','result_ack'],status_cells:d.front.status_cells,equations:d.front.status_refinement.implemented_equations,required_core_sequence:['Hold A/B, mode, compare, lane_enable and execute_request stable with all banks closed; settle actual normalized status D before status_open. DIV0 busy/ready D must be0 independently of feedback before capture.','Accept once only while enabled and idle: busy_value1/final0, status capture/close/settle before arithmetic INIT.','After every W_next result lock closes and settles, capture busy_value0/final1 and close/settle status.','Hold retained W_next and ready through RF, CMP-only architectural NZP, and PC commits; acknowledge only after all obligations and execute_request fall. Then capture busy_value0/final0.','Reset zero-transfers all54 scratch bits even inactive, then status_clear1 with a real status open/close/settle. Deassert clear closed; do not freeze the phase source.'],timing:'No native bound inferred. Verify feedback-before-set-withdrawal, input setup, lock-before-data, and complete result/status closure before ready/ack.',missing:d.remaining};
 save('control-refinement.json',refinement);
 const parentPath='artifacts/full-gpu-layout-v1/alu-v3/source-manifest.json',baseline=json(parentPath);
 for(const[p,h]of Object.entries(baseline.source_sha256))assert.equal(sha(p),h,'Frozen v3 ancestor '+p);
 const files=[...Object.keys(baseline.source_sha256),parentPath,'hardware/full-lane-alu-status-v5.mjs','hardware/full-lane-alu-status-v4.mjs','artifacts/full-gpu-layout-v1/alu-v4/source-manifest.json','artifacts/full-gpu-layout-v1/alu-v4/design.json','artifacts/byte-operand-routing-v1/review-evidence/RedstoneWireBlock.javap.txt',...['README.md','prepare.mjs','check-routing.py','check-corruptions.py','routing-check.json','corruptions-check.json','repair.diff','design.json','control-refinement.json'].map(n=>prefix+n)];
 assert.equal(files.length,new Set(files).size);
 const source_sha256=Object.fromEntries(files.map(p=>[p,sha(p)]));
 const manifest={status:'connected_local_status_derivative_unbuilt_core_interconnect_pending',source_sha256,parent_manifest_sha256:sha(parentPath),parent_preserved_blocks:d.parent_preserved_blocks,blocks:d.metrics.blocks,added_blocks:d.metrics.additions,physical_state_bits:57,exposed_microcontrol_bits:41,mapped_existing_high_level_input_bits:5,local_status_qualification_complete:true,repair:'Four non-wire diode outputs replace three invalid dust-solid-dust junctions; v4 preserved as rejected geometry history',shared_core_event_producers_complete:false,independent_review:false,native_calls:0,build_plans_emitted:false};
 save('source-manifest.json',manifest);return{status:manifest.status,source_pins:files.length,blocks:manifest.blocks,additions:manifest.added_blocks,manifest_sha256:sha(prefix+'source-manifest.json')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
