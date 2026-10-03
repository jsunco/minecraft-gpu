// Separate signature catalog adapter over the unchanged reviewed native trace core.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DIR,ROOT,sha,readDesign,provenance} from './prepare.mjs';
import {checkCatalog} from './check-offline.mjs';
import {analyzeRegisterEvidence,registerOracleValues,registerTracePath,analyzeRegisterJob,summarizeRegisterJobs} from '../../scripts/analyze-workshop-register-file.mjs';

export const STATE=join(ROOT,'.minecraft-assistant/workshop/register-signatures-v1');
export const json=p=>JSON.parse(readFileSync(p)),lines=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const byte=n=>Array.from({length:8},(_,b)=>Math.floor(n/2**b)%2),pack=b=>b.reduce((n,v,i)=>n+v*2**i,0),toBits=s=>({q:s.q.map(byte),a:byte(s.a),b:byte(s.b)});
const toBytes=s=>({q:s.q.map(pack),a:pack(s.a),b:pack(s.b)}),clone=structuredClone;
export function plansFor(design,catalog){
 checkCatalog(catalog,design);let model=toBits(catalog.initial_state);return catalog.jobs.map((suite,index)=>{
  assert.deepEqual(toBytes(model),suite.entry);const vectors=[];
  for(let i=0;i<suite.spec.cases.length;i+=2){const p=suite.spec.cases[i].inputs,before=clone(model),num=(k,n=8)=>pack(Array.from({length:n},(_,b)=>+p[k+b])),wa=num('wa',4),ra=num('ra',4);
   if(p.we&&wa<13)model.q[wa]=Array.from({length:8},(_,b)=>+p['d'+b]);if(p.assign)model.q[13]=Array.from({length:8},(_,b)=>+p['block'+b]);
   const rd=ra<14?model.q[ra]:byte(ra===14?4:design.lane);for(const n of['a','b'])if(p['capture_'+n])model[n]=[...rd];
   vectors.push({before,after:clone(model),inputs:p,expected:registerOracleValues(model,p,design.circuits[suite.view],design.lane),rawOnly:false});
  }assert.deepEqual(toBytes(model),suite.exit);return{...suite,index:42+index,signature_index:index,vectors};
 });
}
export function loadPrepared(){
 const design=readDesign(),catalog=json(join(DIR,'catalog.json'));assert.deepEqual(json(join(DIR,'provenance.json')),provenance());
 for(const[i,j]of catalog.jobs.entries())assert.deepEqual(json(join(DIR,`test-${String(i).padStart(2,'0')}.json`)),j.spec);
 return{design,catalog,plans:plansFor(design,catalog)};
}
export function checkIntegrationSources({requireReview=false}={}){
 const manifest=json(join(DIR,'integration-provenance.json'));
 for(const[p,h]of Object.entries(manifest.source_sha256))assert.equal(sha(resolve(ROOT,p)),h,'Changed integration source '+p);
 if(requireReview){const r=json(join(DIR,'integration-independent-review.json'));assert.equal(r.status,'independently_cleared_offline');assert.equal(r.manifest_sha256,sha(join(DIR,'integration-provenance.json')));assert.deepEqual(r.source_sha256,manifest.source_sha256);}
 return manifest;
}
export function analyzeEvidence(job,journal,trace,prepared=loadPrepared(),index){
 assert(Number.isInteger(index)&&index>=0&&index<66,'Explicit catalog index required: some read protocols are intentionally identical');
 const plan=prepared.plans[index];assert.deepEqual(job.spec,plan.spec);
 const r=analyzeRegisterEvidence(job,journal,trace,{prepared:{...prepared,plans:[plan]}});const i=r.suite_index-42,s=prepared.catalog.jobs[i];assert.equal(i,index);assert(s&&s.label===r.suite);assert(r.functional_endpoints_passed&&!r.raw_only_conditioning);
 return{...r,status:r.timing_admission.passed?'native_register_signature_trace_checks_passed':'native_register_signature_timing_rejected',signature_index:i,signature_family:s.family,group:'signature_campaign',scope:s.observation_scope,signature_campaign_complete:false,whole_architecture_accepted:false};
}
export function analyzeSavedJob(id,prepared=loadPrepared(),index){
 assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id));
 const meta=join(STATE,'tests/runs',id+'.json'),journal=meta+'l',job=json(meta);assert.equal(job.job_id,id);const trace=registerTracePath(STATE,job.trace.trace_id);
 assert.equal(resolve(job.artifact),journal);assert.equal(resolve(job.trace.artifact),trace);
 const report=analyzeEvidence(job,lines(journal),lines(trace),prepared,index);report.source_sha256=Object.fromEntries([meta,journal,trace].map(p=>[p,sha(p)]));return report;
}
export function summarize(reports,prepared=loadPrepared()){
 assert(reports.length>0);const seen=new Set(),ids=new Set();let previous=null;
 for(const r of reports){const s=prepared.catalog.jobs[r.signature_index];assert(s&&r.suite===s.label&&r.suite_index===42+r.signature_index);assert(!seen.has(r.signature_index)&&!ids.has(r.job_id));seen.add(r.signature_index);ids.add(r.job_id);
  assert.equal(r.phases_passed,s.spec.cases.length);assert.equal(r.assertions_passed,s.spec.cases.reduce((n,c)=>n+Object.keys(c.expect).length,0));assert.deepEqual(r.entry,s.entry);assert.deepEqual(r.exit,s.exit);assert.deepEqual(r.scope,s.observation_scope);
  assert(r.expected_endpoints_passed&&r.functional_endpoints_passed&&!r.raw_only_conditioning&&r.trace.complete&&r.trace.stopped_drained_discarded&&r.input_restore.all_twenty_eight_off);
  if(previous){assert(r.signature_index>previous.signature_index,'Input report order must be native order');assert.equal(r.session_id,previous.session_id);assert(r.trace.start_tick>=previous.trace.last_tick);if(r.signature_index===previous.signature_index+1)assert.deepEqual(previous.exit,r.entry);}previous=r;
 }
 const complete=reports.length===prepared.catalog.jobs.length&&reports.every((r,i)=>r.signature_index===i),timing=reports.every(r=>r.timing_admission.passed);
 return{status:complete&&timing?'native_register_signature_campaign_trace_checks_passed':'native_register_signature_campaign_partial_or_timing_rejected',signature_trace_campaign_complete:complete&&timing,signature_campaign_complete:false,native_admission_verified:false,retained_state_chain_complete:complete,timing_admission_passed:timing,session_id:reports[0].session_id,counts:{jobs:reports.length,phases:reports.reduce((n,r)=>n+r.phases_passed,0),expectations:reports.reduce((n,r)=>n+r.assertions_passed,0)},
  coverage:{ordinary_words_written_both_patterns:complete?13:null,read_all16_after_each_pattern:complete,protected_write_attempts:complete?[13,14,15]:[],all_storage_and_operands_final_zero:complete,all_q_simultaneous:false,actual_local_d_holds:false,arbitrary_within_word_bit_permutations_excluded:false},
  missing_indexes:prepared.catalog.jobs.filter(j=>!seen.has(j.index)).map(j=>j.index),jobs:reports,whole_architecture_accepted:false,limits:'Only sampled view scopes and end-of-tick traces; no local-D/lock hold claim, no simultaneous whole-file Q observation, no general200tick bound, no controller/ISA or eight-lane acceptance.'};
}
export function validateBringupSummary(report,session){
 assert.equal(report.status,'native_register_directed_bringup_trace_checks_passed');assert(report.campaign_complete&&report.timing_admission_passed&&report.retained_state_chain_complete);assert.equal(report.session_id,session);
 assert.deepEqual(report.total,{jobs:42,phases:332,expectations:13088});assert.equal(report.jobs.length,42);assert(report.jobs.every((j,i)=>j.suite_index===i&&j.session_id===session&&j.timing_admission.passed));
 const last=report.jobs.at(-1);assert.deepEqual(last.exit,{q:Array(14).fill(0),a:0,b:0});assert(last.input_restore.all_twenty_eight_off&&last.trace.stopped_drained_discarded&&last.trace.complete);return last;
}
// The first signature admission reconstructs all original jobs from their real files.
// Later admissions hash-check this immutable receipt and reanalyze only their predecessor.
export function bringupEvidence(path,session,{replay=true}={}){
 const report=json(path),last=validateBringupSummary(report,session),sources={[resolve(path)]:sha(path)};
 for(const r of report.jobs){assert(r.source_sha256&&Object.keys(r.source_sha256).length>=3);for(const[p,h]of Object.entries(r.source_sha256)){assert.equal(sha(p),h);sources[p]=h;}}
 if(replay){const actual=summarizeRegisterJobs(report.jobs.map(r=>analyzeRegisterJob(r.job_id,{stateRoot:'.minecraft-assistant/workshop/register-file28'})));assert.deepEqual(actual,report,'Original42 report must regenerate identically');}
 return{report_path:resolve(path),report_sha256:sha(path),session_id:session,last_tick:last.trace.last_tick,source_sha256:sources};
}
export function validateAttemptRecords(attempt,entry,result){
 assert.deepEqual(attempt.filter(r=>r.kind==='entry_read').map(r=>r.value),entry.reads,'Fresh entry must belong to this exact raw attempt');
 const rows=attempt.filter(r=>r.kind==='result');assert.equal(rows.length,1);assert.deepEqual(rows[0].value,result);
}
export async function summarizeSaved(indexes){
 assert(indexes.every(i=>Number.isInteger(i)&&i>=0&&i<66));
 const manifest=checkIntegrationSources({requireReview:true}),prepared=loadPrepared(),reports=indexes.map(i=>analyzeSavedJob(json(join(STATE,`case-${String(i).padStart(2,'0')}-result.json`)).result.job_id,prepared,i)),summary=summarize(reports,prepared),source_sha256={...manifest.source_sha256};
 const {validateEntryReads}=await import('./run-one.mjs');let predecessor=null,bringup=null;
 for(const r of reports){const index=r.signature_index,base=join(STATE,`case-${String(index).padStart(2,'0')}`),rp=base+'-result.json',receipt=json(rp),started=json(base+'-started.json');
  assert.equal(receipt.index,index);assert.equal(receipt.result.job_id,r.job_id);assert.equal(receipt.expected_session,r.session_id);assert.equal(receipt.manifest_sha256,sha(join(DIR,'integration-provenance.json')));assert.deepEqual(receipt.source_sha256,manifest.source_sha256);assert.deepEqual(receipt.retained_entry,r.entry);assert.deepEqual(receipt.retained_exit,r.exit);
  assert.equal(started.index,index);assert.equal(started.attempt,receipt.attempt);assert.equal(started.expected_session,r.session_id);assert.equal(started.manifest_sha256,receipt.manifest_sha256);assert.deepEqual(started.bringup,receipt.bringup);
  assert.equal(receipt.analysis_path,base+'-analysis.json');assert.equal(receipt.analysis_sha256,sha(receipt.analysis_path));assert.deepEqual(json(receipt.analysis_path),r);
  if(!bringup)bringup=bringupEvidence(receipt.bringup.report_path,r.session_id);assert.deepEqual(receipt.bringup,bringup);
  assert.equal(receipt.entry_path,base+'-entry.json');assert.equal(receipt.entry_sha256,sha(receipt.entry_path));const entry=json(receipt.entry_path),attempt=lines(receipt.attempt);
  validateAttemptRecords(attempt,entry,receipt.result);assert.deepEqual(json(base+'-raw-result.json'),receipt.result);
  const minTick=predecessor?predecessor.trace.last_tick:bringup.last_tick;assert.deepEqual(entry.summary,validateEntryReads(entry.reads,prepared.design,r.entry,r.session_id,minTick));assert(r.trace.start_tick>=entry.summary.last_tick);
  if(index===0)assert.equal(receipt.previous_result_sha256,null);else assert.equal(receipt.previous_result_sha256,sha(join(STATE,`case-${String(index-1).padStart(2,'0')}-result.json`)));
  for(const p of[rp,base+'-started.json',base+'-raw-result.json',receipt.entry_path,receipt.analysis_path,receipt.attempt])source_sha256[p]=sha(p);Object.assign(source_sha256,r.source_sha256);predecessor=r;
 }
 Object.assign(source_sha256,bringup.source_sha256);summary.native_admission_verified=true;summary.signature_campaign_complete=summary.signature_trace_campaign_complete;summary.status=summary.signature_campaign_complete?'native_register_signature_campaign_checks_passed':'native_register_signature_campaign_partial_or_timing_rejected';summary.source_sha256=source_sha256;return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),oi=args.indexOf('--out');let out;if(oi>=0){out=args[oi+1];args.splice(oi,2);}assert(args.length&&args.every(a=>/^\d{1,2}$/.test(a)));const r=await summarizeSaved(args.map(Number)),s=JSON.stringify(r,null,2)+'\n';if(out)writeFileSync(out,s,{flag:'wx'});process.stdout.write(s);if(!r.timing_admission_passed)process.exitCode=2;}
