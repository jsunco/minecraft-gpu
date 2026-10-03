// Read-only, pair-specific native trace analysis. No bridge, services, or world calls.
// Usage: node scripts/analyze-workshop-pair.mjs JOB_UUID... [--out NEW_REPORT.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeDensePair,makeDensePairTests} from '../hardware/dense-register-pair.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const same=(a,b,msg)=>assert.deepEqual(a,b,msg),integer=n=>Number.isSafeInteger(n)&&n>=0;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8')),jsonl=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
function bit(raw,property){
 if(property==='powered'){assert(['true','false'].includes(String(raw)));return Number(String(raw)==='true');}
 assert(property==='power'&&/^(?:[0-9]|1[0-5])$/.test(String(raw)));return Number(Number(raw)>0);
}
function values(bits){
 const out={};for(let w=0;w<2;w++)for(const prefix of ['q','local_d','lock'])out[prefix+w]=Array.from({length:8},(_,b)=>bits[`${prefix}${w}_${b}`]*2**b).reduce((a,b)=>a+b,0);
 out.read=Array.from({length:8},(_,b)=>bits['read'+b]*2**b).reduce((a,b)=>a+b,0);
 return{...out,qualified:bits.qualified0+2*bits.qualified1,holds:bits.far_hold0+2*bits.far_hold1,raw_we:bits.raw_we,raw_wa:bits.raw_wa,raw_ra:bits.raw_ra};
}
const data=inputs=>Array.from({length:8},(_,b)=>Number(inputs['d'+b])*2**b).reduce((a,b)=>a+b,0);
const matches=(bits,expect)=>Object.entries(expect).every(([k,v])=>values(bits)[k]===v);

