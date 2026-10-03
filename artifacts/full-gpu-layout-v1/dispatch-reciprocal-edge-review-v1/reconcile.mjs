// Read-only topology reconciliation. Never writes any input or block map.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),OLD='../dispatch-global-colocation-v1/',NEW='../dispatch-global-colocation-v6-inverted-v1/',pins={};
const K=p=>`${p.x},${p.y},${p.z}`,P=k=>{const[x,y,z]=k.split(',').map(Number);return{x,y,z};},hash=b=>createHash('sha256').update(b).digest('hex');
function bytes(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=hash(b);return b;}
const read=n=>JSON.parse(bytes(n));
const manifest=read(NEW+'source-manifest.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6-inverted-v1/source-manifest.json'],'5b01e63abb25bff6c9670496068e2ced3dac0dc5a1dfc186efd79bc1bf9891fb');
const review=read('../dispatch-polarity-repair-review-v1/source-manifest.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-polarity-repair-review-v1/source-manifest.json'],'09462bea6bf808fc54b609280472c75246af4494f11262bf196bc9b8deda39ff');
const d=read(NEW+'connected-candidate.json'),ledger=read(NEW+'remaining-ledger.json'),coverage=read(NEW+'coverage.json'),scope=read(OLD+'reference-scope.json'),cuts=read(OLD+'actual-cuts.json'),labels=bytes(OLD+'cell-labels.u16le');
const ow=new Map([...scope.blocks,...scope.foreign_context].map(v=>[K(v.position),v.block])),nw=new Map(d.blocks.map(v=>[K(v.position),v.block]));
const bodyOld=new Map(d.blocks.filter(v=>v.body).map(v=>[K(v.original_position),v])),bodyNew=new Map(d.blocks.filter(v=>v.body).map(v=>[K(v.position),v]));
const oldLabel=new Map(scope.blocks.map((v,i)=>[K(v.position),labels.readUInt16LE(i*2)]));
const sourceBlocks=new Map(scope.blocks.map(v=>[K(v.position),v]));
const oldCache=new Map(),newCache=new Map();
function deps(w,p,cache){const k=K(p);if(!cache.has(k))cache.set(k,inputs(w,p));return cache.get(k);}
function has(w,a,b){return inputs(w,b).some(p=>K(p)===K(a));}
// Output dust is rooted at a retained body only if an internal non-wire device
// can drive it through same-body dust. Passive input pads remain transport.
const powered=new Set(),forward=new Map(),wires=scope.blocks.filter(v=>oldLabel.get(K(v.position))&&v.block.id==='minecraft:redstone_wire');
for(const v of wires)for(const p of deps(ow,v.position,oldCache))if(oldLabel.get(K(p))===oldLabel.get(K(v.position))){
 if(ow.get(K(p)).id!=='minecraft:redstone_wire')powered.add(K(v.position));
 else{if(!forward.has(K(p)))forward.set(K(p),[]);forward.get(K(p)).push(K(v.position));}}
const pq=[...powered];for(let i=0;i<pq.length;i++)for(const k of forward.get(pq[i])??[])if(!powered.has(k)){powered.add(k);pq.push(k);}
const passive=new Set(wires.filter(v=>!powered.has(K(v.position))).map(v=>K(v.position)));
const oldTransport=new Set(scope.blocks.filter(v=>active(v.block)&&(!oldLabel.get(K(v.position))||passive.has(K(v.position)))).map(v=>K(v.position)));
const newTransport=new Set(d.blocks.filter(v=>active(v.block)&&(!v.body||passive.has(K(v.original_position)))).map(v=>K(v.position)));
// Walk actual predecessor edges, stopping only at retained driven body roots or
// foreign-context boundaries. This does not use transfer declarations as proof.
function upstream(w,start,transport,cache){const todo=[start],seen=new Set(),roots=new Set(),edges=[];
 for(let n=0;n<todo.length;n++){const p=todo[n],k=K(p);if(seen.has(k))continue;seen.add(k);if(!transport.has(k)){roots.add(k);continue;}
  for(const q of deps(w,p,cache)){edges.push({source:q,target:p});if(!seen.has(K(q)))todo.push(q);}}
 return{roots:[...roots].sort().map(P),vertices:[...seen].sort().map(p=>({position:P(p),block:w.get(p),is_boundary:roots.has(p)})),edges};}
