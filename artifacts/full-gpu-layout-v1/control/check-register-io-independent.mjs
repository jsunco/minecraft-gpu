import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeGpuRegisterBank} from '../../../hardware/full-gpu-register-bank.mjs';
const root=new URL('../../../',import.meta.url),H=x=>createHash('sha256').update(x).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
const travel={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},step=(p,d,n=1)=>({x:p.x+d[0]*n,y:p.y,z:p.z+d[1]*n});
const sourcePaths=['hardware/full-gpu-register-bank.mjs','artifacts/compact-register-file-v1/design.json',...Array.from({length:4},(_,i)=>`artifacts/full-gpu-layout-v1/registers/lane${i}.json`)];
let bitPorts=0,faces=0;const reports=[];
for(let lane=0;lane<4;lane++){
 const saved=JSON.parse(readFileSync(new URL(sourcePaths[lane+2],root))),generated=makeGpuRegisterBank({lane});assert.deepEqual(saved,generated);
 const cells=new Map(saved.blocks.map(v=>[K(v.position),v]));
 for(const port of Object.values(saved.ports))for(const bit of port.bits){
  bitPorts++;const iso=cells.get(K(bit.isolator));assert.equal(iso.block.id,'minecraft:repeater');const d=travel[iso.block.properties.facing];assert(d);
  const rear=step(iso.position,d,-1),front=step(iso.position,d);
  assert.equal(K(rear),K(port.direction==='input'?bit.position:bit.parent_pad));assert.equal(K(front),K(port.direction==='input'?bit.pad:bit.position));
  if(port.direction==='input'){
    const receiver=cells.get(K(bit.receiver));assert.equal(receiver.block.id,'minecraft:repeater');assert.deepEqual(travel[receiver.block.properties.facing],d);
    assert.equal(K(step(bit.pad,d)),K(receiver.position));assert.equal(cells.get(K(bit.pad)).block.id,'minecraft:redstone_wire');
  }else{const original=cells.get(K(bit.source));assert.equal(original.block.id,'minecraft:repeater');assert.deepEqual(travel[original.block.properties.facing],d);assert.equal(K(step(original.position,d)),K(bit.parent_pad));}
  for(const side of [[d[1],d[0]],[-d[1],-d[0]]]){const near=cells.get(K(step(iso.position,side)));assert(!near||near.block.id==='minecraft:light_gray_concrete');faces++;}
 }
 const newSupports=saved.blocks.filter(v=>v.part==='adapter_support');
 for(const s of newSupports)for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
   const q={x:s.position.x+d[0],y:s.position.y+d[1],z:s.position.z+d[2]},v=cells.get(K(q));
   if(v?.part==='accepted_parent')assert.equal(v.block.id,'minecraft:light_gray_concrete','new support contacts original device');
 }
 assert.equal(saved.changes.filter(c=>c.reason==='replace_fixture_source_with_machine_input').length,28);
 assert.equal(saved.blocks.filter(v=>v.block.id==='minecraft:lever').length,0);
 reports.push({lane,blocks:saved.blocks.length,input_bits:28,output_bits:16,new_supports:newSupports.length,source_replacements:28});
}
const report={status:'independently_checked_offline_register_io_geometry',source_sha256:Object.fromEntries(sourcePaths.map(p=>[p,H(readFileSync(new URL(p,root)))])),
  checks:{lanes:4,bit_ports:bitPorts,isolator_side_faces:faces,reports},native_calls:0,
  limits:['Inherited complete RF is not re-proven here.','Physical IO derivatives have not run natively; preservation of source cells and isolation screens do not prove loaded timing.','No controller or external routes are present in these maps.']};
if(process.argv.includes('--save'))writeFileSync(new URL('register-io-independent-review.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
