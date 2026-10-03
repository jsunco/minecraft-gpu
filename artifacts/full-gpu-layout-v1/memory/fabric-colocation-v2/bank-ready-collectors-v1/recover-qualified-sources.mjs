// Recover actual bank typed READY logic at declared held-state/phase boundaries.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K} from '../allocation-route.mjs';
import {inputs} from '../cut-inputs.mjs';
import {backwardCone} from '../settled-network.mjs';
import {makeSettledEvaluator} from '../settled-bank-network.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const assignment=read('../next-bank-ready-assignment.json'),banks=read('../bank-tail-bodies.json'),parent=read('../channel3-address-design.json'),map=new Map(parent.blocks.map(r=>[K(r.position),r.block])),tail=read('../bank-tail-classification.json'),rows=[];
let cases=0,observations=0,maxEvents=0,checkedInputs=0;const sourceDevices=new Map();
for(let bank=0;bank<4;bank++){
 const o=banks.banks[bank].origin,T=p=>P(o.x+p.x,o.y+p.y,o.z+p.z),phase=tail.rows[bank].sources.filter(s=>['active','tail','reset'].includes(s.name));
 const roots=[...phase.map(s=>({name:s.name,position:s.position,original:s.original,role:'actual phase export; held boundary only'})),...Array.from({length:4},(_,channel)=>({name:'owner'+channel,position:T(P(44,-52+4*channel,-240)),original:P(o.x+44,o.y+8-52+4*channel,o.z-40-240),role:'actual retained bank owner storage',lock:T(P(44,-52+4*channel,-239))})),{name:'is_write',position:T(P(54,-21,-120)),original:P(o.x+54,o.y+8-21,o.z-40-120),role:'actual retained bank request type storage',lock:T(P(54,-21,-119))}];
 assert.equal(roots.length,8);
 for(const r of roots){assert(map.has(K(r.position)),'Missing actual root '+r.name);r.block=map.get(K(r.position));r.inputs=inputs(map,r.position);if(r.lock){assert.equal(r.block.id,'minecraft:repeater');r.lock_block=map.get(K(r.lock));assert.equal(r.lock_block?.id,'minecraft:repeater');assert(r.inputs.some(p=>K(p)===K(r.lock)),'Exact retained side lock absent');}}
 const bs=assignment.bindings.filter(b=>b.bank===bank),outputs=bs.map(b=>({channel:b.channel,kind:b.kind,position:b.current_source,bank_cut_index:b.bank_cut_index,original:b.original.source.position})),stops=roots.map(r=>r.position),cone=[...new Map(outputs.flatMap(r=>backwardCone(map,r.position,stops)).map(p=>[K(p),p])).values()],constants=cone.filter(p=>map.get(K(p)).id==='minecraft:redstone_block');
 for(const r of roots)assert(cone.some(p=>K(p)===K(r.position)),'Required source absent '+r.name);
 const stopKeys=new Set(stops.map(K));for(const p of cone){sourceDevices.set(K(p),p);if(!stopKeys.has(K(p)))checkedInputs+=inputs(map,p).length;}
 const evaluate=makeSettledEvaluator(map,cone,[...stops,...constants],{eventLimit:2000000}),truth=[];
 for(let mask=0;mask<256;mask++){
  const values=new Map([...roots.map((r,i)=>[K(r.position),mask>>i&1?15:0]),...constants.map(p=>[K(p),15])]),result=evaluate(values),phaseReady=!!(mask&1)&&!!(mask&2)&&!(mask&4),isWrite=!!(mask&128),levels=[];
  for(const r of outputs){const expected=phaseReady&&!!(mask>>(3+r.channel)&1)&&(isWrite===(r.kind==='write_ready')),actual=result.power.get(K(r.position))??0;assert.equal(actual,expected?15:0,'Current typed READY bank '+bank+' mask '+mask+' '+r.kind+r.channel);levels.push(actual);observations++;}
  maxEvents=Math.max(maxEvents,result.events);truth.push({mask,levels,events:result.events});cases++;
 }
 rows.push({bank,roots,outputs,constants,cone_devices:cone.length,cone,truth,equation:'read_ready[c] = ACTIVE AND final_normal_delayed_flush AND !reset_blocked AND retained_bank_owner[c] AND !retained_is_write; write_ready[c] substitutes retained_is_write.'});console.log(JSON.stringify({bank,cone:cone.length,cases:256,constants:constants.length}));
}
const footprint=new Set();for(const p of sourceDevices.values())for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++)footprint.add(K(P(p.x+dx,p.y+dy,p.z+dz)));const context=parent.blocks.filter(r=>footprint.has(K(r.position)));
const out={status:'current32_actual_bank_typed_ready_sources_classified_at_exact_phase_and_storage_boundaries',cases,observations,maxEvents,checkedInputs,source_devices:sourceDevices.size,context_cells:context.length,rows,complete_context:{radius:2,blocks:context},source_sha256:Object.fromEntries(['recover-qualified-sources.mjs','../next-bank-ready-assignment.json','../bank-tail-bodies.json','../bank-tail-classification.json','../channel3-address-design.json','../channel3-address-source-manifest.json','../allocation-route.mjs','../cut-inputs.mjs','../settled-network.mjs','../settled-bank-network.mjs'].map(n=>[n,hash(n)])),limits:['Actual retained owner/type repeaters are clamped at Q with exact side-lock identity recorded; no storage capture/reset/hold simulation.','ACTIVE/final delayed flush/reset_blocked are actual distinct exports, treated as held boundaries; no event ordering, pulse, or native proof.','All 256 boundary assignments per bank include invalid multi-owner patterns to test isolation; this does not establish protocol one-hot ownership.','No collector/cable/closed cut is created by this classification. Original cold-source contextual comparison remains separate.']};writeFileSync(new URL('qualified-current-sources.json',H),JSON.stringify(out)+'\n');console.log(JSON.stringify({...out,rows:undefined,complete_context:undefined,source_sha256:undefined}));
