// Exact full parent scan; this tiny adapter's entire3-cell neighborhood is bound.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {iterateObstacles,sourceBindings} from '../floorplan-v3/obstacles.mjs';
const H=new URL('.',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,H))),K=p=>`${p.x},${p.y},${p.z}`;
const o=read('obstacles.json'),d=read('design.json'),wanted=new Map(o.blocks.map(v=>[K(v.position),v.block])),newCells=new Set(d.blocks.map(v=>K(v.position))),halo=new Set();
for(const {position:p}of d.blocks)for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)halo.add(`${p.x+x},${p.y+y},${p.z+z}`);
const sources=await sourceBindings();let visited=0,matched=0,neighbors=0;
const screen=row=>{visited++;const p=row.position,k=K(p);assert(!newCells.has(k),'Occupied adapter collision '+k);if(halo.has(k)){assert(wanted.has(k),'Missing parent neighborhood '+k);assert.deepEqual(row.block,wanted.get(k));neighbors++;}if(['x','y','z'].every(a=>p[a]>=o.bounds[a][0]&&p[a]<=o.bounds[a][1])){assert(wanted.has(k),'Missing sliced obstacle '+k);assert.deepEqual(row.block,wanted.get(k));matched++;}};
for await(const row of iterateObstacles({verify:false}))screen(row);
for(const name of ['master-program-data-v1','master-core-done-routes-v1','master-core-command-routes-v1']){const file=new URL('../'+name+'/design.json',H),bytes=readFileSync(file),r=JSON.parse(bytes);sources['artifacts/full-gpu-layout-v1/'+name+'/design.json']=createHash('sha256').update(bytes).digest('hex');for(const row of r.blocks)screen(row);}
assert.equal(matched,wanted.size);
const out={status:'full_frame_adapter_neighborhood_checked',all_parent_cells_visited:visited,exact_slice_cells:matched,actual_parent_halo_cells:neighbors,source_sha256:sources,design_sha256:createHash('sha256').update(readFileSync(new URL('design.json',H))).digest('hex'),native_acceptance:false,limits:['Current consumer-return additions are separately verified to lie atZ>=172, outside this full adapter halo. Later memory derivatives require neighborhood preservation before reuse.']};
const cp='artifacts/full-gpu-layout-v1/memory/consumer-return-v1/design.json',current=JSON.parse(readFileSync(cp));for(const row of current.blocks)if(['x','y','z'].every(a=>row.position[a]>=o.bounds[a][0]&&row.position[a]<=o.bounds[a][1]))assert.deepEqual(row.block,wanted.get(K(row.position)),'Latest memory local drift');
writeFileSync(new URL('whole-frame-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,source_sha256:undefined}));
