// Corrupt copies of one completed native recording in memory; never edits its evidence.
// Usage: node scripts/check-workshop-word-analyzer.mjs COMPLETED_JOB_UUID
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeEvidence} from './analyze-workshop-word.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),id=process.argv[2];
assert(/^[0-9a-f-]{36}$/.test(id??''),'Provide a completed workshop job UUID');
const p=resolve(root,'.minecraft-assistant/workshop/tests/runs',id+'.json');
const readRows=p=>readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
const job=JSON.parse(readFileSync(p,'utf8')),journal=readRows(p+'l'),trace=readRows(job.trace.artifact);
const original={job,journal,trace};assert.equal(analyzeEvidence(job,journal,trace).status,'native_trace_checks_passed');
let rejected=0;
function rejects(mutator){const f=structuredClone(original);mutator(f);assert.throws(()=>analyzeEvidence(f.job,f.journal,f.trace));rejected++;}
rejects(f=>{f.job.status='running';});
rejects(f=>{f.job.restore.status='incomplete';});
rejects(f=>{f.trace.at(-1).session_id='wrong';});
rejects(f=>{f.trace.pop();});
rejects(f=>{f.trace.find(r=>r.kind==='poll').gap=true;});
rejects(f=>{f.trace.find(r=>r.kind==='poll').entries[0].missed_ticks=1;});
rejects(f=>{f.trace.find(r=>r.kind==='poll').entries[0].seq++;});
rejects(f=>{f.trace[0].initial_states.pop();});
rejects(f=>{f.journal.find(r=>r.kind==='case').observation.signals.q0.bit=2;});
rejects(f=>{f.journal.find(r=>r.kind==='case').observation.signals.q0.raw='true';});
rejects(f=>{const c=f.journal.find(r=>r.kind==='case'&&r.name.endsWith('_hold_opposite_200'));c.start_tick=c.end_tick-199;});
rejects(f=>{f.job.definition.signals[0].position.x++;});
// Inject one-tick faults inside an otherwise unchanged hold and restore the proper state next tick.
for(const prefix of ['q','output','lock','local_d','raw_d'])for(let bit=0;bit<8;bit++)rejects(f=>{
 const hold=f.journal.find(r=>r.kind==='case'&&r.name.endsWith('_hold_opposite_200'));
 const i=f.job.definition.signals.findIndex(s=>s.name===prefix+bit),signal=f.job.definition.signals[i];
 const expected=prefix==='lock'?1:prefix==='local_d'||prefix==='raw_d'?1-((hold.assertions.find(a=>a.name==='q').expected>>bit)&1):(hold.assertions.find(a=>a.name==='q').expected>>bit)&1;
 const row=structuredClone(f.trace[0].initial_states[i]);
 const raw=v=>signal.property==='power'?String(v*15):String(Boolean(v));
 const mk=(tick,v)=>({seq:0,tick,missed_ticks:0,states:[{...row,properties:{[signal.property]:raw(v)}}]});
 const polls=f.trace.filter(r=>r.kind==='poll'),target=polls.find(r=>r.last_sample_tick>=hold.start_tick+101);
 target.entries.push(mk(hold.start_tick+100,1-expected),mk(hold.start_tick+101,expected));target.entries.sort((a,b)=>a.tick-b.tick);
 let seq=0;for(const page of polls){for(const e of page.entries)e.seq=++seq;page.next_seq=seq;}
 for(const page of polls)page.latest_seq=seq;
});
console.log(JSON.stringify({status:'offline_corruption_checks_passed',positive_native_fixture:id,negative_copies_rejected:rejected,native_calls:0,evidence_writes:0}));