const exactCuts=new Map(cuts.crossings.map((c,i)=>[K(c.source)+'>'+K(c.target),i]));
function driveWitness(terminal){const todo=[[terminal]],seen=new Set(),label=oldLabel.get(K(terminal));
 for(let i=0;i<todo.length;i++){const path=todo[i],p=path.at(-1);if(seen.has(K(p)))continue;seen.add(K(p));
  if(ow.get(K(p)).id!=='minecraft:redstone_wire'){const forward=[...path].reverse();for(const q of forward)assert.deepEqual(nw.get(K(bodyOld.get(K(q)).position)),ow.get(K(q)));for(let j=1;j<forward.length;j++)assert(has(nw,bodyOld.get(K(forward[j-1])).position,bodyOld.get(K(forward[j])).position));return forward.map(q=>({original_position:q,position:bodyOld.get(K(q)).position,block:ow.get(K(q))}));}
  for(const q of deps(ow,p,oldCache))if(oldLabel.get(K(q))===label)todo.push([...path,q]);}
 assert.fail('No body-local driver witness '+K(terminal));}
const reciprocal=[],direct=[],negatives=[];
for(let transferIndex=0;transferIndex<ledger.transfers.length;transferIndex++){
 const t=ledger.transfers[transferIndex];
 if(t.status==='reciprocal_terminal_edge_review_required'){
  assert.equal(K(t.source),K(t.target));assert.equal(ow.get(K(t.source)).id,'minecraft:redstone_wire');assert.equal(ow.get(K(t.immediate_source)).id,'minecraft:redstone_wire');
  assert(powered.has(K(t.source)));assert(has(ow,t.source,t.immediate_source));assert(has(ow,t.immediate_source,t.target));
  const up=upstream(ow,t.immediate_source,oldTransport,oldCache),rootOnly=up.roots.length===1&&K(up.roots[0])===K(t.source),allDust=up.vertices.every(v=>v.block.id==='minecraft:redstone_wire');
  assert(rootOnly&&allDust,'Old reciprocal edge contains another source or a device '+transferIndex);
  const a=bodyOld.get(K(t.source));assert(a);assert.deepEqual(a.block,ow.get(K(t.source)));
  const internalOld=deps(ow,t.source,oldCache).filter(p=>bodyOld.has(K(p))).map(K).sort();
  const current=deps(nw,a.position,newCache),internalNew=current.filter(p=>bodyNew.has(K(p))).map(p=>K(bodyNew.get(K(p)).original_position)).sort();assert.deepEqual(internalNew,internalOld);
  const external=current.filter(p=>!bodyNew.has(K(p))),newIncoming=external.map(p=>({immediate_source:p,analysis:upstream(nw,p,newTransport,newCache)}));
  for(const q of newIncoming){assert(q.analysis.roots.every(p=>K(p)===K(a.position)),'New foreign driver feeds an output terminal');assert(q.analysis.vertices.every(v=>v.block.id==='minecraft:redstone_wire'),'New reciprocal region contains a device');}
  const oldReturnCut=exactCuts.get(K(t.immediate_source)+'>'+K(t.target)),oldOutgoingCut=exactCuts.get(K(t.source)+'>'+K(t.immediate_source));assert.notEqual(oldReturnCut,undefined);assert.notEqual(oldOutgoingCut,undefined);
  const departures=d.routes.filter(r=>K(r.path[0])===K(a.position)).map(r=>{
   const first=r.path.findIndex((p,i)=>i>0&&nw.get(K(p)).id==='minecraft:repeater');assert(first>0);
   const prefix=r.path.slice(0,first+1);for(let i=1;i<prefix.length;i++)assert(has(nw,prefix[i-1],prefix[i]));
   assert(!has(nw,prefix[first],prefix[first-1]),'First departure repeater can feed upstream');
   return{name:r.name,source:a.position,first_step:prefix[1],first_isolating_repeater:prefix[first],actual_repeater_block:nw.get(K(prefix[first])),prefix};});
  assert(departures.length,'Output terminal has no new departure');
  const fanout=coverage.drawn.filter(v=>K(v.source)===K(t.source));
  // An actual independent block source adjacent to a transport wire must stop
  // this discharge. Mutation exists only in this in-memory model and is undone.
  let injected=null;for(const v of up.vertices.filter(v=>!v.is_boundary)){for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const q={x:v.position.x+dx,y:v.position.y,z:v.position.z+dz};if(!ow.has(K(q))){injected=q;break;}}if(injected)break;}
  assert(injected);ow.set(K(injected),{id:'minecraft:redstone_block'});const mutated=upstream(ow,t.immediate_source,oldTransport,new Map());assert(mutated.roots.some(p=>K(p)===K(injected)));assert(mutated.roots.length>1);ow.delete(K(injected));
  negatives.push({case:'inject_actual_independent_redstone_block_refuses_self_return_classification',transfer_index:transferIndex,injected_position:injected,mutated_roots:mutated.roots});
  reciprocal.push({transfer_index:transferIndex,body:t.source_body,classification:'same_output_wire_conductance_no_second_semantic_source',old:{terminal:t.source,adjacent_transport_wire:t.immediate_source,return_effective_cut:oldReturnCut,outgoing_effective_cut:oldOutgoingCut,actual_mutual_dust_dependency:true,upstream:up},current:{terminal:a.position,block:a.block,internal_drive_witness:driveWitness(t.source),internal_inputs_preserved:internalOld.map(P),actual_inputs:current,reciprocal_transport_regions:newIncoming,disposition:newIncoming.length?'bounded_same_source_dust_stub_before_outgoing_repeater':'outgoing_repeater_isolates_terminal_no_transport_return',departures,checked_forward_transfers:fanout},assembly_obligation:'Preserve the internal driver and every required forward fanout. No second receive cable is required for this self-return row. Foreign egress/ingress rows and timing remain separate.'});
 }
 if(t.status==='preserved_direct_internal_transfer'){
  const a=bodyOld.get(K(t.source)),b=bodyOld.get(K(t.target));assert(a&&b);assert(has(ow,t.source,t.target));assert(has(nw,a.position,b.position));assert(!has(ow,t.target,t.source));assert(!has(nw,b.position,a.position));assert.deepEqual(a.block,ow.get(K(t.source)));assert.deepEqual(b.block,ow.get(K(t.target)));
  assert(['minecraft:comparator','minecraft:lever'].includes(a.block.id));assert.equal(b.block.id,'minecraft:redstone_wire');
  const ci=exactCuts.get(K(t.source)+'>'+K(t.target));assert.notEqual(ci,undefined);
  const inputsOld=deps(ow,t.target,oldCache),inputsNew=deps(nw,b.position,newCache);
  const saved=nw.get(K(a.position));nw.delete(K(a.position));assert(!has(nw,a.position,b.position));nw.set(K(a.position),saved);negatives.push({case:'remove_actual_direct_driver_loses_dependency',transfer_index:transferIndex,source:a.position,target:b.position});
  if(a.block.id==='minecraft:comparator'){
   const inverse={north:'south',south:'north',east:'west',west:'east'};nw.set(K(a.position),{...saved,properties:{...saved.properties,facing:inverse[saved.properties.facing]}});assert(!has(nw,a.position,b.position));nw.set(K(a.position),saved);negatives.push({case:'reverse_actual_comparator_output_loses_dependency',transfer_index:transferIndex,source:a.position,target:b.position});}
  direct.push({transfer_index:transferIndex,effective_cut_index:ci,classification:a.block.id==='minecraft:comparator'?'direct_one_way_comparator_output_to_decoder_wire':'direct_manual_STOP_source_to_clock_wire',source_body:a.body,target_body:b.body,original_source:t.source,original_target:t.target,source:a.position,target:b.position,source_block:a.block,target_block:b.block,actual_forward_dependency:true,actual_reverse_dependency:false,original_target_inputs:inputsOld,current_target_inputs:inputsNew,assembly_obligation:'Keep these two retained bodies in their present relative placement or explicitly replace this exact directed connection. It is not a missing cable and not a bidirectional signal.'});
 }
}
assert.equal(reciprocal.length,50);assert.equal(direct.length,6);
const classifications=new Map([...reciprocal.map(v=>[v.transfer_index,'self_return_wire_conductance_reconciled_no_independent_receiver']),...direct.map(v=>[v.transfer_index,'direct_internal_dependency_rechecked_present'])]);
const transfers=ledger.transfers.map((t,i)=>({...t,transfer_index:i,prior_status:t.status,status:classifications.get(i)??t.status}));
const cutDispositions=new Map();for(const r of reciprocal){cutDispositions.set(r.old.return_effective_cut,'reciprocal_self_return_conductance_no_independent_driver');cutDispositions.set(r.old.outgoing_effective_cut,'forward_output_root_with_checked_departure_and_fanout');}for(const r of direct)cutDispositions.set(r.effective_cut_index,'direct_internal_dependency_rechecked_present');
const count=xs=>xs.reduce((m,v)=>(m[v]=(m[v]??0)+1,m),{});
bytes('../memory/fabric-colocation-v2/cut-inputs.mjs');bytes('../control-commit-v2/route.mjs');bytes('reconcile.mjs');
const report={status:'bounded_actual_geometry_reciprocal_and_direct_edge_reconciliation',metrics:{reciprocal_rows:reciprocal.length,reciprocal_only_original_self_roots:reciprocal.length,semantic_bidirectional_transfers_found:0,direct_internal_rows:direct.length,original_cut_rows:cuts.crossings.length,classified_effective_cut_rows:cutDispositions.size,reciprocal_new_dispositions:count(reciprocal.map(r=>r.current.disposition)),negative_cases:negatives.length,foreign_source_transfers_still_pending:transfers.filter(t=>t.status==='external_source_transfer_pending').length,foreign_direct_boundaries_still_pending:ledger.direct_foreign_boundaries.length},reciprocal,direct,negative_cases:negatives,source_sha256:pins,limits:['Actual directed potential-input geometry only. Dust conduction is reciprocal; that alone does not declare a second logical producer or a bidirectional protocol.','The 50 local old reverse regions are solely dust rooted at their own retained output. Current geometry preserves every internal input and either removes transport return with a repeater or confines it to same-source dust before a repeater.','This discharges self-return receive-cable ambiguity only. It does not discharge any forward fanout, foreign boundary, missing source, pulse width, attenuation, decay, setup/hold, torch update or native obligation.','Five comparator output and one STOP lever direct dependencies are present and one-way under the effective-input model. This is not comparator truth or oscillator execution proof.','Parent independent repaired-v6 receipt is referenced as geometry/path-parity evidence only, not an independent full OR truth check.'],timing_acceptance:false,native_acceptance:false,complete_connected_candidate:false};
writeFileSync(new URL('reconciliation.json',H),JSON.stringify(report,null,2)+'\n');
writeFileSync(new URL('assembly-ledger.json',H),JSON.stringify({status:'original_complete_ledger_with_bounded_reciprocal_and_direct_dispositions',transfer_counts:count(transfers.map(t=>t.status)),transfers,direct_foreign_boundaries:ledger.direct_foreign_boundaries,effective_cut_ledger:ledger.effective_cut_ledger.map(c=>({...c,reconciliation:cutDispositions.get(c.index)??'unchanged_by_this_bounded_review'})),source_sha256:pins,limits:report.limits,native_acceptance:false},null,2)+'\n');
const csv=[['transfer_index','body','old_output_terminal','old_adjacent_wire','return_cut_index','forward_cut_index','current_output_terminal','first_departure_repeaters','drawn_forward_transfer_count'],...reciprocal.map(r=>[r.transfer_index,r.body,K(r.old.terminal),K(r.old.adjacent_transport_wire),r.old.return_effective_cut,r.old.outgoing_effective_cut,K(r.current.terminal),r.current.departures.map(d=>K(d.first_isolating_repeater)).join(';'),r.current.checked_forward_transfers.length])];
writeFileSync(new URL('reciprocal-endpoints.csv',H),csv.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n');
console.log(JSON.stringify(report.metrics));
