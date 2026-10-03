// Independent bit-array state oracle and finite prepared-spec checks. No native I/O.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DIR,ROOT,readDesign,makeCampaign,outputObjects,provenance} from './prepare.mjs';
import {registerOracleValues} from '../../scripts/analyze-workshop-register-file.mjs';
import {testRunSchema} from '../runner-input-capacity-v1/test-runner-service.mjs';

const byte=n=>Array.from({length:8},(_,b)=>Math.floor(n/2**b)%2),pack=b=>b.reduce((s,v,i)=>s+v*2**i,0);
const stateBytes=s=>({q:s.q.map(pack),a:pack(s.a),b:pack(s.b)}),clone=structuredClone;
export function checkCatalog(t,d){
 assert.equal(t.status,'proposed_offline_signature_campaign_native_unverified');assert.equal(t.lane,1);
 assert.equal(t.jobs.length,66);assert.equal(t.prerequisite.receipt,null);assert.equal(t.prerequisite.native_gate_implemented,false);
 assert.equal(t.temporal_contract.measured_timing,false);assert.equal(t.whole_architecture_accepted,false);
 const state={q:Array.from({length:14},()=>byte(0)),a:byte(0),b:byte(0)},zero=Object.fromEntries(d.inputs.map(i=>[i.name,false]));
 const num=(p,k,n=8)=>pack(Array.from({length:n},(_,b)=>+p[k+b]));
 let expectations=0,phases=0,vectors=0,storedRetentionPredicates=0;
 assert.deepEqual(t.initial_state,stateBytes(state));
 const independentSignatures=Array.from({length:13},(_,w)=>(83+37*w)%256),independentComplements=independentSignatures.map(v=>255-v);
 assert.deepEqual(t.signatures,independentSignatures);assert.deepEqual(t.complements,independentComplements);
 assert.equal(new Set(t.signatures).size,13);assert(t.signatures.every(v=>v!==0&&v!==255));
 const columnSignatures=Array.from({length:8},(_,b)=>pack(t.signatures.map(v=>byte(v)[b])));
 assert.equal(new Set(columnSignatures.flatMap(v=>[v,v^8191])).size,16,'No constant, duplicated or complementary bit columns');
 assert(columnSignatures.every(v=>v!==0&&v!==8191));
 for(const[index,j]of t.jobs.entries()){
  assert.equal(j.index,index);assert.deepEqual(j.entry,stateBytes(state));const spec=testRunSchema.parse(j.spec),view=d.circuits[j.view];
  assert.deepEqual(spec.inputs,d.inputs);assert.equal(spec.circuit_id,view.id);assert(spec.cases.length>0&&spec.cases.length<=10&&spec.cases.length%2===0);
  assert.equal(spec.settle_ticks,200);assert.equal(spec.timeout_ms,65000);assert(spec.trace&&spec.restore_inputs&&spec.stop_on_failure);
  const raw=view.signals.filter(s=>s.name.startsWith('raw_')).map(s=>s.name.slice(4)),stored=view.signals.filter(s=>/^(?:[ab]\d|q\d+_\d)$/.test(s.name)).map(s=>s.name);
  assert.deepEqual(j.observation_scope,{raw_controls:raw,stored_signals:stored,actual_local_d_observed:false,local_locks_observed:false});
  let prior={...zero},writes=0;for(const c of spec.cases)for(const n of Object.keys(prior)){writes+=Number(prior[n]!==c.inputs[n]);prior[n]=c.inputs[n];}assert.equal(j.logical_input_writes,writes);prior={...zero};
  for(let ci=0;ci<spec.cases.length;ci+=2){
   const prop=spec.cases[ci],last=spec.cases[ci+1],p=prop.inputs;
   assert.equal(prop.name,`v${ci/2}_propagate`);assert.equal(last.name,`v${ci/2}_assert`);assert.deepEqual(last.inputs,p);assert.deepEqual(Object.keys(p).sort(),Object.keys(zero).sort());assert(Object.values(p).every(v=>typeof v==='boolean'));
   if(prior.we)for(const name of Object.keys(p).filter(k=>/^(?:wa|d)\d$/.test(k)))assert.equal(p[name],prior[name],'WE must close on unchanged WA/D');
   if(prior.assign)for(let b=0;b<8;b++)assert.equal(p['block'+b],prior['block'+b]);
   if(prior.capture_a||prior.capture_b){for(let b=0;b<4;b++)assert.equal(p['ra'+b],prior['ra'+b]);assert(!p.we&&!p.assign);}
   if(p.capture_a||p.capture_b)assert(!p.we&&!p.assign);
   const before=clone(state),wa=num(p,'wa',4),ra=num(p,'ra',4);
   if(p.we&&wa<=12)for(let b=0;b<8;b++)state.q[wa][b]=+p['d'+b];
   if(p.assign)for(let b=0;b<8;b++)state.q[13][b]=+p['block'+b];
   const bus=ra<14?state.q[ra]:byte(ra===14?4:d.lane);
   for(const which of['a','b'])if(p['capture_'+which])state[which]=[...bus];
   const e=registerOracleValues(state,p,view,d.lane);
   assert.equal(Object.keys(e).length,view.signals.length+view.buses.length,'Every observed value expected');
   assert.deepEqual(last.expect,e,'Independent bit-array oracle mismatch');assert.deepEqual(prop.expect,Object.fromEntries(raw.map(n=>['raw_'+n,+p[n]])));
   for(const n of stored){const q=/^q(\d+)_(\d)$/.exec(n),a=/^([ab])(\d)$/.exec(n);const writable=q?(+q[1]===13?p.assign:p.we&&wa===+q[1]):p['capture_'+a[1]];if(!writable){const old=q?before.q[+q[1]][+q[2]]:before[a[1]][+a[2]];assert.equal(e[n],old);storedRetentionPredicates++;}}
   expectations+=Object.keys(prop.expect).length+Object.keys(last.expect).length;phases+=2;vectors++;prior=p;
  }
  assert.deepEqual(prior,zero);assert.deepEqual(j.exit,stateBytes(state));
 }
 for(const[family,values,viewKind]of[['signature_write',independentSignatures,'main'],['complement_write',independentComplements,'group'],['cleanup_write',Array(13).fill(0),'group']]){
  const js=t.jobs.filter(j=>j.family===family);assert.equal(js.length,13);assert.deepEqual(js.map(j=>j.write_address),Array.from({length:13},(_,w)=>w));
  for(const[w,j]of js.entries()){assert.equal(j.write_value,values[w]);assert.equal(j.view,viewKind==='main'?0:4+Math.floor(w/4));assert.equal(j.spec.cases.length,8);const open=j.spec.cases[3];assert(open.inputs.we);assert.equal(num(open.inputs,'wa',4),w);assert.equal(num(open.inputs,'ra',4),w);assert.equal(num(open.inputs,'d'),values[w]);}
 }
 for(const family of['signature_read','complement_read','protection_read','cleanup_read']){
  const js=t.jobs.filter(j=>j.family===family);assert.equal(js.length,4);assert.deepEqual(js.flatMap(j=>j.read_addresses),Array.from({length:16},(_,i)=>i));
  for(const j of js){assert.equal(j.view,0);assert.equal(j.spec.cases.length,10);for(const[i,ra]of j.read_addresses.entries()){const c=j.spec.cases[2*i+1];assert.equal(num(c.inputs,'ra',4),ra);assert(!c.inputs.we&&!c.inputs.assign&&!c.inputs.capture_a&&!c.inputs.capture_b);assert.equal(num(c.inputs,'d'),0);assert.equal(num(c.inputs,'block'),0);}}
 }
 const protection=t.jobs.filter(j=>j.family==='protection');assert.deepEqual(protection.map(j=>j.write_address),[13,14,15]);for(const j of protection)assert.deepEqual(j.entry,j.exit);
 const firstSignature=t.jobs.find(j=>j.family==='signature_write');assert.equal(firstSignature.entry.a,166);assert.equal(firstSignature.entry.b,89);assert.equal(firstSignature.entry.q[13],150);
 for(const j of t.jobs.filter(j=>!['seed','cleanup_retained','cleanup_read'].includes(j.family))){assert.equal(j.exit.a,166);assert.equal(j.exit.b,89);assert.equal(j.exit.q[13],150);}
 assert.deepEqual(stateBytes(state),t.initial_state);assert.deepEqual(t.final_state,t.initial_state);
 assert.equal(t.counts.jobs,t.jobs.length);assert.equal(t.counts.phases,phases);assert.equal(t.counts.expectations,expectations);assert.equal(t.counts.max_phases,10);assert.equal(t.counts.max_requested_ticks,2000);
 for(const[family,c]of Object.entries(t.families)){const js=t.jobs.filter(j=>j.family===family);assert.deepEqual(c,{jobs:js.length,phases:js.reduce((n,j)=>n+j.spec.cases.length,0),expectations:js.reduce((n,j)=>n+j.spec.cases.reduce((n,c)=>n+Object.keys(c.expect).length,0),0)});}
 assert.equal(t.counts.max_logical_input_writes,Math.max(...t.jobs.map(j=>j.logical_input_writes)));
 return{jobs:t.jobs.length,phases,expectations,vectors,stored_retention_predicates_for_future_native_analysis:storedRetentionPredicates,distinct_signature_bytes:13,distinct_or_complement_bit_columns:16,read_addresses_per_pattern:16,phase_limit:10,requested_ticks_limit:2000,max_logical_input_writes:t.counts.max_logical_input_writes,controls:28};
}
export function checkPrepared(){
 const d=readDesign(),t=makeCampaign(d),result=checkCatalog(t,d);
 for(const[p,o]of Object.entries(outputObjects()))assert.deepEqual(JSON.parse(readFileSync(join(DIR,p))),o);
 assert.deepEqual(JSON.parse(readFileSync(join(DIR,'provenance.json'))),provenance());
 let negatives=0;const reject=fn=>{const copy=clone(t);fn(copy);assert.throws(()=>checkCatalog(copy,d));negatives++;};
 reject(c=>c.jobs.pop());reject(c=>c.jobs[6].entry.q[1]=1);reject(c=>c.jobs[5].spec.cases[3].expect.read=0);
 reject(c=>c.jobs[5].spec.cases[4].inputs.d0=!c.jobs[5].spec.cases[4].inputs.d0);
 reject(c=>{delete c.jobs[0].spec.cases[0].inputs.d7;});reject(c=>c.jobs[0].spec.settle_ticks=199);
 reject(c=>c.jobs[0].spec.cases.push(...clone(c.jobs[0].spec.cases)));reject(c=>c.jobs[0].spec.restore_inputs=false);
 reject(c=>c.jobs[0].spec.cases.at(-1).inputs.we=true);reject(c=>c.jobs[0].exit.q[0]=1);
 reject(c=>c.jobs.find(j=>j.family==='protection').exit.q[13]=255);
 reject(c=>c.jobs.find(j=>j.family==='signature_read').read_addresses[3]=2);
 reject(c=>c.jobs.find(j=>j.family==='complement_write').view=0);
 reject(c=>c.jobs[5].observation_scope.actual_local_d_observed=true);
 reject(c=>c.jobs[5].exit.a=0);reject(c=>c.final_state.q[12]=1);reject(c=>c.prerequisite.receipt='invented-pass');
 return{status:'offline_specs_and_independent_bit_oracle_pass_native_unverified',...result,negative_cases:negatives,exact_output_regeneration:true,unchanged_design_and_original42_pinned:true,schema_only_no_constructors:true,native_calls:0,native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){assert(process.argv.length===2||['--check-only','--save'].includes(process.argv[2]));const r=checkPrepared();if(process.argv[2]==='--save')writeFileSync(join(DIR,'offline-check.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(r));}
