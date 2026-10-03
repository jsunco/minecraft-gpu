// Actual component cells, independently legal height and reserved global space.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{resolve}from'node:path';
import{rotatePosition,transformBlock}from'../../../hardware/gpu-layout-assembly.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),read=p=>readFileSync(resolve(root,p)),d=JSON.parse(readFileSync(new URL('placement.json',import.meta.url))),r=d.candidates.find(v=>v.name===d.selected_frame),global=r.boxes.global;
for(const[p,h]of Object.entries(d.source_sha256))assert.equal(createHash('sha256').update(read(p)).digest('hex'),h,p);
const columns=new Set(),hist={},seen={};let total=0,globalNear=[],boundEndpoints=0;const perInstance={};
const at=(p,t)=>{const q=rotatePosition(p,t.q);return{x:q.x+t.t.x,y:q.y+t.t.y,z:q.z+t.t.z};};
for(const[id,c]of Object.entries(d.components)){
 assert.equal(createHash('sha256').update(read(c.path)).digest('hex'),c.sha256);
 const v=JSON.parse(read(c.path)),instances=id==='core'?['core0','core1']:[id];assert.equal(v.blocks.length,c.blocks);
 for(const n of instances){const t=r.transforms[n],K=p=>[p.x,p.y,p.z].join(','),wanted=new Set(r.external.flatMap(net=>[net.driver,net.sink]).filter(e=>e.instance===n).flatMap(e=>e.positions??[]).map(K)),found=new Set();let count=0;for(const b of v.blocks){const p=at(b.position,t);assert(p.y>=-64&&p.y<=319);for(const a of['x','y','z'])assert(p[a]>=r.boxes[n].from[a]&&p[a]<=r.boxes[n].to[a]);columns.add(Math.floor(p.x/16)+','+Math.floor(p.z/16));hist[b.block.id]=(hist[b.block.id]??0)+1;count++;
   if(wanted.has(K(p))){assert(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(b.block.id),'Endpoint is not a signal device '+n+' '+K(p));found.add(K(p));}
   if(n==='loader'&&['x','y','z'].every(a=>p[a]>=global.from[a]-3&&p[a]<=global.to[a]+3))globalNear.push({position:p,block:b.block});
  }assert.deepEqual(found,wanted,'Actual endpoint coverage '+n);boundEndpoints+=found.size;perInstance[n]=count;total+=count;
 }
 // Every distinct block-state form used by the parents roundtrips for all rotations.
 for(const b of v.blocks)seen[JSON.stringify(b.block)]=b.block;
}
assert.equal(globalNear.length,0,'Global reservation crosses actual loader cells: '+JSON.stringify(globalNear.slice(0,8)));assert.equal(total,r.mapped_component_blocks);
let rotationCases=0;for(const b of Object.values(seen))for(let q=0;q<4;q++){assert.deepEqual(transformBlock(transformBlock(b,q),(4-q)%4),b);rotationCases++;}
const out={status:'actual_component_placement_checked_external_routes_absent',component_cells:total,per_instance:perInstance,height:r.dimensions.y,box:r.box,actual_occupied_chunk_columns:columns.size,histogram:hist,distinct_bound_endpoint_devices:boundEndpoints,rotation_block_state_roundtrips:rotationCases,global_box_margin:3,loader_cells_in_global_reservation:globalNear.length,component_collision_basis:'Other component bounding boxes are separated by at least three empty cells on an axis; the only envelope overlap is global within loader, checked against every actual loader cell including margin.',external_physical_routes:0,known_external_bit_routes:r.external_bit_routes_known,missing_endpoint_bits:r.external_bits_missing_endpoint,complete_gpu_layout:false,native_calls:0,native_acceptance:false};
if(process.argv.includes('--save'))writeFileSync(new URL('placement-checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
