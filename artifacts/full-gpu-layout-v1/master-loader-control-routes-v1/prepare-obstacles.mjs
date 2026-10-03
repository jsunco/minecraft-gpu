// Exact new working corridor; frozen first-seven route slice stays unchanged.
import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{sourceBindings,iterateObstacles,shaFile,inside}from'../floorplan-v2/obstacles.mjs';
const bounds={x:[-2530,1100],z:[-1175,1080]},source_sha256=await sourceBindings(),P='artifacts/full-gpu-layout-v1/master-control-routes-v1/';
assert.equal(await shaFile(P+'source-manifest.json'),'d8d475d323af0f70fec7ee6c092958fd901f80e36aba77e69a32c71d2fd67774');
const m=JSON.parse(readFileSync(P+'source-manifest.json'));
for(const[p,h]of Object.entries(m.files)){assert(!source_sha256[p]||source_sha256[p]===h);assert.equal(await shaFile(p),h);source_sha256[p]=h;}source_sha256[P+'source-manifest.json']=await shaFile(P+'source-manifest.json');
const palette=[],pal=new Map(),instances=['loader','core0','core1','dispatch','global','master-control-routes-v1'].map(name=>({name})),cells=[],counts=Object.fromEntries(instances.map(v=>[v.name,0])),seen=new Set();
function add(v){if(!inside(v.position,bounds))return;const{x,y,z}=v.position,k=`${x},${y},${z}`;assert(!seen.has(k));seen.add(k);const s=JSON.stringify(v.block);if(!pal.has(s)){pal.set(s,palette.length);palette.push(v.block);}const i=instances.findIndex(n=>n.name===v.instance);assert(i>=0);cells.push([x,y,z,pal.get(s),i]);counts[v.instance]++;}
for await(const v of iterateObstacles({bounds,verify:false}))add(v);
const prior=JSON.parse(readFileSync(P+'design.json'));for(const v of prior.blocks){assert(inside(v.position,bounds),'prior route outside corridor');add({...v,instance:'master-control-routes-v1'});}
writeFileSync(new URL('obstacles.json',import.meta.url),JSON.stringify({status:'offline_route_working_corridor',bounds,all_y:true,palette,instances,cells,counts,cell_count:cells.length,source_sha256,native_acceptance:false})+'\n');console.log(JSON.stringify({counts,cells:cells.length,palette:palette.length}));
