import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{definition,evaluate,step,zero}from'./logic.mjs';
const d=definition();let truth=0;for(let bits=0;bits<256;bits++){const v=Object.fromEntries(d.inputs.map((n,i)=>[n,!!(bits>>i&1)])),r=Object.fromEntries(d.outputs.map(n=>[n,d.products.some(p=>p.out===n&&Object.entries(p.literals).every(([k,w])=>v[k]===w))]));assert.deepEqual(r,evaluate(v));truth++;}
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
const out={status:'author_checked_requester_scalar_protocol_only',truth_cases:truth,arbitrary_cold_states_and_phase_orders:cold,reassertion_schedules:traces,coalesced_without_sampled_low:coalesced,deferred_separate_epochs:deferred,stored_bits_per_core:13,geometry_status:'not_yet_drawn',native_acceptance:false,limits:['Signals are held through actual sampled capture; sub-cycle pulse capture is not promised.','Far qualified-completion withdrawal, START blanking and reset delivery/ACK return setup and closure remain required timing bounds.','No raw multi-bit decode exports: six state bits, four B input samples and three A-held commands per core.']};writeFileSync(new URL('logic-checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
