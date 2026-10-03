import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{definition,evaluate,step,zero}from'./logic.mjs';import{step as oldStep}from'./history/before-load-hold-feedback/logic.mjs';
const d=definition();let truth=0;for(let bits=0;bits<512;bits++){const v=Object.fromEntries(d.inputs.map((n,i)=>[n,!!(bits>>i&1)])),r=Object.fromEntries(d.outputs.map(n=>[n,d.products.some(p=>p.out===n&&Object.entries(p.literals).every(([k,w])=>v[k]===w))]));assert.deepEqual(r,evaluate(v));truth++;}
let cold=0;for(let bits=0;bits<8192;bits++)for(const first of['A','B']){let q=Object.fromEntries(Object.keys(zero()).map((n,i)=>[n,!!(bits>>i&1)]));for(const p of[first,'A','B','A','B','A'])q=step(q,p,{initialize:true,demand:true,ack:true,start:true,permit:false});assert(q.active&&q.active_next&&q.reset_out);for(const n of['waiting','pending','waiting_next','pending_next','demand','ack','start','permit','start_out','held_reset_out'])assert(!q[n],n);cold++;}
// Input requests/ACK are held until each four-phase action has occurred. Delays are model scheduling, not game ticks.
let traces=0,coalesced=0,deferred=0;for(let reassert=0;reassert<24;reassert++)for(const delay of[2,4,8])for(const offset of[0,1]){let q=zero();q.active=q.active_next=true;q.reset_out=true;let ack=false,demand=true,firstAck=-1,firstLow=-1,secondStart=-1,raised=false,epochs=0,resetAge=0,withdrawAge=0,oldReset=true;for(let t=0;t<220;t++){
 if(q.reset_out){resetAge++;withdrawAge=0;if(resetAge>=delay)ack=true;}else{withdrawAge++;resetAge=0;if(withdrawAge>=delay)ack=false;}
 if(q.held_reset_out&&firstAck<0)firstAck=t;
 if(firstAck>=0&&t===firstAck+3)demand=false;
 if(firstAck>=0&&t===firstAck+4+reassert){demand=true;raised=true;}
 if(raised&&epochs>=1&&q.held_reset_out)demand=false;if(t===150)demand=false;
 const raw={initialize:false,demand,ack,start:true,permit:true};q=step(q,(t+offset)%2?'B':'A',raw);
 if(oldReset&&!q.reset_out&&firstLow<0)firstLow=t;
 if(!oldReset&&q.reset_out){assert(!ack,'A new delivered epoch reused high old ACK');epochs++;secondStart=t;}
 if(q.waiting||q.pending||q.reset_out)assert(!q.start_out,'START during reset/withdrawal');
 if(q.held_reset_out)assert(q.reset_out,'Completion outside delivered reset');
 oldReset=q.reset_out;
 }
 assert(firstAck>=0&&firstLow>=0);if(epochs===0){assert(firstLow>=150,'A retained withdrawal lost the reassertion');coalesced++;}else{assert(epochs===1&&secondStart>firstLow,'Deferred epoch lost');deferred++;}assert(!q.reset_out&&!q.held_reset_out&&!q.waiting&&!q.pending);traces++;}
// Concrete old bug: a loader already holds a new LOAD owner while old completion
// is withdrawing. Its renewed demand is sampled while old delivered RESET is high.
let held=zero();Object.assign(held,{active:false,active_next:false,waiting:true,waiting_next:true,demand:true,ack:true,reset_out:true,pending:true,pending_next:true});
const oldResetEquation=!!held.active;assert.equal(oldResetEquation,false);
held=step(held,'A',{initialize:false});assert.equal(held.reset_out,true,'A retained new LOAD owner lost core reset');assert.equal(held.held_reset_out,false,'Old completion must still withdraw');
for(let i=0;i<8;i++)held=step(held,i%2?'A':'B',{initialize:false,demand:true,ack:true,start:true,permit:true});assert(held.reset_out&&!held.start_out&&!held.held_reset_out);
held=step(held,'B',{initialize:false,demand:false,ack:true,start:true,permit:true});held=step(held,'A',{initialize:false});assert(!held.reset_out,'Physical release after owner releases demand');
// Once RESET is actually low, high old ACK cannot resurrect it.
held=step(held,'B',{initialize:false,demand:true,ack:true,start:true,permit:true});held=step(held,'A',{initialize:false});assert(!held.reset_out&&!held.start_out);
let oldQ=zero(),newQ=zero();for(const q of[oldQ,newQ])Object.assign(q,{active:true,active_next:true,demand:true,ack:true,reset_out:true,held_reset_out:true});const rows=[];for(const[phase,demand,event]of[['B',false,'old request demand low is sampled'],['A',false,'qualified completion begins withdrawing; loader may still see its old high'],['B',true,'new retained loader owner demand returns before this B closes'],['A',true,'scheduled old withdrawal A'],['B',true,'loader owner remains active'],['A',true,'loader owner remains active']]){const raw={initialize:false,demand,ack:true,start:true,permit:true};oldQ=oldStep(oldQ,phase,raw);newQ=step(newQ,phase,raw);rows.push({phase,event,raw,old:oldQ,repaired:newQ});}assert.equal(rows[3].old.reset_out,false);assert.equal(rows[3].repaired.reset_out,true);assert.equal(rows[3].repaired.held_reset_out,false);
writeFileSync(new URL('load-withdrawal-counterexample.json',import.meta.url),JSON.stringify({status:'old_equation_counterexample_reproduced_and_corrected',rows,model:'renewed held loader demand reaches B sample before scheduled withdrawal A',physical_return_deadline_still_required:true,native_acceptance:false},null,2)+'\n');
const out={status:'author_checked_requester_scalar_protocol_only',truth_cases:truth,arbitrary_cold_states_and_phase_orders:cold,reassertion_schedules:traces,coalesced_without_sampled_low:coalesced,deferred_separate_epochs:deferred,stored_bits_per_core:13,geometry_status:'actual_local_and_master_geometry_with_checks_separate',native_acceptance:false,limits:['Signals are held through actual sampled capture; sub-cycle pulse capture is not promised.','Far qualified-completion withdrawal, START blanking and reset delivery/ACK return setup and closure remain required timing bounds.','No raw multi-bit decode exports: six state bits, four B input samples and three A-held commands per core.']};writeFileSync(new URL('logic-checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
