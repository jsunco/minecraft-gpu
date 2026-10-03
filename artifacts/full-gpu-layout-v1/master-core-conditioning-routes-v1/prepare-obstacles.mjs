import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {sourceBindings,iterateObstacles,shaFile} from '../floorplan-v3/obstacles.mjs';
const F='artifacts/full-gpu-layout-v1/floorplan-v3/',manifest=JSON.parse(readFileSync(F+'source-manifest.json'));
assert.equal(await shaFile(F+'source-manifest.json'),'a5765a161bdcdc12a766f4dce8bc8309f2ad0c22859a2fcac8157b7f69367602');
for(const[p,h]of Object.entries(manifest.files))assert.equal(await shaFile(p),h,p);
const source_sha256={...manifest.files,[F+'source-manifest.json']:await shaFile(F+'source-manifest.json')};
const bounds={x:[-1480,930],z:[-3450,1100]},regions=[{...bounds,y:[227,319]},{x:[-650,-450],z:[450,650]}],covered=p=>regions.some(b=>['x','y','z'].every(a=>!b[a]||p[a]>=b[a][0]&&p[a]<=b[a][1])),palette=[],pal=new Map(),instances=[],idx=new Map(),cells=[],counts={};
function add(v){if(!covered(v.position))return;
 if(!idx.has(v.instance)){idx.set(v.instance,instances.length);instances.push({name:v.instance});counts[v.instance]=0;}
 const s=JSON.stringify(v.block);if(!pal.has(s)){pal.set(s,palette.length);palette.push(v.block);}
 const{x,y,z}=v.position;cells.push([x,y,z,pal.get(s),idx.get(v.instance)]);counts[v.instance]++;
}
for await(const v of iterateObstacles({bounds,verify:false}))add(v);
for(const name of ['master-core-done-routes-v1','master-program-data-v1','master-core-command-routes-v1','master-core-service-routes-v1']){const p='artifacts/full-gpu-layout-v1/'+name+'/';const d=JSON.parse(readFileSync(p+'design.json'));source_sha256[p+'design.json']=await shaFile(p+'design.json');if(true){const m=JSON.parse(readFileSync(p+'source-manifest.json'));for(const[k,h]of Object.entries(m.files)){assert.equal(await shaFile(k),h);source_sha256[k]=h;}source_sha256[p+'source-manifest.json']=await shaFile(p+'source-manifest.json');}for(const r of d.blocks)add({...r,instance:name});}
writeFileSync(new URL('./obstacles.json',import.meta.url),JSON.stringify({status:'source_bound_cumulative_core_conditioning_corridor',bounds,regions,all_y:false,palette,instances,cells,counts,cell_count:cells.length,source_sha256,native_acceptance:false})+'\n');console.log(JSON.stringify({counts,cells:cells.length}));
