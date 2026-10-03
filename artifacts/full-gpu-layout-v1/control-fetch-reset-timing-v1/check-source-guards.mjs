// Narrow assertions over the equations that generated the actual guard matrices.
// This is source identity/semantics evidence, not event-level execution.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {definition as barrier} from '../control-reset-retire-v1/logic.mjs';
import {laneDefinition,joinDefinition} from '../control-reset-quiet-v1/logic.mjs';
import {definition as scratch} from '../control-reset-scratch-v1/logic.mjs';
import {eligibilityDefinition,exitsDefinition} from '../control-reset-final-v1/logic.mjs';
const run=(d,v)=>Object.fromEntries(d.outputs.map(n=>[n,d.products.some(p=>p.out===n&&Object.entries(p.literals).every(([k,w])=>Number(!!v[k])===Number(w)))]));
const negative=[];
function checks(name,d,input,output,required){assert.equal(run(d,input)[output],true,name);for(const k of required){const bad={...input,[k]:!input[k]};assert.equal(run(d,bad)[output],false,name+': '+k);negative.push(name+': flip '+k);}}
checks('parked ownership service',barrier(),{pending:1,parked:1,idle_mask_arrived:1,update_mask_arrived:1,program_quiet:1,rf_quiet:1,lsu_quiet:1},'service_ready',['parked','idle_mask_arrived','update_mask_arrived','program_quiet','program_ready','rf_quiet','lsu_quiet','initialize','release_complete']);
checks('one actual LSU quiet',laneDefinition(),{drained:1},'quiet',['read_ready','write_ready','drained','read_valid','write_valid']);
for(const mode of ['owner_idle','owner_complete'])checks('RF '+mode,joinDefinition(),{[mode]:1},'rf_quiet',[mode,'rf_request','rf_ack']);
checks('all four LSU quiet',joinDefinition(),{quiet0:1,quiet1:1,quiet2:1,quiet3:1},'lsu_quiet',['quiet0','quiet1','quiet2','quiet3']);
checks('scratch start',scratch(),{service_ready:1},'active_D',['service_ready','initialize','core_fault','release_complete']);
checks('final epoch eligibility',eligibilityDefinition(),{arch_zero:1,epochs_zero:1,intents_zero:1,locks_closed:1,rf_ack:1,scratch_complete:1,epoch_settled:1,arch_stop:1},'eligible',['intents_zero','locks_closed','epoch_settled','epoch_enable','fault']);
checks('actual exits',exitsDefinition(),{alu_idle:1,alu_status_low:1,program_quiet:1,lsu_quiet:1},'exits_quiet',['rf_ack','rf_event_ack','alu_idle','alu_status_low','lsu_ack','program_quiet','program_ready','lsu_quiet','program_valid','decode_valid','request_tail']);
const p='artifacts/full-gpu-layout-v1/',names=['control-reset-retire-v1/logic.mjs','control-reset-quiet-v1/logic.mjs','control-reset-scratch-v1/logic.mjs','control-reset-final-v1/logic.mjs','control-fetch-reset-timing-v1/check-source-guards.mjs'];
const source_sha256=Object.fromEntries(names.map(n=>[p+n,createHash('sha256').update(readFileSync(p+n)).digest('hex')]));
const report={status:'source_bound_drain_and_epoch_guard_predicates_checked',rejected_missing_or_opposite_required_inputs:negative.length,cases:negative,source_sha256,native_acceptance:false,limits:['This checks the source equations used by the physical matrices, not freshness or waveforms of remote quiet/ready/drain signals.','Retained scalar stage interleavings and actual path timing are separately checked.']};
writeFileSync(new URL('source-guards.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({checks:negative.length}));
