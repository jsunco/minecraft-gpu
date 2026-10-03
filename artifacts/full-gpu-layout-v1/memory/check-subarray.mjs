// Bounded offline map/support/interface checks. No service constructors or native IO.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeMemorySubarray,key} from '../../../hardware/memory-layout-subarray.mjs';
import {circuitSchema} from '../../../tools/minecraft-redstone/scripts/circuit-service.mjs';
const axes=['x','y','z'],dirs=[[1,0],[-1,0],[0,1],[0,-1]],solid=b=>['minecraft:light_gray_concrete','minecraft:redstone_block'].includes(b?.id);
const facing={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]},attach={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]};
const p=(x,y,z)=>({x,y,z}),read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url)));
function check(d){
 const m=new Map(d.blocks.map(v=>[key(v.position),v.block]));assert.equal(m.size,d.blocks.length);let supports=0;
 for(const v of d.blocks){if(solid(v.block))continue;const q={...v.position,y:v.position.y-1};if(v.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=attach[v.block.properties.facing];Object.assign(q,{...v.position,x:v.position.x+dx,z:v.position.z+dz});}assert(solid(m.get(key(q))),'Support '+key(v.position));supports++;}
 circuitSchema.parse(d.circuit);for(const s of d.circuit.signals)assert(m.has(key(s.position)));
 // All16 cell rows include actual storage/constant and exact read mask/collector.
 const half=d.bits/2;let storage=0;
 for(let w=0;w<16;w++)for(let b=0;b<d.bits;b++){
  const r=b>=half,x=r?10:2,y=1+8*w,z=8*(b%half),gate=r?9:3;
  if(d.kind==='ram'){for(const xx of[x,r?11:1])assert.deepEqual(m.get(key(p(xx,y,z))),{id:'minecraft:repeater',properties:{facing:r?'east':'west',delay:'1'}});assert.deepEqual(m.get(key(p(x,y,z+1))),{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}});}
  else assert(solid(m.get(key(p(x,y,z)))));
  assert.deepEqual(m.get(key(p(gate,y,z))),{id:'minecraft:comparator',properties:{facing:r?'east':'west',mode:'subtract'}});
  assert.deepEqual(m.get(key(p(gate,y,z-1))),{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});storage++;
 }
 // New mismatch fork must touch other signal groups only at its source and the
 // isolated comparator-side receiver. Include one-step dust and support inputs.
 let boundary=0,slopeCandidates=0;
 if(d.kind==='ram')for(const v of d.blocks){const a=v.position;if(d.groups[key(a)]!=='write_mismatch_feed'||solid(v.block))continue;
  for(const[dx,dz]of dirs){const q=p(a.x+dx,a.y,a.z+dz),b=m.get(key(q));if(b&&!solid(b)&&d.groups[key(q)]!=='write_mismatch_feed'){
   assert((a.x===20&&a.z===-11&&q.x===20&&q.z===-12&&d.groups[key(q)]==='read_mask_rise')||(a.x===7&&a.z===-12&&q.x===6&&q.z===-12&&b.id==='minecraft:comparator'),'Foreign fork face '+key(a)+'>'+key(q));boundary++;
  }
  if(v.block.id==='minecraft:redstone_wire')for(const dy of[-1,1]){const r=p(q.x,a.y+dy,q.z),b2=m.get(key(r));if(b2?.id!=='minecraft:redstone_wire')continue;if(dy>0&&m.has(key(p(a.x,a.y+1,a.z))))continue;if(dy<0&&m.has(key(p(r.x,a.y,r.z))))continue;assert.equal(d.groups[key(r)],'write_mismatch_feed','Foreign slope '+key(a)+'>'+key(r));slopeCandidates++;}
  }
  // A dust-powered support directly behind a different diode would bypass the
  // intended fork direction. Only screen newly introduced fork/support paths.
  if(v.block.id==='minecraft:redstone_wire'){
   const s=p(a.x,a.y-1,a.z);for(const[dx,dz]of dirs){const q=p(s.x+dx,s.y,s.z+dz),b=m.get(key(q));if(!['minecraft:repeater','minecraft:comparator'].includes(b?.id))continue;const[tX,tZ]=facing[b.properties.facing];assert.notDeepEqual(p(q.x-tX,q.y,q.z-tZ),s,'New powered support rear bypass');}
  }
 }
 if(d.kind==='ram')assert.equal(boundary,32);
 // Every row fork has an explicit mid-path refresh and a final15 mask source.
 for(let w=0;w<16&&d.kind==='ram';w++){const y=1+8*w;for(const[x,z]of[[13,-10],[7,-12]])assert.deepEqual(m.get(key(p(x,y,z))),{id:'minecraft:repeater',properties:{facing:'east',delay:'1'}});}
 // Tower parity: positive solids every8 levels, independently isolated output.
 for(let b=0;b<d.bits;b++){const r=b>=half,z=8*(b%half);for(let w=0;w<16;w++){assert(solid(m.get(key(p(r?8:4,1+8*w,z)))));if(d.kind==='ram')assert(solid(m.get(key(p(r?12:0,1+8*w,z)))));}assert.equal(m.get(key(p(r?8:4,124,z))).id,'minecraft:redstone_torch');}
 return{kind:d.kind,bits:d.bits,...d.metrics,support_checks:supports,exact_cells:storage,new_fork_boundary_contacts:boundary,new_fork_step_contacts:slopeCandidates};
}
const variants=[['ram',8],['ram',16],['rom',16]],reports=[];
for(const[kind,bits]of variants){const d=makeMemorySubarray({kind,bits,id:kind+'16x'+bits});assert.deepEqual(d,read(kind+'16x'+bits+'.json'));reports.push(check(d));}
const zeros=makeMemorySubarray({kind:'rom',bits:16,id:'rom16x16'}),patterns=[Array(16).fill(65535),Array.from({length:16},(_,i)=>1<<i),Array.from({length:16},(_,i)=>(0x9631+0x29c7*i)&65535)];
let changedProgramCells=0;
for(const image of patterns){const d=makeMemorySubarray({kind:'rom',bits:16,id:'rom16x16',image});assert.equal(d.blocks.length,zeros.blocks.length);const allowed=new Set(d.configuration.map(v=>key(v.position)));d.blocks.forEach((v,i)=>{assert.deepEqual(v.position,zeros.blocks[i].position);if(JSON.stringify(v.block)!==JSON.stringify(zeros.blocks[i].block)){assert(allowed.has(key(v.position)));assert.equal(v.block.id,'minecraft:redstone_block');changedProgramCells++;}});check(d);for(const c of d.configuration)assert.equal(c.value,(image[c.address]>>c.bit)&1);}
const dataMapping=Array.from({length:256},(_,a)=>({address:a,bank:a&3,subarray:a>>6,row:(a>>2)&15}));assert.equal(new Set(dataMapping.map(v=>`${v.bank}/${v.subarray}/${v.row}`)).size,256);for(const v of dataMapping)assert.equal(v.address,(v.subarray<<6)|(v.row<<2)|v.bank);
const programMapping=Array.from({length:256},(_,a)=>({address:a,subarray:a>>4,row:a&15}));assert.equal(new Set(programMapping.map(v=>`${v.subarray}/${v.row}`)).size,256);
const inventory=read('inventory.json'),interfaces=read('interface.json');
assert.equal(inventory.complete_memory_geometry,false);assert.equal(inventory.complete_memory_block_total,null);assert(inventory.missing_modules.length&&inventory.missing_modules.every(v=>v.routed_blocks===null));
assert.equal(inventory.exact_generated_storage_subtotal_blocks,16*(reports[0].blocks+reports[2].blocks));assert.equal(inventory.program_rom_blocks_saved,16*(reports[1].blocks-reports[2].blocks));
for(const[kind,bits]of[['ram',8],['rom',16]])assert.deepEqual(inventory.subarray_port_maps[kind+'16x'+bits],makeMemorySubarray({kind,bits,id:kind+'16x'+bits}).ports);
for(const[name,kind,bits]of[['program','rom',16],['data','ram',8]]){const a=inventory.relative_floorplan_options[name],d=makeMemorySubarray({kind,bits,id:kind+'16x'+bits});assert.equal(a.instances.length,16);assert.equal(a.subarray_blocks,d.blocks.length*16);const boxes=a.instances.map(i=>({from:Object.fromEntries(axes.map(k=>[k,i.relative_origin[k]+d.box.from[k]])),to:Object.fromEntries(axes.map(k=>[k,i.relative_origin[k]+d.box.to[k]]))}));for(let i=0;i<16;i++)for(let j=0;j<i;j++)assert(!axes.every(k=>boxes[i].from[k]<=boxes[j].to[k]&&boxes[j].from[k]<=boxes[i].to[k]),'Card boxes overlap');for(const k of axes){assert.equal(a.box.from[k],Math.min(...boxes.map(b=>b.from[k])));assert.equal(a.box.to[k],Math.max(...boxes.map(b=>b.to[k])));}}
for(const[name,consumers,width]of[['gpu/program_memory',2,16],['gpu/data_memory',8,8]]){const m=interfaces.instances[name];assert.equal(m.consumer_order.length,consumers);for(const[port,v]of Object.entries(m.ports)){if(port==='reset'){assert.equal(v.width,1);assert.equal(v.direction,'input');continue;}assert.equal(v.width,v.shape[0]*v.shape[1]);assert.equal(v.shape[0],consumers);assert.equal(v.shape[1],port.endsWith('_address')?8:port.endsWith('_data')?width:1);assert.equal(v.direction,port.endsWith('_ready')||port==='read_data'?'output':'input');}}
const result={status:'offline_subarray_geometry_checked_no_whole_memory_or_native_acceptance',variants:reports,program_images_checked:patterns.length,program_changed_cells_checked:changedProgramCells,data_addresses_checked:256,program_addresses_checked:256,storage_only_subtotal:16*reports[0].blocks+16*reports[2].blocks,unrouted_fabric_blocks:null,native_calls:0,service_constructors:0,limits:['No dynamic simulator, full strong/weak-power proof, physical timing or arbitration implementation.','Only newly added shared read/write mismatch forks receive the explicit contact-delta screen; inherited read/storage topology is source reuse, not new native proof.','Output bank selectors, channel/state latches, arbitration, handshake, loader and inter-module routing remain missing.']};
if(process.argv.includes('--save'))writeFileSync(new URL('subarray-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
