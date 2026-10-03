// Small synthetic recorder fixtures only. No native calls or service constructors.
import assert from 'node:assert/strict';
import {makeCompactReadHeader,makeCompactReadHeaderTests,compactReadHeaderExpected} from '../hardware/compact-read-header.mjs';
import {analyzeReadHeaderEvidence,readHeaderOracle,summarizeReadHeaderJobs} from './analyze-workshop-read-header.mjs';
const design=makeCompactReadHeader(),tests=makeCompactReadHeaderTests(design);
const blocks=new Map(design.blocks.map(b=>[JSON.stringify(b.position),b.block]));
function fixture(test){
 const spec=structuredClone(test.spec),definition=spec.circuit_id===design.id?design.circuit:design.guard_circuit,diagnostic=definition.id===design.guard_circuit.id;
 const raw=(v,s)=>s.property==='power'?String(v*15):String(Boolean(v));
 const rows=v=>definition.signals.map((s,index)=>({index,position:s.position,status:'loaded',id:blocks.get(JSON.stringify(s.position)).id,properties:{[s.property]:raw(v[s.name],s)}}));
 const original=design.inputs.map(i=>({name:i.name,original:{position:i.position,id:'minecraft:lever',properties:blocks.get(JSON.stringify(i.position)).properties},expected_powered:'false',touched:false}));
 const session='synthetic-only',base={session_id:session,watch_id:'synthetic-watch',dimension:definition.dimension,started_tick:10,duration_ticks:12000,point_count:definition.signals.length};
 const trace=[{kind:'start',...base,active:true,server_tick:10,last_sample_tick:10,next_seq:0,positions:definition.signals.map(s=>s.position),definition,initial_phase:'server_task',sampling_phase:'end_server_tick',initial_states:rows(compactReadHeaderExpected(0,diagnostic))}];
 const journal=[{kind:'start',spec,definition},{kind:'input_baseline',session_id:session,tick:5,inputs:original}],entries=[],current=Object.fromEntries(design.inputs.map(i=>[i.name,false])),touched=new Set();let end=10;
 for(const[i,c]of spec.cases.entries()){
  for(const input of design.inputs)if(c.inputs[input.name]!==current[input.name]){journal.push({kind:'input_write_pending',name:input.name,previous:String(current[input.name]),desired:String(c.inputs[input.name])});current[input.name]=c.inputs[input.name];touched.add(input.name);}
  const start=end+5;end=start+200;const address=design.inputs.reduce((n,k,b)=>n+Number(c.inputs[k.name])*2**b,0),v=compactReadHeaderExpected(address,diagnostic);
  // Raw inputs arrive at the confirmed checkpoint; logical nodes settle later.
  if(i%2===0){entries.push({seq:entries.length+1,tick:start,missed_ticks:0,states:rows(v).filter(r=>definition.signals[r.index].name.startsWith('raw_'))});entries.push({seq:entries.length+1,tick:start+100,missed_ticks:0,states:rows(v)});}
  const observation={id:definition.id,session_id:session,tick:end,atomic:true,phase:'server_task',signals:Object.fromEntries(definition.signals.map(s=>[s.name,{status:'loaded',bit:v[s.name],raw:raw(v[s.name],s)}])),buses:Object.fromEntries(definition.buses.map(b=>[b.name,{bits_lsb_first:b.bits.map(s=>v[s]),value:v[b.name]}]))};
  const assertions=Object.entries(c.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true}));journal.push({kind:'case',name:c.name,inputs:c.inputs,assertions,pass:true,unknown:false,start_tick:start,end_tick:end,settled_ticks:200,observation});
 }
 const last=end+10,stop={...base,active:false,last_sample_tick:last,end_reason:'stopped'};
 trace.push({kind:'stop',...stop,server_tick:last,discarded:false},{kind:'poll',...stop,server_tick:last+1,gap:false,dropped_total:0,next_seq:entries.length,latest_seq:entries.length,entries},{kind:'discard',...stop,server_tick:last+2,discarded:true});
 const job={job_id:'synthetic-'+test.label,circuit_id:definition.id,status:'passed',session_id:session,completed:spec.cases.length,total:spec.cases.length,passed:spec.cases.length,failed:0,spec,definition,input_journal:original.map(i=>({...i,touched:touched.has(i.name)})),restore:{status:'restored',inputs:design.inputs.filter(i=>touched.has(i.name)).map(i=>({name:i.name,status:'restored'}))},trace:{trace_id:'synthetic-only',complete:true,gaps:0,active:false,has_more:false,last_tick:last,required_through_tick:end,end_reason:'stopped',discarded:true},duration_ms:1};
 journal.push({kind:'finish',summary:structuredClone(job)});return{job,journal,trace};
}
const fixtures=tests.map(fixture),analyze=f=>analyzeReadHeaderEvidence(f.job,f.journal,f.trace,{design});
const reports=fixtures.map(analyze);for(const r of reports){assert(r.functional_endpoints_passed&&r.timing_admission.passed);assert.equal(r.settling.max_final_correct_offset_ticks,100);}
let rejected=0;
function refuses(change,index=0){const f=structuredClone(fixtures[index]);change(f);assert.throws(()=>analyze(f));rejected++;}
function pulse(f,name,offset,phase=0){
 const def=f.job.definition,c=f.journal.filter(r=>r.kind==='case')[phase],s=def.signals.find(v=>v.name===name),index=def.signals.indexOf(s);assert(s);
 const address=design.inputs.reduce((n,k,b)=>n+Number(c.inputs[k.name])*2**b,0),expected=compactReadHeaderExpected(address,def.id===design.guard_circuit.id)[name],poll=f.trace.find(r=>r.kind==='poll');
 for(const[tick,v]of [[c.start_tick+offset,1-expected],[c.start_tick+offset+1,expected]])poll.entries.push({seq:0,tick,missed_ticks:0,states:[{index,position:s.position,status:'loaded',id:blocks.get(JSON.stringify(s.position)).id,properties:{[s.property]:s.property==='power'?String(v*15):String(Boolean(v))}}]});
 poll.entries.sort((a,b)=>a.tick-b.tick);poll.entries.forEach((e,i)=>e.seq=i+1);poll.next_seq=poll.latest_seq=poll.entries.length;
}
for(const change of[
 f=>f.job.status='running',f=>f.job.restore.status='incomplete',f=>f.trace.at(-1).session_id='wrong',f=>f.trace.pop(),
 f=>f.trace.find(r=>r.kind==='poll').gap=true,f=>f.trace.find(r=>r.kind==='poll').dropped_total=1,
 f=>f.trace.find(r=>r.kind==='poll').entries[0].missed_ticks=1,f=>f.trace.find(r=>r.kind==='poll').entries[0].seq++,
 f=>f.trace[0].initial_states.pop(),f=>f.trace[0].initial_states[1].index=0,
 f=>f.trace.find(r=>r.kind==='poll').entries[0].states[0].status='unloaded',
 f=>f.trace.find(r=>r.kind==='poll').entries[0].states[0].id='minecraft:air',
 f=>f.job.definition.signals[0].position.x++,f=>f.job.spec.settle_ticks=199,
 f=>f.journal.splice(f.journal.findIndex(r=>r.kind==='input_write_pending'),1),
 f=>f.job.input_journal[0].touched=false,f=>f.job.restore.inputs.pop(),
 f=>f.journal.find(r=>r.kind==='case').start_tick=0,
 f=>{const c=f.journal.filter(r=>r.kind==='case')[1];c.start_tick=c.end_tick-199;c.settled_ticks=199;},
 f=>f.journal.find(r=>r.kind==='case').observation.atomic=false,
 f=>f.journal.find(r=>r.kind==='case').observation.signals.raw_a0.bit=2,
 f=>f.journal.find(r=>r.kind==='case').observation.buses.raw_address.value=0,
 f=>f.trace.find(r=>r.kind==='poll').last_sample_tick--,
 f=>{f.trace.push(structuredClone(f.trace.at(-1)));},
])refuses(change);
for(let b=0;b<4;b++){refuses(f=>pulse(f,'raw_a'+b,150));refuses(f=>pulse(f,'raw_a'+b,202));}
// A reversal after initial correct output is allowed before the requested budget.
const early=structuredClone(fixtures[0]);pulse(early,'mask15_7',250);const er=analyze(early);assert(er.timing_admission.passed&&er.settling.correct_then_wrong_events===1);assert.equal(er.settling.pairs[0].final_correct_offset_ticks,251);
// Endpoint-correct native jobs with a late glitch remain functional passes but fail timing admission.
let timingFailures=0;for(const[index,signal]of [[0,'mask15_7'],[0,'top_a3'],[3,'low_mismatch4'],[3,'high_mismatch4']]){
 const late=structuredClone(fixtures[index]);pulse(late,signal,401);const r=analyze(late);assert(r.functional_endpoints_passed&&!r.timing_admission.passed);assert.equal(r.settling.pairs[0].final_correct_offset_ticks,402);timingFailures++;
}
// Functional endpoint corruption is not merely a rejected timing budget.
refuses(f=>pulse(f,'mask15_7',405));
for(let address=0;address<16;address++)for(const diagnostic of[false,true])assert.deepEqual(readHeaderOracle(address,diagnostic),compactReadHeaderExpected(address,diagnostic));
const full=summarizeReadHeaderJobs(reports);assert(full.campaign_complete&&full.timing_admission_passed);assert.equal(full.phases_passed,110);assert.equal(full.decode_results_passed,55);assert.equal(full.assertions_passed,3102);
assert(!summarizeReadHeaderJobs([reports[0]]).campaign_complete);assert.throws(()=>summarizeReadHeaderJobs([reports[0],reports[0]]));rejected++;
const changed=structuredClone(reports[1]);changed.session_id='wrong';assert.throws(()=>summarizeReadHeaderJobs([reports[0],changed]));rejected++;
console.log(JSON.stringify({status:'offline_read_header_analyzer_checks_passed',synthetic_jobs:5,phases:110,decode_results:55,expectations:3102,corrupt_copies_rejected:rejected,endpoint_pass_but_timing_rejected:timingFailures,early_correct_then_wrong_allowed:true,oracle_addresses:16,views:2,native_calls:0,native_acceptance:false}));
