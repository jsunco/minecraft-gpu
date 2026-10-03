// Reference admission ordering only. It is not a tick simulator or phase-duration proof.
import assert from'node:assert/strict';import{writeFileSync}from'node:fs';
const permit=(s,r)=>!!(r&&s[1]&&s[3]);
const edge=(s,r,p)=>p==='a'?[r,s[1],Number(!!(r&&s[1])),s[3]]:[s[0],s[0],s[2],s[2]];
let coldCases=0,releaseCases=0,withdrawalCases=0;
for(let mask=0;mask<16;mask++)for(const initialPhase of['a','b']){
 let s=Array.from({length:4},(_,i)=>mask>>i&1);
 // Raw initialize forces READY low. Prefix CURRENT is allowed before the complete ordered transfer.
 for(const p of(initialPhase==='b'?['b','a','b']:['a','b'])){s=edge(s,0,p);assert.equal(permit(s,0),false);coldCases++;}assert.deepEqual(s,[0,0,0,0]);
 s=edge(s,1,'a');assert.equal(permit(s,1),false);s=edge(s,1,'b');assert.equal(permit(s,1),false);
 s=edge(s,1,'a');assert.equal(permit(s,1),false);s=edge(s,1,'b');assert.equal(permit(s,1),true);releaseCases++;
 for(const phase of['a','b']){let t=edge(s,0,phase);assert.equal(permit(t,0),false);t=edge(t,0,'a');t=edge(t,0,'b');assert.deepEqual(t,[0,0,0,0]);withdrawalCases++;}
}
const earlyRelease=[1,1,1,1];assert.equal(permit(edge(earlyRelease,0,'b'),1),true);
const r={status:'settled_dispatch_admission_ordering_checks_pass',initial_retained_assignments:16,initial_phase_positions:2,cold_edge_cases:coldCases,release_cases:releaseCases,withdrawal_cases:withdrawalCases,preserved_early_release_counterexample:{initial_bits:earlyRelease,prefix:['b'],ready_released:1,permit:true},native_acceptance:false,complete_gpu_layout:false,limits:['READY must really remain zero through full ordered A-close/B-close and far closure; release after CURRENT alone can admit stale state.','The two retained stages provide event ordering, not a numerical settling guarantee for the remote decoder or output masks.','No tick-level, transient or unmodified-Minecraft proof is produced.']};writeFileSync(new URL('./protocol-checks.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
