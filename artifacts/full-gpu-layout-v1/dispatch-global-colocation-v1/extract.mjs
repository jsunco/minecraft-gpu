// Actual selected-cell ownership and complete effective electrical cuts.
// No native calls, regenerated parent, placement or selection change.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readLargeDesign,writeLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),B='artifacts/full-gpu-layout-v1/';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z),ZERO=P(0,0,0),pins={};
const numeric=p=>((p.x+1048576)*2097152+p.z+1048576)*512+p.y+64;
function read(n){const u=new URL(n,ROOT),bytes=readFileSync(u);pins[n]=createHash('sha256').update(bytes).digest('hex');return bytes.length<450e6?JSON.parse(bytes):readLargeDesign(fileURLToPath(u));}
// Frozen local snapshot: later root selection changes do not alter this baseline.
const cfg=read(B+'dispatch-global-colocation-v1/selected-config.json');
const ownNames=['dispatcher','global','master-reset-requesters-v2'],selected=cfg.instances.filter(v=>ownNames.includes(v.name));assert.equal(selected.length,3);
const rows=[],index=new Map(),world=new Map(),owner=[],refMaps={},declared=[];
for(const c of selected){const d=read(c.path);assert.equal(pins[c.path],c.sha256);read(c.source_manifest);assert.equal(pins[c.source_manifest],c.source_manifest_sha256);refMaps[c.name]={design:d,translation:c.translation};
 for(const v of d.blocks){const p=A(v.position,c.translation),k=K(p);assert(!index.has(k));index.set(k,rows.length);rows.push({position:p,block:v.block,reference_instance:c.name,reference_part:v.part??null});world.set(k,v.block);owner.push(c.name);}
 declared.push({instance:c.name,translation:c.translation,ports:d.ports,connections:d.connections,routes:(d.routes??[]).map(v=>({name:v.name,points:v.path?.length,from:v.path?.[0],to:v.path?.at(-1)}))});
}
// The single existing DCR/panel is embedded in memory. Start with its known
// exact positions; the selected memory read below replaces states before cuts.
const panel=read(B+'config-panel/design.json'),panelT=P(-400,0,600),panelKeys=new Set();
for(const v of panel.blocks){const p=A(v.position,panelT),k=K(p);assert(!index.has(k));panelKeys.add(k);index.set(k,rows.length);rows.push({position:p,block:v.block,reference_instance:'panel',reference_part:v.part??null});world.set(k,v.block);owner.push('panel');}
const labels=['unpartitioned_cables'],labelID=new Map(),bodySpecs=[],assignment=new Uint16Array(rows.length),changes=[];
function claim(name,d,t=ZERO,predicate=()=>true){assert(!labelID.has(name));const id=labels.length;labels.push(name);labelID.set(name,id);let count=0;
 for(const v of d.blocks){if(!predicate(v))continue;const p=A(v.position,t),k=K(p),i=index.get(k);assert(i!==undefined,'Missing body cell '+name+' '+k);assert(!assignment[i],'Body overlap '+name+' / '+labels[assignment[i]]+' '+k);assignment[i]=id;count++;if(JSON.stringify(v.block)!==JSON.stringify(rows[i].block))changes.push({body:name,position:p,historical:v.block,selected:rows[i].block});}
 assert(count>0,name);bodySpecs.push({name,label:id,reference_translation:t,cells:count,source_ports:d.ports??null});console.log(JSON.stringify({body:name,cells:count}));
}
const DT=refMaps.dispatcher.translation,GT=refMaps.global.translation;
const part=(n,p,t,s)=>claim(n,read(B+p),t,v=>s.includes(v.part));
claim('dispatch/microdecode',read(B+'dispatch-controller-v1/design.json'),DT);
part('dispatch/next_logic','dispatch-controller-v1/state-feedback/design.json',DT,['conditional_next']);
part('dispatch/microstate_stores','dispatch-controller-v1/state-feedback/design.json',DT,['state_banks']);
for(const [n,t]of [['dispatched',P(0,0,400)],['completed',P(0,0,464)]])claim('dispatch/'+n,read(B+'dispatch-counter-phased-v1/design.json'),A(DT,t));
for(const [n,t]of [['remaining',P(100,0,400)],['last',P(164,0,400)],['all_done',P(100,0,464)]])claim('dispatch/compare_'+n,read(B+'dispatch-controller-v1/byte-comparison/design.json'),A(DT,t));
claim('dispatch/total',read(B+'dispatch-count/design.json'),A(DT,P(-128,80,336)));
part('dispatch/output_next','dispatch-output-v1/feedback/design.json',A(DT,P(160,0,-32)),['conditional_next']);
part('dispatch/output_stores','dispatch-output-v1/feedback/design.json',A(DT,P(160,0,-32)),['state_banks']);
for(let c=0;c<2;c++)claim('dispatch/payload'+c,read(B+'dispatch-payload-v1/bank/design.json'),A(DT,P(380+44*c,0,400)));
claim('dispatch/lane_mask',read(B+'dispatch-payload-v1/mask/design.json'),A(DT,P(460,56,416)));
claim('dispatch/predicates',read(B+'dispatch-predicates-v1/logic/design.json'),A(DT,P(520,128,-32)));
claim('dispatch/scanner_and_clock',read(B+'startup-scan-v1/clock/design.json'),A(DT,P(-600,180,-248)));
part('dispatch/admission_logic','dispatch-startup-v1/admission-feedback/design.json',A(DT,P(-540,0,280)),['conditional_next']);
part('dispatch/admission_stores','dispatch-startup-v1/admission-feedback/design.json',A(DT,P(-540,0,280)),['state_banks']);
claim('dispatch/input_samples',refMaps.dispatcher.design,DT,v=>v.part==='input_samples');
part('global/next_logic','global-control-v3/feedback/design.json',GT,['conditional_next']);
part('global/state_stores','global-control-v3/feedback/design.json',GT,['state_banks']);
part('global/held_commands','global-held-commands-v1/design.json',GT,['held_commands']);
for(const p of ['sample0','sample1','conjunctions'])part('global/'+p,'global-input-sampler-v1/design.json',GT,[p]);
part('global/clock','global-clocked-control-v1/design.json',GT,['oscillator']);
part('global/command_gates','global-command-assembly-v3/design.json',GT,['commands']);
const req=refMaps['master-reset-requesters-v2'].design;
for(let c=0;c<2;c++)claim('requester'+c,req,ZERO,v=>v.part==='requester'+c);
for(const n of Object.keys(req.parents)){if(['existing_master','requester0','requester1'].includes(n))continue;claim('requester_join/'+n,req,ZERO,v=>v.part===n);}
claim('panel/DCR',panel,panelT);
// Do not misclassify the real startup selector/data-clamp gates or STOP as
// replaceable transport. These fifteen comparators retain both actual inputs;
// their incoming side masks are separate cuts, never implicit constants.
let retainedGates=0,retainedStops=0;
for(let i=0;i<rows.length;i++){
 if(assignment[i])continue;const v=rows[i];if(!['minecraft:comparator','minecraft:lever'].includes(v.block.id))continue;
 const support=rows[index.get(K(P(v.position.x,v.position.y-1,v.position.z)))];assert(support?.block.id.endsWith('_concrete'),'Missing gate support');
 const name=v.block.id==='minecraft:comparator'?'dispatch/boundary_gate_'+retainedGates++:'global/STOP_'+retainedStops++;
 claim(name,{blocks:[v,support]},ZERO);
}
assert.equal(retainedGates,15);assert.equal(retainedStops,1);
// Complete radius-3 context about body cells permits both incoming and
// outgoing effective edges through an adjacent powered conductor. Preserve
// only nearby foreign rows; never infer an empty boundary from declared ports.
const wanted=new Set(),bodyTargets=new Set();
for(let i=0;i<rows.length;i++){const p=rows[i].position;for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){const distance=Math.abs(dx)+Math.abs(dy)+Math.abs(dz);if(distance<=3)wanted.add(numeric(P(p.x+dx,p.y+dy,p.z+dz)));if(assignment[i]&&distance<=2)bodyTargets.add(numeric(P(p.x+dx,p.y+dy,p.z+dz)));}}
const context=[],contextOwner=new Map(),panelSeen=new Set();let scanned=0;
for(const c of cfg.instances){if(ownNames.includes(c.name))continue;let d=read(c.path);assert.equal(pins[c.path],c.sha256);let accepted=0;
 for(const v of d.blocks){scanned++;const p=A(v.position,c.translation);if(!wanted.has(numeric(p)))continue;const k=K(p);
  if(panelKeys.has(k)){assert.equal(c.name,'memory');panelSeen.add(k);const i=index.get(k);if(JSON.stringify(rows[i].block)!==JSON.stringify(v.block))changes.push({body:'panel/DCR',position:p,historical:rows[i].block,selected:v.block});rows[i].block=v.block;world.set(k,v.block);continue;}
  assert(!world.has(k),'Selected foreign overlap '+c.name+' '+k);world.set(k,v.block);context.push({position:p,block:v.block,reference_instance:c.name});contextOwner.set(k,c.name);accepted++;
 }
 console.log(JSON.stringify({foreign:c.name,scanned:d.blocks.length,retained:accepted}));d=null;global.gc?.();
}
assert.equal(panelSeen.size,panel.blocks.length);
const TR={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},stats=labels.map(name=>({name,cells:0,stores:0,materials:{},box:{from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)}})),stores=[];
for(let i=0;i<rows.length;i++){const v=rows[i],s=stats[assignment[i]];s.cells++;s.materials[v.block.id]=(s.materials[v.block.id]??0)+1;for(const a of ['x','y','z']){s.box.from[a]=Math.min(s.box.from[a],v.position[a]);s.box.to[a]=Math.max(s.box.to[a],v.position[a]);}
 if(v.block.id!=='minecraft:repeater')continue;const d=TR[v.block.properties.facing],locks=[];for(const t of Object.values(TR)){if(d.x*t.x+d.z*t.z)continue;const p=A(v.position,t),b=world.get(K(p));if(['minecraft:repeater','minecraft:comparator'].includes(b?.id)&&K(A(p,TR[b.properties.facing]))===K(v.position))locks.push(p);}
 if(locks.length){s.stores++;stores.push({position:v.position,body:s.name,reference_instance:v.reference_instance,locks});}
}
assert.equal(stores.filter(s=>s.reference_instance==='dispatcher').length,125);assert.equal(stores.filter(s=>s.reference_instance==='global').length,28);assert.equal(stores.filter(s=>s.reference_instance==='master-reset-requesters-v2').length,26);assert.equal(stores.filter(s=>s.reference_instance==='panel').length,8);assert.equal(stats[0].stores,0,'Unpartitioned real storage');
const bodyAt=p=>{const i=index.get(K(p));return i===undefined?'foreign/'+contextOwner.get(K(p)):labels[assignment[i]];},cross=[],byPair={};let receivers=0,internal=0;
for(const v of [...rows,...context]){if(!active(v.block))continue;const tBody=bodyAt(v.position),isBody=tBody!=='unpartitioned_cables'&&!tBody.startsWith('foreign/');
 if(!isBody&&!index.has(K(v.position))&&!bodyTargets.has(numeric(v.position)))continue;
 receivers++;
 for(const p of inputs(world,v.position)){assert(world.has(K(p)));const sBody=bodyAt(p),isSourceBody=sBody!=='unpartitioned_cables'&&!sBody.startsWith('foreign/');if(!isBody&&!isSourceBody)continue;if(tBody===sBody){internal++;continue;}
  const e={source:p,target:v.position,source_body:sBody,target_body:tBody,source_block:world.get(K(p)),target_block:v.block};cross.push(e);const k=sBody+' -> '+tBody;byPair[k]=(byPair[k]??0)+1;
 }
}
for(const b of bodySpecs){b.box=stats[b.label].box;b.stores=stats[b.label].stores;}
pins[B+'memory/fabric-colocation-v2/cut-inputs.mjs']=createHash('sha256').update(readFileSync(new URL('../memory/fabric-colocation-v2/cut-inputs.mjs',H))).digest('hex');
pins[B+'dispatch-global-colocation-v1/extract.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const report={status:'actual_body_cable_boundary_inventory_no_relocation',own_cells:rows.length,body_cells:rows.length-stats[0].cells,unpartitioned_cable_cells:stats[0].cells,actual_side_locked_stores:stores.length,bodies:bodySpecs,stats,selected_state_differences:changes,foreign_parent_cells_scanned:scanned,foreign_context_cells:context.length,effective_crossings:cross.length,crossings_by_pair:byPair,active_receivers_checked:receivers,within_body_dependencies:internal,source_sha256:pins,limits:['This is actual selected-cell extraction and both-direction effective dependency accounting, not a new placement or permission to remove any cable.','Nested bodies are intentionally coarse for counters, payloads, scanner/oscillator and requester control. Their complete internal costs remain included.','Foreign radius3 context covers actual support/direct/side/step interactions at body boundaries; it is not a complete selected-world electrical check.','No clock/delay cell is dropped or shortened. New layout routes and timing must be proved against all effective cuts before savings can be accepted.'],native_acceptance:false,world_mutations:0};
writeFileSync(new URL('inventory.json',H),JSON.stringify(report,null,2)+'\n');writeFileSync(new URL('actual-cuts.json',H),JSON.stringify({source_sha256:pins,crossings:cross},null,2)+'\n');
writeLargeDesign(fileURLToPath(new URL('bodies.json',H)),{status:report.status,blocks:rows.filter((_,i)=>assignment[i]).map(v=>({...v,body:labels[assignment[index.get(K(v.position))]]})),bodies:bodySpecs,source_sha256:pins});
writeFileSync(new URL('stores.json',H),JSON.stringify({source_sha256:pins,stores},null,2)+'\n');writeFileSync(new URL('cell-labels.u16le',H),Buffer.from(assignment.buffer));writeFileSync(new URL('cell-labels.json',H),JSON.stringify({labels,cells:rows.length,order:selected.map(v=>v.name).concat('panel'),source_sha256:pins},null,2)+'\n');
writeLargeDesign(fileURLToPath(new URL('reference-scope.json',H)),{status:report.status,blocks:rows,foreign_context:context,source_sha256:pins});writeFileSync(new URL('declared-boundaries.json',H),JSON.stringify({source_sha256:pins,declared},null,2)+'\n');console.log(JSON.stringify({own_cells:rows.length,body_cells:report.body_cells,cable_cells:stats[0].cells,stores:stores.length,bodies:bodySpecs.length,crossings:cross.length,foreign_context:context.length}));
