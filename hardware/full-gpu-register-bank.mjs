// Layout-first integration derivative. Pure geometry; no game/bridge/service imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const axes=['x','y','z'],K=p=>axes.map(a=>p[a]).join(','),H=b=>createHash('sha256').update(b).digest('hex');
const source='artifacts/compact-register-file-v1/design.json',sourceHash='478858635d907e74c9760614e5154a2c00e5a9d5bf8bf301c7849933655017b4';
const dir={west:{x:1,y:0,z:0},east:{x:-1,y:0,z:0},north:{x:0,y:0,z:1},south:{x:0,y:0,z:-1}};
const add=(a,b,n=1)=>Object.fromEntries(axes.map(k=>[k,a[k]+n*b[k]])),solid={id:'minecraft:light_gray_concrete'};
const bounds=bs=>({from:Object.fromEntries(axes.map(k=>[k,Math.min(...bs.map(v=>v.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...bs.map(v=>v.position[k]))]))});
export function makeGpuRegisterBank({lane=0}={}){
 assert(Number.isInteger(lane)&&lane>=0&&lane<4);
 const raw=readFileSync(resolve(root,source));assert.equal(H(raw),sourceHash);const parent=JSON.parse(raw);
 const shift=p=>Object.fromEntries(axes.map(k=>[k,p[k]-parent.box.from[k]]));
 const cells=new Map(parent.blocks.map(v=>{const position=shift(v.position);return[K(position),{position,block:structuredClone(v.block),part:'accepted_parent'}];}));
 const original=new Map([...cells].map(([k,v])=>[k,structuredClone(v.block)]));
 const changes=[],ports={},newCells=[];
 function put(position,block,part){const k=K(position),old=cells.get(k);if(old){assert.deepEqual(old.block,block,'Adapter overlap '+k);return;}const v={position,block,part};cells.set(k,v);newCells.push(v);}
 function support(position){put({...position,y:position.y-1},solid,'adapter_support');}
 function wire(position,name){support(position);put(position,{id:'minecraft:redstone_wire'},name);}
 function repeater(position,facing,name){support(position);put(position,{id:'minecraft:repeater',properties:{facing,delay:'1'}},name);}
 // Immutable physical lane identity; no runtime writes.
 for(let bit=0;bit<8;bit++){
  const at=shift({x:parent.origin.x+(bit>=4?10:2),y:parent.origin.y+121,z:parent.origin.z+8*(bit%4)}),v=cells.get(K(at));assert(v);
  const next={id:lane&(1<<bit)?'minecraft:redstone_block':solid.id};if(JSON.stringify(v.block)!==JSON.stringify(next)){changes.push({position:at,from:v.block,to:next,reason:'physical_lane_identity'});v.block=next;}
 }
 const atomInputs=[];
 for(const input of parent.inputs){
  const p=shift(input.position),v=cells.get(K(p));assert.equal(v.block.id,'minecraft:lever');assert.equal(v.block.properties.powered,'false');
  const candidates=Object.values(dir).map(d=>({d,p:add(p,d)})).filter(q=>{const b=cells.get(K(q.p))?.block;return b?.id==='minecraft:repeater'&&K(dir[b.properties.facing])===K(q.d);});
  assert.equal(candidates.length,1,'Ambiguous receiver '+input.name);const {d,p:receiver}=candidates[0],facing=cells.get(K(receiver)).block.properties.facing;
  changes.push({position:p,from:v.block,to:{id:'minecraft:redstone_wire'},reason:'replace_fixture_source_with_machine_input',signal:input.name});v.block={id:'minecraft:redstone_wire'};v.part='converted_input_pad';
  const isolator=add(p,d,-1),terminal=add(p,d,-2);repeater(isolator,facing,'input_isolator:'+input.name);wire(terminal,'input_terminal:'+input.name);
  atomInputs.push({name:input.name,position:terminal,travel:d,pad:p,isolator,receiver,bit_polarity:'active_high',required_high_power:15});
 }
 const atomOutputs=[];
 for(const bank of ['a','b'])for(let bit=0;bit<8;bit++){
  const s=parent.circuit.signals.find(s=>s.name===bank+bit),q=shift(s.position),b=cells.get(K(q)).block;assert.equal(b.id,'minecraft:repeater');const d=dir[b.properties.facing],pad=add(q,d);assert.equal(cells.get(K(pad)).block.id,'minecraft:redstone_wire');
  const isolator=add(q,d,2),terminal=add(q,d,3);repeater(isolator,b.properties.facing,'output_isolator:'+bank+bit);wire(terminal,'output_terminal:'+bank+bit);
  atomOutputs.push({name:bank+bit,position:terminal,travel:d,source:q,parent_pad:pad,isolator,bit_polarity:'active_high',driven_high_power:15});
 }
 function port(name,direction,names,meaning){const all=direction==='input'?atomInputs:atomOutputs;ports[name]={direction,width:names.length,bit_order:'least_significant_first',polarity:'active_high',meaning,bits:names.map((n,bit)=>({bit,...all.find(p=>p.name===n)}))};assert(ports[name].bits.every(b=>b.position));}
 const bitnames=(prefix,n)=>Array.from({length:n},(_,i)=>prefix+i);
 port('write_data','input',bitnames('d',8),'Stable before opening and until every ordinary write lock closes.');
 port('write_address','input',bitnames('wa',4),'Original register address; only0..12 have ordinary write paths.');
 port('read_address','input',bitnames('ra',4),'One physical read selector shared by sequential A/B capture.');
 port('write_enable','input',['we'],'High opens selected ordinary word; low closes.');
 port('block_id','input',bitnames('block',8),'Core block ID payload, held through ASSIGN closure.');
 port('assign_block','input',['assign'],'High assigns retainedR13; REQUEST defers this until both old operands close.');
 port('capture_a','input',['capture_a'],'High opens operandA; low closes.');port('capture_b','input',['capture_b'],'High opens operandB; low closes.');
 port('operand_a','output',bitnames('a',8),'Retained physical source operandA.');port('operand_b','output',bitnames('b',8),'Retained physical source operandB.');
 const blocks=[...cells.values()],box=bounds(blocks),histogram={};for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const changedPositions=new Set(changes.map(c=>K(c.position)));for(const[k,b]of original)if(!changedPositions.has(k))assert.deepEqual(cells.get(k).block,b);
 return{status:'offline_register_io_geometry_not_native_accepted',lane,source:{path:source,sha256:sourceHash,physical_evidence_scope:'Only original lane1 parent was tested; derivative IO and other lane instances are unverified.'},coordinate_frame:'Local parent minimum before adapters; no world/site selected.',box,blocks,ports,changes,
  metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,adapter_additions:newCells.length,source_replacements:28,lane_identity_changes:changes.filter(c=>c.reason==='physical_lane_identity').length,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),histogram},
  complete_component_geometry:true,complete_gpu:false,native_acceptance:false,
  missing_external:['Physical address/data/control producers, register reset/phase sequencer, lane enable qualification.','ALU/LSU/writeback wiring, interlane/core routing and full integration timing.'],
  initialization:'No reset port; controller must condition/read addresses, write all13ordinary words/R13 and capture zero intoA/B through normal ports. Both capture banks and every write gate closed before payload changes.'};
}
export function checkRegisterBank(d){
 const cells=new Map(d.blocks.map(v=>[K(v.position),v])),faces=Object.values(dir),same=(a,b)=>K(a)===K(b);let ports=0;
 for(const p of Object.values(d.ports))for(const bit of p.bits){ports++;const terminal=cells.get(K(bit.position));assert.equal(terminal.block.id,'minecraft:redstone_wire');assert.equal(cells.get(K({...bit.position,y:bit.position.y-1})).block.id,solid.id);
  const rep=cells.get(K(bit.isolator));assert.equal(rep.block.id,'minecraft:repeater');assert(same(dir[rep.block.properties.facing],bit.travel));
  // New diode sides must be clear; a neighbor here could inhibit or lock it.
  for(const off of faces.filter(v=>v.x*bit.travel.x+v.z*bit.travel.z===0)){const b=cells.get(K(add(bit.isolator,off)))?.block;assert(!b||b.id===solid.id,'Unexpected new diode side contact '+K(bit.isolator));}
  const predecessor=p.direction==='input'?bit.position:bit.parent_pad;
  assert(same(add(bit.isolator,bit.travel,-1),predecessor));const successor=p.direction==='input'?bit.pad:bit.position;assert(same(add(bit.isolator,bit.travel),successor));
 }
 assert.equal(ports,44);assert.equal(new Set(d.blocks.map(v=>K(v.position))).size,d.blocks.length);
 // New naked dust must touch only its declared isolator/old input receiver.
 const intended=new Set();for(const p of Object.values(d.ports))for(const bit of p.bits){intended.add([K(bit.position),K(bit.isolator)].sort().join('|'));if(p.direction==='input'){intended.add([K(bit.pad),K(bit.isolator)].sort().join('|'));intended.add([K(bit.pad),K(bit.receiver)].sort().join('|'));}}
 for(const v of d.blocks.filter(v=>v.part?.startsWith('input_terminal:')||v.part?.startsWith('output_terminal:')||v.part==='converted_input_pad'))for(const off of faces){const q=add(v.position,off),b=cells.get(K(q));if(b&&b.block.id!==solid.id)assert(intended.has([K(v.position),K(q)].sort().join('|')),'Unexpected dust face contact '+K(v.position)+' > '+K(q));}
 // Every adapter dust cell must be isolated from foreign level/step dust.
 const protectedDust=d.blocks.filter(v=>v.part?.startsWith('input_terminal:')||v.part?.startsWith('output_terminal:')||v.part==='converted_input_pad');
 for(const v of protectedDust)for(const f of faces)for(const dy of[-1,0,1]){const q={...add(v.position,f),y:v.position.y+dy},other=cells.get(K(q));if(other?.block.id!=='minecraft:redstone_wire')continue;if(dy===1&&cells.has(K({...v.position,y:v.position.y+1})))continue;if(dy===-1&&cells.has(K({...q,y:v.position.y})))continue;assert.fail('Foreign adapter dust slope '+K(v.position)+' > '+K(q));}
 for(const v of d.blocks.filter(v=>v.part==='adapter_support'))for(const f of[...faces,{x:0,y:1,z:0},{x:0,y:-1,z:0}]){const other=cells.get(K(add(v.position,f)));assert(!(other?.part==='accepted_parent'&&other.block.id!==solid.id),'New support touches parent device');}
 return{status:'offline_interface_support_and_direct_contact_checks_passed',lane:d.lane,...d.metrics,port_bits_checked:ports,native_calls:0,native_acceptance:false,limits:['No full dynamic/electrical simulation. Screened adapter slopes and support faces do not replace full signal-graph or loaded native timing review.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2];assert(out,'Output directory required');mkdirSync(out,{recursive:true});
 const reviews=[];for(let lane=0;lane<4;lane++){const d=makeGpuRegisterBank({lane});reviews.push(checkRegisterBank(d));writeFileSync(join(out,`lane${lane}.json`),JSON.stringify(d)+'\n');}
 writeFileSync(join(out,'checks.json'),JSON.stringify({reviews,native_acceptance:false},null,2)+'\n');console.log(JSON.stringify(reviews.map(r=>({lane:r.lane,blocks:r.blocks,additions:r.adapter_additions,dimensions:r.dimensions,ports:r.port_bits_checked}))));
}
