import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {sourceBindings,iterateObstacles,shaFile} from '../floorplan-v3/obstacles.mjs';
const F='artifacts/full-gpu-layout-v1/floorplan-v3/',manifest=JSON.parse(readFileSync(F+'source-manifest.json'));
assert.equal(await shaFile(F+'source-manifest.json'),'a5765a161bdcdc12a766f4dce8bc8309f2ad0c22859a2fcac8157b7f69367602');
for(const[p,h]of Object.entries(manifest.files))assert.equal(await shaFile(p),h,p);
const source_sha256={...manifest.files,[F+'source-manifest.json']:await shaFile(F+'source-manifest.json')};
const bounds={x:[-2550,0],z:[-3440,-500]},palette=[],pal=new Map(),instances=[],idx=new Map(),cells=[],counts={};
for await(const v of iterateObstacles({bounds,verify:false})){
 if(!idx.has(v.instance)){idx.set(v.instance,instances.length);instances.push({name:v.instance});counts[v.instance]=0;}
 const s=JSON.stringify(v.block);if(!pal.has(s)){pal.set(s,palette.length);palette.push(v.block);}
 const{x,y,z}=v.position;cells.push([x,y,z,pal.get(s),idx.get(v.instance)]);counts[v.instance]++;
}
writeFileSync(new URL('./obstacles.json',import.meta.url),JSON.stringify({status:'source_bound_frame3_done_corridor',bounds,all_y:true,palette,instances,cells,counts,cell_count:cells.length,source_sha256,native_acceptance:false})+'\n');console.log(JSON.stringify({counts,cells:cells.length}));
