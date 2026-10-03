// Read-only analysis of the compact eight-bit word's native end-of-tick trace.
// Usage: node scripts/analyze-workshop-word.mjs JOB_ID... [--out NEW_FILE.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeDenseWord,makeDenseWordTests} from '../hardware/dense-register-word.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const same=(a,b,message)=>assert.deepEqual(a,b,message);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const jsonl=path=>readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
const busPrefixes={q:'q',local_d:'local_d',locks:'lock',output_q:'output',raw_d:'raw_d'};
const decode=(raw,property)=>{
 if(property==='powered'){assert(['true','false'].includes(String(raw)),'Invalid powered property');return Number(String(raw)==='true');}
 assert(property==='power'&&/^(?:[0-9]|1[0-5])$/.test(String(raw)),'Invalid wire power');return Number(Number(raw)>0);
};
function values(bits){
 const out=Object.fromEntries(Object.entries(busPrefixes).map(([name,prefix])=>[name,Array.from({length:8},(_,i)=>bits[prefix+i]*2**i).reduce((a,b)=>a+b,0)]));
 return{...out,raw_hold:bits.raw_hold,far_hold:bits.far_hold};
}

export function analyzeEvidence(job,journal,trace){
 assert(job.status==='passed'&&job.failed===0&&job.passed===job.total&&job.completed===job.total,'Job must be fully passed and terminal');
 assert(job.restore?.status==='restored'&&job.spec.restore_inputs&&job.spec.trace,'Restoration and tracing are required');
 assert(job.trace?.complete===true&&job.trace.gaps===0&&job.trace.active===false&&job.trace.has_more===false&&job.trace.discarded===true&&job.trace.end_reason==='stopped'&&!job.trace.error,'Trace must be complete, stopped, drained and discarded');
 assert(typeof job.session_id==='string'&&job.session_id.length>0,'Missing session');
 const d0=job.spec.inputs.find(i=>i.name==='d0');assert(d0,'Missing data port');
 const design=makeDenseWord({id:job.circuit_id,origin:{x:d0.position.x,y:d0.position.y-1,z:d0.position.z}});
 same(job.definition,design.circuit,'Only the exact compact word geometry/view is supported');same(job.spec.inputs,design.inputs);
 assert(makeDenseWordTests(design).some(test=>JSON.stringify(test.spec.cases)===JSON.stringify(job.spec.cases)),'Unknown word test cases');
 assert(job.spec.settle_ticks===200,'This analyzer requires the prepared 200-tick specs');
 assert(journal[0]?.kind==='start'&&journal.at(-1)?.kind==='finish','Missing journal lifecycle');same(journal[0].spec,job.spec);
 assert(journal.every(r=>['start','input_baseline','input_write_pending','case','finish'].includes(r.kind)),'Unexpected/error journal event');
 assert(journal.filter(r=>r.kind==='start').length===1&&journal.filter(r=>r.kind==='finish').length===1);
 const baseline=journal.filter(r=>r.kind==='input_baseline');assert(baseline.length===1&&baseline[0].session_id===job.session_id);
 assert(integer(baseline[0].tick));same(baseline[0].inputs.map(i=>i.name),design.inputs.map(i=>i.name));
 for(const [i,input]of baseline[0].inputs.entries()){
  same(input.original.position,design.inputs[i].position);assert(input.original.id==='minecraft:lever');
  same(input.original.properties,{face:'floor',powered:'false',facing:'west'});
 }
 const finish=journal.at(-1).summary;
 for(const k of ['job_id','circuit_id','status','session_id','completed','total','passed','failed','restore','trace'])same(finish[k],job[k],`Finish mismatch: ${k}`);
 same(job.input_journal.map(i=>i.name),design.inputs.map(i=>i.name));
 for(const [i,input]of job.input_journal.entries()){
  same(input.original,baseline[0].inputs[i].original);assert(input.expected_powered==='false'&&!Object.hasOwn(input,'pending_powered'));
  if(input.touched)assert(job.restore.inputs.some(r=>r.name===input.name&&r.status==='restored'),'Touched input not restored');
 }

 const first=trace[0];assert(first?.kind==='start'&&first.active===true&&first.next_seq===0&&first.point_count===42);
 same(first.definition,design.circuit);same(first.positions,design.circuit.signals.map(s=>s.position));
 assert(first.initial_phase==='server_task'&&first.sampling_phase==='end_server_tick');
 assert(integer(first.started_tick)&&first.started_tick>=baseline[0].tick&&first.last_sample_tick===first.started_tick);
 let states=Array(42),seq=0,lastEvent=first.started_tick,lastServer=first.server_tick,lastSample=first.started_tick;
 const snapshots=[],signals=design.circuit.signals;
 function apply(rows,initial=false){
  assert(Array.isArray(rows)&&(!initial||rows.length===42));const seen=new Set();
  for(const r of rows){assert(Number.isInteger(r.index)&&r.index>=0&&r.index<42&&!seen.has(r.index));seen.add(r.index);
   const s=signals[r.index];same(r.position,s.position);assert(r.status==='loaded','Unknown/unloaded trace state');
   const id=s.property==='power'?'minecraft:redstone_wire':s.name.startsWith('raw_')?'minecraft:lever':'minecraft:repeater';
   assert(r.id===id,`Wrong block at ${s.name}`);states[r.index]=decode(r.properties?.[s.property],s.property);
  }
  assert(states.every(v=>v===0||v===1));return Object.fromEntries(signals.map((s,i)=>[s.name,states[i]]));
 }
 snapshots.push({tick:first.started_tick,bits:apply(first.initial_states,true)});
 let stopped=false,drained=false,discarded=false;
 for(const [index,r]of trace.entries()){
  assert(r.session_id===job.session_id&&r.watch_id===first.watch_id&&r.dimension===design.circuit.dimension,'Trace identity changed');
  assert(r.started_tick===first.started_tick&&r.point_count===42&&r.duration_ticks===first.duration_ticks);
  assert(integer(r.server_tick)&&r.server_tick>=lastServer&&integer(r.last_sample_tick)&&r.last_sample_tick>=lastSample&&r.last_sample_tick<=r.server_tick,'Trace tick regressed');
  lastServer=r.server_tick;lastSample=r.last_sample_tick;
  if(index===0)continue;
  assert(!discarded,'Trace data after discard');
  if(r.kind==='stop'){assert(!stopped&&r.active===false&&r.end_reason==='stopped'&&r.discarded===false);stopped=true;}
  else if(r.kind==='poll'){
   assert(r.gap===false&&r.dropped_total===0&&Array.isArray(r.entries),'Trace has missing samples');
   assert(integer(r.next_seq)&&integer(r.latest_seq)&&r.next_seq<=r.latest_seq);
   for(const e of r.entries){assert(e.seq===++seq&&e.missed_ticks===0&&integer(e.tick)&&e.tick>lastEvent&&e.tick<=r.last_sample_tick,'Noncontiguous trace or missed ticks');lastEvent=e.tick;snapshots.push({tick:e.tick,bits:apply(e.states)});}
   assert(r.next_seq===seq,'Trace page cursor mismatch');
   if(stopped){assert(r.active===false&&r.end_reason==='stopped');drained=r.next_seq===r.latest_seq;}
  }else if(r.kind==='discard'){assert(stopped&&drained&&r.active===false&&r.discarded===true&&r.end_reason==='stopped');discarded=true;}
  else assert.fail('Unexpected trace event: '+r.kind);
 }
 assert(stopped&&drained&&discarded&&lastSample===job.trace.last_tick&&lastSample>=job.trace.required_through_tick);
 function at(tick){assert(integer(tick)&&tick>=first.started_tick&&tick<=lastSample,'Tick outside trace');let s=snapshots[0];for(const next of snapshots){if(next.tick>tick)break;s=next;}return s.bits;}
 function window(from,to){at(from);at(to);return[{tick:from,bits:at(from)},...snapshots.filter(s=>s.tick>from&&s.tick<=to)];}
 const cases=journal.filter(r=>r.kind==='case');assert(cases.length===job.total&&cases.length===job.spec.cases.length);
 const holds=[],tails=[];let previousEnd=first.started_tick;
 for(const [i,c]of cases.entries()){
  const spec=job.spec.cases[i];assert(c.name===spec.name&&c.pass===true&&c.unknown===false);same(c.inputs,spec.inputs);
  assert(integer(c.start_tick)&&integer(c.end_tick)&&c.start_tick>=previousEnd&&c.end_tick-c.start_tick>=200&&c.settled_ticks===c.end_tick-c.start_tick);previousEnd=c.end_tick;
  const obs=c.observation;assert(obs.session_id===job.session_id&&obs.id===job.circuit_id&&obs.tick===c.end_tick&&obs.atomic===true&&obs.phase==='server_task');
  const bits={};same(Object.keys(obs.signals),signals.map(s=>s.name));
  for(const s of signals){const v=obs.signals[s.name];assert(v.status==='loaded'&&(v.bit===0||v.bit===1));assert(v.bit===decode(v.raw,s.property));bits[s.name]=v.bit;}
  const observed=values(bits);same(observed,spec.expect,'Case native observation disagrees with expected result');
  for(const [name,prefix]of Object.entries(busPrefixes)){same(obs.buses[name].bits_lsb_first,Array.from({length:8},(_,b)=>bits[prefix+b]));assert(obs.buses[name].value===observed[name]);}
  same(c.assertions,Object.entries(spec.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true})));
  const samples=window(c.start_tick,c.end_tick);
  for(const s of samples){assert(s.bits.raw_hold===Number(spec.inputs.hold),'Raw HOLD pulse');for(let b=0;b<8;b++)assert(s.bits['raw_d'+b]===Number(spec.inputs['d'+b]),'Raw D pulse');}
  // The final native task and end-of-tick sample independently agree at this boundary.
  same(values(at(c.end_tick)),spec.expect,'Recorded endpoint mismatch');
  let correctSince=c.start_tick;
  for(let k=0;k<samples.length;k++)if(JSON.stringify(values(samples[k].bits))!==JSON.stringify(spec.expect))correctSince=samples[k+1]?.tick??null;
  assert(correctSince!==null);tails.push({case:c.name,final_correct_from_tick:correctSince,after_input_checkpoint_ticks:correctSince-c.start_tick,stable_tail_ticks:c.end_tick-correctSince});
  if(c.name.endsWith('_hold_opposite_200')){
   const prepare=cases[i-1];assert(prepare?.name===c.name.replace('_hold_opposite_200','_prepare_opposite'));same(prepare.inputs,c.inputs,'Hold must have unchanged inputs after preparation');
   const q=spec.expect.q;assert(spec.inputs.hold&&spec.expect.local_d===(q^255)&&spec.expect.locks===255&&spec.expect.output_q===q);
   for(const s of window(prepare.end_tick,c.end_tick))for(let b=0;b<8;b++){
    const qb=(q>>b)&1;assert(s.bits['q'+b]===qb&&s.bits['output'+b]===qb,'Q/output changed during hold');
    assert(s.bits['local_d'+b]===1-qb&&s.bits['lock'+b]===1,'Actual local D/lock hold failure');
    assert(s.bits['raw_d'+b]===1-qb&&s.bits.raw_hold===1,'Source changed during unchanged-input hold');
   }
   assert(c.end_tick-prepare.end_tick>=200);holds.push({case:c.name,from_tick:prepare.end_tick,to_tick:c.end_tick,recorded_elapsed_ticks:c.end_tick-prepare.end_tick,stored_byte:q,actual_local_data:q^255,all_eight_cells:true});
  }
 }
 assert(holds.length===2,'Expected two prepared opposite-data holds');
 const final=values(at(lastSample));assert(final.raw_d===0&&final.raw_hold===0,'Trace final controls not restored');
 return{status:'native_trace_checks_passed',job_id:job.job_id,session_id:job.session_id,trace_id:job.trace.trace_id,cases_passed:cases.length,assertions_passed:cases.reduce((n,c)=>n+c.assertions.length,0),duration_ms:job.duration_ms,trace:{start_tick:first.started_tick,last_tick:lastSample,transition_entries:seq,complete:true,gaps:0,stopped_drained_discarded:true},holds,settling:{basis:'After all sequential inputs were confirmed applied; not first input write or a proven minimum clock.',max_final_correct_offset_ticks:Math.max(...tails.map(t=>t.after_input_checkpoint_ticks)),min_stable_tail_ticks:Math.min(...tails.map(t=>t.stable_tail_ticks)),cases:tails},limits:'End-of-server-tick evidence cannot exclude within-tick pulses. No full GPU or reload-persistence claim; restoration readbacks are runner-journal evidence.'};
}

