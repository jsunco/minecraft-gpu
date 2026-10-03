// State-level proof over source-pinned hardware equations; not block simulation.
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nextState,ACTION_STATES,decodedActions} from '../../../hardware/full-gpu-dispatch-microprogram.mjs';
import {outputTerms,INPUTS} from '../../../hardware/full-gpu-dispatch-output-logic.mjs';
const H=new URL('.',import.meta.url),root=new URL('../../../',H);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pins={};for(const file of ['hardware/full-gpu-dispatch-microprogram.mjs','hardware/full-gpu-dispatch-output-logic.mjs','artifacts/full-gpu-layout-v1/dispatch-input-sampling-v1/protocol-audit.json'])pins[file]=hash(new URL(file,root));
assert.deepEqual(ACTION_STATES.capture_payload,[9]);assert.deepEqual(ACTION_STATES.raise_start,[13]);
const successor=q=>[...new Set(Array.from({length:256},(_,v)=>nextState(q,Object.fromEntries(['start','completed','reset_high','available','reset_low','owner','all_done','both_reset'].map((f,i)=>[f,!!(v&(1<<i))])))))];
let distance=new Map([[9,0]]),queue=[9];for(const q of queue)for(const n of successor(q))if(!distance.has(n)){distance.set(n,distance.get(q)+1);queue.push(n);}
assert.equal(distance.get(13),4);
// Enumerate all *reachable* retained command/macro states, with every possible
// external START/DONE/ACK/remaining/total predicate. No optimistic response time.
const key=s=>[s.q,...s.bits].join(',');const initial={q:0,bits:[0,0,0,1,0,1]};const seen=new Map([[key(initial),initial]]),todo=[initial];let transitions=0,captures=0,startRises=0;
for(const s of todo){const[owner,done,start0,reset0,start1,reset1]=s.bits;for(let raw=0;raw<128;raw++){
 const [extstart,d0,d1,a0,a1,remaining,all_done]=Array.from({length:7},(_,i)=>!!(raw&(1<<i)));
 const active=owner?start1:start0,ack=owner?a1:a0,coreDone=owner?d1:d0;
 const predicates={start:extstart,completed:!!active&&coreDone,reset_high:ack,reset_low:!ack,available:!active&&ack&&remaining,owner:!!owner,all_done,both_reset:a0&&a1};
 const acts=decodedActions(s.q),values={...acts,owner_state:owner,done_state:done,core0_start_state:start0,core1_start_state:start1,core0_reset_state:reset0,core1_reset_state:reset1};
 assert(INPUTS.every(f=>values[f]!==undefined));const bits=Array(6).fill(0);
 for(const row of outputTerms())if(Object.entries(row.literals).every(([n,w])=>Number(values[n])===w))for(const b of row.bits)bits[b]=1;
 if(acts.capture_payload){assert.equal(active,0,'Payload overwritten while selected held START high');assert.equal(owner?s.bits[5]:s.bits[3],1,'Payload capture before held RESET');captures++;}
 for(let c=0;c<2;c++)if(!s.bits[2+2*c]&&bits[2+2*c]){assert.equal(s.q,13);assert.equal(c,owner);assert.equal(s.bits[3+2*c],0);startRises++;}
 // Ordinary held payloads change only when CAPTURE of that owner is true.
 // CLEAR_ALL is cold initialization and remains a separately blanked epoch.
 const n={q:nextState(s.q,predicates),bits};transitions++;const k=key(n);if(!seen.has(k)){seen.set(k,n);todo.push(n);}
 }}
let negative=0;assert(distance.get(13)>0);for(const shortcut of [[9,13],[10,13]]){const q=[9],dist=new Map([[9,0]]);for(const a of q)for(const b of [...successor(a),...(a===shortcut[0]?[shortcut[1]]:[])])if(!dist.has(b)){dist.set(b,dist.get(a)+1);q.push(b);}assert(dist.get(13)<4);negative++;}
const r={status:'source_bound_dispatch_macro_spacing_and_payload_hold_invariants',minimum_capture_to_raise_start_macrocycles:4,macro_path:[9,10,11,12,13],reachable_retained_states:seen.size,all_external_predicate_transitions:transitions,capture_cases:captures,start_rise_cases:startRises,negative_shortcuts_refused:negative,source_sha256:pins,native_acceptance:false,world_mutations:0,limits:['Reachable settled register-transfer equations, not event-level block execution. Every state advances only on its physical qualified A/B cycle; complete dispatcher nominal dependency audit is a separate premise.','Payload remains unchanged while its held START is high; reuse requires sampled completion, START lowering, RESET high acknowledgement, capture, RESET-low acknowledgement, then START. Reset requester must enforce the ACK epoch rather than treating arbitrary raw ACK as fresh.','Destructive cold initialization blanks execution and resets payload independently; its far release/hold timing is a separate obligation. DCR and external START obey the documented launch protocol.']};
pins['artifacts/full-gpu-layout-v1/dispatch-launch-timing-v1/check-sequence.mjs']=hash(new URL('check-sequence.mjs',H));writeFileSync(new URL('sequence-checks.json',H),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({...r,source_sha256:undefined,limits:undefined}));