export function analyzePairEvidence(job,journal,trace){
 assert(job.status==='passed'&&job.failed===0&&job.completed===job.total&&job.passed===job.total,'Pair job is not fully passed');
 assert(job.spec.trace&&job.spec.restore_inputs&&job.restore?.status==='restored','Tracing/restoration required');
 assert(job.trace?.complete===true&&job.trace.gaps===0&&job.trace.active===false&&job.trace.has_more===false&&job.trace.discarded===true&&job.trace.end_reason==='stopped'&&!job.trace.error,'Incomplete trace lifecycle');
 assert(typeof job.session_id==='string'&&job.session_id);
 const d0=job.spec.inputs.find(i=>i.name==='d0');assert(d0);
 const design=makeDensePair({id:job.circuit_id,origin:{x:d0.position.x,y:d0.position.y-1,z:d0.position.z-16}});
 same(job.definition,design.circuit,'Unsupported pair definition/geometry');same(job.spec.inputs,design.inputs);
 const suite=makeDensePairTests(design).find(t=>JSON.stringify(t.spec.cases)===JSON.stringify(job.spec.cases));assert(suite,'Unknown pair stimulus sequence');assert(job.spec.settle_ticks===200);
 assert(journal[0]?.kind==='start'&&journal[1]?.kind==='input_baseline'&&journal.at(-1)?.kind==='finish');same(journal[0].spec,job.spec);
 assert(journal.every(r=>['start','input_baseline','input_write_pending','case','finish'].includes(r.kind)),'Unexpected/error journal row');
 for(const kind of ['start','input_baseline','finish'])assert(journal.filter(r=>r.kind===kind).length===1);
 const baseline=journal[1];assert(baseline.session_id===job.session_id&&integer(baseline.tick));
 same(baseline.inputs.map(i=>i.name),design.inputs.map(i=>i.name));same(job.input_journal.map(i=>i.name),design.inputs.map(i=>i.name));
 for(const [i,b]of baseline.inputs.entries()){
  same(b.original.position,design.inputs[i].position);assert(b.original.id==='minecraft:lever');same(b.original.properties,{face:'floor',powered:'false',facing:'west'});
  const final=job.input_journal[i];same(final.original,b.original);assert(final.expected_powered==='false'&&!Object.hasOwn(final,'pending_powered'));
  if(final.touched)assert(job.restore.inputs.some(r=>r.name===final.name&&r.status==='restored'));
 }
 for(const k of ['job_id','circuit_id','status','session_id','completed','total','passed','failed','restore','trace'])same(journal.at(-1).summary[k],job[k],`Finish mismatch ${k}`);
 const first=trace[0],signals=design.circuit.signals,byPosition=new Map(design.blocks.map(b=>[JSON.stringify(b.position),b.block.id]));
 assert(first?.kind==='start'&&first.active===true&&first.next_seq===0&&first.point_count===63);
 same(first.definition,design.circuit);same(first.positions,signals.map(s=>s.position));
 assert(first.initial_phase==='server_task'&&first.sampling_phase==='end_server_tick'&&integer(first.started_tick)&&first.started_tick>=baseline.tick&&first.last_sample_tick===first.started_tick);
 let states=Array(63),seq=0,lastEvent=first.started_tick,lastServer=first.server_tick,lastSample=first.started_tick,stopped=false,drained=false,discarded=false;
 const snapshots=[];
 function apply(rows,initial=false){
  assert(Array.isArray(rows)&&(!initial||rows.length===63));const seen=new Set();
  for(const r of rows){assert(Number.isInteger(r.index)&&r.index>=0&&r.index<63&&!seen.has(r.index));seen.add(r.index);const s=signals[r.index];same(r.position,s.position);assert(r.status==='loaded','Unloaded/unknown native state');assert(r.id===byPosition.get(JSON.stringify(s.position)));states[r.index]=bit(r.properties?.[s.property],s.property);}
  assert(states.every(v=>v===0||v===1));return Object.fromEntries(signals.map((s,i)=>[s.name,states[i]]));
 }
 snapshots.push({tick:first.started_tick,bits:apply(first.initial_states,true)});
 for(const [index,r]of trace.entries()){
  assert(r.session_id===job.session_id&&r.watch_id===first.watch_id&&r.dimension===design.circuit.dimension,'Trace identity changed');
  assert(r.started_tick===first.started_tick&&r.point_count===63&&r.duration_ticks===first.duration_ticks);
  assert(integer(r.server_tick)&&r.server_tick>=lastServer&&integer(r.last_sample_tick)&&r.last_sample_tick>=lastSample&&r.last_sample_tick<=r.server_tick,'Trace clock regressed');lastServer=r.server_tick;lastSample=r.last_sample_tick;
  if(!index)continue;assert(!discarded);
  if(r.kind==='stop'){assert(!stopped&&r.active===false&&r.end_reason==='stopped'&&r.discarded===false);stopped=true;}
  else if(r.kind==='poll'){
   assert(r.gap===false&&r.dropped_total===0&&Array.isArray(r.entries));assert(integer(r.next_seq)&&integer(r.latest_seq)&&r.next_seq<=r.latest_seq);
   for(const e of r.entries){assert(e.seq===++seq&&e.missed_ticks===0&&integer(e.tick)&&e.tick>lastEvent&&e.tick<=r.last_sample_tick,'Gap or unordered transition');lastEvent=e.tick;snapshots.push({tick:e.tick,bits:apply(e.states)});}
   assert(r.next_seq===seq);if(stopped){assert(r.active===false&&r.end_reason==='stopped');drained=r.next_seq===r.latest_seq;}
  }else if(r.kind==='discard'){assert(stopped&&drained&&r.active===false&&r.discarded===true&&r.end_reason==='stopped');discarded=true;}
  else assert.fail('Unexpected trace event '+r.kind);
 }
 assert(stopped&&drained&&discarded&&lastSample===job.trace.last_tick&&lastSample>=job.trace.required_through_tick);
 function at(t){assert(integer(t)&&t>=first.started_tick&&t<=lastSample);let s=snapshots[0];for(const next of snapshots){if(next.tick>t)break;s=next;}return s.bits;}
 function window(a,b){at(a);at(b);return[{tick:a,bits:at(a)},...snapshots.filter(s=>s.tick>a&&s.tick<=b)];}
 const cases=journal.filter(r=>r.kind==='case');assert(cases.length===job.total&&cases.length===job.spec.cases.length);
 const isolation=[],closed=[],holds=[],settling=[];let previousEnd=first.started_tick;
 for(const [i,c]of cases.entries()){
  const spec=job.spec.cases[i];assert(c.name===spec.name&&c.pass===true&&c.unknown===false);same(c.inputs,spec.inputs);
  assert(integer(c.start_tick)&&integer(c.end_tick)&&c.start_tick>=previousEnd&&c.end_tick-c.start_tick>=200&&c.settled_ticks===c.end_tick-c.start_tick);previousEnd=c.end_tick;
  const obs=c.observation;assert(obs.id===job.circuit_id&&obs.session_id===job.session_id&&obs.tick===c.end_tick&&obs.atomic===true&&obs.phase==='server_task');same(Object.keys(obs.signals),signals.map(s=>s.name));
  const bits={};for(const s of signals){const v=obs.signals[s.name];assert(v.status==='loaded'&&(v.bit===0||v.bit===1)&&v.bit===bit(v.raw,s.property));bits[s.name]=v.bit;}
  for(const bus of design.circuit.buses){const ordered=bus.bits.map(n=>bits[n]);same(obs.buses[bus.name].bits_lsb_first,ordered);assert(obs.buses[bus.name].value===ordered.reduce((n,v,b)=>n+v*2**b,0));}
  assert(matches(bits,spec.expect),'Native endpoint disagrees with expectations');same(c.assertions,Object.entries(spec.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true})));
  same(at(c.end_tick),bits,'Native task and trace endpoint disagree');
  const samples=window(c.start_tick,c.end_tick);
  for(const s of samples)for(const control of ['we','wa','ra'])assert(s.bits['raw_'+control]===Number(c.inputs[control]),`Raw ${control} changed after applied-input checkpoint`);
  let correctSince=c.start_tick;for(let k=0;k<samples.length;k++)if(!matches(samples[k].bits,spec.expect))correctSince=samples[k+1]?.tick??null;
  assert(correctSince!==null);settling.push({case:c.name,after_input_checkpoint_ticks:correctSince-c.start_tick,stable_tail_ticks:c.end_tick-correctSince});
  const prev=cases[i-1];
  if(prev){
   const span=window(prev.end_tick,c.end_tick),old=values(at(prev.end_tick)),oldWe=prev.inputs.we,newWe=c.inputs.we,wa=Number(c.inputs.wa);
   if(oldWe||newWe){
    assert(prev.inputs.wa===c.inputs.wa&&data(prev.inputs)===data(c.inputs),'D/WA changed across open or close write edge');
    const other=1-wa;
    for(const s of span){const v=values(s.bits);assert(v['q'+other]===old['q'+other]&&v['lock'+other]===255,'Unselected word/lock changed during write');assert(v.raw_wa===wa,'Write address changed during write');assert(v.local_d0===data(c.inputs)&&v.local_d1===data(c.inputs),'Staged local data changed during write');}
    if(!oldWe&&newWe)assert(old.lock0===255&&old.lock1===255,'Write opened without both lock buses previously closed');
    if(oldWe&&!newWe)for(const s of span)assert(values(s.bits)['q'+wa]===old['q'+wa],'Selected Q changed while closing same data');
    isolation.push({case:c.name,unselected_word:other,from_tick:prev.end_tick,to_tick:c.end_tick,retained_byte:old['q'+other]});
   }else{
    for(const s of span){const v=values(s.bits);assert(v.raw_we===0&&v.q0===old.q0&&v.q1===old.q1&&v.lock0===255&&v.lock1===255,'Closed word/lock changed during D/WA/RA perturbation');}
    closed.push({case:c.name,from_tick:prev.end_tick,to_tick:c.end_tick,q0:old.q0,q1:old.q1});
   }
   if(c.name.endsWith('_hold_200')){
    assert(prev.name===c.name.replace('_hold_200','_prepare'));same(c.inputs,prev.inputs,'Opposite-data hold must not change any input');
    const q=old['q'+wa];assert(data(c.inputs)===(q^255));
    for(const s of span){const v=values(s.bits);assert(v['local_d'+wa]===(q^255)&&v['q'+wa]===q&&v['lock'+wa]===255,'Actual opposite local-D hold failed');}
    assert(c.end_tick-prev.end_tick>=200);holds.push({case:c.name,word:wa,stored_byte:q,actual_local_data:q^255,from_tick:prev.end_tick,to_tick:c.end_tick,recorded_elapsed_ticks:c.end_tick-prev.end_tick,all_eight_cells:true});
   }
  }
 }
 assert(holds.length===(['pair_55_aa','pair_aa_55'].includes(suite.label)?2:0));
 const end=values(at(lastSample));assert(end.raw_we===0&&end.raw_wa===0&&end.raw_ra===0&&end.local_d0===0&&end.local_d1===0,'Final controls/data did not clear');
 return{status:'native_pair_trace_checks_passed',suite:suite.label,job_id:job.job_id,session_id:job.session_id,trace_id:job.trace.trace_id,cases_passed:cases.length,assertions_passed:cases.reduce((n,c)=>n+c.assertions.length,0),duration_ms:job.duration_ms,trace:{start_tick:first.started_tick,last_tick:lastSample,transition_entries:seq,complete:true,gaps:0,stopped_drained_discarded:true},unselected_isolation_windows:isolation,closed_retention_windows:closed,opposite_data_holds:holds,settling:{basis:'After the sequential inputs were confirmed; not first write or minimum clock.',max_final_correct_offset_ticks:Math.max(...settling.map(s=>s.after_input_checkpoint_ticks)),min_stable_tail_ticks:Math.min(...settling.map(s=>s.stable_tail_ticks)),cases:settling},limits:'End-of-tick sampling cannot exclude within-tick pulses. Raw WE/WA/RA are observed; raw D levers are journal-scoped, with actual normalized D observed at both words. First initialization stage has no prior stable retention checkpoint. Read endpoints pass; combinational read switching is not claimed hazard-free. Input restoration does not clear stored memory.'};
}
export function analyzePairJob(id,{projectRoot=root}={}){
 assert(/^[0-9a-f-]{36}$/.test(id));const state=resolve(projectRoot,'.minecraft-assistant/workshop/tests/runs',id+'.json'),journal=state+'l',job=json(state);assert(job.job_id===id);
 const trace=resolve(projectRoot,'.minecraft-assistant/workshop/circuits',job.trace.trace_id+'.jsonl');assert(resolve(job.artifact)===journal&&resolve(job.trace.artifact)===trace);
 const report=analyzePairEvidence(job,jsonl(journal),jsonl(trace));report.source_sha256=Object.fromEntries([state,journal,trace,fileURLToPath(import.meta.url),resolve(root,'hardware/dense-register-pair.mjs')].map(p=>[p,hash(p)]));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),outAt=args.indexOf('--out');let out;if(outAt>=0){assert(outAt===args.length-2);out=resolve(args.splice(outAt)[1]);}assert(args.length,'Provide completed pair job UUIDs');
 const text=JSON.stringify({status:'native_pair_trace_checks_passed',jobs:args.map(id=>analyzePairJob(id))},null,2)+'\n';if(out)writeFileSync(out,text,{flag:'wx'});process.stdout.write(text);
}
