// Independent phase-order replay. Software protocol evidence, never timing/native evidence.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{definition}from'./logic.mjs';
const H=new URL('.',import.meta.url),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),manifest=JSON.parse(readFileSync(new URL('source-manifest.json',H))),pins=manifest.files??manifest.source_sha256??manifest.pins;
for(const[p,h]of Object.entries(pins))assert.equal(hash(p),h,p);
const logic=definition(),evaluate=(v,drop=null)=>Object.fromEntries(logic.outputs.map(n=>[n,logic.products.some(p=>p.out===n&&!(drop&&p.out==='external_ack_D'&&p.literals[drop]===true)&&Object.entries(p.literals).every(([k,w])=>!!v[k]===w))]));
function trace(delays,drop=null){
 const q={ack:false,withdraw:false,release:false,cleanup:false},n={withdraw:false,release:false,cleanup:false};let external=false,request=true,ackAt=null,withdrawAt=null,releaseAt=null,clearAt=null,finished=false,seen=false;
 const history=[];
 for(let half=0;half<180;half++){
  const phase=half%2?'B':'A';if(ackAt!==null&&half>=ackAt+delays.withdraw)request=false;
  const eligible=half>=delays.eligible,exits=withdrawAt!==null&&half>=withdrawAt+delays.exits,clear=releaseAt!==null&&half>=releaseAt+delays.clear;
  if(clear&&clearAt===null)clearAt=half;
  const before={...q},was=external,r=evaluate({...q,eligible,request,start:false,exits_quiet:exits,stages_clear:clear,initialize:false,fault:false},drop);
  if(phase==='A'){external=r.external_ack_D;q.ack=r.ack_D;for(const k of Object.keys(n))n[k]=r[k+'_D'];}
  else Object.assign(q,n);
  if(external){if(!seen){seen=true;ackAt=half;}assert(eligible,'ACK before eligibility');}
  if(q.withdraw&&withdrawAt===null)withdrawAt=half;
  if(q.release&&releaseAt===null)releaseAt=half;
  if(q.release&&!before.release)assert(exits&&!request,'Release before withdrawal exit');
  if(was&&!external){assert(clearAt!==null&&Object.values(q).every(v=>!v),'ACK gap before complete cleanup');finished=true;}
  history.push({half,phase,request,eligible,exits,clear,...q,external});
  if(finished){assert(!external);assert(Object.values(q).every(v=>!v));}
 }
 assert(seen&&finished);return history.length;
}
let traces=0,halves=0;for(const eligible of[0,1,3,7])for(const withdraw of[1,2,5,9])for(const exits of[0,1,2,5,9,17])for(const clear of[0,1,2,5,9,17]){halves+=trace({eligible,withdraw,exits,clear});traces++;}
// A removed baton term must be caught when its predecessor has cleared.
let negatives=0;for(const omit of['cleanup']){assert.throws(()=>trace({eligible:3,withdraw:2,exits:7,clear:7},omit));negatives++;}
// Each physical single/pair cold state starts arbitrary; split A and B strictly.
let cold=0;for(let bits=0;bits<256;bits++)for(const initial of['A','B']){let q={ack:!!(bits&1),withdraw:!!(bits&2),release:!!(bits&4),cleanup:!!(bits&8)},n={withdraw:!!(bits&16),release:!!(bits&32),cleanup:!!(bits&64)},ext=!!(bits&128);for(let h=0;h<6;h++){const phase=(h%2===0)=== (initial==='A')?'A':'B';if(phase==='A'){const r=evaluate({...q,initialize:true});q.ack=r.ack_D;ext=r.external_ack_D;for(const k of Object.keys(n))n[k]=r[k+'_D'];}else Object.assign(q,n);}assert(!ext&&Object.values(q).every(v=>!v)&&Object.values(n).every(v=>!v));cold++;}
const out={status:'independent_bounded_reset_baton_phase_replay',frozen_manifest_sha256:hash(new URL('source-manifest.json',H)),pins_verified:Object.keys(pins).length,separate_A_B_traces:traces,half_phase_steps:halves,cold_cases:cold,baton_corruption_refusals:negatives,scope:'Protocol replay of a single serialized reset epoch with eligibility/exit/clear delays. Not a new hardware model or whole-core proof.',remaining_blocker:'A RESET reassertion while previous external ACK is still high is not accepted as a new epoch by this replay. Actual global/loader serialization or separate held-reset epoch qualification remains under design.',limits:['All source observations are abstract booleans and each A/B phase is assumed to finish with declared setup/closure. No physical delay or far-rail bound.','No full electrical rerun or current master replacement review; authored interaction reports are only source-pinned.','No claims about arbitrary asynchronous chatter, faults after visible ACK, or unmodified Minecraft.'],native_acceptance:false,complete_core_reset:false,world_mutations:0};writeFileSync(new URL('reviewer-phase-check.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
