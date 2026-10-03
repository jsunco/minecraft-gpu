// Source-bound counterexamples under unconstrained inter-bit propagation order.
// This does not predict an actual Minecraft pulse duration or ordering.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
import{actionDefinition,equation,nextState,stateValues}from'../control-lsu-v2/logic.mjs';
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sources=['artifacts/full-gpu-layout-v1/control-lsu-v2/logic.mjs','artifacts/full-gpu-layout-v1/control-lsu-v2/prepare.mjs','artifacts/full-gpu-layout-v1/control-core-v1/prepare.mjs','artifacts/full-gpu-layout-v1/control-commit-v2/terms.mjs','artifacts/full-gpu-layout-v1/control-fetch-v1/prepare.mjs'];
function permutations(a){return a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];}
function transition(from,to){const changed=Array.from({length:4},(_,b)=>b).filter(b=>(from^to)&(1<<b));return permutations(changed).map(order=>{let s=from;const states=[s];for(const bit of order){s^=1<<bit;states.push(s);}return{order,states};});}
const actions=s=>equation(actionDefinition(),{...stateValues(s),initialize:false,phase_a:false,is_write:false,valid:false});
assert.equal(nextState(7,{}),8);assert.equal(nextState(11,{}),12);
const drop=transition(7,8),reset=transition(11,12),witness=drop.find(t=>[9,13,15].every(n=>t.states.includes(n)));assert(witness);for(const [state,name]of[[9,'done'],[13,'reset_ack'],[15,'fault']])assert(actions(state)[name]);
assert.equal(nextState(13,{reset:true}),13);assert.equal(nextState(13,{reset:false}),14);const lateRelease=transition(13,14).find(t=>t.states.includes(15));assert(lateRelease);
// Stable-phase capture is a protocol obligation: sampling after all CURRENT
// transitions settles stores only the settled status, never an intermediate row.
for(const list of[drop,reset])for(const t of list){const captured=actions(t.states.at(-1));assert(!captured.done&&!captured.reset_ack&&!captured.fault);}
const report={status:'author_source_audit_concrete_transient_obligations',source_sha256:Object.fromEntries(sources.map(p=>[p,sha(p)])),current_interleavings:{drop_valid_to_wait_drain:drop.length,reset_clear_to_reset_close:reset.length},possible_unlatched_status_pulse_witness:witness,possible_late_A_NEXT_capture_on_reset_release:lateRelease,scope:'Possible intermediate Boolean encodings under unconstrained inter-bit ordering, not observed Minecraft waveforms or proof of a particular duration.',required_derivative:['Capture DONE/reset_ACK/fault exports while CURRENT is stable in A, hold through B changes, and clear/initialize those cells explicitly.','Sample asynchronous request/ready/drained/reset/update and core/fetch/RF completion predicates into B-held single-bit guards before A chooses a multi-bit NEXT. A same-phase transparent guard is insufficient.','Require quantitative CURRENT-B to command-capture-A and guard-B to NEXT-A settling bounds over actual routes; one shared oscillator does not eliminate remote skew.','Preserve raw reset/fault only for monotonic admission/architectural suppression; never use a raw level to select multi-bit state or claim final closure.'],native_acceptance:false,transient_safety_proven:false};
if(process.argv.includes('--save'))writeFileSync(new URL('findings.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
