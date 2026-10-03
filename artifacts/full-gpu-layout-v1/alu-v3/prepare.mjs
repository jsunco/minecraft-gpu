import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {makeFullLaneAluFoldedV3} from '../../../hardware/full-lane-alu-folded-v3.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-v3/',enc=v=>JSON.stringify(v,null,2)+'\n';
export function prepare({check=false}={}){
 const d=makeFullLaneAluFoldedV3(),f=resolve(root,prefix+'design.json');
 if(check)assert.equal(readFileSync(f,'utf8'),enc(d));else writeFileSync(f,enc(d));
 const original=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/alu/physical-control-interface.json')));
 const names=[...original.ports.map(p=>p.name),'status_busy_value','status_open','status_clear'];
 const refinement={status:'physical_receivers_mapped_status_qualification_and_core_producers_missing',original_38:original,additional_status_commands:['status_busy_value','status_open','status_clear'],total_microcontrol_bits:41,receivers:names.map(name=>{const a=d.ports.filter(p=>p.name===name);assert.equal(a.length,1,name);return a[0];}),retained_state_bits:57,result_outputs:d.ports.filter(p=>['result','cmp_nzp','ready','fault_div_zero','busy'].includes(p.name)),high_level_inputs_not_yet_mapped:['arithmetic_mux[1:0]','compare','lane_enable','reset','execute_request','result_ack'],status_cells:d.front.status_cells,qualification_equations_proposed_not_routed:{accepted:'lane_enable AND execute_request AND NOT busy AND NOT ready AND NOT fault',raw_local_div0:'NOT compare AND arithmetic_mux==3 AND actual_B_zero',fault_next:'(old_fault OR (accepted AND raw_local_div0)) AND NOT status_clear',busy_next:'lane_enable AND status_busy_value AND NOT fault_next AND NOT raw_local_div0 AND NOT status_clear',ready_next:'lane_enable AND final_latched AND NOT fault_next AND NOT status_clear'},required_core_sequence:['Idle acceptance is core-owned; no local second sequencer or host acceptance event.','Hold request/mode/A/B; prepare status_busy_value=1 and final_latched=0, open status, close and settle before scratch-bank INIT.','Close all final W_next result stores and wait measured settlement before status_busy_value=0/final_latched=1 capture.','Hold ready/result until UPDATE completes and request falls before result_ack; then capture status values0.','Reset performs actual zero NEXT/CURRENT transfers for every lane, including inactive lanes, before status_clear=1 capture and close. Raw reset must not freeze the phase source.'],timing:'Shared core phase source and all close/settle margins require physical validation; nominal source scheduling is not a delay guarantee.',missing:d.remaining};
 const rf=resolve(root,prefix+'control-refinement.json');if(check)assert.equal(readFileSync(rf,'utf8'),enc(refinement));else writeFileSync(rf,enc(refinement));
 const baseline=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/alu-v2/source-manifest.json')));
 const files=[...Object.keys(baseline.source_sha256),'artifacts/full-gpu-layout-v1/alu-v2/source-manifest.json','hardware/full-lane-alu-folded-v3.mjs',...['README.md','prepare.mjs','check-routing.py','routing-check.json','design.json','control-refinement.json'].map(n=>prefix+n)];
 const source_sha256=Object.fromEntries(files.map(n=>[n,createHash('sha256').update(readFileSync(resolve(root,n))).digest('hex')]));
 for(const [n,h]of Object.entries(baseline.source_sha256))assert.equal(source_sha256[n],h,'Preserved baseline '+n);
 const m={status:'active_refolded_partial_ALU_checkpoint_not_buildable',source_sha256,blocks:d.metrics.blocks,logical_state_bits:57,physical_state_bits:57,original_physical_control_bits:38,additional_status_microcontrol_bits:3,exposed_microcontrol_bits:41,missing_original_microcontrol_receivers:0,status_qualification_and_core_producers_complete:false,independent_review:false,native_calls:0,build_plans_emitted:false};
 const out=resolve(root,prefix+'source-manifest.json');if(check)assert.deepEqual(JSON.parse(readFileSync(out)),m);else writeFileSync(out,enc(m));return{status:m.status,source_pins:files.length,blocks:m.blocks};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
