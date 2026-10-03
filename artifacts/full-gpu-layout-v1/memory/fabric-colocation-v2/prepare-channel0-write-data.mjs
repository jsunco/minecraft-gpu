// Next bounded assignment only: no blocks placed and no old cuts closed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K,V,F} from './allocation-route.mjs';
import {inputs,active} from './cut-inputs.mjs';
import {backwardCone,makeSettledEvaluator} from './settled-network.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const d=read('typed-request-connected-design.json'),plan=read('next-bank-input-bindings.json'),ledger=read('typed-request-cut-ledger.json'),map=new Map(d.blocks.map(v=>[K(v.position),v.block]));
const W='minecraft:redstone_wire',R='minecraft:repeater',S='minecraft:light_gray_concrete',T='minecraft:redstone_torch';
const U=p=>P(p.x,p.y-1,p.z),step=(p,dir,n=1)=>P(p.x+V[dir][0]*n,p.y,p.z+V[dir][1]*n);
function departure(p){
 const b=map.get(K(p));assert([W,S].includes(b?.id));const source=b.id===S?U(p):p;if(b.id===S)assert.equal(map.get(K(source))?.id,T);
 for(const dir of ['south','north','west','east']){
  const tap=step(p,dir),start=step(p,dir,2),rows=[[tap,{id:R,properties:{facing:F[dir],delay:'1'}}],[U(tap),{id:S}],[start,{id:W}],[U(start),{id:S}]];
  if(rows.some(([q])=>map.has(K(q))))continue;
  const added=new Map(rows.map(([q,b])=>[K(q),b])),after={get:k=>added.get(k)??map.get(k)},allowed=new Set([K(source)+'>'+K(tap),K(tap)+'>'+K(start)]),affected=new Map();
  for(const [q]of rows)for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const r=P(q.x+dx,q.y+dy,q.z+dz);if(active(after.get(K(r))))affected.set(K(r),r);}
  let bad=false;for(const [k,q]of affected){const a=new Set(inputs(map,q).map(K)),b=new Set(inputs(after,q).map(K));if([...a].some(k=>!b.has(k))||[...b].some(i=>!a.has(i)&&!allowed.has(i+'>'+k))){bad=true;break;}}
  if(!bad&&inputs(after,tap).some(q=>K(q)===K(source)))return {source,sourcePad:p,tap,start,travel:dir,proposed_cells:rows.map(([position,block])=>({position,block})),checked_affected_receivers:affected.size};
 }
 return null;
}
let cases=0;const sources=[],bindings=plan.payload.filter(b=>b.channel===0&&b.kind==='write_data');assert.equal(bindings.length,32);
for(let bit=0;bit<8;bit++){
 const s=plan.sources.find(s=>s.channel===0&&s.field==='write_data'+bit);
 // The existing export has the same measured local placement as the frozen
 // held-type exporter. The actual block and cone, not that pattern, admit it.
 const p=P(s.storage.x-5,s.storage.y+3,s.storage.z-2),cone=backwardCone(map,p,[s.storage]);
 assert(cone.some(p=>K(p)===K(s.storage)));const ev=makeSettledEvaluator(map,cone,[s.storage]);
 const levels=[];for(const value of [0,15]){const result=ev(new Map([[K(s.storage),value]])).power.get(K(p))??0;assert.equal(result>0,value>0);levels.push({stored:value,exported:result});cases++;}
 let access=departure(p);const attempted_export_departure=!!access,alternative_access=[];if(!access)for(const q of cone){const b=map.get(K(q));if(![W,S].includes(b?.id)||K(q)===K(p))continue;const actual=departure(q);if(!actual)continue;const testCone=backwardCone(map,q,[s.storage]);if(!testCone.some(p=>K(p)===K(s.storage)))continue;const test=makeSettledEvaluator(map,testCone,[s.storage]);if((test(new Map([[K(s.storage),0]])).power.get(K(q))??0)===0&&(test(new Map([[K(s.storage),15]])).power.get(K(q))??0)>0)alternative_access.push(actual);}if(!access&&alternative_access.length)access=alternative_access[0];
 const targetBindings=bindings.filter(b=>b.bit===bit);assert.equal(targetBindings.length,4);
 for(const b of targetBindings){assert.equal(ledger.bank_inventory.entries[b.original_cut_index].status,'outside_this_group_reconciliation_pending');assert.equal(ledger.bank_inventory.entries[b.original_cut_index].cut_sha256,b.cut_sha256);assert.deepEqual(map.get(K(b.current_destination)),b.original.target.block);}
 sources.push({channel:0,bit,field:s.field,storage:s.storage,original_storage:s.original_storage,original_terminal:s.terminal,current_export:p,export_block:map.get(K(p)),function:'positive actual retained write_data'+bit,cone,levels,attempted_export_departure,alternative_access,proposed_departure:access,source_access_status:access?'isolated_proposed_departure_checked':'no_isolated_departure_found_existing_cone_requires_new_adapter_design',targets:targetBindings});
}
const out={status:'next_channel0_write_data_assignment_actual_current_sources_access_checked_geometry_not_drawn',parent_manifest_sha256:hash('typed-request-connected-source-manifest.json'),parent_design_sha256:hash('typed-request-connected-design.json'),channel:0,source_bits:8,bank_receivers:32,cases,accessible_sources:sources.filter(s=>s.proposed_departure).length,sources,bindings,original_producer_classification:{status:'pending_complete_original_source_adapter_cone_trace',source_groups:['current/bank_write_data_adapter','current/retained_write_data_source_joins','current/retained_write_data_bank_fanout','channel-retention-v1/payload_storage','channel-retention-v1/payload_exports'],required_function:'same positive actual globally retained write-data bit; preserve any actual source qualification discovered in full original trace'},proposed_group:'channel0-write-data-connected',required_work:['Classify all 32 actual original write-data source-to-bank adapters with complete input context before placement.','Preserve the 1,191,454-cell typed-request parent and all prior attenuation/cold/sampling repairs.','Draw eight real shared front/rear data trunks and all 32 matching bank-pad branches; choose positions from actual clearance and count all supports/columns/cables.','Check the complete parent input map, actual source0/15 levels at all32 bank receivers, supports, strength, no device cycles, mutations and exact bank cut identities.','Retained data stability before/through qualified VALID and bank capture remains a separate state/phase timing obligation.'],remaining_cut_credit:{bank_checked:52,bank_pending:520,payload_pending:384,fabric_checked:44,fabric_pending:900,new_closed:0},source_sha256:Object.fromEntries(['prepare-channel0-write-data.mjs','typed-request-connected-source-manifest.json','typed-request-connected-design.json','typed-request-cut-ledger.json','next-bank-input-bindings.json','allocation-route.mjs','cut-inputs.mjs','settled-network.mjs'].map(n=>[n,hash(n)])),limits:['Source stubs are checked proposals only, not placed blocks or routed transports.','All384 address/data inputs still remain undelivered; this assignment would cover32 if its geometry later passes.','Only channel0 write-data is assigned. All address inputs and the other three channels remain separate.']};
writeFileSync(new URL('next-channel0-write-data-assignment.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,sources:8,accessible_sources:out.accessible_sources,targets:32,cases,new_closed:0}));
