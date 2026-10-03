// Read-only, operand-specific native trace analysis. No bridge, services, or world calls.
// Usage: node scripts/analyze-workshop-operands.mjs JOB_UUID... [--out NEW_REPORT.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeDensePair} from '../hardware/dense-register-pair.mjs';
import {makeDenseOperands,makeDenseOperandTests} from '../hardware/dense-operand-capture.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const same=(a,b,msg)=>assert.deepEqual(a,b,msg),integer=n=>Number.isSafeInteger(n)&&n>=0;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8')),jsonl=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
function bit(raw,property){
 if(property==='powered'){assert(['true','false'].includes(String(raw)));return Number(String(raw)==='true');}
 assert(property==='power'&&/^(?:[0-9]|1[0-5])$/.test(String(raw)));return Number(Number(raw)>0);
}
function values(bits,definition){
 const out={...bits};for(const bus of definition.buses)out[bus.name]=bus.bits.reduce((n,name,i)=>n+bits[name]*2**i,0);return out;
}
const data=inputs=>Array.from({length:8},(_,b)=>Number(inputs['d'+b])*2**b).reduce((a,b)=>a+b,0);
const controls=['we','wa','ra','capture_a','capture_b'];
export function loadOperandDesign(projectRoot=root){
 const d=json(resolve(projectRoot,'artifacts/workshop-operands-v1/design.json'));
 same(d,makeDenseOperands({id:d.id,parent:makeDensePair({id:d.parent_reference.id,origin:d.origin})}),'Prepared design differs from generator');return d;
}

