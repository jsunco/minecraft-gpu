// Design-only logical replay; no native clock, hardware execution or host GPU.
import assert from 'node:assert/strict';
import {evaluate} from './terms.mjs';
import {checkProtocol} from '../control-commit-v1/protocol.mjs';
let claims=0,opens=0,releases=0,equalTargetCases=0;
for(let bits=0;bits<8;bits++)for(const update of[false,true])for(const ack of[false,true]){
 const other=!!(bits&1),operand=!!(bits&2),owned_update=!!(bits&4),values={other,operand,owned_update,update_intent:update,rf_ack:ack};
 const exactlyOne=[other,operand,owned_update].filter(Boolean).length===1,kindMatches=owned_update===update,m=evaluate(values);
 assert.equal(m.exact_one,exactlyOne&&kindMatches);assert.equal(m.owner_go0,exactlyOne&&kindMatches&&!ack);claims++;
}
for(let commit=0;commit<8;commit++)for(let mask=0;mask<16;mask++)for(const window of[false,true])for(const nzp of[false,true]){
 const v={window,nzp_write:nzp};for(let i=1;i<8;i++)v['commit'+i]=commit===i;for(let i=0;i<4;i++)v['enable'+i]=!!(mask&1<<i);const m=evaluate(v);
 assert.equal(m.pc_next,window&&commit===1);assert.equal(m.pc_current,window&&commit===3);for(let i=0;i<4;i++)assert.equal(m['flags'+i],window&&commit===3&&nzp&&!!(mask&1<<i));assert.equal(m.update_claim,commit>=1&&commit<=5);assert.equal(m.release_D,commit===6||commit===7);opens++;
}
// The actual-target refinement allows disagreeing predicates when both byte
// destinations coincide. Recomputed PC+1 may differ after CURRENT commits;
// that later change is outside the physically qualified admission fault gate.
for(let pc=0;pc<256;pc++)for(const phaseA of[false,true]){
 const immediate=(pc+1)&255,oldAgreement=immediate===((pc+1)&255),newAgreement=immediate===((immediate+1)&255);
 assert(oldAgreement);assert(!newAgreement);const fault=(update,idle,a,agreement)=>update&&idle&&a&&!agreement;
 assert.equal(fault(true,true,phaseA,oldAgreement),false);assert.equal(fault(true,false,phaseA,newAgreement),false);assert.equal(fault(true,true,phaseA,false),phaseA);equalTargetCases++;
}
const cases=[];
for(let rise=0;rise<4;rise++)for(let fall=0;fall<4;fall++)for(let drain=0;drain<4;drain++){
 let owner=0,commit=0,kind=0,request=false,ack=false,release=false,intent=true,statusLow=false,requestAge=0,dropAge=0,drainAge=0,pcNext=false,pcCurrent=false,closedCycle=false,done=false;const history=[];
 for(let cycle=0;cycle<100;cycle++){
  if(request){requestAge++;dropAge=0;if(requestAge>rise)ack=true;}else{requestAge=0;dropAge++;if(dropAge>fall)ack=false;}
  if(release&&!intent){/* completion retains release through intent withdrawal */}
  if(release){drainAge++;if(drainAge>drain)statusLow=true;}
  const v={other:false,operand:false,owned_update:commit>=1&&commit<=5,kind0:!!(kind&1),kind1:!!(kind&2),owner_idle:owner===0,owner_complete:owner===7,rf_ack:ack,update_intent:intent,agreement:true,release_latched:release,window:true};for(let i=1;i<8;i++)v['commit'+i]=commit===i;
  const m=evaluate(v),ownerGo=[m.owner_go0,m.exact_one,true,true,ack,true,!ack,m.owner_go7][owner],commitGo=[m.commit_go0,true,true,true,true,m.done_update,statusLow,m.commit_go7][commit];
  if(owner===1&&m.exact_one)kind=2;
  if(m.pc_next){assert(!pcCurrent);pcNext=true;}if(m.pc_current){assert(pcNext);pcCurrent=true;}if(commit===4)closedCycle=true;
  if(release){assert(pcNext&&pcCurrent&&closedCycle);assert(!m.alu_execute);}
  if(commit===7){assert(statusLow&&closedCycle&&!request&&!ack);done=true;intent=false;}
  history.push({cycle,owner,commit,request,ack,release,statusLow,kind});
  request=owner===3||owner===4;release=m.release_D;
  if(ownerGo)owner=(owner+1)&7;if(commitGo)commit=(commit+1)&7;
  if(done&&owner===0&&commit===0&&!request&&!ack)break;
 }
 assert(done&&owner===0&&commit===0&&!request&&!ack);assert(history.some(v=>v.owner===7&&v.commit===5));assert(history.some(v=>v.commit===6&&v.release));cases.push({rise,fall,drain,cycles:history.length});releases++;
}
console.log(JSON.stringify({status:'design_protocol_replay_passed',owner_admission_vectors:claims,pc_flags_mask_vectors:opens,actual_target_equal_then_pc_changes:equalTargetCases,delayed_ack_release_drain_sequences:releases,maximum_macrocycles:Math.max(...cases.map(c=>c.cycles)),inherited_protocol:checkProtocol(),native_acceptance:false,limits:['Logical phase-separated replay only; real closure, decoder hazards, path skew and pulse width require physical timing evidence.','Cold initialization and retained-mask/OTHER/LSU producers are external dependencies; no zero-state assumption is an admission receipt.']}));
