// Independent phase/open schedule oracle. Pure offline; no native services.
import assert from'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import {createHash}from'node:crypto';
import {fileURLToPath}from'node:url';
import {relative,resolve}from'node:path';
import {step,word,commands}from'../alu-control/microprogram.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),root=resolve(here,'../../..'),ref=resolve(here,'../control-complete-timing-v1');
const read=p=>JSON.parse(readFileSync(p));
const expectedNext={0:'wmq',5:'wmq',6:'wmq',7:'wmq',8:'wmq',9:'wm',10:'wm',11:'wm',12:'wm',13:'mq',14:'wq',15:'wm',16:'wm',17:'q',18:'wm',19:'wm',21:'w',22:'w',23:'w'};
const expectedCurrent={...expectedNext,17:'',20:'q',21:'',22:'',23:''};
const expectedStatus=new Set([1,4,24,26]);
const physicalWord=read(resolve(here,'../alu-control/control-word.json'));
for(const bank of['w','m','q'])for(const [phase,oracle]of[['next',expectedNext],['current',expectedCurrent]]){
 const g=physicalWord.groups[bank+'_open_'+phase];assert.equal(g.phase,phase);assert.deepEqual(g.states,Array.from({length:32},(_,i)=>i).filter(i=>(oracle[i]??'').includes(bank)));
 const column=physicalWord.matrix.find(x=>x.names.includes(bank+'_open_'+phase));assert.deepEqual(column.states,g.states);
}
assert.deepEqual(physicalWord.groups.status_open.states,[...expectedStatus]);assert.equal(physicalWord.groups.status_open.phase,'next');
assert.deepEqual(physicalWord.qualifiers.map(x=>x.gates.map(g=>[g.name,g.wanted])),[[['phase0',1],['phase1',0],['qualified_action_A',1]],[['phase0',0],['phase1',1],['qualified_action_A',1]]]);
let transitions=0,modeChanges=0,openCases=0,phaseBitOrderCases=0;
for(let macro=0;macro<32;macro++){
 const w=word(macro);assert.deepEqual([...w.next].sort(),[...(expectedNext[macro]??'')].sort());assert.deepEqual([...w.current].sort(),[...(expectedCurrent[macro]??'')].sort());assert.equal(w.status,expectedStatus.has(macro));
 for(let phase=0;phase<4;phase++)for(let bit of[0,7])for(let round of[0,7])for(let flags=0;flags<128;flags++){
  const input={reset_request:!!(flags&1),any_fault:!!(flags&2),execute_request:!!(flags&4),result_ack:!!(flags&8),compare:!!(flags&16),arithmetic_mux:(flags>>5)&3,initialize:false};
  const state={macro,phase,bit,round},next=step(state,input);assert.equal(next.phase,(phase+1)%4);
  if(phase!==3){assert.equal(next.macro,macro);assert.equal(next.bit,bit);assert.equal(next.round,round);}
  if(next.macro!==macro){assert.equal(phase,3);assert.equal(next.phase,0);modeChanges++;}
  transitions++;
 }
 for(let phase=0;phase<4;phase++)for(let flags=0;flags<64;flags++){
  const x={qualifiedA:!!(flags&1),lane_enable:!!(flags&2),lane_fault:!!(flags&4),initialize:!!(flags&8),reset_request:!!(flags&16),any_fault:!!(flags&32)};
  const c=commands({macro,phase},x),reset=macro===0||macro===1,admitted=x.qualifiedA&&!x.initialize&&(!x.reset_request||reset)&&(!x.any_fault||reset),data=admitted&&(reset||(x.lane_enable&&!x.lane_fault));
  for(const bank of['w','m','q']){
   assert.equal(c[bank+'_open_next'],+(data&&phase===1&&(expectedNext[macro]??'').includes(bank)));
   assert.equal(c[bank+'_open_current'],+(data&&phase===2&&(expectedCurrent[macro]??'').includes(bank)));
  }
  assert.equal(c.status_open,+(admitted&&phase===1&&expectedStatus.has(macro)));
  // Physical retained Q-aux is a NEXT-phase bank. It is read as !take only
  // during DIV_RESTORE_BIT while q_open_next is closed, not a transparent loop.
  if(c.addend_mode_not_take){assert.equal(macro,19);assert.equal(c.q_open_next,0);assert.equal(c.q_open_current,0);}
  if(phase===0||phase===3)for(const key of['w_open_next','w_open_current','m_open_next','m_open_current','q_open_next','q_open_current','status_open'])assert.equal(c[key],0);
  openCases++;
 }
}
const paths=read(resolve(here,'alu-control-checks.json')),phase=read(resolve(ref,'phase-checks.json')).phase_paths,stores=read(resolve(ref,'storage-discovery.json')).stores,ids=new Map(stores.map((s,i)=>[s.storage.join(','),i]));
const laneIds=new Set(paths.phase_lane.rows.map(r=>ids.get(r.target_storage.join(','))));assert.equal(laneIds.size,228);
const phaseCurrentIds=[[1414,237,-30],[1414,245,-30]].map(p=>ids.get(p.join(',')));
const earliestPhaseChange=1584+Math.min(...phase.filter(x=>phaseCurrentIds.includes(x.store_index)&&x.phase==='B').map(x=>x.nominal_min_ticks))+2;
const latestLaneClose=544+Math.max(...phase.filter(x=>laneIds.has(x.store_index)&&x.phase==='A').map(x=>x.nominal_max_ticks));assert(earliestPhaseChange>latestLaneClose);
// All actual two-bit transition orders, including 3→0 through1 or2, happen
// inside the proven nominal closed interval when the phase banks transfer.
for(let old=0;old<4;old++){
 const value=(old+1)&3,changed=[0,1].filter(b=>(old^value)&(1<<b));
 for(const order of changed.length===2?[changed,[...changed].reverse()]:[changed]){let n=old;for(const bit of order){n=(n&~(1<<bit))|(value&(1<<bit));assert(n>=0&&n<4);}assert.equal(n,value);phaseBitOrderCases++;}
}
assert(paths.phase_lane.summary.minimum_finite>0);assert(paths.macro_lane.summary.minimum_finite>3160);assert(paths.NEXT_phase_to_CURRENT_enable.every(r=>r.nominal_margin_before_B>0));
// Actual qualifiers use CURRENTphase3 for A and held NEXTphase0 for B. The
// second condition does not withdraw when CURRENT changes3→0 during B.
let qualifierCases=0;
for(let current=0;current<4;current++)for(let next=0;next<4;next++)for(let flags=0;flags<8;flags++){
 const A=!!(flags&1),B=!!(flags&2),initialize=!!(flags&4);
 const nextMask=15-Math.max(current===3?15:0,initialize?15:0);
 const N=Math.max((A?15:0)-nextMask,0)>0;
 const heldOr=(next&1)||((next>>1)&1)?15:0,C=Math.max((B?15:0)-Math.max(heldOr-(initialize?15:0),0),0)>0;
 assert.equal(N,A&&(initialize||current===3));assert.equal(C,B&&(initialize||next===0));qualifierCases++;
}
// Independent negative exemplars show the purpose of each premise.
assert.notEqual(3===3,0===3,'Raw CURRENT==3 would withdraw the B qualifier during3→0.');
assert(expectedNext[9].includes('w'));assert.equal(commands({macro:9,phase:0},{qualifiedA:true}).w_open_next,0);
const sources=[fileURLToPath(import.meta.url),resolve(here,'alu-control-checks.json'),resolve(ref,'phase-checks.json'),resolve(ref,'storage-discovery.json'),resolve(here,'../alu-control/microprogram.mjs'),resolve(here,'../alu-control/control-word.json'),resolve(root,'hardware/full-gpu-alu-qualified-feedback.mjs')];
const report={status:'conditional_macro_and_phase_epoch_proof',transitions,modeChanges,independentOpenCases:openCases,qualifierCases,phaseBitOrderCases,retainedNextBeforeCurrentMinimum:Math.min(...paths.held_transfers.map(r=>r.nominal_setup_before_B)),ownControlFeedbackMinimum:paths.own_feedback.summary.minimum_finite,heldNEXTPhaseBeforeCURRENTEnableMinimum:Math.min(...paths.NEXT_phase_to_CURRENT_enable.map(r=>r.nominal_margin_before_B)),nominalPhaseChange:{earliest:earliestPhaseChange,latestPriorLaneLockClosure:latestLaneClose,holdMargin:earliestPhaseChange-latestLaneClose,latestSelectorSettleBeforeNextA:paths.phase_lane.summary.minimum_finite},nominalMacroBeforeFirstNEXTMinimum:paths.macro_lane.summary.minimum_finite,nominalMacroBeforePREPMinimum:paths.macro_lane.summary.minimum_finite-3160,source_sha256:Object.fromEntries(sources.map(p=>[relative(root,p),createHash('sha256').update(readFileSync(p)).digest('hex')])),limits:['This binds source program and actual-cell nominal paths; it is not scheduled-block simulation or native timing.','The already generated qualifier topology is source pinned; this script does not redo every physical gate screen.','Proof requires complete stable-qualified source A/B pulses, cold admitted state, and data/mode holds through the request epoch. It does not establish asynchronous initialize release.','Status fault feedback and other retained cross-subsystem guards remain outside this local phase proof.'],native_acceptance:false,full_timing_acceptance:false};
writeFileSync(resolve(here,'alu-epoch-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,source_sha256:undefined,limits:undefined}));
