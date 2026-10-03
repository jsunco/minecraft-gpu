import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import {pathToFileURL}from'node:url';
export function boundary(d){const p=d.ports,entries=[],add=(name,path,role,contract)=>{let v=p;for(const k of path.split('.'))v=v[k];assert(v?.bits&&v.width, 'Missing boundary '+path);entries.push({name,path,role,port:structuredClone(v),contract,geometry_status:'actual_local_terminal_master_composition_pending'});};
for(const[n,path,contract]of[
 ['cold_initialize','rf.startup_initialize_request','Quiescent BOOT/global conditioning only; already distributes internally to front, RF, ALU, LSU and reset stages. No second master front.initialize driver.'],
 ['phase_inhibit','rf.startup_phase_inhibit','Hold low while cold initialization, ordinary execution and warm reset service run. Raw RESET must not halt this shared phase producer.'],
 ['normal_permit','front.normal_permit','New normal admission; accepted instruction ownership still retires through the staged barrier.'],
 ['alu_normal_permit','alu_startup.logic.normal_permit','Normal ALU admission; accepted retained ALU operations and explicit reset rows have the existing local bypass contract.'],
 ['start','start_request','Held dispatch start; stay low throughout reset/ACK withdrawal and rearm before next rising START.'],
 ['reset','reset_request','Held staged warm request. Preserve dispatch payload until actual reset ACK high; lower request and wait ACK low before new START.'],
 ['lane_mask','front.lane_enable','Retained per-core four-lane mask, lane0 mandatory; payload stable through ownership and reset admission.'],
 ['block_id','rf.block_id','Eight-bit dispatch block ID; initial OTHER assignment precedes first REQUEST.'],
 ['program_ready','front.program_ready','Owner-qualified ready held with response until local request is withdrawn.'],
 ['program_data','front.program_data','Sixteen-bit response; qualified by ready, captured and closed before request withdrawal.'],
 ['program_drained','reset_barrier.program_quiet','Actual shared program quiet producer; own READY must separately be low. Ready-low is not drain.']])add(n,path,'input',contract);
for(const[n,path,contract]of[
 ['program_valid','front.program_valid','A-held fetch intent through the actual fetch/IR tail gate and controller.'],
 ['program_address','front.program_address','Actual held CURRENT PC; normalized pads preserved. UPDATE closes before next admitted FETCH.'],
 ['done','core_done','Actual A-held completion. Far fault must precede visible completion; not instantaneous fault retraction.'],
 ['reset_ack','reset_ack','Held whole-core completion spanning WITHDRAW/RELEASE/CLEANUP; final ACK-low follows delivered clears and retained-stage release.'],
 ['fault','architectural_fault','Sticky diagnostic fault; no warm ACK recovery. Destructive BOOT and full image reload/readback required.'],
 ['rf_conditioned','rf.startup_admitted','Local retained decoder admission only; not full reset ACK or global timing acceptance.'],
 ['alu_conditioned','alu_startup.logic.startup_admitted','Local retained decoder admission only; not full reset ACK or far lock closure.']])add(n,path,'output',contract);
for(let lane=0;lane<4;lane++)for(const name of['read_address','write_address','write_data','read_valid','write_valid','read_data','read_ready','write_ready','drained'])add(`lsu${lane}.${name}`,`lsus.${lane}.${name}`,['read_data','read_ready','write_ready','drained'].includes(name)?'input':'output',`Memory consumer index core*4+${lane}; payload/typed valid retained through response closure, then both READY low plus actual owner/backend drained before reuse.`);
return{status:'author_source_bound_current_remaining_core_machine_boundary',entries,local_only_not_additional_master_inputs:['front.initialize','front.phase_a','front.phase_b','local_reset_service','reset_barrier.release_complete','reset_scratch.*','reset_closure.*','reset_final.*','rf.event_request/event_kind/reset_request','LSU request/enable/type/reset/update/initialize/phase/rs/rt','ALU request/ACK/reset/mode/compare/enables','external.other historical alias'],native_acceptance:false,complete_core_reset:false,notes:['Nested inherited ports include internally connected diagnostic aliases. This list identifies the remaining master boundary, not every nested port.','Master composition must apply explicit parent replacements and rescreen actual cells/contacts, including the reserved North held-DONE tap.']};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=boundary(JSON.parse(readFileSync(new URL('design.json',import.meta.url))));if(process.argv.includes('--check'))assert.deepEqual(r,JSON.parse(readFileSync(new URL('machine-boundary.json',import.meta.url))));else writeFileSync(new URL('machine-boundary.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({boundary_ports:r.entries.length}));}
