import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`;
assert.equal(hash('../final-stage-clear-connected-v1/source-manifest.json'),'a5d1c7f216e1c6263a6c31c691dcaccab1c4cc4e6ff91cdf73253b817d85feb1');
assert.equal(hash('../final-stage-clear-connected-v1/design.json'),'3a9eefac1388c7a4df50180958548de93e85c4be3807dc0c863fb511e368e4f2');
const d=read('../final-stage-clear-connected-v1/design.json'), ep=read('../final-stage-clear-connected-v1/endpoint-map.json');
const old=readLargeDesign(fileURLToPath(new URL('../../compact-core-guard-v1/design.json',H)));
const worlds={old:new Map(old.blocks.map(b=>[K(b.position),b.block])),current:new Map(d.blocks.map(b=>[K(b.position),b.block]))};
const cuts=read('../final-stage-clear-connected-v1/cut-census.json').all_current_body_cuts;
assert.equal(cuts.length,2005);
const cache={old:new Map,current:new Map}, sourceCache={old:new Map,current:new Map};
function incoming(side,p){const k=K(p);if(!cache[side].has(k))cache[side].set(k,inputs(worlds[side],p));return cache[side].get(k);}
function sources(side,p){
 const cached=sourceCache[side].get(K(p));if(cached)return cached;
 const w=worlds[side],q=[p],seen=new Set(q.map(K)),drivers=new Map;
 for(let i=0;i<q.length;i++){
  const at=q[i],b=w.get(K(at));
  if(b?.id!=='minecraft:redstone_wire'){drivers.set(K(at),{position:at,block:b??null});continue;}
  for(const s of incoming(side,at))if(!seen.has(K(s))){seen.add(K(s));q.push(s);}
 }
 const result={passive_wire_positions:q.filter(p=>w.get(K(p))?.id==='minecraft:redstone_wire'),active_boundary_drivers:[...drivers.values()]};
 sourceCache[side].set(K(p),result);return result;
}
const map=p=>ep.mapping[K(p)]??ep.replacement_interface_map[K(p)]??null;
const rows=[];
for(const [index,c] of cuts.entries()){
 assert(incoming('old',c.to).some(p=>K(p)===K(c.from)),`Not an original actual input ${index}`);
 const sm=map(c.from),tm=map(c.to),row={index,...c,original_source_block:worlds.old.get(K(c.from)),original_receiver_block:worlds.old.get(K(c.to)),mapped_source:sm,mapped_receiver:tm};
 if(!tm){row.status='original_receiver_inside_unmapped_or_function_preserving_network';rows.push(row);continue;}
 const b=worlds.current.get(K(tm.position));assert(b,`Mapped receiver absent ${index}`);
 row.current_receiver_block=b;row.actual_current_immediate_inputs=incoming('current',tm.position);
 row.actual_direct_translated_edge_present=Boolean(sm&&row.actual_current_immediate_inputs.some(p=>K(p)===K(sm.position)));
 if(b.id==='minecraft:redstone_wire'){
  row.current_receiver_ancestry=sources('current',tm.position);
  row.status=row.current_receiver_ancestry.active_boundary_drivers.length?'current_passive_receiver_has_actual_active_device_boundary':'current_passive_receiver_has_no_actual_active_driver';
 }else{
  row.current_input_ancestries=row.actual_current_immediate_inputs.map(p=>({input:p,...sources('current',p)}));
  row.status=row.current_input_ancestries.length?'current_device_has_actual_inputs_roles_require_classification':'current_device_has_no_actual_inputs';
 }
 rows.push(row);
}
const grouped={};for(const r of rows){const k=r.status;grouped[k]=(grouped[k]??0)+1;}
const candidateGroups={};for(const r of rows.filter(r=>r.status==='current_passive_receiver_has_no_actual_active_driver')){
 const k=r.target_body??'unowned';candidateGroups[k]??={body:k,rows:[],distinct_passive_components:new Set};candidateGroups[k].rows.push(r.index);candidateGroups[k].distinct_passive_components.add(r.current_receiver_ancestry.passive_wire_positions.map(K).sort().join(';'));
}
const out={status:'read_only_actual_input_census_not_cut_closure',parent_manifest_sha256:hash('../final-stage-clear-connected-v1/source-manifest.json'),parent_cells:d.blocks.length,actual_original_cells:old.blocks.length,total_original_body_crossings:cuts.length,classification_counts:grouped,undriven_passive_receiver_candidate_groups:Object.values(candidateGroups).map(g=>({...g,distinct_passive_components:g.distinct_passive_components.size})).sort((a,b)=>b.rows.length-a.rows.length),rows,limits:['Actual immediate inputs and passive ancestry only; an active device boundary does not establish its source generation, function, timing or completed upstream wiring.','A missing passive driver can be an intentional external boundary or genuinely missing internal route; classify original full function and exact current shared-frame ports before drawing.','Conceptual ownership of a function-preserving old network is distinct from an exact coordinate map. No unmatched internal cell is silently assigned a new runtime source.','No route count is subtracted from the cut count. This is not a whole-core closure certificate.'],geometry_added:0,two_core_placement:false,complete_core:false,native_acceptance:false};
writeFileSync(new URL('census.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,counts:grouped,candidates:out.undriven_passive_receiver_candidate_groups},null,2));
