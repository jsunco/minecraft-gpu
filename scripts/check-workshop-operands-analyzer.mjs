// Tiny synthetic recorder fixtures test the analyzer, not the redstone circuit.
import assert from 'node:assert/strict';
import {makeDensePair} from '../hardware/dense-register-pair.mjs';
import {makeDenseOperands,makeDenseOperandTests} from '../hardware/dense-operand-capture.mjs';
import {analyzeOperandEvidence,summarizeOperandJobs} from './analyze-workshop-operands.mjs';
const d=makeDenseOperands({parent:makeDensePair({id:'workshop_pair8',origin:{x:33,y:-60,z:1}}),id:'workshop_operands'}),tests=makeDenseOperandTests(d);
const ids=new Map(d.blocks.map(b=>[JSON.stringify(b.position),b.block.id]));
function fixture(test){
 const spec=structuredClone(test.spec),definition=spec.circuit_id===d.id?d.circuit:d.guard_circuit,words=[0,0],operands=[0,0];
 function bits(inputs){
  const data=Array.from({length:8},(_,b)=>Number(inputs['d'+b])*2**b).reduce((a,b)=>a+b,0),wa=Number(inputs.wa),ra=Number(inputs.ra),we=Number(inputs.we),v={};
  if(we)words[wa]=data;
  const read=words[ra];for(const [i,o]of ['a','b'].entries()){
   if(inputs['capture_'+o])operands[i]=read;
   for(let bit=0;bit<8;bit++){v[o+bit]=(operands[i]>>bit)&1;v['d'+o+bit]=(read>>bit)&1;v['l'+o+bit]=Number(!inputs['capture_'+o]);}
   v['raw_capture_'+o]=Number(inputs['capture_'+o]);
  }
  for(let bit=0;bit<8;bit++){v['read'+bit]=(read>>bit)&1;for(let w=0;w<2;w++)v[`q${w}_${bit}`]=(words[w]>>bit)&1;}
  return{...v,raw_we:we,raw_wa:wa,raw_ra:ra};
 }
 const raw=(value,s)=>s.property==='power'?String(15*value):String(Boolean(value));
 const rows=v=>definition.signals.map((s,index)=>({index,position:s.position,status:'loaded',id:ids.get(JSON.stringify(s.position)),properties:{[s.property]:raw(v[s.name],s)}}));
 const original=d.inputs.map(i=>({name:i.name,original:{id:'minecraft:lever',position:i.position,properties:{face:'floor',powered:'false',facing:'west'}},expected_powered:'false',touched:false}));
 const session='synthetic-only',watch='synthetic-watch',base={session_id:session,watch_id:watch,dimension:definition.dimension,started_tick:0,duration_ticks:12000,point_count:61};
 const trace=[{kind:'start',...base,active:true,server_tick:0,last_sample_tick:0,next_seq:0,positions:definition.signals.map(s=>s.position),definition,initial_phase:'server_task',sampling_phase:'end_server_tick',initial_states:rows(bits(Object.fromEntries(d.inputs.map(i=>[i.name,false]))))}];
 const journal=[{kind:'start',spec,definition},{kind:'input_baseline',session_id:session,tick:0,inputs:original}],entries=[];let end=0;const current=Object.fromEntries(d.inputs.map(i=>[i.name,false])),touched=new Set();
 for(const c of spec.cases){
  for(const input of d.inputs)if(c.inputs[input.name]!==current[input.name]){journal.push({kind:'input_write_pending',name:input.name,previous:String(current[input.name]),desired:String(c.inputs[input.name])});current[input.name]=c.inputs[input.name];touched.add(input.name);}
  const start=end+5;end=start+200;const v=bits(c.inputs);entries.push({seq:entries.length+1,tick:start,missed_ticks:0,states:rows(v)});
  const assertions=Object.entries(c.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true}));
  const observation={id:definition.id,session_id:session,tick:end,atomic:true,phase:'server_task',signals:Object.fromEntries(definition.signals.map(s=>[s.name,{bit:v[s.name],raw:raw(v[s.name],s),status:'loaded'}])),buses:Object.fromEntries(definition.buses.map(b=>[b.name,{bits_lsb_first:b.bits.map(n=>v[n]),value:b.bits.reduce((n,s,i)=>n+v[s]*2**i,0)}]))};
  journal.push({kind:'case',name:c.name,inputs:c.inputs,assertions,pass:true,unknown:false,start_tick:start,end_tick:end,settled_ticks:200,observation});
 }
 const last=end+1,stop={...base,active:false,last_sample_tick:last,end_reason:'stopped'};
 trace.push({kind:'stop',...stop,server_tick:last,discarded:false},{kind:'poll',...stop,server_tick:last+1,gap:false,dropped_total:0,next_seq:entries.length,latest_seq:entries.length,entries},{kind:'discard',...stop,server_tick:last+2,discarded:true});
 const job={job_id:'synthetic-'+test.label,circuit_id:definition.id,status:'passed',session_id:session,completed:spec.cases.length,total:spec.cases.length,passed:spec.cases.length,failed:0,spec,definition,input_journal:original.map(i=>({...i,touched:touched.has(i.name)})),restore:{status:'restored',inputs:d.inputs.filter(i=>touched.has(i.name)).map(i=>({name:i.name,status:'restored'}))},trace:{trace_id:'synthetic-only',complete:true,gaps:0,active:false,has_more:false,last_tick:last,required_through_tick:end,end_reason:'stopped',discarded:true},duration_ms:1};
 journal.push({kind:'finish',summary:structuredClone(job)});return{job,journal,trace};
}
const fixtures=tests.map(fixture);let phases=0,assertions=0;const reports=[];
for(const f of fixtures){const r=analyzeOperandEvidence(f.job,f.journal,f.trace,{design:d});reports.push(r);phases+=r.cases_passed;assertions+=r.assertions_passed;}
let rejected=0;
function refuses(change,index=0){const f=structuredClone(fixtures[index]);change(f);assert.throws(()=>analyzeOperandEvidence(f.job,f.journal,f.trace,{design:d}));rejected++;}
function pulse(f,caseName,signal,preCheckpoint=false){
 const definition=f.job.definition,c=f.journal.find(r=>r.kind==='case'&&r.name===caseName),i=definition.signals.findIndex(s=>s.name===signal),s=definition.signals[i];assert(c&&i>=0);
 const old=c.observation.signals[signal],t=c.start_tick+(preCheckpoint?-3:100),r=f.trace[0].initial_states[i],entries=f.trace.find(r=>r.kind==='poll').entries;
 for(const [tick,v]of [[t,1-old.bit],[t+1,old.bit]])entries.push({seq:0,tick,missed_ticks:0,states:[{...r,properties:{[s.property]:String(Boolean(v))}}]});
 entries.sort((a,b)=>a.tick-b.tick);entries.forEach((e,i)=>e.seq=i+1);const p=f.trace.find(r=>r.kind==='poll');p.next_seq=p.latest_seq=entries.length;
}
for(const o of ['a','b'])for(let bit=0;bit<8;bit++){
 refuses(f=>pulse(f,'aliased_update_open',o+bit,true));
 refuses(f=>pulse(f,'opposite_local_d_hold_200','d'+o+bit),4);
 refuses(f=>pulse(f,'opposite_local_d_hold_200','l'+o+bit),4);
}
for(const o of ['a','b']){
 refuses(f=>pulse(f,o==='a'?'request_b_open':'request_a_open',o+'7'));
 refuses(f=>pulse(f,'request_b_select','raw_capture_'+o,true));
}
for(let w=0;w<2;w++){
 refuses(f=>pulse(f,'request_a_open',`q${w}_0`),5);
 refuses(f=>pulse(f,'request_b_select',`q${w}_7`,true),5);
}
for(const name of ['raw_we','raw_wa','raw_ra','raw_capture_a','raw_capture_b'])refuses(f=>pulse(f,'opposite_local_d_hold_200',name));
for(const name of ['raw_we','raw_capture_a','raw_capture_b'])refuses(f=>pulse(f,'aliased_update_stage',name,true));
refuses(f=>{f.job.status='running';});refuses(f=>{f.job.restore.status='incomplete';});refuses(f=>{f.trace.at(-1).session_id='wrong';});refuses(f=>{f.trace.pop();});
refuses(f=>{f.trace.find(r=>r.kind==='poll').gap=true;});refuses(f=>{f.trace.find(r=>r.kind==='poll').entries[0].missed_ticks=1;});
refuses(f=>{f.trace.find(r=>r.kind==='poll').entries[0].seq++;});refuses(f=>{f.trace[0].initial_states.pop();});
refuses(f=>{f.journal.find(r=>r.kind==='case').observation.signals.read0.bit=2;});
refuses(f=>{f.job.definition.signals[0].position.x++;});
refuses(f=>{const c=f.journal.find(r=>r.kind==='case'&&r.name==='opposite_local_d_hold_200');c.start_tick=c.end_tick-199;});
refuses(f=>{f.journal.splice(f.journal.findIndex(r=>r.kind==='input_write_pending'),1);});
refuses(f=>{f.job.input_journal[0].touched=false;});
refuses(f=>{f.trace.find(r=>r.kind==='poll').last_sample_tick++;f.trace.find(r=>r.kind==='poll').server_tick++;});
// A read transient with both operands closed is permitted before its settled endpoint.
const allowed=structuredClone(fixtures[0]);pulse(allowed,'request_b_select','read0');assert.equal(analyzeOperandEvidence(allowed.job,allowed.journal,allowed.trace,{design:d}).status,'native_operand_trace_checks_passed');
const aggregate=summarizeOperandJobs(reports);assert(aggregate.campaign_complete);assert.deepEqual(aggregate.actual_opposite_full_byte_windows,{a:3,b:3});
assert.throws(()=>summarizeOperandJobs([reports[0],reports[0]]));rejected++;
console.log(JSON.stringify({status:'offline_analyzer_checks_passed',synthetic_jobs:fixtures.length,phases,expected_endpoints:assertions,actual_opposite_windows_in_synthetic_fixture:aggregate.actual_opposite_full_byte_windows,corrupt_copies_rejected:rejected,allowed_read_transient:true,native_calls:0,native_acceptance:false}));
