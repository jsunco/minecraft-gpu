// Offline analysis of saved native read-header jobs. No services or world calls.
// Usage: node scripts/analyze-workshop-read-header.mjs JOB_UUID... [--out NEW.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeCompactReadHeader,makeCompactReadHeaderTests} from '../hardware/compact-read-header.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const prepared='artifacts/compact-read-header-v1';
const same=(a,b,message)=>assert.deepEqual(a,b,message);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const jsonl=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
function bit(raw,property){
 if(property==='powered'||property==='lit'){assert(['true','false'].includes(String(raw)));return +(String(raw)==='true');}
 assert(property==='power'&&/^(?:[0-9]|1[0-5])$/.test(String(raw)));return +(Number(raw)>0);
}
function values(bits,definition){
 const result={...bits};for(const b of definition.buses)result[b.name]=b.bits.reduce((n,s,i)=>n+bits[s]*2**i,0);return result;
}
// Independent Boolean decomposition, not the generator's expected-value function.
export function readHeaderOracle(address,diagnostic=false){
 assert(Number.isInteger(address)&&address>=0&&address<16);
 const bits=Array.from({length:4},(_,b)=>(address>>b)&1),e={};let lo=0,hi=0,all=0;
 for(let b=0;b<4;b++)e['raw_a'+b]=e['top_a'+b]=bits[b];
 for(let word=0;word<16;word++){
  const low=+(bits[0]!==((word>>0)&1)||bits[1]!==((word>>1)&1));
  const high=+(bits[2]!==((word>>2)&1)||bits[3]!==((word>>3)&1));
  e['mismatch'+word]=+(low||high);all+=e['mismatch'+word]*2**word;lo+=low*2**word;hi+=high*2**word;
  if(diagnostic){e['low_mismatch'+word]=low;e['high_mismatch'+word]=high;}
 }
 e.raw_address=e.top_address=address;e.mismatches=all;
 if(diagnostic){e.low_mismatches=lo;e.high_mismatches=hi;}
 else for(const word of[0,15]){for(let b=0;b<8;b++)e[`mask${word}_${b}`]=e['mismatch'+word];e['mask'+word]=255*e['mismatch'+word];}
 return e;
}
export function loadReadHeaderDesign(projectRoot=root){
 const dir=resolve(projectRoot,prepared),p=json(resolve(dir,'provenance.json'));
 assert.equal(hash(resolve(projectRoot,p.source)),p.source_sha256,'Read-header source changed');
 for(const[file,digest]of Object.entries(p.dependencies))assert.equal(hash(resolve(projectRoot,file)),digest);
 for(const[file,digest]of Object.entries(p.files))assert.equal(hash(resolve(dir,file)),digest);
 const d=json(resolve(dir,'design.json'));
 same(d,makeCompactReadHeader({id:d.id,origin:d.origin}),'Prepared design changed');
 same(json(resolve(dir,'tests.json')),makeCompactReadHeaderTests(d),'Prepared tests changed');return d;
}
export function analyzeReadHeaderEvidence(job,journal,trace,{design=loadReadHeaderDesign()}={}){
 assert(job.status==='passed'&&job.failed===0&&job.passed===job.total&&job.completed===job.total,'Job is not completely passed');
 assert(job.spec.trace&&job.spec.restore_inputs&&job.restore?.status==='restored','Trace and restored inputs required');
 const meta=job.trace;assert(meta?.complete===true&&meta.gaps===0&&meta.active===false&&meta.has_more===false&&meta.discarded===true&&meta.end_reason==='stopped'&&!meta.error,'Incomplete recorder lifecycle');
 assert(typeof job.session_id==='string'&&job.session_id);
 const definition=[design.circuit,design.guard_circuit].find(d=>d.id===job.circuit_id);assert(definition,'Unknown view');
 same(job.definition,definition);same(job.spec.inputs,design.inputs);
 const suite=makeCompactReadHeaderTests(design).find(t=>t.spec.circuit_id===job.circuit_id&&JSON.stringify(t.spec.cases)===JSON.stringify(job.spec.cases));assert(suite,'Unknown test sequence');same(job.spec,suite.spec,'Changed test policy');
 const diagnostic=job.circuit_id===design.guard_circuit.id,signals=definition.signals;
 assert(journal[0]?.kind==='start'&&journal[1]?.kind==='input_baseline'&&journal.at(-1)?.kind==='finish');
 assert(journal.every(r=>['start','input_baseline','input_write_pending','case','finish'].includes(r.kind)));
 for(const kind of['start','input_baseline','finish'])assert.equal(journal.filter(r=>r.kind===kind).length,1);
 same(journal[0].spec,job.spec);same(journal[0].definition,definition);
 const baseline=journal[1];assert(baseline.session_id===job.session_id&&integer(baseline.tick));
 same(baseline.inputs.map(i=>i.name),design.inputs.map(i=>i.name));same(job.input_journal.map(i=>i.name),design.inputs.map(i=>i.name));
 const physical=new Map(design.blocks.map(b=>[JSON.stringify(b.position),b.block]));
 const commanded=Object.fromEntries(design.inputs.map(i=>[i.name,false])),touched=new Set();let pending=[],caseIndex=0;
 for(const row of journal.slice(2,-1)){
  if(row.kind==='input_write_pending')pending.push(row);
  else{
   assert.equal(row.kind,'case');const spec=job.spec.cases[caseIndex++];assert(spec);
   const changes=design.inputs.filter(i=>commanded[i.name]!==spec.inputs[i.name]);
   same(pending.map(r=>({name:r.name,previous:r.previous,desired:r.desired})),changes.map(i=>({name:i.name,previous:String(commanded[i.name]),desired:String(spec.inputs[i.name])})),'Unexpected input-write order or assertion-phase write');
   for(const i of changes)touched.add(i.name);
   Object.assign(commanded,spec.inputs);same(row.inputs,commanded);pending=[];
  }
 }
 assert.equal(pending.length,0);assert.equal(caseIndex,job.total);assert(Object.values(commanded).every(v=>v===false));
 for(const[i,b]of baseline.inputs.entries()){
  const input=design.inputs[i],block=physical.get(JSON.stringify(input.position));
  same(b.original.position,input.position);assert.equal(b.original.id,'minecraft:lever');same(b.original.properties,block.properties);assert.equal(b.original.properties.powered,'false');
  const end=job.input_journal[i];same(end.original,b.original);assert(end.expected_powered==='false'&&!Object.hasOwn(end,'pending_powered'));assert.equal(end.touched,touched.has(input.name));
 }
 same(job.restore.inputs.map(i=>({name:i.name,status:i.status})),design.inputs.filter(i=>touched.has(i.name)).map(i=>({name:i.name,status:'restored'})));
 for(const name of['job_id','circuit_id','status','session_id','completed','total','passed','failed','restore','trace'])same(journal.at(-1).summary[name],job[name]);
 const first=trace[0];assert(first?.kind==='start'&&first.active===true&&first.next_seq===0&&first.point_count===signals.length);
 same(first.definition,definition);same(first.positions,signals.map(s=>s.position));
 assert(first.initial_phase==='server_task'&&first.sampling_phase==='end_server_tick'&&integer(first.started_tick)&&first.started_tick>=baseline.tick&&first.last_sample_tick===first.started_tick);
 assert(integer(first.duration_ticks)&&first.duration_ticks>0&&first.duration_ticks<=12000);
 let state=Array(signals.length),seq=0,lastEvent=first.started_tick,lastServer=first.server_tick,lastSample=first.started_tick,stopTick=null,drained=false,discarded=false;
 function apply(rows,initial=false){
  assert(Array.isArray(rows)&&rows.length>0&&(!initial||rows.length===signals.length));const seen=new Set();
  for(const r of rows){assert(Number.isInteger(r.index)&&r.index>=0&&r.index<signals.length&&!seen.has(r.index));seen.add(r.index);const s=signals[r.index];same(r.position,s.position);assert(r.status==='loaded'&&r.id===physical.get(JSON.stringify(s.position))?.id);state[r.index]=bit(r.properties?.[s.property],s.property);}
  assert(state.every(v=>v===0||v===1));return Object.fromEntries(signals.map((s,i)=>[s.name,state[i]]));
 }
 const snapshots=[{tick:first.started_tick,bits:apply(first.initial_states,true)}];
 for(const[index,r]of trace.entries()){
  assert(r.session_id===job.session_id&&r.watch_id===first.watch_id&&r.dimension===definition.dimension);
  assert(r.started_tick===first.started_tick&&r.point_count===signals.length&&r.duration_ticks===first.duration_ticks);
  assert(integer(r.server_tick)&&r.server_tick>=lastServer&&integer(r.last_sample_tick)&&r.last_sample_tick>=lastSample&&r.last_sample_tick<=r.server_tick);lastServer=r.server_tick;lastSample=r.last_sample_tick;
  if(!index)continue;assert(!discarded,'Rows after discard');
  if(r.kind==='stop'){assert(stopTick===null&&r.active===false&&r.end_reason==='stopped'&&r.discarded===false);stopTick=r.last_sample_tick;}
  else if(r.kind==='poll'){
   assert(r.gap===false&&r.dropped_total===0&&Array.isArray(r.entries)&&integer(r.next_seq)&&integer(r.latest_seq)&&r.next_seq<=r.latest_seq);
   for(const e of r.entries){assert(e.seq===++seq&&e.missed_ticks===0&&integer(e.tick)&&e.tick>lastEvent&&e.tick<=r.last_sample_tick);lastEvent=e.tick;snapshots.push({tick:e.tick,bits:apply(e.states)});}
   assert.equal(r.next_seq,seq);
   if(stopTick!==null){assert(r.active===false&&r.end_reason==='stopped'&&r.last_sample_tick===stopTick);drained=r.next_seq===r.latest_seq;}
   else assert(r.active===true&&!r.end_reason,'Recorder ended early');
  }else if(r.kind==='discard'){assert(stopTick!==null&&drained&&r.active===false&&r.discarded===true&&r.end_reason==='stopped'&&r.last_sample_tick===stopTick);discarded=true;}
  else assert.fail('Unexpected trace event');
 }
 assert(stopTick!==null&&drained&&discarded&&lastSample===meta.last_tick&&lastSample>=meta.required_through_tick);
 function at(t){assert(integer(t)&&t>=first.started_tick&&t<=lastSample);let s=snapshots[0];for(const v of snapshots){if(v.tick>t)break;s=v;}return s.bits;}
 function window(from,to){assert(from<=to);at(from);at(to);return[{tick:from,bits:at(from)},...snapshots.filter(s=>s.tick>from&&s.tick<=to)];}
 const matches=(bits,expected)=>{const v=values(bits,definition);return Object.entries(expected).every(([k,e])=>v[k]===e);};
 const cases=journal.filter(r=>r.kind==='case');assert.equal(cases.length,job.spec.cases.length);let previousEnd=first.started_tick;
 for(const[i,c]of cases.entries()){
  const spec=job.spec.cases[i];assert(c.name===spec.name&&c.pass===true&&c.unknown===false);same(c.inputs,spec.inputs);
  assert(integer(c.start_tick)&&integer(c.end_tick)&&c.start_tick>=previousEnd&&c.end_tick-c.start_tick>=200&&c.settled_ticks===c.end_tick-c.start_tick);previousEnd=c.end_tick;
  const obs=c.observation;assert(obs.id===job.circuit_id&&obs.session_id===job.session_id&&obs.tick===c.end_tick&&obs.atomic===true&&obs.phase==='server_task');same(Object.keys(obs.signals),signals.map(s=>s.name));
  const bits={};for(const s of signals){const v=obs.signals[s.name];assert(v.status==='loaded'&&(v.bit===0||v.bit===1)&&v.bit===bit(v.raw,s.property));bits[s.name]=v.bit;}
  for(const bus of definition.buses){same(obs.buses[bus.name].bits_lsb_first,bus.bits.map(n=>bits[n]));assert.equal(obs.buses[bus.name].value,values(bits,definition)[bus.name]);}
  assert(matches(bits,spec.expect));same(at(c.end_tick),bits,'Task/trace endpoint mismatch');
  same(c.assertions,Object.entries(spec.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true})));
 }
 const pairs=[];const budgetFailures=[];
 for(let i=0;i<cases.length;i+=2){
  const p=cases[i],a=cases[i+1];assert(a);same(p.inputs,a.inputs);
  const address=design.inputs.reduce((n,input,b)=>n+Number(p.inputs[input.name])*2**b,0),expected=readHeaderOracle(address,diagnostic);
  same(job.spec.cases[i+1].expect,expected,'Independent decoder oracle mismatch');
  same(job.spec.cases[i].expect,Object.fromEntries(Object.entries(expected).filter(([n])=>n.startsWith('raw_'))));
  const span=window(p.start_tick,a.end_tick);
  for(const s of span)for(const input of design.inputs)assert.equal(s.bits['raw_'+input.name],Number(p.inputs[input.name]),'Raw address changed within the paired wait');
  if(i){const prev=cases[i-1];for(const input of design.inputs){const before=+prev.inputs[input.name],after=+p.inputs[input.name];let changed=before===after;
    for(const s of window(prev.end_tick,p.start_tick)){const actual=s.bits['raw_'+input.name];if(actual===after)changed=true;else assert(!changed&&actual===before,'Unjournaled raw-address reversal between pairs');}}}
  let correctSince=p.start_tick,wasCorrect=false;const reversals=[];
  for(let k=0;k<span.length;k++){
   const s=span[k],correct=matches(s.bits,expected);
   if(!correct){correctSince=span[k+1]?.tick??null;if(wasCorrect){const v=values(s.bits,definition);reversals.push({tick:s.tick,offset_ticks:s.tick-p.start_tick,incorrect:Object.keys(expected).filter(n=>v[n]!==expected[n])});}}
   wasCorrect=correct;
  }
  assert(correctSince!==null);const requestedBudgetTick=p.start_tick+400;assert(requestedBudgetTick<=a.end_tick);
  const late=[];for(const s of window(requestedBudgetTick,a.end_tick))if(!matches(s.bits,expected)){
   const v=values(s.bits,definition);late.push({tick:s.tick,offset_ticks:s.tick-p.start_tick,incorrect:Object.keys(expected).filter(n=>v[n]!==expected[n])});
  }
  const pair={propagation_case:p.name,assertion_case:a.name,address,start_tick:p.start_tick,propagation_end_tick:p.end_tick,assertion_start_tick:a.start_tick,end_tick:a.end_tick,recorded_window_ticks:a.end_tick-p.start_tick,requested_budget_ticks:400,final_correct_offset_ticks:correctSince-p.start_tick,stable_tail_ticks:a.end_tick-correctSince,correct_then_wrong_events:reversals,timing_budget_passed:late.length===0,incorrect_after_budget:late};
  pairs.push(pair);if(late.length)budgetFailures.push({assertion_case:a.name,address,events:late});
 }
 const last=cases.at(-1);assert(Object.values(last.inputs).every(v=>v===false));
 for(const s of window(last.end_tick,lastSample))assert(matches(s.bits,readHeaderOracle(0,diagnostic)),'Address-zero state changed during cleanup');
 const timingPassed=budgetFailures.length===0;
 return{status:timingPassed?'native_read_header_trace_checks_passed':'native_read_header_functional_pass_timing_budget_failed',job_id:job.job_id,session_id:job.session_id,suite:suite.label,view:diagnostic?'decoder_pair_stages':'near_far_read_masks',phases_passed:cases.length,decode_results_passed:pairs.length,assertions_passed:cases.reduce((n,c)=>n+c.assertions.length,0),functional_endpoints_passed:true,duration_ms:job.duration_ms,trace:{trace_id:meta.trace_id,start_tick:first.started_tick,last_tick:lastSample,transition_entries:seq,complete:true,gaps:0,stopped_drained_discarded:true},timing_admission:{requested_ticks:400,passed:timingPassed,failures:budgetFailures,basis:'All selected outputs must remain correct from the first post-input checkpoint +400 through the actual assertion endpoint. Earlier switching transients are allowed.'},settling:{max_final_correct_offset_ticks:Math.max(...pairs.map(p=>p.final_correct_offset_ticks)),min_stable_tail_ticks:Math.min(...pairs.map(p=>p.stable_tail_ticks)),correct_then_wrong_events:pairs.reduce((n,p)=>n+p.correct_then_wrong_events.length,0),pairs},input_restore:{all_four_off:true,raw_controls_stable_through_each_pair:true,off_and_outputs_stable_through_cleanup:true},limits:'Native end-of-tick samples do not exclude within-tick pulses. Timing begins after sequential input writes were confirmed, not at their first write. Main view measures complete word0/15 read-mask routes; diagnostic view measures decoder stages separately. No full16-row electrical-load, register-data, hazard-free switching or GPU-clock claim. Final geometry, pins and world save are separate stage evidence.'};
}
export function analyzeReadHeaderJob(id,{projectRoot=root}={}){
 assert(/^[0-9a-f-]{36}$/.test(id));const state=resolve(projectRoot,'.minecraft-assistant/workshop/tests/runs',id+'.json'),journal=state+'l',job=json(state);assert.equal(job.job_id,id);
 const trace=resolve(projectRoot,'.minecraft-assistant/workshop/circuits',job.trace.trace_id+'.jsonl');assert(resolve(job.artifact)===journal&&resolve(job.trace.artifact)===trace);
 const report=analyzeReadHeaderEvidence(job,jsonl(journal),jsonl(trace),{design:loadReadHeaderDesign(projectRoot)});
 report.source_sha256=Object.fromEntries([state,journal,trace,fileURLToPath(import.meta.url),resolve(projectRoot,'hardware/compact-read-header.mjs'),resolve(projectRoot,prepared,'provenance.json'),resolve(projectRoot,prepared,'design.json'),resolve(projectRoot,prepared,'tests.json')].map(p=>[p,hash(p)]));return report;
}
export function summarizeReadHeaderJobs(jobs){
 assert(jobs.length&&new Set(jobs.map(j=>j.job_id)).size===jobs.length&&new Set(jobs.map(j=>j.suite)).size===jobs.length);assert.equal(new Set(jobs.map(j=>j.session_id)).size,1);
 const labels=makeCompactReadHeaderTests(loadReadHeaderDesign()).map(t=>t.label);assert(jobs.every(j=>labels.includes(j.suite)));
 const complete=jobs.length===labels.length&&labels.every(n=>jobs.some(j=>j.suite===n)),timingPassed=jobs.every(j=>j.timing_admission.passed);
 return{status:complete&&timingPassed?'native_read_header_campaign_trace_checks_passed':'native_read_header_partial_or_timing_rejected',campaign_complete:complete,functional_endpoints_passed:jobs.every(j=>j.functional_endpoints_passed),timing_admission_passed:timingPassed,session_id:jobs[0].session_id,phases_passed:jobs.reduce((n,j)=>n+j.phases_passed,0),decode_results_passed:jobs.reduce((n,j)=>n+j.decode_results_passed,0),assertions_passed:jobs.reduce((n,j)=>n+j.assertions_passed,0),jobs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),i=args.indexOf('--out');let out;if(i>=0){assert(i===args.length-2);out=resolve(args.splice(i)[1]);}assert(args.length,'Provide completed job UUIDs');
 const report=summarizeReadHeaderJobs(args.map(id=>analyzeReadHeaderJob(id))),text=JSON.stringify(report,null,2)+'\n';if(out)writeFileSync(out,text,{flag:'wx'});process.stdout.write(text);if(!report.timing_admission_passed)process.exitCode=2;
}
