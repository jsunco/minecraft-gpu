import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {materializeInstance,assemble,rotatePosition,transformBlock} from '../../hardware/gpu-layout-assembly.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const read=p=>JSON.parse(readFileSync(root+'/'+p));
const K=p=>`${p.x},${p.y},${p.z}`;
const d=read('artifacts/full-gpu-layout-v1/registers/lane1.json');
let checks=0;
for(let q=0;q<4;q++){
 const m=materializeInstance(d,{id:'rotated',translation:{x:61,y:-60,z:17},quarter_turns:q});
 for(let i=0;i<d.blocks.length;i++){
  const p=m.blocks[i].position,local=rotatePosition({x:p.x-61,y:p.y+60,z:p.z-17},(4-q)%4);
  assert.deepEqual(local,d.blocks[i].position);
  assert.deepEqual(transformBlock(m.blocks[i].block,(4-q)%4),d.blocks[i].block);checks++;
 }
 const map=new Map(m.blocks.map(v=>[K(v.position),v]));
 for(const p of Object.values(m.ports))for(const bit of p.bits){
  for(const key of['position','pad','isolator','receiver','source','parent_pad'])if(bit[key])assert(map.has(K(bit[key])),`${key} does not address transformed block`);
  const rep=map.get(K(bit.isolator)).block;
  const travel={west:{x:1,y:0,z:0},east:{x:-1,y:0,z:0},north:{x:0,y:0,z:1},south:{x:0,y:0,z:-1}}[rep.properties.facing];
  assert.deepEqual(bit.travel,travel);checks++;
 }
}
const a=read('artifacts/full-gpu-layout-v1/register-array.partial.json');assert.equal(a.metrics.blocks,104384);assert.equal(a.metrics.port_bits,352);
const native=read('artifacts/compact-register-file-v1/design.json');
const retained=new Map(a.blocks.filter(v=>v.instance==='gpu/core0/lane1/registers').map(v=>[K(v.position),v.block]));
const replaced=new Set(native.inputs.map(v=>K(v.position)));
for(const cell of native.blocks)if(!replaced.has(K(cell.position))) {assert.deepEqual(retained.get(K(cell.position)),cell.block);checks++;}
for(let lane=0;lane<4;lane++){
 const l=read(`artifacts/full-gpu-layout-v1/registers/lane${lane}.json`),map=new Map(l.blocks.map(v=>[K(v.position),v.block]));let value=0;
 for(let bit=0;bit<8;bit++){const p={x:20+(bit>=4?10:2),y:121,z:18+8*(bit%4)},b=map.get(K(p));assert(['minecraft:redstone_block','minecraft:light_gray_concrete'].includes(b.id));if(b.id==='minecraft:redstone_block')value+=1<<bit;}
 assert.equal(value,lane);checks++;
}
assert.throws(()=>assemble([materializeInstance(d,{id:'a',translation:{x:0,y:0,z:0}}),materializeInstance(d,{id:'b',translation:{x:0,y:0,z:0}})]),/collision/);checks++;
assert.throws(()=>assemble([materializeInstance(d,{id:'too_high',translation:{x:0,y:300,z:0}})]),/height/);checks++;
const hash=p=>createHash('sha256').update(readFileSync(root+'/'+p)).digest('hex');
const receipt={status:'offline_assembly_checks_passed',checks,scope:['All four rotations invert positions, facing and dust cardinal properties.','Every transformed port coordinate addresses its corresponding placed block.','Original core0/lane1 parent cells unchanged outside 28 declared source replacements.','R15 physical constant decodes to lane0..3.','Duplicate instance and out-of-height geometry refused.'],sources:Object.fromEntries(['hardware/full-gpu-register-bank.mjs','hardware/gpu-layout-assembly.mjs','artifacts/full-gpu-layout-v1/register-array.partial.json'].map(p=>[p,hash(p)])),native_acceptance:false,complete_gpu_layout:false};
writeFileSync(root+'/artifacts/full-gpu-layout-v1/registers/assembly-check.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