export function analyzeOperandEvidence(job,journal,trace,{design=loadOperandDesign()}={}){
 assert(job.status==='passed'&&job.failed===0&&job.completed===job.total&&job.passed===job.total,'Operand job is not fully passed');
 assert(job.spec.trace&&job.spec.restore_inputs&&job.restore?.status==='restored','Tracing/restoration required');
 assert(job.trace?.complete===true&&job.trace.gaps===0&&job.trace.active===false&&job.trace.has_more===false&&job.trace.discarded===true&&job.trace.end_reason==='stopped'&&!job.trace.error,'Incomplete trace lifecycle');
 assert(typeof job.session_id==='string'&&job.session_id);
 const definition=[design.circuit,design.guard_circuit].find(d=>d.id===job.circuit_id);assert(definition,'Unknown operand view');
 const guard=definition.id===design.guard_circuit.id,signals=definition.signals;
 same(job.definition,definition,'Unsupported operand definition/geometry');same(job.spec.inputs,design.inputs);
 const suite=makeDenseOperandTests(design).find(t=>t.spec.circuit_id===job.circuit_id&&JSON.stringify(t.spec.cases)===JSON.stringify(job.spec.cases));assert(suite,'Unknown operand stimulus sequence');same(job.spec,suite.spec,'Changed prepared test policy');
 const matches=(bits,expect)=>Object.entries(expect).every(([k,v])=>values(bits,definition)[k]===v);
 assert(journal[0]?.kind==='start'&&journal[1]?.kind==='input_baseline'&&journal.at(-1)?.kind==='finish');same(journal[0].spec,job.spec);
 same(journal[0].definition,definition,'Journal start definition differs');
 assert(journal.every(r=>['start','input_baseline','input_write_pending','case','finish'].includes(r.kind)),'Unexpected/error journal row');
 for(const kind of ['start','input_baseline','finish'])assert(journal.filter(r=>r.kind===kind).length===1);
 const baseline=journal[1];assert(baseline.session_id===job.session_id&&integer(baseline.tick));
 same(baseline.inputs.map(i=>i.name),design.inputs.map(i=>i.name));same(job.input_journal.map(i=>i.name),design.inputs.map(i=>i.name));
 const commanded=Object.fromEntries(design.inputs.map(i=>[i.name,false])),touched=new Set();
 for(const row of journal){
  if(row.kind==='input_write_pending'){
   assert(Object.hasOwn(commanded,row.name)&&row.previous===String(commanded[row.name])&&['true','false'].includes(row.desired)&&row.desired!==row.previous,'Invalid sequential input-write journal');
   commanded[row.name]=row.desired==='true';touched.add(row.name);
  }else if(row.kind==='case')same(commanded,row.inputs,'Case controls disagree with the sequential write journal');
 }
 assert(Object.values(commanded).every(v=>v===false),'Journal did not return all13 controls to off');
 for(const [i,b]of baseline.inputs.entries()){
  same(b.original.position,design.inputs[i].position);assert(b.original.id==='minecraft:lever');same(b.original.properties,{face:'floor',powered:'false',facing:'west'});
  const final=job.input_journal[i];same(final.original,b.original);assert(final.expected_powered==='false'&&!Object.hasOwn(final,'pending_powered'));
  assert(final.touched===touched.has(final.name));
  if(final.touched)assert(job.restore.inputs.some(r=>r.name===final.name&&r.status==='restored'));
 }
 for(const k of ['job_id','circuit_id','status','session_id','completed','total','passed','failed','restore','trace'])same(journal.at(-1).summary[k],job[k],`Finish mismatch ${k}`);
 const first=trace[0],byPosition=new Map(design.blocks.map(b=>[JSON.stringify(b.position),b.block.id]));
 assert(first?.kind==='start'&&first.active===true&&first.next_seq===0&&first.point_count===signals.length);
 same(first.definition,definition);same(first.positions,signals.map(s=>s.position));
 assert(first.initial_phase==='server_task'&&first.sampling_phase==='end_server_tick'&&integer(first.started_tick)&&first.started_tick>=baseline.tick&&first.last_sample_tick===first.started_tick);
 let states=Array(signals.length),seq=0,lastEvent=first.started_tick,lastServer=first.server_tick,lastSample=first.started_tick,stopped=false,stopTick=null,drained=false,discarded=false;
 const snapshots=[];
 function apply(rows,initial=false){
  assert(Array.isArray(rows)&&(!initial||rows.length===signals.length));const seen=new Set();
  for(const r of rows){assert(Number.isInteger(r.index)&&r.index>=0&&r.index<signals.length&&!seen.has(r.index));seen.add(r.index);const s=signals[r.index];same(r.position,s.position);assert(r.status==='loaded','Unloaded/unknown native state');assert(r.id===byPosition.get(JSON.stringify(s.position)));states[r.index]=bit(r.properties?.[s.property],s.property);}
  assert(states.every(v=>v===0||v===1));return Object.fromEntries(signals.map((s,i)=>[s.name,states[i]]));
 }
 snapshots.push({tick:first.started_tick,bits:apply(first.initial_states,true)});
 for(const [index,r]of trace.entries()){
  assert(r.session_id===job.session_id&&r.watch_id===first.watch_id&&r.dimension===definition.dimension,'Trace identity changed');
  assert(r.started_tick===first.started_tick&&r.point_count===signals.length&&r.duration_ticks===first.duration_ticks);
  assert(integer(r.server_tick)&&r.server_tick>=lastServer&&integer(r.last_sample_tick)&&r.last_sample_tick>=lastSample&&r.last_sample_tick<=r.server_tick,'Trace clock regressed');lastServer=r.server_tick;lastSample=r.last_sample_tick;
  if(!index)continue;assert(!discarded);
  if(r.kind==='stop'){assert(!stopped&&r.active===false&&r.end_reason==='stopped'&&r.discarded===false);stopped=true;stopTick=r.last_sample_tick;}
  else if(r.kind==='poll'){
   assert(r.gap===false&&r.dropped_total===0&&Array.isArray(r.entries));assert(integer(r.next_seq)&&integer(r.latest_seq)&&r.next_seq<=r.latest_seq);
   for(const e of r.entries){assert(e.seq===++seq&&e.missed_ticks===0&&integer(e.tick)&&e.tick>lastEvent&&e.tick<=r.last_sample_tick,'Gap or unordered transition');lastEvent=e.tick;snapshots.push({tick:e.tick,bits:apply(e.states)});}
   assert(r.next_seq===seq);if(stopped){assert(r.active===false&&r.end_reason==='stopped'&&r.last_sample_tick===stopTick);drained=r.next_seq===r.latest_seq;}else assert(r.active===true&&!r.end_reason,'Recorder ended before explicit stop');
  }else if(r.kind==='discard'){assert(stopped&&drained&&r.active===false&&r.discarded===true&&r.end_reason==='stopped'&&r.last_sample_tick===stopTick);discarded=true;}
  else assert.fail('Unexpected trace event '+r.kind);
 }
 assert(stopped&&drained&&discarded&&lastSample===job.trace.last_tick&&lastSample>=job.trace.required_through_tick);
 function at(t){assert(integer(t)&&t>=first.started_tick&&t<=lastSample);let s=snapshots[0];for(const next of snapshots){if(next.tick>t)break;s=next;}return s.bits;}
 function window(a,b){at(a);at(b);return[{tick:a,bits:at(a)},...snapshots.filter(s=>s.tick>a&&s.tick<=b)];}
 const cases=journal.filter(r=>r.kind==='case');assert(cases.length===job.total&&cases.length===job.spec.cases.length);
 const retained=[],captureWindows=[],parentWindows=[],holds=[],holdScope=[],settling=[];let previousEnd=first.started_tick;
 for(const [i,c]of cases.entries()){
  const spec=job.spec.cases[i];assert(c.name===spec.name&&c.pass===true&&c.unknown===false);same(c.inputs,spec.inputs);
  assert(integer(c.start_tick)&&integer(c.end_tick)&&c.start_tick>=previousEnd&&c.end_tick-c.start_tick>=200&&c.settled_ticks===c.end_tick-c.start_tick);previousEnd=c.end_tick;
  const obs=c.observation;assert(obs.id===job.circuit_id&&obs.session_id===job.session_id&&obs.tick===c.end_tick&&obs.atomic===true&&obs.phase==='server_task');same(Object.keys(obs.signals),signals.map(s=>s.name));
  const bits={};for(const s of signals){const v=obs.signals[s.name];assert(v.status==='loaded'&&(v.bit===0||v.bit===1)&&v.bit===bit(v.raw,s.property));bits[s.name]=v.bit;}
  for(const bus of definition.buses){const ordered=bus.bits.map(n=>bits[n]);same(obs.buses[bus.name].bits_lsb_first,ordered);assert(obs.buses[bus.name].value===ordered.reduce((n,v,b)=>n+v*2**b,0));}
  assert(matches(bits,spec.expect),'Native endpoint disagrees with expectations');same(c.assertions,Object.entries(spec.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true})));
  same(at(c.end_tick),bits,'Native task and trace endpoint disagree');
  const samples=window(c.start_tick,c.end_tick);
  for(const s of samples)for(const control of controls)assert(s.bits['raw_'+control]===Number(c.inputs[control]),`Raw ${control} changed after applied-input checkpoint`);
  let correctSince=c.start_tick;for(let k=0;k<samples.length;k++)if(!matches(samples[k].bits,spec.expect))correctSince=samples[k+1]?.tick??null;
  assert(correctSince!==null);settling.push({case:c.name,after_input_checkpoint_ticks:correctSince-c.start_tick,stable_tail_ticks:c.end_tick-correctSince});
  const prev=cases[i-1];
  if(prev){
   const span=window(prev.end_tick,c.end_tick),old=values(at(prev.end_tick),definition);
   for(const control of controls){
    const before=Number(prev.inputs[control]),after=Number(c.inputs[control]);let changed=before===after;
    for(const s of span){const actual=s.bits['raw_'+control];
     if(actual===after)changed=true;
     else assert(!changed&&actual===before,'Unjournaled raw-control pulse during sequential input writes');
    }
   }
   for(const operand of ['a','b']){
    const was=prev.inputs['capture_'+operand],now=c.inputs['capture_'+operand];
    if(!was&&!now){
     for(const s of span){const v=values(s.bits,definition);assert(v[operand]===old[operand]&&v['locks_'+operand]===255&&v['raw_capture_'+operand]===0,`Held ${operand} or lock changed during sequential stimulus`);}
     retained.push({case:c.name,operand,from_tick:prev.end_tick,to_tick:c.end_tick,retained_byte:old[operand]});
    }else{
     assert(prev.inputs.ra===c.inputs.ra&&!prev.inputs.we&&!c.inputs.we,'Capture overlaps a read-address/write change');
     if(!was)assert(old['locks_'+operand]===255,'Capture opened without a prior closed-lock checkpoint');
     for(const s of span){const v=values(s.bits,definition);assert(v.raw_ra===Number(c.inputs.ra)&&v.raw_we===0&&v.read===old.read,'Read source changed during capture/closure');
      if(!guard)assert(v['local_'+operand]===old.read,'Actual local D was not already settled for capture');
      if(was&&!now)assert(v[operand]===old[operand],'Captured Q changed during close with the same read source');
     }
     captureWindows.push({case:c.name,operand,action:now?'open':'close',from_tick:prev.end_tick,to_tick:c.end_tick,source_byte:old.read});
    }
   }
   if(prev.inputs.ra!==c.inputs.ra||prev.inputs.we!==c.inputs.we){
    assert(!prev.inputs.capture_a&&!prev.inputs.capture_b&&!c.inputs.capture_a&&!c.inputs.capture_b,'Source address/write changed while capture open');
    assert(old.locks_a===255&&old.locks_b===255,'Source changed without both operand banks previously locked');
   }
   if(prev.inputs.we||c.inputs.we){
    assert(prev.inputs.wa===c.inputs.wa&&data(prev.inputs)===data(c.inputs),'D/WA changed around parent write');
    for(const s of span)assert(s.bits.raw_wa===Number(c.inputs.wa),'Raw write address changed during write');
   }
   if(guard){
    const words=prev.inputs.we||c.inputs.we?[1-Number(c.inputs.wa)]:[0,1];
    for(const word of words)for(const s of span)assert(values(s.bits,definition)['q'+word]===old['q'+word],'Parent Q changed outside its selected write window');
    if(prev.inputs.we&&!c.inputs.we)for(const s of span)assert(values(s.bits,definition)['q'+Number(c.inputs.wa)]===old['q'+Number(c.inputs.wa)],'Parent Q changed while its write closed');
    parentWindows.push({case:c.name,words,from_tick:prev.end_tick,to_tick:c.end_tick});
   }
   if(c.name==='opposite_local_d_hold_200'){
    assert(prev.name==='opposite_local_d_prepare');same(c.inputs,prev.inputs,'Opposite-data hold changed inputs');assert(!c.inputs.capture_a&&!c.inputs.capture_b&&!c.inputs.we);
    const targets=['a','b'].filter(o=>spec.expect.read===(spec.expect[o]^255));assert(targets.length);
    if(guard)holdScope.push({case:c.name,local_data_unobserved:true,retained_targets:targets});
    else for(const operand of targets){
     const q=spec.expect[operand];assert(old[operand]===q);
     for(const s of span){const v=values(s.bits,definition);assert(v['local_'+operand]===(q^255)&&v[operand]===q&&v['locks_'+operand]===255,'Actual opposite local-D hold failed');}
     assert(c.end_tick-prev.end_tick>=200);holds.push({case:c.name,operand,stored_byte:q,actual_local_data:q^255,from_tick:prev.end_tick,to_tick:c.end_tick,recorded_elapsed_ticks:c.end_tick-prev.end_tick,all_eight_cells:true});
    }
   }
  }
 }
 const expectedHolds=suite.label==='capture_final_clear'||guard?0:suite.label==='capture_same_word'?2:1;assert.equal(holds.length,expectedHolds);
 const final=values(at(lastSample),definition),last=cases.at(-1);assert(Object.values(last.inputs).every(v=>v===false),'Final spec controls are not all off');
 for(const s of window(last.end_tick,lastSample)){
  const v=values(s.bits,definition);for(const control of controls)assert(v['raw_'+control]===0,'Observed final control did not remain off');
  assert(v.a===last.observation.buses.a.value&&v.b===last.observation.buses.b.value&&v.locks_a===255&&v.locks_b===255,'Cleanup changed retained operands');
 }
 assert(matches(at(lastSample),last.assertions.reduce((e,a)=>({...e,[a.name]:a.expected}),{})),'Final trace state differs from final assertion');
 return{status:'native_operand_trace_checks_passed',suite:suite.label,view:guard?'parent_guard':'actual_local_data',job_id:job.job_id,session_id:job.session_id,trace_id:job.trace.trace_id,cases_passed:cases.length,assertions_passed:cases.reduce((n,c)=>n+c.assertions.length,0),duration_ms:job.duration_ms,trace:{start_tick:first.started_tick,last_tick:lastSample,transition_entries:seq,complete:true,gaps:0,stopped_drained_discarded:true},retained_operand_windows:retained,capture_source_windows:captureWindows,parent_isolation_windows:parentWindows,opposite_data_holds:holds,local_data_scope_exclusions:holdScope,settling:{basis:'After sequential inputs were confirmed; not first write or a minimum clock.',max_final_correct_offset_ticks:Math.max(...settling.map(s=>s.after_input_checkpoint_ticks)),min_stable_tail_ticks:Math.min(...settling.map(s=>s.stable_tail_ticks)),cases:settling},input_restore:{all_thirteen_off:true,scope:'Runner baseline/pending-write journal and restored summaries; five raw control levers are also traced. Raw D levers are not trace probes.'},limits:'End-of-tick samples cannot exclude within-tick pulses. Main view observes operand local D but not parent Q; guard view observes parent Q but not operand local D. First initialization has no prior stable retention checkpoint. Read switching transients are allowed before settled endpoints; no hazard-free claim. Inputs off do not clear retained memory. No architectural phase-controller acceptance.'};
}
export function analyzeOperandJob(id,{projectRoot=root}={}){
 assert(/^[0-9a-f-]{36}$/.test(id));const state=resolve(projectRoot,'.minecraft-assistant/workshop/tests/runs',id+'.json'),journal=state+'l',job=json(state);assert(job.job_id===id);
 const trace=resolve(projectRoot,'.minecraft-assistant/workshop/circuits',job.trace.trace_id+'.jsonl');assert(resolve(job.artifact)===journal&&resolve(job.trace.artifact)===trace);
 const design=loadOperandDesign(projectRoot),report=analyzeOperandEvidence(job,jsonl(journal),jsonl(trace),{design});
 report.source_sha256=Object.fromEntries([state,journal,trace,fileURLToPath(import.meta.url),resolve(root,'hardware/dense-operand-capture.mjs'),resolve(root,'hardware/dense-register-pair.mjs'),resolve(projectRoot,'artifacts/workshop-operands-v1/design.json')].map(p=>[p,hash(p)]));return report;
}
export function summarizeOperandJobs(jobs){
 assert(jobs.length&&new Set(jobs.map(j=>j.job_id)).size===jobs.length&&new Set(jobs.map(j=>j.suite)).size===jobs.length,'Duplicate jobs/suites');
 assert(new Set(jobs.map(j=>j.session_id)).size===1,'Campaign crosses native sessions');
 const labels=makeDenseOperandTests(loadOperandDesign()).map(t=>t.label),complete=jobs.length===labels.length&&labels.every(n=>jobs.some(j=>j.suite===n));
 const coverage=Object.fromEntries(['a','b'].map(o=>[o,jobs.flatMap(j=>j.opposite_data_holds).filter(h=>h.operand===o).length]));
 if(complete){assert(coverage.a===3&&coverage.b===3);assert(jobs.find(j=>j.suite==='capture_parent_guard').parent_isolation_windows.length);}
 return{status:complete?'native_operand_campaign_trace_checks_passed':'native_operand_partial_trace_checks_passed',campaign_complete:complete,session_id:jobs[0].session_id,cases_passed:jobs.reduce((n,j)=>n+j.cases_passed,0),assertions_passed:jobs.reduce((n,j)=>n+j.assertions_passed,0),actual_opposite_full_byte_windows:coverage,jobs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),outAt=args.indexOf('--out');let out;if(outAt>=0){assert(outAt===args.length-2);out=resolve(args.splice(outAt)[1]);}assert(args.length,'Provide completed operand job UUIDs');
 const text=JSON.stringify(summarizeOperandJobs(args.map(id=>analyzeOperandJob(id))),null,2)+'\n';if(out)writeFileSync(out,text,{flag:'wx'});process.stdout.write(text);
}
