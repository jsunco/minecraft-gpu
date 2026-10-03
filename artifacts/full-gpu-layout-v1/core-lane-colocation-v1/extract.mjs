// Exact four-lane bodies and effective-input cuts before joint placement.
// This is extraction, not removal permission or a routed replacement.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import {fileURLToPath}from'node:url';
import {createHash}from'node:crypto';
import {readLargeDesign}from'../../../hardware/memory-layout-large-json-v2.mjs';
import {inputs,active}from'../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),B=new URL('../',H),ROOT=new URL('../../../',H);
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),pins={};
function read(n){const p=new URL(n,B),bytes=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(bytes).digest('hex');return bytes.length<450e6?JSON.parse(bytes):readLargeDesign(fileURLToPath(p));}
const d=read('compact-core-fault-v1/design.json');assert.equal(d.blocks.length,1853787);assert.equal(pins['artifacts/full-gpu-layout-v1/compact-core-fault-v1/design.json'],'ae1269e63feb5c394c87e0f6eb44f29a618ab67d8988ce33742aa4b077bf5db1');
const rows=d.blocks,index=new Map(rows.map((v,i)=>[K(v.position),i])),world=new Map(rows.map(v=>[K(v.position),v.block]));assert.equal(index.size,rows.length);
const label=new Uint16Array(rows.length),labels=['shared_spine_and_unpartitioned_cables'],ids=new Map(),bodies=[],changes=[],missing=[];
const id=n=>{if(!ids.has(n)){ids.set(n,labels.length);labels.push(n);}return ids.get(n);};
function claim(name,blocks,t=P(0,0,0),{allowMissing=false,ports=null}={}){
 const i=id(name),actual=[],oldMissing=[];let changed=0;
 for(const v of blocks){const p=A(v.position,t),k=K(p),j=index.get(k);if(j===undefined){oldMissing.push(p);continue;}assert(!label[j]||label[j]===i,'Shared body cell '+k+' '+labels[label[j]]+'/'+name);label[j]=i;actual.push(j);
  if(JSON.stringify(v.block)!==JSON.stringify(rows[j].block)){changed++;changes.push({body:name,position:p,historical:v.block,current:rows[j].block});}
 }
 if(!allowMissing)assert.equal(oldMissing.length,0,name+' missing cells');missing.push({body:name,count:oldMissing.length,positions:oldMissing});
 if(!bodies.some(b=>b.name===name))bodies.push({name,label:i,reference_translation:t,declared_ports:ports});
 console.log(JSON.stringify({claim:name,actual:actual.length,absent:oldMissing.length,changed}));
}
const alu=read('alu-v5/design.json'),lsu=read('control-lsu-v2/design.json'),wb=read('writeback/design.json'),oldWB=read('register-sequencer-v1/four-files-writeback-v1/design.json');
const alut=[P(1800,78,0),P(1984,78,0),P(1800,202,0),P(1984,202,0)],rfT=[P(460,66,100),P(540,70,100),P(460,74,180),P(540,78,180)],lsuT=[P(300,0,400),P(600,0,400),P(300,150,400),P(600,150,400)];
const removedRaw=new Set(['request','enable','mem_read','mem_write','reset','read_ready','write_ready','drained'].map(n=>'external_guard_'+n).concat(['request','reset','update'].map(n=>'external_next_'+n)));
for(let lane=0;lane<4;lane++){
 claim('lane'+lane+'/alu',alu.blocks,alut[lane],{ports:alu.ports});
 claim('lane'+lane+'/lsu',lsu.blocks.filter(b=>!removedRaw.has(b.part)),lsuT[lane],{ports:lsu.ports});
 const rf=read('register-sequencer-v1/file-address-stage/lane'+lane+'.json');claim('lane'+lane+'/rf',rf.blocks,rfT[lane],{ports:rf.ports});
 claim('lane'+lane+'/writeback',wb.blocks,P(rfT[lane].x,-24,rfT[lane].z-30),{ports:wb.ports});
 claim('lane'+lane+'/rf',oldWB.blocks.filter(b=>b.part?.startsWith('lane'+lane+'_writeback')),P(900,53,0));
}
// The existing nine held guards and all within-LSU replacement paths belong
// with their lane. Initialize cables are external even for lane2's shared tap.
const guards=read('control-lsu-guards-v3/design.json');
for(let lane=0;lane<4;lane++)claim('lane'+lane+'/lsu',guards.blocks.filter(b=>b.part?.startsWith('guard_bank_'+lane+'_')||b.part?.startsWith('guard_clear_'+lane)||b.part?.startsWith('guard_clamp_'+lane+'_')||b.part?.startsWith('lane'+lane+'_')&&b.part!=='lane'+lane+'_guard_initialize'));
// Verify real pad isolation and its first receiving diode against the FULL
// core, including direct/indirect solid power. No metadata-only missing claim.
const undriven=[];
for(let lane=0;lane<4;lane++){
 const audits=[...alu.ports.filter(p=>['operand_a','operand_b'].includes(p.name)).map(p=>({family:'RF_to_ALU',port:p.name,bit:p.bit,position:A(p.position,alut[lane]),receiver:A(p.receiver,alut[lane])})),...['alu','immediate','select'].flatMap(n=>wb.ports[n].bits.map(p=>({family:n==='alu'?'ALU_to_writeback':n==='immediate'?'IR_immediate_to_writeback':'writeback_select',port:n,bit:p.bit,position:A(p.position,P(rfT[lane].x,-24,rfT[lane].z-30)),receiver:p.receiver?A(p.receiver,P(rfT[lane].x,-24,rfT[lane].z-30)):null})))];
 for(const q of audits){
  assert.equal(world.get(K(q.position))?.id,'minecraft:redstone_wire');const predecessors=inputs(world,q.position);
  const candidates=q.receiver?[q.receiver]:Object.values({e:P(1,0,0),w:P(-1,0,0),n:P(0,0,-1),s:P(0,0,1)}).map(v=>A(q.position,v));
  const next=candidates.filter(p=>['minecraft:repeater','minecraft:comparator'].includes(world.get(K(p))?.id)&&inputs(world,p).some(s=>K(s)===K(q.position)));
  assert(next.length>0,'No actual first diode '+K(q.position));
  assert.equal(predecessors.length,0,'Pad has actual incoming source '+K(q.position));
  undriven.push({...q,lane,pad_block:world.get(K(q.position)),actual_pad_predecessors:predecessors,first_receivers:next.map(p=>({position:p,block:world.get(K(p)),all_effective_predecessors:inputs(world,p)}))});
 }
}
assert.equal(undriven.length,136);
writeFileSync(new URL('missing-internal-inputs.json',H),JSON.stringify({status:'actual_complete_core_undriven_required_data_inputs',per_core_missing_bits:136,two_core_missing_bits:272,counts_per_core:{RF_to_ALU:64,ALU_to_writeback:32,IR_immediate_to_writeback:32,writeback_select:8},witnesses:undriven,source_sha256:pins,scope:['Checks every actual pad and first receiving diode using complete core power map, including indirect strong conductor inputs and dust steps.','No input predecessor exists at these real ALU A/B and writeback input pads; first receiving diodes are present and directly read those pads.','The 443 master-boundary ledger is a separate scope. These absent internal wires are mandatory additions, never historical route savings.'],native_acceptance:false},null,2)+'\n');
// Count stores from the complete actual world; metadata is not the census.
const TR={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},states=[],stats=labels.map(name=>({name,cells:0,stores:0,materials:{},box:{from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)}}));
for(let j=0;j<rows.length;j++){
 const v=rows[j],s=stats[label[j]];s.cells++;s.materials[v.block.id]=(s.materials[v.block.id]??0)+1;for(const a of['x','y','z']){s.box.from[a]=Math.min(s.box.from[a],v.position[a]);s.box.to[a]=Math.max(s.box.to[a],v.position[a]);}
 if(v.block.id!=='minecraft:repeater')continue;const dir=TR[v.block.properties.facing],locks=[];
 for(const side of Object.values(TR)){if(side.x*dir.x+side.z*dir.z)continue;const q=A(v.position,side),b=world.get(K(q));if(['minecraft:repeater','minecraft:comparator'].includes(b?.id)&&K(A(q,TR[b.properties.facing]))===K(v.position))locks.push(q);}
 if(locks.length){states.push({position:v.position,body:s.name,locks});s.stores++;}
}
assert.equal(states.length,1117);for(let i=0;i<4;i++){assert.equal(stats[ids.get('lane'+i+'/rf')].stores,128);assert.equal(stats[ids.get('lane'+i+'/alu')].stores,57);assert.equal(stats[ids.get('lane'+i+'/lsu')].stores,46);}
// Every actual effective dependency that crosses a body boundary is retained,
// including output dust reciprocity, later lock taps and indirect support power.
const cross=[],byPair={},ins=new Map(),outs=new Map();let audited=0,internal=0;
for(let j=0;j<rows.length;j++){
 const v=rows[j];if(!active(v.block))continue;audited++;
 for(const q of inputs(world,v.position)){
  const qi=index.get(K(q));assert(qi!==undefined);const a=label[qi],b=label[j];if(a===b){internal++;continue;}
  if(!a&&!b)continue;const e={source:q,target:v.position,source_body:labels[a],target_body:labels[b],source_id:rows[qi].block.id,target_id:v.block.id};cross.push(e);const key=labels[a]+' -> '+labels[b];byPair[key]=(byPair[key]??0)+1;
  if(b){if(!ins.has(b))ins.set(b,new Set);ins.get(b).add(K(v.position));}if(a){if(!outs.has(a))outs.set(a,new Set);outs.get(a).add(K(q));}
 }
}
for(const s of bodies){s.cells=stats[s.label].cells;s.box=stats[s.label].box;s.stores=stats[s.label].stores;s.effective_input_receiver_positions=ins.get(s.label)?.size??0;s.effective_output_source_positions=outs.get(s.label)?.size??0;}
// Preserve exact block states in a compact, independent body map for routing.
const bodyRows=rows.filter((_,i)=>label[i]).map(v=>({...v,body:labels[label[index.get(K(v.position))]]}));
const report={status:'actual_lane_body_cut_inventory_not_relocated',parent:'artifacts/full-gpu-layout-v1/compact-core-fault-v1/design.json',reference_cells:rows.length,comparison_guard_cells:1828787,actual_stores:states.length,bodies,stats,changes,historical_absence:missing.filter(v=>v.count),audited_active_receivers:audited,internal_dependencies:internal,effective_crossings:cross.length,crossings_by_group:byPair,source_sha256:pins,limits:['Complete actual effective-input crossing census, not only named ports. Potential dependencies are conservative, not scheduled Minecraft events.','Shared control and unpartitioned cables remain in group0; this is not a completed full-core partition or removal permission.','Every phase, initialize, status, closure and data dependency must be rerouted before a selected whole-core saving.'],native_acceptance:false};
writeFileSync(new URL('inventory.json',H),JSON.stringify(report,null,2)+'\n');writeFileSync(new URL('actual-cuts.json',H),JSON.stringify({source_sha256:pins,crossings:cross},null,2)+'\n');writeFileSync(new URL('bodies.json',H),JSON.stringify({status:report.status,blocks:bodyRows,bodies,source_sha256:pins})+'\n');writeFileSync(new URL('stores.json',H),JSON.stringify({source_sha256:pins,stores:states},null,2)+'\n');writeFileSync(new URL('cell-labels.u16le',H),Buffer.from(label.buffer));writeFileSync(new URL('cell-labels.json',H),JSON.stringify({parent:report.parent,parent_sha256:pins[report.parent],labels,cells:rows.length})+'\n');
console.log(JSON.stringify({cells:rows.length,stores:states.length,bodies:stats,actual_crossings:cross.length,audited_receivers:audited}));