export function analyzeJob(jobId,{projectRoot=root}={}){
 assert(/^[0-9a-f-]{36}$/.test(jobId),'Expected a job UUID');
 const state=resolve(projectRoot,'.minecraft-assistant/workshop/tests/runs',jobId+'.json'),journal=state+'l';
 const job=json(state);assert(job.job_id===jobId);const trace=resolve(projectRoot,'.minecraft-assistant/workshop/circuits',job.trace.trace_id+'.jsonl');
 assert(resolve(job.artifact)===journal&&resolve(job.trace.artifact)===trace,'Evidence paths do not match this workshop');
 const report=analyzeEvidence(job,jsonl(journal),jsonl(trace));
 report.source_sha256=Object.fromEntries([state,journal,trace,fileURLToPath(import.meta.url),resolve(root,'hardware/dense-register-word.mjs')].map(p=>[p,hash(p)]));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),outAt=args.indexOf('--out');let out;
 if(outAt>=0){assert(outAt===args.length-2,'--out must be followed by one new path');out=resolve(args.splice(outAt)[1]);}
 assert(args.length>0,'Provide one or more completed workshop job UUIDs');
 const report={status:'native_trace_checks_passed',jobs:args.map(id=>analyzeJob(id))};
 const text=JSON.stringify(report,null,2)+'\n';if(out)writeFileSync(out,text,{flag:'wx'});process.stdout.write(text);
}
