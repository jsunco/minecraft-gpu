import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {iterateObstacles,sourceBindings} from '../floorplan-v3/obstacles.mjs';
const H=new URL('.',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,H))),K=p=>`${p.x},${p.y},${p.z}`;
const d=read('design.json'),o=read('obstacles.json'),wanted=new Map(o.blocks.map(v=>[K(v.position),v.block])),newCells=new Set(d.blocks.map(v=>K(v.position))),halo=new Set();
for(const {position:p}of d.blocks)for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)halo.add(`${p.x+x},${p.y+y},${p.z+z}`);
const pins=await sourceBindings();let visited=0,matched=0,neighbors=0;
const screen=row=>{visited++;const p=row.position,k=K(p);assert(!newCells.has(k),'Occupied adapter collision '+k);if(halo.has(k)){assert(wanted.has(k),'Missing parent halo '+k);assert.deepEqual(row.block,wanted.get(k));neighbors++;}if(['x','y','z'].every(a=>p[a]>=o.bounds[a][0]&&p[a]<=o.bounds[a][1])){assert(wanted.has(k),'Missing sliced obstacle '+k);assert.deepEqual(row.block,wanted.get(k));matched++;}};
// Read all old frame groups, but replace its old loader once with the newer
// consumer-return union. This is a bounded adapter check, not a new composition.
for await(const row of iterateObstacles({verify:false}))if(row.instance!=='loader')screen(row);
for(const name of ['memory/consumer-return-v1','master-program-data-v1','master-core-done-routes-v1','master-core-command-routes-v1','master-core-service-routes-v1','master-core-conditioning-routes-v1','master-memory-cold-routes-v1','master-memory-address-adapter-v1']){
 const file=new URL('../'+name+'/design.json',H),bytes=readFileSync(file),r=JSON.parse(bytes);pins['artifacts/full-gpu-layout-v1/'+name+'/design.json']=createHash('sha256').update(bytes).digest('hex');for(const row of r.blocks)screen(row);
}
assert.equal(matched,wanted.size);
const out={status:'bank_quiet_adapter_entire_parent_halo_checked',all_current_parent_cells_visited:visited,exact_slice_cells:matched,actual_parent_halo_cells:neighbors,source_sha256:pins,design_sha256:createHash('sha256').update(readFileSync(new URL('design.json',H))).digest('hex'),native_acceptance:false,complete_new_frame_composition:false,world_mutations:0,limits:['Current consumer-return memory and all listed master deltas are included; later core/memory derivatives require exact neighborhood preservation before reuse.','No new core replacement or complete master composition is admitted by this bounded adapter screen.']};
writeFileSync(new URL('whole-frame-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,source_sha256:undefined}));
