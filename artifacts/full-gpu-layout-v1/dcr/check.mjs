import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeDcr} from '../../../hardware/full-gpu-dcr.mjs';
import {makeResetRegister} from '../../../hardware/register-reset.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(p,d)=>P(p.x+d.x,p.y+d.y,p.z+d.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},dirs=Object.values(D);
const d=makeDcr(),parent=makeResetRegister({origin:P(0,0,0),bits:8,id:'gpu_register_dcr8'});assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const cells=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>cells.get(K(p)),isSolid=b=>['minecraft:cyan_concrete','minecraft:light_gray_concrete'].includes(b?.id);let supports=0;
const replacements=new Set(d.replacements.map(v=>K(v.position)));
for(const cell of parent.blocks){const now=at(cell.position);if(!replacements.has(K(cell.position)))assert.deepEqual(now.block,cell.block);assert.equal(at({...cell.position,y:0}).block.id,'minecraft:cyan_concrete');}
for(const v of d.blocks){if(isSolid(v.block))continue;const p=v.position,s=v.block.id==='minecraft:redstone_wall_torch'?add(p,D[v.block.properties.facing]):{...p,y:p.y-1};assert(isSolid(at(s)?.block),'Missing support '+K(p));supports++;}
let sides=0,sourceColumns=0;
for(const v of d.blocks.filter(v=>v.part.startsWith('input_receiver_')||v.part.endsWith('_isolate'))){if(v.block.id!=='minecraft:repeater')continue;for(const delta of dirs.filter(q=>q.x===0)){assert(!at(add(v.position,delta)),'New side contact '+K(v.position));sides++;}}
for(const p of Object.values(d.ports).filter(p=>p.direction==='input'))for(const bit of p.bits){const{x,z}=bit.original_pad;for(const y of[-4,-2,0])assert(isSolid(at(P(x,y,z))?.block));for(const y of[-3,-1])assert.equal(at(P(x,y,z)).block.id,'minecraft:redstone_torch');assert.deepEqual(at(bit.receiver).block.properties,{facing:'west',delay:'1'});assert.equal(at(bit.position).block.id,'minecraft:redstone_wire');sourceColumns++;}
const intended=new Set();for(let bit=0;bit<8;bit++)intended.add([K(P(6,1,bit*8)),K(P(6,2,bit*8-1))].sort().join('|'));
let parentStepContacts=0;
for(const v of d.blocks.filter(v=>v.block.id==='minecraft:redstone_wire'))for(const dir of dirs)for(const dy of[-1,0,1]){
 const q=add(v.position,dir);q.y+=dy;const other=at(q);if(other?.block.id!=='minecraft:redstone_wire')continue;if(dy===1&&at({...v.position,y:v.position.y+1}))continue;if(dy===-1&&at({...q,y:v.position.y}))continue;
 const newA=v.part.startsWith('output_'),newB=other.part.startsWith('output_');
 if(newA!==newB){assert(intended.has([K(v.position),K(q)].sort().join('|')),'Foreign parent-output dust connection');parentStepContacts++;}
 if(newA&&newB)assert.equal(v.part.split('_')[1],other.part.split('_')[1],'Output bit short');
}
// Readback route only; a locked-Q output is the seed. No storage simulation.
function propagate(seed){const powers=new Map([[K(seed),15]]),queue=[seed];for(let i=0;i<queue.length;i++){const p=queue[i],b=at(p)?.block,n=powers.get(K(p));const out=b.id==='minecraft:repeater'?[D[b.properties.facing]]:dirs;
 for(const dir of out)for(const dy of(b.id==='minecraft:redstone_wire'?[-1,0,1]:[0])){const q=add(p,dir);q.y+=dy;const qb=at(q)?.block;if(dy===1&&at({...p,y:p.y+1}))continue;if(dy===-1&&at({...q,y:p.y}))continue;let next;
 if(qb?.id==='minecraft:redstone_wire')next=b.id==='minecraft:repeater'?15:n-1;
 else if(qb?.id==='minecraft:repeater'&&dy===0&&K(D[qb.properties.facing])===K(dir))next=n>0?15:0;else continue;
 if(next>0&&next>(powers.get(K(q))??0)){powers.set(K(q),next);queue.push(q);}}
 }return powers;}
let minRear=15;for(const bit of d.ports.thread_count.bits){const powers=propagate(bit.parent_source);assert.equal(powers.get(K(bit.position)),15);minRear=Math.min(minRear,powers.get(K({...bit.source,x:bit.source.x-1})));for(const other of d.ports.thread_count.bits)if(other.bit!==bit.bit)assert(!powers.has(K(other.position)));}
// Every new component must not contact any unrelated parent device directly.
let boundaryContacts=0;for(const v of d.blocks.filter(v=>!v.part.startsWith('parent')&&!v.part.startsWith('retained')&&!v.part.startsWith('converted')))for(const delta of[...dirs,P(0,1,0),P(0,-1,0)]){const q=add(v.position,delta),other=at(q);if(other?.part!=='parent_device'||isSolid(other.block))continue;assert(v.part.startsWith('output_')&&v.position.x===6&&v.position.y===1&&other.position.x===6&&other.position.z===v.position.z+1,'Unintended direct parent device contact '+K(v.position));boundaryContacts++;}
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');const result={status:'offline_dcr_derivative_static_checks_passed',blocks:d.blocks.length,parent_non_source_cells_preserved:parent.blocks.length-10,supports,new_diode_side_faces:sides,positive_input_columns:sourceColumns,parent_output_step_contacts:parentStepContacts,new_direct_parent_device_contacts:boundaryContacts,output_routes:8,minimum_output_repeater_rear_power:minRear,sources:{generator:sha('../../../hardware/full-gpu-dcr.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['No dynamic reset/source-column/lock timing or complete electrical simulation.','Input columns screened structurally; parent storage behavior inherited as design, not derivative native acceptance.','Panel/dispatch routes and closed-DCR-before-start sequencing missing.']};writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
