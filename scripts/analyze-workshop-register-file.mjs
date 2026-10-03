// Offline analysis of saved full-byte bring-up evidence. No services or world calls.
// Usage: node scripts/analyze-workshop-register-file.mjs JOB_UUID... [--out NEW.json]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {makeCompactRegisterFile} from '../hardware/compact-register-file.mjs';
import {makeCompactRegisterFileTests} from '../hardware/compact-register-file-tests.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const prepared='artifacts/compact-register-file-v1',testPrepared='artifacts/compact-register-file-tests-v1';
const same=(a,b,message)=>assert.deepEqual(a,b,message);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const jsonl=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
export const REGISTER_POLICY={variant:'workshop_register28_v1',expected_tps:100,rate_basis:'Fresh native Workshop tick status before each logical call; configured100TPS, not achieved rate',run_budget_ms:65000,restore_budget_ms:28000,trace_cleanup_budget_ms:10000,trace_duration_ticks:12000,trace_buffer_capacity:4096,drain_interval_ms:500,native_run_tick_budget:6500};
function bit(raw,property){
 if(property==='powered'||property==='lit'){assert(['true','false'].includes(String(raw)));return +(String(raw)==='true');}
 assert(property==='power'&&/^(?:[0-9]|1[0-5])$/.test(String(raw)));return +(Number(raw)>0);
}
function values(bits,definition){
 const result={...bits};for(const b of definition.buses)result[b.name]=b.bits.reduce((n,s,i)=>n+bits[s]*2**i,0);return result;
}
// A separate array-of-bits state model checks every prepared expected value.
const pack=bits=>bits.some(v=>v===null)?null:bits.reduce((n,v,b)=>n+v*2**b,0);
const byte=n=>Array.from({length:8},(_,b)=>n===null?null:(n>>b)&1);
const inputsByte=(p,n,width=8)=>Array.from({length:width},(_,b)=>+p[n+b]);
const modelFrom=s=>({q:s.q.map(byte),a:byte(s.a),b:byte(s.b)});
const modelTo=s=>({q:s.q.map(pack),a:pack(s.a),b:pack(s.b)});
export function registerOracleValues(model,p,definition,lane,{rawOnly=false}={}){
 const wa=pack(inputsByte(p,'wa',4)),ra=pack(inputsByte(p,'ra',4)),rd=ra<14?model.q[ra]:byte(ra===14?4:lane),out={};
 for(const sig of definition.signals){const n=sig.name;let v=null,m;
  if(n.startsWith('raw_'))v=+p[n.slice(4)];
  else if(!rawOnly){
   if((m=/^read(\d)$/.exec(n)))v=rd[+m[1]];
   else if((m=/^([ab])(\d)$/.exec(n)))v=model[m[1]][+m[2]];
   else if((m=/^q(\d+)_(\d)$/.exec(n)))v=model.q[+m[1]][+m[2]];
   else if((m=/^local(\d+)_(\d)$/.exec(n)))v=+p[(+m[1]===13?'block':'d')+m[2]];
   else if((m=/^lock(\d+)_(\d)$/.exec(n))&&pack(model.q[+m[1]])!==null)v=+(+m[1]===13?!p.assign:!(p.we&&wa===+m[1]));
   else if((m=/^qualified(\d+)$/.exec(n)))v=+(+m[1]===13?p.assign:p.we&&wa===+m[1]);
   else if((m=/^local_([ab])(\d)$/.exec(n)))v=rd[+m[2]];
   else if((m=/^lock_([ab])(\d)$/.exec(n))&&pack(model[m[1]])!==null)v=+!p['capture_'+m[1]];
  }
  if(v!==null)out[n]=v;
 }
 for(const bus of definition.buses)if(bus.bits.every(n=>n in out))out[bus.name]=bus.bits.reduce((n,k,b)=>n+out[k]*2**b,0);
 return out;
}
export function independentRegisterPlans(design,manifest){
 const state={q:Array.from({length:14},()=>byte(null)),a:byte(null),b:byte(null)},results=[];
 for(const[suiteIndex,suite]of manifest.jobs.entries()){
  same(modelTo(state),suite.entry,'Prepared retained entry differs from prior exit');const vectors=[];
  for(let i=0;i<suite.spec.cases.length;i+=2){const prop=suite.spec.cases[i],test=suite.spec.cases[i+1],p=prop.inputs;assert(test);same(p,test.inputs);
   const before=structuredClone(state),wa=pack(inputsByte(p,'wa',4));if(p.we&&wa<13)state.q[wa]=inputsByte(p,'d');if(p.assign)state.q[13]=inputsByte(p,'block');
   const ra=pack(inputsByte(p,'ra',4)),rd=ra<14?state.q[ra]:byte(ra===14?4:design.lane);if(p.capture_a)state.a=[...rd];if(p.capture_b)state.b=[...rd];
   const rawOnly=suiteIndex<5,e=registerOracleValues(state,p,design.circuits[suite.view],design.lane,{rawOnly});same(test.expect,e,'Independent bit-state oracle mismatch');same(prop.expect,Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_'))));
   vectors.push({before,after:structuredClone(state),inputs:p,expected:e,rawOnly});
  }
  same(modelTo(state),suite.exit);results.push({...suite,index:suiteIndex,vectors});
 }
 assert(modelTo(state).q.every(v=>v===0)&&pack(state.a)===0&&pack(state.b)===0);return results;
}
export function loadRegisterPrepared(projectRoot=root){
 for(const[p,h]of Object.entries({'artifacts/compact-register-file-v1/provenance.json':'b087c16ea5be8088ea8f55c8ef6c7029522739d999c38f9c711b3ecb7e4e6a44','artifacts/compact-register-file-tests-v1/provenance.json':'bc1c699b6db4a9691ba8596e83ff24e46db77888cda1b2b0d35450bccdebf77e'}))assert.equal(hash(resolve(projectRoot,p)),h,'Frozen preparation binding changed');
 const dir=resolve(projectRoot,prepared),p=json(resolve(dir,'provenance.json')),tp=json(resolve(projectRoot,testPrepared,'provenance.json'));
 assert.equal(hash(resolve(projectRoot,p.source)),p.source_sha256);for(const[f,h]of Object.entries(p.dependencies))assert.equal(hash(resolve(projectRoot,f)),h);
 for(const[f,h]of Object.entries(p.files))assert.equal(hash(resolve(dir,f)),h);for(const[f,h]of Object.entries(tp.source_sha256))assert.equal(hash(resolve(projectRoot,f)),h);
 assert.equal(hash(resolve(projectRoot,testPrepared,'tests.json')),tp.tests_sha256);
 const design=json(resolve(dir,'design.json')),tests=json(resolve(projectRoot,testPrepared,'tests.json'));same(design,makeCompactRegisterFile());same(tests,makeCompactRegisterFileTests(design));
 for(const[i,j]of tests.jobs.entries())same(json(resolve(projectRoot,testPrepared,`test-${String(i).padStart(2,'0')}.json`)),j.spec);
 return{design,tests,plans:independentRegisterPlans(design,tests)};
}
export function analyzeRegisterEvidence(job,journal,trace,{prepared:loaded=loadRegisterPrepared()}={}){
 const{design,plans}=loaded;
 assert(job.status==='passed'&&job.failed===0&&job.passed===job.total&&job.completed===job.total,'Job is not completely passed');
 assert(job.spec.trace&&job.spec.restore_inputs&&job.restore?.status==='restored','Trace and restored inputs required');
 const meta=job.trace;assert(meta?.complete===true&&meta.gaps===0&&meta.active===false&&meta.has_more===false&&meta.discarded===true&&meta.end_reason==='stopped'&&!meta.error,'Incomplete recorder lifecycle');
 assert(typeof job.session_id==='string'&&job.session_id);
 const definition=design.circuits.find(d=>d.id===job.circuit_id);assert(definition,'Unknown view');
 same(job.definition,definition);same(job.spec.inputs,design.inputs);
 const suite=plans.find(t=>t.spec.circuit_id===job.circuit_id&&JSON.stringify(t.spec.cases)===JSON.stringify(job.spec.cases));assert(suite,'Unknown test sequence');same(job.spec,suite.spec,'Changed test policy');
 const view=design.circuits.findIndex(d=>d.id===job.circuit_id),signals=definition.signals;
 assert.equal(suite.view,view);const tracedInputs=design.inputs.filter(i=>signals.some(s=>s.name==='raw_'+i.name));
 assert(journal[0]?.kind==='start'&&journal[1]?.kind==='input_baseline'&&journal.at(-1)?.kind==='finish');
 assert(journal.every(r=>['start','input_baseline','input_write_pending','case','finish'].includes(r.kind)));
 for(const kind of['start','input_baseline','finish'])assert.equal(journal.filter(r=>r.kind===kind).length,1);
 same(journal[0].spec,job.spec);same(journal[0].definition,definition);
 same(journal[0].execution_policy,REGISTER_POLICY,'Unreviewed execution policy');same(journal.at(-1).summary.execution_policy,REGISTER_POLICY);if(job.execution_policy)same(job.execution_policy,REGISTER_POLICY);
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
 assert.equal(first.duration_ticks,12000);assert(integer(job.duration_ms)&&job.duration_ms>0); // Total includes separately budgeted restoration/trace cleanup.
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
 assert(cases.at(-1).end_tick-first.started_tick<REGISTER_POLICY.native_run_tick_budget,'Final case exceeded the reserved native run window');
 for(const[i,c]of cases.entries()){
  const spec=job.spec.cases[i];assert(c.name===spec.name&&c.pass===true&&c.unknown===false);same(c.inputs,spec.inputs);
  assert(integer(c.start_tick)&&integer(c.end_tick)&&c.start_tick>=previousEnd&&c.end_tick-c.start_tick>=200&&c.settled_ticks===c.end_tick-c.start_tick);previousEnd=c.end_tick;
  const obs=c.observation;assert(obs.id===job.circuit_id&&obs.session_id===job.session_id&&obs.tick===c.end_tick&&obs.atomic===true&&obs.phase==='server_task');same(Object.keys(obs.signals),signals.map(s=>s.name));
  const bits={};for(const s of signals){const v=obs.signals[s.name];assert(v.status==='loaded'&&(v.bit===0||v.bit===1)&&v.bit===bit(v.raw,s.property));bits[s.name]=v.bit;}
  for(const bus of definition.buses){same(obs.buses[bus.name].bits_lsb_first,bus.bits.map(n=>bits[n]));assert.equal(obs.buses[bus.name].value,values(bits,definition)[bus.name]);}
  assert(matches(bits,spec.expect));same(at(c.end_tick),bits,'Task/trace endpoint mismatch');
  same(c.assertions,Object.entries(spec.expect).map(([name,expected])=>({name,expected,actual:expected,pass:true})));
 }
 const pairs=[],retained=[],captures=[],holds=[];const budgetFailures=[];
 const entryExpected=registerOracleValues(modelFrom(suite.entry),Object.fromEntries(design.inputs.map(i=>[i.name,false])),definition,design.lane,{rawOnly:suite.index<5});
 assert(matches(at(first.started_tick),entryExpected),'Known retained entry disagrees with first native sample');
 for(let i=0;i<cases.length;i+=2){
  const p=cases[i],a=cases[i+1];assert(a);same(p.inputs,a.inputs);
  const vector=suite.vectors[i/2],expected=vector.expected;
  same(job.spec.cases[i+1].expect,expected,'Independent register oracle mismatch');
  same(job.spec.cases[i].expect,Object.fromEntries(Object.entries(expected).filter(([n])=>n.startsWith('raw_'))));
  const span=window(p.start_tick,a.end_tick);
  for(const s of span)for(const input of tracedInputs)assert.equal(s.bits['raw_'+input.name],Number(p.inputs[input.name]),'Raw address changed within the paired wait');
  if(i){const prev=cases[i-1];for(const input of tracedInputs){const before=+prev.inputs[input.name],after=+p.inputs[input.name];let changed=before===after;
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
  const pair={propagation_case:p.name,assertion_case:a.name,start_tick:p.start_tick,propagation_end_tick:p.end_tick,assertion_start_tick:a.start_tick,end_tick:a.end_tick,recorded_window_ticks:a.end_tick-p.start_tick,requested_budget_ticks:400,final_correct_offset_ticks:correctSince-p.start_tick,stable_tail_ticks:a.end_tick-correctSince,correct_then_wrong_events:reversals,timing_budget_passed:late.length===0,incorrect_after_budget:late};
  pairs.push(pair);if(late.length)budgetFailures.push({assertion_case:a.name,events:late});
 }
 // Evaluate retention over the whole previous endpoint -> current endpoint,
 // including the real sequential input writes before each checkpoint.
 for(let i=0;i<cases.length;i++){
  const prev=i?cases[i-1]:{end_tick:first.started_tick,inputs:Object.fromEntries(design.inputs.map(v=>[v.name,false]))},c=cases[i],span=window(prev.end_tick,c.end_tick),old=values(at(prev.end_tick),definition),pi=prev.inputs,ci=c.inputs,priorModel=i?suite.vectors[Math.floor((i-1)/2)].after:modelFrom(suite.entry);
  const wa=p=>pack(inputsByte(p,'wa',4));
  for(const o of['a','b'])if(definition.buses.some(b=>b.name===o)&&pack(priorModel[o])!==null){
   if(!pi['capture_'+o]&&!ci['capture_'+o]){
    for(const s of span){const v=values(s.bits,definition);assert.equal(v[o],old[o],'Closed operand changed during stimulus');if('locks_'+o in v)assert.equal(v['locks_'+o],255);}
    retained.push({kind:'operand',name:o,from_tick:prev.end_tick,to_tick:c.end_tick,value:old[o],locks_observed:Object.hasOwn(old,'locks_'+o)});
   }else{
    assert.equal(pack(inputsByte(pi,'ra',4)),pack(inputsByte(ci,'ra',4)));assert(!pi.we&&!ci.we&&!pi.assign&&!ci.assign);
    if(!pi['capture_'+o]&&'locks_'+o in old)assert.equal(old['locks_'+o],255,'No closed-lock checkpoint before capture');
    for(const s of span){const v=values(s.bits,definition);assert.equal(v.read,old.read,'Read bus changed through capture edge');if('local_'+o in v)assert.equal(v['local_'+o],old.read);if(pi['capture_'+o]&&!ci['capture_'+o])assert.equal(v[o],old[o]);}
    captures.push({operand:o,from_tick:prev.end_tick,to_tick:c.end_tick,source:old.read,action:ci['capture_'+o]?'open':'close',local_d_observed:Object.hasOwn(old,'local_'+o)});
   }
  }
  for(let w=0;w<14;w++){const name=w===13&&definition.buses.some(b=>b.name==='r13')?'r13':'q'+w;if(!(name in old)||pack(priorModel.q[w])===null)continue;
   const active=p=>w===13?p.assign:p.we&&wa(p)===w;
   if(!active(pi)&&!active(ci)||active(pi)&&!active(ci)){
    for(const s of span){const v=values(s.bits,definition);assert.equal(v[name],old[name],'Unselected/closing register changed during input writes');if(!active(pi)&&'locks'+w in v)assert.equal(v['locks'+w],255);}
    retained.push({kind:'register',name,from_tick:prev.end_tick,to_tick:c.end_tick,value:old[name],locks_observed:Object.hasOwn(old,'locks'+w)});
   }
  }
 }
 if(suite.hold){const h=suite.hold,prepare=cases.find(c=>c.name===h.prepare_assertion_case),end=cases.find(c=>c.name===h.unchanged_assertion_case);assert(prepare&&end&&end.end_tick-prepare.end_tick>=200);same(prepare.inputs,end.inputs);
  const e=job.spec.cases.find(c=>c.name===h.unchanged_assertion_case).expect;
  const targets=['a','b',...Array.from({length:14},(_,w)=>'q'+w)].filter(n=>n in e).map(n=>({q:n,local:n==='a'||n==='b'?'local_'+n:'local'+n.slice(1),lock:n==='a'||n==='b'?'locks_'+n:'locks'+n.slice(1)})).filter(t=>t.local in e&&t.lock in e&&e[t.local]===(e[t.q]^255));assert(targets.length,'No actual opposite local-data target');
  for(const t of targets){assert.equal(e[t.lock],255);for(const s of window(prepare.end_tick,end.end_tick)){const v=values(s.bits,definition);assert.equal(v[t.q],e[t.q]);assert.equal(v[t.local],e[t.q]^255);assert.equal(v[t.lock],255);}holds.push({...t,value:e[t.q],actual_local_d:e[t.q]^255,from_tick:prepare.end_tick,to_tick:end.end_tick,recorded_ticks:end.end_tick-prepare.end_tick,all_eight_bits:true});}
 }
 const last=cases.at(-1);assert(Object.values(last.inputs).every(v=>v===false));
 for(const s of window(last.end_tick,lastSample))assert(matches(s.bits,job.spec.cases.at(-1).expect),'Final observed retained state changed during cleanup');
 const timingPassed=budgetFailures.length===0;
 return{status:timingPassed?'native_register_bringup_trace_checks_passed':'native_register_functional_pass_timing_budget_failed',job_id:job.job_id,session_id:job.session_id,suite:suite.label,suite_index:suite.index,group:suite.index<21?'setup':'semantic_cleanup',view,entry:suite.entry,exit:suite.exit,phases_passed:cases.length,assertions_passed:cases.reduce((n,c)=>n+c.assertions.length,0),expected_endpoints_passed:true,raw_only_conditioning:suite.index<5,functional_endpoints_passed:suite.index>=5,duration_ms:job.duration_ms,trace:{trace_id:meta.trace_id,start_tick:first.started_tick,last_tick:lastSample,transition_entries:seq,complete:true,gaps:0,stopped_drained_discarded:true},timing_admission:{requested_ticks:400,passed:timingPassed,failures:budgetFailures,scope:suite.index<5?'Raw-source conditioning only; no electrical-output timing acceptance.':'Only expected known outputs in this view; correctness from checkpoint+400 through assertion endpoint.'},settling:{max_final_correct_offset_ticks:Math.max(...pairs.map(p=>p.final_correct_offset_ticks)),min_stable_tail_ticks:Math.min(...pairs.map(p=>p.stable_tail_ticks)),correct_then_wrong_events:pairs.reduce((n,p)=>n+p.correct_then_wrong_events.length,0),pairs},retention_windows:retained,capture_windows:captures,opposite_local_data_holds:holds,input_restore:{all_twenty_eight_off:true,all_twenty_eight_baseline_and_journal_checked:true,continuously_traced_controls:tracedInputs.map(v=>v.name),untraced_controls:design.inputs.filter(i=>!tracedInputs.includes(i)).map(v=>v.name),all_twenty_eight_continuously_sampled:tracedInputs.length===28,observed_controls_stable_through_pairs:true},limits:'No native claim from software fixtures. Unobserved raw controls have guarded input/journal evidence, not pulse-absence proof. Only known observed retained bytes are checked at entry/exit. End-of-tick samples do not exclude within-tick pulses; multiple views are not simultaneous. Manual old-R13 sequencing is not controller acceptance. Geometry, pins/save/reload and whole-GPU behavior are separate gates.'};
}
export function registerTracePath(stateDir,traceId){
 assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(traceId),'Exact recorder UUID required');
 return resolve(stateDir,'circuits',traceId+'.jsonl');
}
export function analyzeRegisterJob(id,{projectRoot=root,stateRoot='.minecraft-assistant/workshop/full-byte-28'}={}){
 assert(/^[0-9a-f-]{36}$/.test(id));const state=resolve(projectRoot,stateRoot,'tests/runs',id+'.json'),journal=state+'l',job=json(state);assert.equal(job.job_id,id);
 const trace=registerTracePath(resolve(projectRoot,stateRoot),job.trace.trace_id);assert(resolve(job.artifact)===journal&&resolve(job.trace.artifact)===trace);
 const report=analyzeRegisterEvidence(job,jsonl(journal),jsonl(trace),{prepared:loadRegisterPrepared(projectRoot)});
 report.source_sha256=Object.fromEntries([state,journal,trace,fileURLToPath(import.meta.url),resolve(projectRoot,'hardware/compact-register-file.mjs'),resolve(projectRoot,'hardware/compact-register-file-tests.mjs'),resolve(projectRoot,prepared,'provenance.json'),resolve(projectRoot,prepared,'design.json'),resolve(projectRoot,testPrepared,'tests.json'),resolve(projectRoot,testPrepared,'provenance.json')].map(p=>[p,hash(p)]));return report;
}
export function summarizeRegisterJobs(jobs,{prepared:loaded=loadRegisterPrepared()}={}){
 assert(jobs.length&&new Set(jobs.map(j=>j.job_id)).size===jobs.length&&new Set(jobs.map(j=>j.suite)).size===jobs.length);assert.equal(new Set(jobs.map(j=>j.session_id)).size,1);
 const ordered=[...jobs].sort((a,b)=>a.suite_index-b.suite_index);for(const[j,r]of ordered.entries()){const s=loaded.plans[r.suite_index];assert(s&&s.label===r.suite);same(r.entry,s.entry);same(r.exit,s.exit);if(j&&ordered[j-1].suite_index+1===r.suite_index){same(ordered[j-1].exit,r.entry);assert(ordered[j-1].trace.last_tick<=r.trace.start_tick,'Native jobs are not in retained-state order');}}
 const complete=ordered.length===42&&ordered.every((j,i)=>j.suite_index===i),timing=jobs.every(j=>j.timing_admission.passed),sum=list=>({jobs:list.length,phases:list.reduce((n,j)=>n+j.phases_passed,0),expectations:list.reduce((n,j)=>n+j.assertions_passed,0)});
 return{status:complete&&timing?'native_register_directed_bringup_trace_checks_passed':'native_register_partial_or_timing_rejected',campaign_complete:complete,timing_admission_passed:timing,session_id:jobs[0].session_id,setup:sum(jobs.filter(j=>j.group==='setup')),semantic_cleanup:sum(jobs.filter(j=>j.group==='semantic_cleanup')),total:sum(jobs),whole_architecture_accepted:false,retained_state_chain_complete:complete,missing_suites:loaded.plans.filter(s=>!jobs.some(j=>j.suite===s.label)).map(s=>s.label),jobs:ordered};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2);let out,stateRoot;for(const flag of['--out','--state-dir']){const i=args.indexOf(flag);if(i>=0){assert(args[i+1]);const v=args.splice(i,2)[1];if(flag==='--out')out=resolve(v);else stateRoot=v;}}assert(args.length);const report=summarizeRegisterJobs(args.map(id=>analyzeRegisterJob(id,{stateRoot}))),text=JSON.stringify(report,null,2)+'\n';if(out)writeFileSync(out,text,{flag:'wx'});process.stdout.write(text);if(!report.timing_admission_passed)process.exitCode=2;}
