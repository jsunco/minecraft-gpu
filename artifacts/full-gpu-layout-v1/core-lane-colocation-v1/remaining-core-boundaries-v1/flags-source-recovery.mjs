import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
import {symbolicPower} from '../final-architecture-observers-v1/symbolic-power.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const K=p=>`${p.x},${p.y},${p.z}`;
const ep=read('../final-stage-clear-connected-v1/endpoint-map.json');
const d=read('../final-stage-clear-connected-v1/design.json');
const old=readLargeDesign(fileURLToPath(new URL('../../compact-core-guard-v1/design.json',H)));
const ow=new Map(old.blocks.map(b=>[K(b.position),b.block])),cw=new Map(d.blocks.map(b=>[K(b.position),b.block]));
const cut=read('census.json').rows.filter(r=>r.status==='current_device_has_no_actual_inputs'&&r.target_body?.startsWith('flags_agreement_'));
const comparators=[...new Map(cut.map(r=>[K(r.to),r])).values()];assert.equal(comparators.length,12);
const cache=new Map,ins=p=>{const k=K(p);if(!cache.has(k))cache.set(k,inputs(ow,p));return cache.get(k);};
function mappedBoundary(p){const m=ep.mapping[K(p)]??ep.replacement_interface_map[K(p)],b=ow.get(K(p));return m&&b.id!=='minecraft:redstone_wire'&&!b.id.endsWith('_concrete')?{...m,original:p,original_block:b,current_block:cw.get(K(m.position))}:null;}
const reports=[];
for(const r of comparators){
 const q=[r.to],seen=new Set(q.map(K)),stops=new Map,undriven=[];
 for(let i=0;i<q.length;i++){
  const p=q[i],m=i?mappedBoundary(p):null;
  if(m){assert(m.current_block);assert.equal(m.current_block.id,m.original_block.id);stops.set(K(p),m);continue;}
  const deps=ins(p);if(!deps.length)undriven.push({position:p,block:ow.get(K(p))});
  for(const s of deps)if(!seen.has(K(s))){seen.add(K(s));q.push(s);}
 }
 assert(!undriven.length,'Original cone reaches an unclassified undriven point '+JSON.stringify(undriven));
 const sources=[...stops.values()],seeds=Object.fromEntries(sources.map((s,i)=>['source'+i,s.original]));
 const m=symbolicPower(ow,q,seeds);assert(sources.length<=12);
 const cases=[];for(let bits=0;bits<2**sources.length;bits++){
  const assignment=Object.fromEntries(sources.map((s,i)=>['source'+i,(bits>>i)&1]));
  cases.push({bits,level:m.evaluate(r.to,assignment)});
 }
 const expectedRear={x:r.to.x-1,y:r.to.y,z:r.to.z},expectedSide={x:r.to.x,y:r.to.y,z:r.to.z+1};
 const arrivalFunctions={rear:[],side:[]};for(const [name,p] of Object.entries({rear:expectedRear,side:expectedSide})){
  assert(ins(r.to).some(q=>K(q)===K(p)));for(const test of cases){const assignment=Object.fromEntries(sources.map((s,i)=>['source'+i,(test.bits>>i)&1]));arrivalFunctions[name].push(m.evaluate(p,assignment));}
 }
 reports.push({body:r.target_body,original_comparator:r.to,current_comparator:r.mapped_receiver.position,original_required_rear:expectedRear,original_required_side:expectedSide,actual_current_inputs:inputs(cw,r.mapped_receiver.position),sources,original_cone:q,...m.summary(),cases,arrival_functions:arrivalFunctions});
}
const out={status:'twelve_actual_flags_qualification_comparator_cones_recovered_pending_source_semantics_and_routes',reports,limits:['The twelve retained comparators are present but have no actual current inputs. Original first-retained active-device source sets are exact structural boundaries, not complete upstream generation proof.','Full old settled comparator/rear/side truth tables are included. Named source semantics, selected polarity, current source attenuation and the missing routes must still be proved before geometry.','This analysis adds no blocks and does not close any ledger entry.'],geometry_added:0,complete_core:false,native_acceptance:false};
writeFileSync(new URL('flags-source-recovery.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(reports.map(r=>({body:r.body,old:r.original_comparator,current:r.current_comparator,sources:r.sources,summary:{nodes:r.actual_nodes,variables:r.BDD_variables},cases:r.cases,arrival_functions:r.arrival_functions})),null,2));
