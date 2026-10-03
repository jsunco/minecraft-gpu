// Tiny synthetic recorder fixtures test the analyzer, not the redstone circuit.
import assert from 'node:assert/strict';
import {makeDensePair,makeDensePairTests} from '../hardware/dense-register-pair.mjs';
import {analyzePairEvidence} from './analyze-workshop-pair.mjs';
const d=makeDensePair({id:'workshop_pair8',origin:{x:33,y:-60,z:1}}),tests=makeDensePairTests(d);
const ids=new Map(d.blocks.map(b=>[JSON.stringify(b.position),b.block.id]));
function fixture(test){
 const spec=structuredClone(test.spec),words=[0,0];
 function bits(inputs){
  const data=Array.from({length:8},(_,b)=>Number(inputs['d'+b])*2**b).reduce((a,b)=>a+b,0),wa=Number(inputs.wa),ra=Number(inputs.ra),we=Number(inputs.we),v={};
  if(we)words[wa]=data;
  for(let w=0;w<2;w++){v['qualified'+w]=Number(we&&wa===w);v['far_hold'+w]=1-v['qualified'+w];for(let b=0;b<8;b++){v[`q${w}_${b}`]=(words[w]>>b)&1;v[`local_d${w}_${b}`]=(data>>b)&1;v[`lock${w}_${b}`]=v['far_hold'+w];}}
  for(let b=0;b<8;b++)v['read'+b]=(words[ra]>>b)&1;return{...v,raw_we:we,raw_wa:wa,raw_ra:ra};
 }
 const raw=(value,s)=>s.property==='power'?String(15*value):String(Boolean(value));
 const rows=v=>d.circuit.signals.map((s,index)=>({index,position:s.position,status:'loaded',id:ids.get(JSON.stringify(s.position)),properties:{[s.property]:raw(v[s.name],s)}}));
 const original=d.inputs.map(i=>({name:i.name,original:{id:'minecraft:lever',position:i.position,properties:{face:'floor',powered:'false',facing:'west'}},expected_powered:'false',touched:false}));
 const session='synthetic-only',watch='synthetic-watch',base={session_id:session,watch_id:watch,dimension:d.circuit.dimension,started_tick:0,duration_ticks:12000,point_count:63};
 const trace=[{kind:'start',...base,active:true,server_tick:0,last_sample_tick:0,next_seq:0,positions:d.circuit.signals.map(s=>s.position),definition:d.circuit,initial_phase:'server_task',sampling_phase:'end_server_tick',initial_states:rows(bits(Object.fromEntries(d.inputs.map(i=>[i.name,false]))))}];
 const journal=[{kind:'start',spec},{kind:'input_baseline',session_id:session,tick:0,inputs:original}],entries=[];let end=0;
 for(const c of spec.cases){
  const start=end+5;end=start+200;const v=bits(c.inputs);entries.push({seq:entries.length+1,tick:start,missed_ticks:0,states:rows(v)});
  const assertions=Object.entries(c.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true}));
  const observation={id:d.id,session_id:session,tick:end,atomic:true,phase:'server_task',signals:Object.fromEntries(d.circuit.signals.map(s=>[s.name,{bit:v[s.name],raw:raw(v[s.name],s),status:'loaded'}])),buses:Object.fromEntries(d.circuit.buses.map(b=>[b.name,{bits_lsb_first:b.bits.map(n=>v[n]),value:b.bits.reduce((n,s,i)=>n+v[s]*2**i,0)}]))};
  journal.push({kind:'case',name:c.name,inputs:c.inputs,assertions,pass:true,unknown:false,start_tick:start,end_tick:end,settled_ticks:200,observation});
 }
 const last=end+1,stop={...base,active:false,last_sample_tick:last,end_reason:'stopped'};
 trace.push({kind:'stop',...stop,server_tick:last,discarded:false},{kind:'poll',...stop,server_tick:last+1,gap:false,dropped_total:0,next_seq:entries.length,latest_seq:entries.length,entries},{kind:'discard',...stop,server_tick:last+2,discarded:true});
 const job={job_id:'synthetic-only',circuit_id:d.id,status:'passed',session_id:session,completed:spec.cases.length,total:spec.cases.length,passed:spec.cases.length,failed:0,spec,definition:d.circuit,input_journal:original.map(i=>({...i,touched:true})),restore:{status:'restored',inputs:d.inputs.map(i=>({name:i.name,status:'restored'}))},trace:{trace_id:'synthetic-only',complete:true,gaps:0,active:false,has_more:false,last_tick:last,required_through_tick:end,end_reason:'stopped',discarded:true},duration_ms:1};
 journal.push({kind:'finish',summary:structuredClone(job)});return{job,journal,trace};
}
const fixtures=tests.map(fixture);let phases=0,assertions=0;
for(const f of fixtures){const r=analyzePairEvidence(f.job,f.journal,f.trace);phases+=r.cases_passed;assertions+=r.assertions_passed;}
let rejected=0;
function refuses(change){const f=structuredClone(fixtures[2]);change(f);assert.throws(()=>analyzePairEvidence(f.job,f.journal,f.trace));rejected++;}
function pulse(f,caseName,signal,preCheckpoint=false){
 const c=f.journal.find(r=>r.kind==='case'&&r.name===caseName),i=d.circuit.signals.findIndex(s=>s.name===signal),s=d.circuit.signals[i];assert(c&&i>=0);
 const old=c.observation.signals[signal],t=c.start_tick+(preCheckpoint?-3:100),r=f.trace[0].initial_states[i];
 const raw=v=>s.property==='power'?String(15*v):String(Boolean(v));
 const entries=f.trace.find(r=>r.kind==='poll').entries;
 for(const [tick,v]of [[t,1-old.bit],[t+1,old.bit]])entries.push({seq:0,tick,missed_ticks:0,states:[{...r,properties:{[s.property]:raw(v)}}]});
 entries.sort((a,b)=>a.tick-b.tick);entries.forEach((e,i)=>e.seq=i+1);const p=f.trace.find(r=>r.kind==='poll');p.next_seq=p.latest_seq=entries.length;
}
for(let w=0;w<2;w++)for(let b=0;b<8;b++){
 refuses(f=>pulse(f,'load'+(1-w)+'_open',`q${w}_${b}`));
 refuses(f=>pulse(f,'opposite_prepare',`q${w}_${b}`));
 refuses(f=>pulse(f,w?'other_hold_200':'opposite_hold_200',`local_d${w}_${b}`));
 refuses(f=>pulse(f,w?'other_hold_200':'opposite_hold_200',`lock${w}_${b}`));
}
refuses(f=>pulse(f,'opposite_prepare','raw_we',true));
refuses(f=>pulse(f,'load0_open','raw_wa',true));
refuses(f=>{f.job.status='running';});refuses(f=>{f.job.restore.status='incomplete';});refuses(f=>{f.trace.at(-1).session_id='wrong';});refuses(f=>{f.trace.pop();});
refuses(f=>{f.trace.find(r=>r.kind==='poll').gap=true;});refuses(f=>{f.trace.find(r=>r.kind==='poll').entries[0].missed_ticks=1;});
refuses(f=>{f.trace.find(r=>r.kind==='poll').entries[0].seq++;});refuses(f=>{f.trace[0].initial_states.pop();});
refuses(f=>{f.journal.find(r=>r.kind==='case').observation.signals.read0.bit=2;});
refuses(f=>{f.job.definition.signals[0].position.x++;});
refuses(f=>{const c=f.journal.find(r=>r.kind==='case'&&r.name==='opposite_hold_200');c.start_tick=c.end_tick-199;});
// Read-select switching may glitch before its settled endpoint; this is intentionally not a hazard-free claim.
const allowed=structuredClone(fixtures[2]);pulse(allowed,'read1','read0');assert.equal(analyzePairEvidence(allowed.job,allowed.journal,allowed.trace).status,'native_pair_trace_checks_passed');
console.log(JSON.stringify({status:'offline_analyzer_checks_passed',synthetic_jobs:fixtures.length,phases,expected_endpoints:assertions,corrupt_copies_rejected:rejected,allowed_read_transient:true,native_calls:0,native_acceptance:false}));
