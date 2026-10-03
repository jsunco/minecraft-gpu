// Read-only geometry comparison. The ALU admission input may still be a draft.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const file=n=>new URL(n,import.meta.url),read=n=>JSON.parse(readFileSync(file(n))),sha=n=>createHash('sha256').update(readFileSync(file(n))).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
const lsuPath='../control-lsu-core-v1/design.json',aluPath='../alu-core-admission-v1/design.json';
let lsu=read(lsuPath);const extra=lsu.blocks.filter(v=>v.part!=='core_parent');lsu=null;
const alu=read(aluPath),m=new Map(alu.blocks.map(v=>[K(v.position),v]));let supports=0;const identicalDevices=[],conflicts=[];
for(const b of extra){const old=m.get(K(b.position));if(!old)continue;const record={position:b.position,lsu_part:b.part,alu_part:old.part,lsu_block:b.block,alu_block:old.block};if(JSON.stringify(old.block)!==JSON.stringify(b.block))conflicts.push(record);else if(b.block.id.endsWith('_concrete'))supports++;else identicalDevices.push(record);}
const r={status:'draft_overlap_inventory_only',sources:{[lsuPath]:sha(lsuPath),[aluPath]:sha(aluPath)},lsu_added_cells:extra.length,identical_supports:supports,identical_devices:identicalDevices,conflicts,limits:['Equal block state does not prove equal electrical net. Every shared device still needs signal identity/interaction review.','This inventory neither freezes the ALU draft nor claims successful composition.'],native_calls:0};
if(process.argv.includes('--save'))writeFileSync(file('draft-overlap.json'),JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify(r));
