// Finite proposed bring-up specifications only. This model never drives a live GPU.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactRegisterFile} from './compact-register-file.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),clone=structuredClone;
export function makeCompactRegisterFileTests(d=makeCompactRegisterFile()){
 const jobs=[],state={q:Array(14).fill(null),a:null,b:null},zero=Object.fromEntries(d.inputs.map(v=>[v.name,false]));
 const pins=v=>{const p={...zero};for(const[name,value]of Object.entries(v)){if(['d','block','wa','ra'].includes(name)){const width=['d','block'].includes(name)?8:4;assert(Number.isInteger(value)&&value>=0&&value<2**width);for(let b=0;b<width;b++)p[name+b]=!!(value&(1<<b));}else{assert(name in p);assert.equal(typeof value,'boolean');p[name]=value;}}return p;};
 const val=(p,n,width)=>Array.from({length:width},(_,b)=>Number(p[n+b])*2**b).reduce((a,b)=>a+b,0);
 const read=(s,p)=>{const ra=val(p,'ra',4);return ra<14?s.q[ra]:ra===14?4:d.lane;};
 function next(s,p){const n=clone(s),wa=val(p,'wa',4);if(p.we&&wa<13)n.q[wa]=val(p,'d',8);if(p.assign)n.q[13]=val(p,'block',8);if(p.capture_a)n.a=read(n,p);if(p.capture_b)n.b=read(n,p);return n;}
 function expected(s,p,view,rawOnly=false){const e={},bit=(v,b)=>v===null?undefined:(v>>b)&1,wa=val(p,'wa',4),rd=read(s,p);
  for(const signal of view.signals){const name=signal.name;let value,m;
   if(name.startsWith('raw_'))value=Number(p[name.slice(4)]);
   else if(!rawOnly){
    if((m=/^read(\d)$/.exec(name)))value=bit(rd,+m[1]);
    else if((m=/^([ab])(\d)$/.exec(name)))value=bit(s[m[1]],+m[2]);
    else if((m=/^q(\d+)_(\d)$/.exec(name)))value=bit(s.q[+m[1]],+m[2]);
    else if((m=/^local(\d+)_(\d)$/.exec(name)))value=bit(val(p,+m[1]===13?'block':'d',8),+m[2]);
    else if((m=/^lock(\d+)_(\d)$/.exec(name))){const w=+m[1];if(s.q[w]!==null)value=Number(!(w===13?p.assign:p.we&&wa===w));}
    else if((m=/^qualified(\d+)$/.exec(name)))value=Number(+m[1]===13?p.assign:p.we&&wa===+m[1]);
    else if((m=/^local_([ab])(\d)$/.exec(name)))value=bit(rd,+m[2]);
    else if((m=/^lock_([ab])(\d)$/.exec(name))&&s[m[1]]!==null)value=Number(!p['capture_'+m[1]]);
   }
   if(value!==undefined)e[name]=value;
  }
  for(const bus of view.buses)if(bus.bits.every(n=>n in e))e[bus.name]=bus.bits.reduce((n,k,b)=>n+e[k]*2**b,0);
  return e;
 }
 function add(label,viewIndex,vectors,{rawOnly=false,holdVector=null,note=''}={}){
  assert(vectors.length<=5,'Keep bootstrap jobs small');const view=d.circuits[viewIndex],entry=clone(state),cases=[];let prior=zero;
  for(const[i,values]of vectors.entries()){
   const p=pins(values);if(prior.we)for(const k of Object.keys(p).filter(k=>/^wa\d|^d\d/.test(k)))assert.equal(p[k],prior[k],'Close WE before moving WA/D');
   if(prior.assign)for(let b=0;b<8;b++)assert.equal(p['block'+b],prior['block'+b],'Close ASSIGN before moving block ID');
   if(prior.capture_a||prior.capture_b){for(let b=0;b<4;b++)assert.equal(p['ra'+b],prior['ra'+b],'Close captures before changing RA');assert(!p.we&&!p.assign,'No update with capture open');}
   if(p.capture_a||p.capture_b)assert(!p.we&&!p.assign,'Capture and update must be separate');
   Object.assign(state,next(state,p));const e=expected(state,p,view,rawOnly),raw=Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_')));
   cases.push({name:`v${i}_propagate`,inputs:p,expect:raw},{name:`v${i}_assert`,inputs:{...p},expect:e});prior=p;
  }
  assert.deepEqual(prior,zero,'Each job ends at all-off source baseline; memory is retained');
  const spec={circuit_id:view.id,inputs:clone(d.inputs),cases,settle_ticks:200,timeout_ms:65000,stop_on_failure:true,restore_inputs:true,trace:true};
  const hold=holdVector===null?null:{prepare_assertion_case:`v${holdVector-1}_assert`,unchanged_assertion_case:`v${holdVector}_assert`,minimum_ticks:200,view:view.id,require_actual_local_d:true,require_closed_locks:true};
  jobs.push({label,view:viewIndex,entry,exit:clone(state),assertion_scope:rawOnly?'Actual source controls only; conditioning is not electrical acceptance.':'Only known stored state is asserted. Null entry bits remain unclaimed until initialized.',note,hold,spec});
 }
 for(let group=0;group<4;group++)add('cold_ra_'+group,0,[...Array.from({length:4},(_,i)=>({ra:group*4+i})),{}],{rawOnly:true,note:'Visit each real address; parent full-mask regression must independently pass after cold conditioning.'});
 add('cold_data_edges',0,[{d:255,block:255},{}],{rawOnly:true,note:'Real input edges while all execution controls remain closed; this does not initialize stored state.'});
 const write=(label,w,data,view=4+Math.floor(w/4))=>add(label,view,[{wa:w,d:data},{wa:w,d:data,we:true},{wa:w,d:data},{}]);
 for(let w=0;w<13;w++)write('clear_r'+w,w,0);
 add('clear_r13',3,[{block:0},{block:0,assign:true},{block:0},{}]);
 for(const which of['a','b'])add('clear_operand_'+which,1,[{}, {['capture_'+which]:true},{},{}]);
 write('near_r0_a5',0,165,2);write('far_r12_3c',12,60,2);
 add('near_opposite_hold',2,[{d:90},{d:90},{}],{holdVector:1,note:'All eight R0 local D bits oppose A5; R12 remains3C. Trace scope only the two observed words.'});
 add('far_opposite_hold',2,[{d:195},{d:195},{}],{holdVector:1,note:'All eight R12 local D bits oppose3C; R0 remainsA5.'});
 add('assign_r13_36',3,[{block:54},{block:54,assign:true},{block:54},{}]);
 for(const w of[13,14,15])add('protect_r'+w,0,[{wa:w,ra:w,d:255},{wa:w,ra:w,d:255,we:true},{wa:w,ra:w,d:255},{}]);
 for(const which of['a','b'])add('capture_old_r13_'+which,0,[{ra:13,block:201},{ra:13,block:201,['capture_'+which]:true},{ra:13,block:201},{}],{note:'Stage new block ID while ASSIGN stays closed. Capture the retained old36, then close before any source-address movement.'});
 add('assign_after_old_captures',1,[{ra:13,block:201},{ra:13,block:201,assign:true},{ra:13,block:201},{}],{note:'Only after both operands have closed on36 may ASSIGN exposeC9. This proves provided sequencing, not an unbuilt REQUEST controller.'});
 add('old_r13_opposite_hold',1,[{ra:13},{ra:13},{}],{holdVector:1,note:'Actual A/B local D=C9 opposes retained36 for both bytes; both lock bytes must remainFF.'});
 for(const which of['a','b'])add('capture_r0_'+which,1,[{}, {['capture_'+which]:true},{},{}]);
 add('overwrite_aliased_r0',1,[{d:90},{d:90,we:true},{d:90},{}],{note:'A/B must continuously retainA5 while their sourceR0 becomes5A; final settled values alone are insufficient.'});
 add('alias_opposite_hold',1,[{}, {},{}],{holdVector:1,note:'Actual A/B local D=5A opposes retainedA5 while all16 capture locks remain powered.'});
 write('final_clear_r0',0,0,2);write('final_clear_r12',12,0,2);
 add('final_clear_r13',3,[{}, {assign:true},{},{}]);
 for(const which of['a','b'])add('final_clear_'+which,1,[{}, {['capture_'+which]:true},{},{}]);
 assert(state.q.every(v=>v===0)&&state.a===0&&state.b===0);
 return{status:'proposed_small_bringup_jobs_not_native_accepted',lane:d.lane,jobs,counts:{jobs:jobs.length,phases:jobs.reduce((n,j)=>n+j.spec.cases.length,0),expectations:jobs.reduce((n,j)=>n+j.spec.cases.reduce((n,c)=>n+Object.keys(c.expect).length,0),0),max_phases:Math.max(...jobs.map(j=>j.spec.cases.length)),max_requested_ticks:Math.max(...jobs.map(j=>j.spec.cases.length*200))},limits:'Every job requests at most2000ticks, but all28 baseline/restore operations and native pacing count toward the separately reviewed65s/6500tick runtime. The four cold RA jobs assert raw controls only. No general200tick settling bound. This is startup plus directed semantics, not complete register/ISA acceptance.',final_state:clone(state)};
}
export async function checkCompactRegisterFileTests(){const{testRunSchema}=await import('../artifacts/runner-input-capacity-v1/test-runner-service.mjs');const d=makeCompactRegisterFile(),t=makeCompactRegisterFileTests(d);for(const j of t.jobs){testRunSchema.parse(j.spec);const names=new Set([...d.circuits[j.view].signals,...d.circuits[j.view].buses].map(v=>v.name));for(const c of j.spec.cases){assert.equal(Object.keys(c.inputs).length,28);for(const n of Object.keys(c.expect))assert(names.has(n));}if(j.hold){const n=+j.hold.unchanged_assertion_case.match(/^v(\d+)/)[1];assert.deepEqual(j.spec.cases[2*n].inputs,j.spec.cases[2*n-1].inputs);}}return{status:'offline_specs_pass_native_unverified',...t.counts,inputs:28,views:8,wide_schema_only:true,constructors:0,native_calls:0};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await checkCompactRegisterFileTests();if(process.argv[2]==='--out'){const dir=resolve(process.argv[3]);mkdirSync(dir);const t=makeCompactRegisterFileTests();writeFileSync(join(dir,'tests.json'),JSON.stringify(t,null,2)+'\n',{flag:'wx'});for(const[i,j]of t.jobs.entries())writeFileSync(join(dir,`test-${String(i).padStart(2,'0')}.json`),JSON.stringify(j.spec,null,2)+'\n',{flag:'wx'});writeFileSync(join(dir,'offline-check.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});writeFileSync(join(dir,'provenance.json'),JSON.stringify({source_sha256:Object.fromEntries(['compact-register-file.mjs','compact-register-file-tests.mjs'].map(n=>['hardware/'+n,sha(readFileSync(new URL(n,import.meta.url)))])),tests_sha256:sha(readFileSync(join(dir,'tests.json'))),native:false},null,2)+'\n',{flag:'wx'});}else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(result));}
