import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {definition,evaluate,step,zero} from './logic.mjs';
import {step as oldStep} from '../master-reset-requesters-v1/logic.mjs';
import {evaluateGlobalControl} from '../../../hardware/full-gpu-global-control-logic-v3.mjs';
import {evaluateGlobalCommands} from '../../../hardware/full-gpu-global-command-gates.mjs';
const H='artifacts/full-gpu-layout-v1/master-reset-requesters-v2/',sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const def=definition();let truth=0;for(let bits=0;bits<512;bits++){const v=Object.fromEntries(def.inputs.map((n,i)=>[n,!!(bits>>i&1)])),r=Object.fromEntries(def.outputs.map(n=>[n,def.products.some(p=>p.out===n&&Object.entries(p.literals).every(([k,w])=>v[k]===w))]));assert.deepEqual(r,evaluate(v));truth++;}
let cold=0;for(let bits=0;bits<8192;bits++)for(const first of ['A','B']){let q=Object.fromEntries(Object.keys(zero()).map((n,i)=>[n,!!(bits>>i&1)]));for(const p of [first,'A','B','A','B','A'])q=step(q,p,{initialize:true,demand:true,ack:true,start:true,permit:false});assert(q.active&&q.active_next&&q.reset_out);for(const n of ['waiting','pending','waiting_next','pending_next','demand','ack','start','permit','start_out','held_reset_out'])assert(!q[n],n);cold++;}
// A fresh LOAD can be held waiting for completion. It need not already own the
// loader: raw LOAD itself drives loader_reset and enters global LOAD_CORE_DRAIN.
const start=()=>Object.assign(zero(),{active:true,active_next:true,demand:true,ack:true,reset_out:true,held_reset_out:true});let old=start(),fixed=start();const rows=[];
for(const[phase,demand]of[['B',false],['A',false],['B',true],['A',true]]){const raw={initialize:false,demand,ack:true,start:true,permit:true};old=oldStep(old,phase,raw);fixed=step(fixed,phase,raw);rows.push({phase,raw,old,fixed});}
let oldGlobal=7,newGlobal=7;const globalStep=(state,complete)=>{const v={q0:state&1,q1:(state>>1)&1,q2:(state>>2)&1,q3:(state>>3)&1,boot:0,raw_reset:0,raw_load:1,both_core_acks:Number(complete),drain_ready:1,conditioning_ready:1};const r=evaluateGlobalControl(v);const commands=evaluateGlobalCommands({loader_start:0,loader_reset:1,global_launch:r[7],global_force:r[5],dispatch_start0:0,dispatch_reset0:0,dispatch_start1:0,dispatch_reset1:0,dispatch_done:0});assert(commands[2]&&commands[4]);return r.slice(0,4).reduce((n,b,i)=>n+(b<<i),0);};
for(let t=0;t<100;t++){const raw={initialize:false,demand:true,ack:true,start:true,permit:true},phase=t%2?'B':'A';old=oldStep(old,phase,raw);fixed=step(fixed,phase,raw);if(phase==='A'){oldGlobal=globalStep(oldGlobal,old.held_reset_out);newGlobal=globalStep(newGlobal,fixed.held_reset_out);}assert(old.reset_out&&fixed.reset_out);assert(!old.start_out&&!fixed.start_out);}
assert(old.waiting&&old.pending&&!old.active&&!old.held_reset_out);assert.equal(oldGlobal,7);assert(fixed.active&&!fixed.waiting&&!fixed.pending&&fixed.held_reset_out);assert.equal(newGlobal,9);
const counterexample={status:'v1_held_demand_deadlock_reproduced_v2_coalesces_live_epoch',rows,old_after_100:old,v2_after_100:fixed,caller:{old_global_state:oldGlobal,v2_global_state:newGlobal,source:'global-control-v3 LOAD_CORE_DRAIN7 waits for both_core_acks; command gates OR held global_force and loader_reset into each demand',physical_requirement:'The demand reassertion is B-sampled while delivered RESET is still held high; source/path setup remains a timing obligation.'},native_acceptance:false};writeFileSync(H+'held-demand-counterexample.json',JSON.stringify(counterexample,null,2)+'\n');
// Reassertions are released ONLY after completion, never on a fixed timeout.
let traces=0,coalesced=0,separate=0;for(let reassert=0;reassert<32;reassert++)for(const delay of[1,2,4,8,12])for(const offset of[0,1]){let q=zero();q.active=q.active_next=true;q.reset_out=true;let ack=false,demand=true,first=-1,raised=false,done=false,epochs=0,highAge=0,lowAge=0,oldReset=true,completionAt=-1;
 for(let t=0;t<260;t++){if(q.reset_out){highAge++;lowAge=0;if(highAge>=delay)ack=true;}else{lowAge++;highAge=0;if(lowAge>=delay)ack=false;}
  if(q.held_reset_out&&first<0)first=t;
  if(first>=0&&t===first+3)demand=false;
  if(first>=0&&t===first+4+reassert){demand=true;raised=true;}
  if(raised&&q.held_reset_out&&t>first+4+reassert){done=true;completionAt=t;demand=false;}
  q=step(q,(t+offset)%2?'B':'A',{initialize:false,demand,ack,start:true,permit:true});
  if(!oldReset&&q.reset_out){assert(!ack,'New delivered RESET reuses old high ACK');epochs++;}
  if(q.held_reset_out)assert(q.reset_out,'Completion outside held reset');
  // A already-held START may change only on A, so inspect after its capture.
  if((t+offset)%2===0&&(q.waiting||q.pending||q.reset_out))assert(!q.start_out);
  oldReset=q.reset_out;
 }
 assert(done&&completionAt<first+4+reassert+80,'Held request never completed');assert(!q.reset_out&&!q.held_reset_out&&!q.active&&!q.waiting&&!q.pending);assert(epochs<=1);epochs?separate++:coalesced++;traces++;}
