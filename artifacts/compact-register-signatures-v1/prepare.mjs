// Offline specification preparation only. No services, recorder or native transport.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeCompactRegisterFile} from '../../hardware/compact-register-file.mjs';

export const DIR=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(DIR,'../..');
export const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export const PINS={
 'hardware/compact-register-file.mjs':'ef171a45303020943bfe938f50eeaa9ad033d6a3bc3ce4b9b1f0d260ab9171bd',
 'artifacts/compact-register-file-v1/design.json':'478858635d907e74c9760614e5154a2c00e5a9d5bf8bf301c7849933655017b4',
 'artifacts/compact-register-file-v1/provenance.json':'b087c16ea5be8088ea8f55c8ef6c7029522739d999c38f9c711b3ecb7e4e6a44',
 'hardware/compact-register-file-tests.mjs':'9251393fe3b5cb9f58ea56fa95a5ea6d5a2c3fc376d910dd9f4ffd423d92a0c0',
 'artifacts/compact-register-file-tests-v1/tests.json':'ec5545b8c173e8dcd73cb6993864f1434f5efecf97417a20aeca1647b7836af6',
 'scripts/analyze-workshop-register-file.mjs':'4a42f61ac2cf2e0d9b75c534a09984363e40283f676e84da324c2d5f176e802c',
 'scripts/workshop-register-runner.mjs':'b932ec8345822d1f6fce8d5d67c072d01b8539a328920c8bb977abf626cfe863',
 'artifacts/runner-input-capacity-v1/test-runner-service.mjs':'60e002651acbec6d2652c44f1b132520feb984bf8edd55dca988cf0fd2eb3fe8',
};
export function readDesign(){
 for(const[p,h]of Object.entries(PINS))assert.equal(sha(resolve(ROOT,p)),h,'Frozen dependency '+p);
 const provenance=JSON.parse(readFileSync(resolve(ROOT,'artifacts/compact-register-file-v1/provenance.json')));
 for(const[p,h]of Object.entries(provenance.dependencies))assert.equal(sha(resolve(ROOT,p)),h);
 const d=JSON.parse(readFileSync(resolve(ROOT,'artifacts/compact-register-file-v1/design.json')));assert.deepEqual(d,makeCompactRegisterFile());return d;
}
export function makeCampaign(d=readDesign()){
 const clone=structuredClone,zero=Object.fromEntries(d.inputs.map(i=>[i.name,false]));
 const state={q:Array(14).fill(0),a:0,b:0},initial=clone(state),jobs=[];
 const signatures=Array.from({length:13},(_,w)=>(83+37*w)&255),complements=signatures.map(v=>v^255);
 function pins(v){const p={...zero};for(const[k,x]of Object.entries(v)){if(['d','block','wa','ra'].includes(k)){const bits=['d','block'].includes(k)?8:4;assert(Number.isInteger(x)&&x>=0&&x<2**bits);for(let b=0;b<bits;b++)p[k+b]=!!(x&(1<<b));}else{assert(k in p&&typeof x==='boolean');p[k]=x;}}return p;}
 const num=(p,k,n=8)=>Array.from({length:n},(_,b)=>Number(p[k+b])*2**b).reduce((a,b)=>a+b,0);
 const read=p=>{const a=num(p,'ra',4);return a<14?state.q[a]:a===14?4:d.lane;};
 function expected(p,view){const e={},wa=num(p,'wa',4),rd=read(p);for(const s of view.signals){let n=s.name,m,v;
  if(n.startsWith('raw_'))v=Number(p[n.slice(4)]);
  else if((m=/^read(\d)$/.exec(n)))v=(rd>>+m[1])&1;
  else if((m=/^([ab])(\d)$/.exec(n)))v=(state[m[1]]>>+m[2])&1;
  else if((m=/^q(\d+)_(\d)$/.exec(n)))v=(state.q[+m[1]]>>+m[2])&1;
  else if((m=/^qualified(\d+)$/.exec(n)))v=Number(+m[1]===13?p.assign:p.we&&wa===+m[1]);
  else assert.fail('Unexpected signature-view signal '+n);
  e[n]=v;
 }for(const b of view.buses)e[b.name]=b.bits.reduce((n,k,i)=>n+e[k]*2**i,0);return e;}
 function add(label,family,viewIndex,vectors,detail={}){
  assert(vectors.length>0&&vectors.length<=5);const view=d.circuits[viewIndex],entry=clone(state),cases=[];let prior=zero;
  for(const[i,v]of vectors.entries()){
   const p=pins(v);if(prior.we)for(const k of Object.keys(p).filter(k=>/^(wa|d)\d$/.test(k)))assert.equal(p[k],prior[k]);
   if(prior.assign)for(let b=0;b<8;b++)assert.equal(p['block'+b],prior['block'+b]);
   if(prior.capture_a||prior.capture_b){for(let b=0;b<4;b++)assert.equal(p['ra'+b],prior['ra'+b]);assert(!p.we&&!p.assign);}
   if(p.capture_a||p.capture_b)assert(!p.we&&!p.assign);
   const wa=num(p,'wa',4);if(p.we&&wa<13)state.q[wa]=num(p,'d');if(p.assign)state.q[13]=num(p,'block');
   if(p.capture_a)state.a=read(p);if(p.capture_b)state.b=read(p);
   const e=expected(p,view),raw=Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_')));
   cases.push({name:`v${i}_propagate`,inputs:p,expect:raw},{name:`v${i}_assert`,inputs:{...p},expect:e});prior=p;
  }
  assert.deepEqual(prior,zero,'Each job returns all28 controls off');
  let commanded={...zero},logicalWrites=0;for(const c of cases)for(const n of Object.keys(commanded)){logicalWrites+=Number(commanded[n]!==c.inputs[n]);commanded[n]=c.inputs[n];}
  jobs.push({index:jobs.length,label,family,view:viewIndex,entry,exit:clone(state),logical_input_writes:logicalWrites,...detail,
   observation_scope:{raw_controls:view.signals.filter(s=>s.name.startsWith('raw_')).map(s=>s.name.slice(4)),stored_signals:view.signals.filter(s=>/^(?:[ab]\d|q\d+_\d)$/.test(s.name)).map(s=>s.name),actual_local_d_observed:false,local_locks_observed:false},
   spec:{circuit_id:view.id,inputs:clone(d.inputs),cases,settle_ticks:200,timeout_ms:65000,stop_on_failure:true,restore_inputs:true,trace:true}});
 }
 const write=(label,family,w,value,view=0)=>add(label,family,view,[{wa:w,ra:w,d:value},{wa:w,ra:w,d:value,we:true},{wa:w,ra:w,d:value},{}],{write_address:w,write_value:value});
 const assign=(label,value,family)=>add(label,family,0,[{ra:13,block:value},{ra:13,block:value,assign:true},{ra:13,block:value},{}]);
 const capture=(which,ra,family)=>add(family+'_capture_'+which,family,0,[{ra},{ra,['capture_'+which]:true},{ra},{}]);
 function readAll(family){for(let group=0;group<4;group++){const addresses=Array.from({length:4},(_,i)=>group*4+i);add(family+'_'+group,family,0,[...addresses.map(ra=>({ra})),{}],{read_addresses:addresses});}}
 assign('seed_r13_96',0x96,'seed');write('seed_r0_a6','seed',0,0xa6);capture('a',0,'seed');write('seed_r12_59','seed',12,0x59);capture('b',12,'seed');
 for(let w=0;w<13;w++)write('signature_r'+w,'signature_write',w,signatures[w]);readAll('signature_read');
 for(let w=0;w<13;w++)write('complement_r'+w,'complement_write',w,complements[w],4+Math.floor(w/4));readAll('complement_read');
 for(const w of[13,14,15])write('protect_r'+w,'protection',w,255);readAll('protection_read');
 for(let w=0;w<13;w++)write('clear_r'+w,'cleanup_write',w,0,4+Math.floor(w/4));
 assign('clear_r13',0,'cleanup_retained');capture('a',0,'cleanup_retained');capture('b',0,'cleanup_retained');readAll('cleanup_read');
 assert.deepEqual(state,initial);
 const families=Object.fromEntries([...new Set(jobs.map(j=>j.family))].map(f=>{const js=jobs.filter(j=>j.family===f);return[f,{jobs:js.length,phases:js.reduce((n,j)=>n+j.spec.cases.length,0),expectations:js.reduce((n,j)=>n+j.spec.cases.reduce((n,c)=>n+Object.keys(c.expect).length,0),0)}];}));
 return{status:'proposed_offline_signature_campaign_native_unverified',lane:d.lane,design_sha256:PINS['artifacts/compact-register-file-v1/design.json'],initial_state:initial,
  prerequisite:{required:'Actual accepted frozen42 bringup, final all14 stored bytes and A/B zero, all28 controls off; fresh same-session observation and source bindings',receipt:null,native_gate_implemented:false},
  signatures,complements,jobs,families,counts:{jobs:jobs.length,phases:jobs.reduce((n,j)=>n+j.spec.cases.length,0),expectations:jobs.reduce((n,j)=>n+j.spec.cases.reduce((n,c)=>n+Object.keys(c.expect).length,0),0),max_phases:Math.max(...jobs.map(j=>j.spec.cases.length)),max_requested_ticks:Math.max(...jobs.map(j=>j.spec.cases.length*200)),max_logical_input_writes:Math.max(...jobs.map(j=>j.logical_input_writes)),inputs:28,views_used:[...new Set(jobs.map(j=>j.view))]},
  temporal_contract:{provisional_paired_budget_ticks:400,each_phase_wait_ticks:200,measured_timing:false,required:'Gap-free tick traces, exact task endpoints, view-scoped raw-control constancy, known unselected stored signals retained through entire stimulus intervals, complete same-watch/session stop-drain-discard, all28 baseline/write/restore journals. Infer holds from model and physical view, not from this text.',local_d_hold_claim:false},
  final_state:clone(state),whole_architecture_accepted:false};
}
export function outputObjects(){const t=makeCampaign();return{'catalog.json':t,...Object.fromEntries(t.jobs.map((j,i)=>[`test-${String(i).padStart(2,'0')}.json`,j.spec]))};}
export function provenance(){const paths=['prepare.mjs','check-offline.mjs','README.md'];return{status:'offline_only_not_native_admitted',source_sha256:{...PINS,...Object.fromEntries(paths.map(p=>['artifacts/compact-register-signatures-v1/'+p,sha(join(DIR,p))]))},files_sha256:Object.fromEntries(Object.keys(outputObjects()).map(p=>[p,sha(join(DIR,p))])),native_calls:0,constructors:0};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert(['--write','--check'].includes(process.argv[2]));const objects=outputObjects();
 if(process.argv[2]==='--write'){mkdirSync(DIR,{recursive:true});for(const[p,o]of Object.entries(objects))writeFileSync(join(DIR,p),JSON.stringify(o,null,2)+'\n',{flag:'wx'});writeFileSync(join(DIR,'provenance.json'),JSON.stringify(provenance(),null,2)+'\n',{flag:'wx'});}
 else{for(const[p,o]of Object.entries(objects))assert.deepEqual(JSON.parse(readFileSync(join(DIR,p))),o);assert.deepEqual(JSON.parse(readFileSync(join(DIR,'provenance.json'))),provenance());}
 console.log(JSON.stringify({status:'offline_prepared',...objects['catalog.json'].counts,native_acceptance:false}));
}
