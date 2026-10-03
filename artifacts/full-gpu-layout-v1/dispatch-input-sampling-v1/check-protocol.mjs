// Settled truth and explicit counterexamples, never a redstone timing simulation.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {nextState} from '../../../hardware/full-gpu-dispatch-microprogram.mjs';
import {makeDispatchPredicates,OUTPUTS} from '../../../hardware/full-gpu-dispatch-predicates.mjs';
import {transitionTerms,BRANCHES} from '../../../hardware/full-gpu-dispatch-next-state.mjs';
const d=JSON.parse(readFileSync(new URL('design.json',import.meta.url))),logic=makeDispatchPredicates(),states=[1,2,7,8,12,20,21,25],fields=['owner','start0','start1','done0','done1','ack0','ack1','remaining','start','all_done'];
const actual=(values,name)=>logic.rows.some(r=>r.bits.includes(OUTPUTS.indexOf(name))&&r.gates.every(g=>values[g.name]===!!g.wanted));
let predicates=0,branches=0;
for(let bits=0;bits<1024;bits++){
 const v=Object.fromEntries(fields.map((n,b)=>[n,!!(bits&(1<<b))])),c=v.owner?1:0,p={start:v.start,owner:v.owner,all_done:v.all_done,completed:v['start'+c]&&v['done'+c],reset_high:v['ack'+c],reset_low:!v['ack'+c],available:!v['start'+c]&&v['ack'+c]&&v.remaining,both_reset:v.ack0&&v.ack1};
 for(const name of OUTPUTS){assert.equal(actual(v,name),p[name]);predicates++;}
 for(const[i,[name,pred,no,yes]]of BRANCHES.entries()){
  const terms=transitionTerms().filter(t=>t.literals['branch_'+name]);let result=0;for(const t of terms)if(t.literals['predicate_'+pred]===Number(p[pred]))for(const bit of t.bits)result|=1<<bit;
  assert.equal(result,p[pred]?yes:no);assert.equal(result,nextState(states[i],p));branches++;
 }
}
const mixed=(a,b)=>{const vals=new Set();for(let select=0;select<32;select++)vals.add((a&~select)|(b&select));return[...vals].sort((a,b)=>a-b);};
const examples=[{state:7,predicate:'reset_high',false_next:7,true_next:8,unsafe_examples:[0,13,15]},{state:2,predicate:'completed',false_next:8,true_next:3,unsafe_examples:[9]},{state:1,predicate:'start',false_next:1,true_next:21,unsafe_examples:[5,17]}].map(x=>({...x,possible_mixed_next:mixed(x.false_next,x.true_next)}));
for(const x of examples)for(const n of x.unsafe_examples)assert(x.possible_mixed_next.includes(n)&&![x.false_next,x.true_next].includes(n));
const baseline=d.samples.map(s=>({name:s.name,raw:s.raw,held:s.source,storage:s.storage,lock:s.lock,consumer:s.destination}));
const obligations=[
 {id:'sample_closure_before_next',relation:'latest(sample_lock_high[0..4]) + sample_to_predicate_to_NEXT_settle < earliest(NEXT_lock_low)',sources:baseline.map(s=>s.lock),proven:false},
 {id:'current_decode_before_actions',relation:'latest(macro_CURRENT_lock_high,output_CURRENT_lock_high,counter_CURRENT_lock_high) + all decode/comparison routes settle < earliest(qualified_action_A_or_NEXT_A)',proven:false},
 {id:'sample_rearm',relation:'physical B high must open all five sample locks and allow every held raw level to reach its storage; physical B low closes all five before A',phase_source:d.phase.source,phase_receiver:d.phase.bank_open,proven:false},
 {id:'cold_release',relation:'held cold_initialize and architectural blanking persist through a fresh complete sample B and far predicate settle, in addition to original decoder/admission transfer',proven:false},
 {id:'external_epoch',relation:'START holds until DONE; each DONE/reset ACK belongs to current core assignment/reset epoch and persists until the corresponding held START/RESET response. DCR remains stable throughout kernel.',proven:false},
 {id:'held_output_transition',relation:'six retained command bits change only through original macro close/wait states; far START/reset/payload recipients must obey their existing settled handshake requirements',proven:false}
];
const result={status:'offline_dispatch_boundary_audit_and_settled_sample_refinement',predicate_cases:predicates,conditional_cases:branches,late_A_counterexamples:examples,physical_samples:baseline,existing_held_outputs:{count:6,state_ports:d.ports.output_state.bits,source:'hardware/full-gpu-dispatch-output-feedback.mjs'},startup_admission:{retained_select_and_admitted:true,source:'hardware/full-gpu-dispatch-startup-feedback.mjs',no_extra_async_READY_store_invented:true},timing_obligations:obligations,native_acceptance:false,limits:['Mixed NEXT examples demonstrate possible bit skew, not an observed Minecraft event.','Truth cases use settled captured scalars. No schedule/latency bound or arbitrary-input chatter safety is claimed.','Raw destructive cold initialize stays separate from staged warm reset; it is not added to normal input sampling.']};
if(process.argv.includes('--save'))writeFileSync(new URL('protocol-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,predicate_cases:predicates,conditional_cases:branches,counterexamples:examples.length,timing_obligations:obligations.length,native_acceptance:false}));