// Old ACK-high after RESET-low must not resurrect RESET or claim completion.
let low=Object.assign(zero(),{waiting:true,waiting_next:true,demand:true,ack:true,pending:true,pending_next:true});for(let t=0;t<40;t++){low=step(low,t%2?'B':'A',{initialize:false,demand:true,ack:true,start:true,permit:true});assert(!low.reset_out&&!low.held_reset_out&&!low.start_out);}
for(let t=0;t<8;t++)low=step(low,t%2?'B':'A',{initialize:false,demand:true,ack:false,start:true,permit:true});assert(low.reset_out&&low.active&&!low.held_reset_out);
// Coalesced requests leave all retained START outputs low continuously.
let h=start();for(const[phase,demand]of[['B',false],['A',false],['B',true],['A',true],['B',true],['A',true]]){h=step(h,phase,{initialize:false,demand,ack:true,start:true,permit:true});assert(h.reset_out&&!h.start_out);}assert(h.held_reset_out);
// The three new RESET-Q -> NEXT-A paths are sensitized only while RESET holds
// its current level. ACTIVE and WAIT are mutually exclusive after cold scrub;
// prove the invariant is preserved for all stable sampled inputs, not just traces.
let stableCases=0,sensitiveCases=0;const rest=def.inputs.filter(n=>n!=='reset_held'),samePhase=[];
for(let bits=0;bits<256;bits++){const v=Object.fromEntries(rest.map((n,i)=>[n,!!(bits>>i&1)]));if(v.active&&v.waiting)continue;const lo=evaluate({...v,reset_held:false}),hi=evaluate({...v,reset_held:true});for(const r of[lo,hi])assert(!(r.active_D&&r.waiting_D),'ACTIVE/WAIT exclusivity not inductive');const sensitive=['active_D','waiting_D','pending_D'].filter(n=>lo[n]!==hi[n]);if(sensitive.length){assert(!lo.reset_D&&hi.reset_D,'Same-phase source can change while NEXT is sensitive');sensitiveCases++;}samePhase.push({inputs:v,sensitive_outputs:sensitive,reset_equation_holds:!lo.reset_D&&hi.reset_D});stableCases++;}
assert(stableCases===192&&sensitiveCases>0);
const sourcePaths=[H+'logic.mjs',H+'check-logic.mjs','artifacts/full-gpu-layout-v1/master-reset-requesters-v1/logic.mjs','hardware/full-gpu-global-control-logic-v3.mjs','hardware/full-gpu-global-command-gates.mjs'];const out={status:'author_checked_v2_held_request_liveness_and_scalar_protocol',truth_cases:truth,arbitrary_cold_states_and_phase_orders:cold,held_request_schedules:traces,coalesced_live_epochs:coalesced,separate_rearmed_epochs:separate,forced_request_releases:0,old_ack_high_refusal_phases:40,same_phase_reset_dependency:{stable_closed_B_input_domains:stableCases,sensitive_domains:sensitiveCases,mutually_exclusive_active_wait_preserved:true,source_never_changes_when_next_sensitive:true,required:'Complete cold scrub, closed and settled B samples/CURRENT throughout A; real propagation must finish before A closure.'},source_sha256:Object.fromEntries(sourcePaths.map(p=>[p,sha(p)])),native_acceptance:false,limits:['Boolean phase model only; actual geometry, input setup and far closure remain separate gates.','Coalescing acknowledges the same uninterrupted RESET epoch; no claim of a second architectural reset.']};writeFileSync(H+'same-phase-proof.json',JSON.stringify({status:'qualified_same_phase_reset_data_dependency',cases:samePhase,source_sha256:out.source_sha256,native_acceptance:false},null,2)+'\n');writeFileSync(H+'logic-checks.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
