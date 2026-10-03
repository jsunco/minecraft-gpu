// Bounded independent logic/delta review. No native constructors or frozen writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {definition,evaluate,step,zero} from './logic.mjs';
const H='artifacts/full-gpu-layout-v1/master-reset-requesters-v2/', O=H.replace('v2/','v1/');
const read=p=>JSON.parse(readFileSync(p)),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
// Independent branch oracle: initialization; active work; withdrawal; idle.
function ref(v){
 let a=false,w=false,p=false;
 if(v.initialize)a=true;
 else if(v.waiting){
  if(v.reset_held&&v.demand)a=true;
  else {w=!!v.ack;p=!!(v.pending||v.demand);}
 }else if(v.active){a=!!(v.demand||!v.ack);w=!!(v.ack&&!v.demand);}
 else if(v.ack)p=!!(v.pending||v.demand);
 else a=!!(v.pending||v.demand);
 return {active_D:a,waiting_D:w,pending_D:p,
  reset_D:!!(v.initialize||v.active||(v.waiting&&v.reset_held&&v.demand)),
  start_D:!!(!v.initialize&&v.permit&&!v.active&&!v.waiting&&!v.pending&&!v.demand&&!v.ack&&v.start),
  held_reset_D:!!(!v.initialize&&v.active&&v.ack&&v.demand)};
}
const d=definition();let truth=0, coherent=0,sensitive=0;
for(let bits=0;bits<512;bits++){
 const v=Object.fromEntries(d.inputs.map((n,i)=>[n,!!(bits>>i&1)]));
 const physical=Object.fromEntries(d.outputs.map(n=>[n,d.products.some(t=>t.out===n&&Object.entries(t.literals).every(([k,b])=>v[k]===b))]));
 assert.deepEqual(physical,ref(v));assert.deepEqual(evaluate(v),ref(v));truth++;
 if(!v.active||!v.waiting){
  assert(!(physical.active_D&&physical.waiting_D));coherent++;
  if(!v.reset_held){const hi=ref({...v,reset_held:true}),lo=ref(v);
   if(['active_D','waiting_D','pending_D'].some(n=>lo[n]!==hi[n])){
    assert.equal(lo.reset_D,false);assert.equal(hi.reset_D,true);sensitive++;
   }
  }
 }
}
let cold=0;for(let bits=0;bits<8192;bits++)for(const first of ['A','B']){
 let q=Object.fromEntries(Object.keys(zero()).map((n,i)=>[n,!!(bits>>i&1)]));
 for(const phase of [first,'A','B','A','B','A'])q=step(q,phase,{initialize:true,demand:true,ack:true,start:true,permit:true});
 for(const [n,b]of Object.entries(q))assert.equal(b,['active','active_next','reset_out'].includes(n),n);cold++;
}
// Systematically hold a renewed request at every A/B withdrawal boundary. A
// simulated receiver retains ACK until RESET falls and acknowledges only after
// its specified high interval. Request is NEVER forcibly dropped on timeout.
let schedules=0,coalesced=0,separate=0;
for(let offset=0;offset<2;offset++)for(let launch=0;launch<40;launch++)for(const delay of [1,3,7,13]){
 let q=Object.assign(zero(),{active:true,active_next:true,reset_out:true,demand:true,ack:true,held_reset_out:true});
 let ack=true,high=delay,low=0,demand=false,completed=false,fall=false,rearm=false;
 for(let t=0;t<240;t++){
  if(q.reset_out){high++;low=0;if(high>=delay)ack=true;}else{low++;high=0;if(low>=delay)ack=false;fall=true;}
  if(t===launch)demand=true;
  const previous=q.reset_out;q=step(q,(t+offset)%2?'B':'A',{initialize:false,demand,ack,start:true,permit:true});
  if(!previous&&q.reset_out){assert(!ack);rearm=true;}
  if(q.held_reset_out){assert(q.reset_out);if(t>launch+3&&demand)completed=true;}
  if((t+offset)%2===0&&(q.reset_out||q.waiting||q.pending))assert(!q.start_out);
 }
 assert(completed,'Held renewed demand did not complete');assert(q.active&&q.reset_out&&q.held_reset_out);assert(!q.waiting&&!q.pending);
 if(rearm)separate++;else coalesced++;schedules++;
}
let q=Object.assign(zero(),{waiting:true,waiting_next:true,pending:true,pending_next:true,demand:true,ack:true});
for(let i=0;i<100;i++){q=step(q,i%2?'B':'A',{initialize:false,demand:true,ack:true,start:true,permit:true});assert(!q.reset_out&&!q.held_reset_out&&!q.start_out);}
const old=read(O+'connected-design.json'),next=read(H+'connected-design.json');
for(const k of ['existing_cells','ports','connections','routes'])assert.deepEqual(next[k],old[k]);
const key=b=>Object.values(b.position).join(','),a=new Map(old.blocks.map(b=>[key(b),b])),b=new Map(next.blocks.map(b=>[key(b),b]));
let changed=0,added=0,removed=0;
for(const k of new Set([...a.keys(),...b.keys()])){
 const x=a.get(k),y=b.get(k);if(JSON.stringify(x?.block)===JSON.stringify(y?.block))continue;
 assert([x,y].filter(Boolean).every(v=>/^requester[01]$/.test(v.part)),'Foreign delta '+k);
 if(!x)added++;else if(!y)removed++;else changed++;
}
assert.deepEqual([added,removed,changed],[6166,3540,266]);
const n=read(H+'local-design.json'),o=read(O+'local-design.json');
for(const k of ['epoch_state','scalar_B_samples','A_held_commands'])assert.deepEqual(n.parents[k],o.parents[k]);
const routes=n.routes.filter(r=>JSON.stringify(r)!==JSON.stringify(o.routes.find(t=>t.name===r.name))).map(r=>r.name);
assert.deepEqual(routes,['active_next','waiting_next','pending_next','reset_held_D','start_held_D','held_reset_held_D']);
const result={status:'independent_bounded_logic_and_local_delta_pass',truth_cases:truth,coherent_domains:coherent,same_phase_sensitive_domains:sensitive,cold_phase_cases:cold,held_request_schedules:schedules,coalesced_schedules:coalesced,separate_schedules:separate,old_ack_high_refusal_phases:100,forced_release:false,delta:{added,removed,changed,net:added-removed,same_external_paths:33,changed_local_routes:routes},source_sha256:Object.fromEntries([H+'logic.mjs',H+'connected-design.json',H+'local-design.json',O+'connected-design.json',O+'local-design.json',H+'check-independent.mjs'].map(p=>[p,hash(p)])),native_acceptance:false,numeric_physical_bounds_established:false};
if(process.argv.includes('--save'))writeFileSync(H+'independent-checks.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,source_sha256:undefined}));
