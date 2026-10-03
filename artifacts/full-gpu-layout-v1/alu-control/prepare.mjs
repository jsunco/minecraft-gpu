import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{makeAluControlWord}from'../../../hardware/full-gpu-alu-control-word.mjs';
import{COMMANDS,STATES,PHASES,word}from'./microprogram.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),prefix='artifacts/full-gpu-layout-v1/alu-control/',enc=v=>JSON.stringify(v,null,2)+'\n',read=p=>readFileSync(resolve(root,p)),sha=p=>createHash('sha256').update(read(p)).digest('hex');
export function prepare({check=false}={}){
 const d=makeAluControlWord();assert.deepEqual(d,JSON.parse(read(prefix+'control-word.json')));
 const contract={status:'complete_offline_schedule_connected_word_plane_feedback_missing',instances:['gpu/core0/alu_control','gpu/core1/alu_control'],state:{macro:5,phase:2,bit:3,round:3,current_bits:13,next_bits:13,physically_mapped:false},macro_states:STATES,phases:PHASES,commands:COMMANDS,words:STATES.map((_,i)=>word(i)),physical_ports:d.ports,external_joins:{fault_source:'lane_join.any_fault',ready_source:'lane_join.all_ready',existing_core_fault_sink:'qualifier.fault_any'},reset:'Initialize actual state0 with actions blanked; physical RESET transfers all lanes then RESET_STATUS capture/close; held request waits in RESET_WAIT.',ack:'Keep W_next/ready until RF+flags+PC have committed, then request low + result_ack permits status ACK.',geometry:d.metrics,missing:d.missing,native_calls:0};
 function save(name,v){if(check)assert.equal(read(prefix+name).toString(),enc(v));else writeFileSync(resolve(root,prefix+name),enc(v));}
 save('interface.json',contract);
 const pp='artifacts/full-gpu-layout-v1/alu-v4/source-manifest.json',parent=JSON.parse(read(pp));for(const[p,h]of Object.entries(parent.source_sha256))assert.equal(sha(p),h,p);
 const files=[...Object.keys(parent.source_sha256),pp,'hardware/full-gpu-alu-control-word.mjs','hardware/full-gpu-state-decoder.mjs','hardware/address-decoder4.mjs',...['README.md','microprogram.mjs','check-microprogram.mjs','check-word.mjs','check-word.py','control-word.json','interface.json','prepare.mjs'].map(n=>prefix+n)];
 const unique=[...new Set(files)],source_sha256=Object.fromEntries(unique.map(p=>[p,sha(p)]));
 save('source-manifest.json',{status:'connected_command_plane_checkpoint_not_an_autonomous_sequencer',source_sha256,command_bits:41,command_plane_blocks:d.blocks.length,logical_controller_current_bits:13,logical_controller_next_bits:13,controller_storage_geometry_mapped:false,complete_state_loop:false,independent_review:false,native_calls:0});return{pins:unique.length,blocks:d.blocks.length,manifest_sha256:sha(prefix+'source-manifest.json')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepare({check:process.argv.includes('--check')})));
