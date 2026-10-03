// Import-safe offline obstacle access. No services, world calls, or parent writes.
import assert from 'node:assert/strict';
import {createReadStream,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const HERE=fileURLToPath(new URL('.',import.meta.url));
const json=p=>JSON.parse(readFileSync(resolve(ROOT,p),'utf8'));
export const CORRIDOR={x:[-2460,-390],z:[-1175,750]};
export const frame=JSON.parse(readFileSync(new URL('frame-config.json',import.meta.url),'utf8'));
const checks=JSON.parse(readFileSync(new URL('sparse-checks.json',import.meta.url),'utf8'));
export async function shaFile(p){const h=createHash('sha256');for await(const chunk of createReadStream(resolve(ROOT,p)))h.update(chunk);return h.digest('hex');}
export function inside(p,bounds){return !bounds||['x','y','z'].every(a=>!bounds[a]||(p[a]>=bounds[a][0]&&p[a]<=bounds[a][1]));}
function intersects(box,bounds){return !bounds||['x','y','z'].every(a=>!bounds[a]||(box.to[a]>=bounds[a][0]&&box.from[a]<=bounds[a][1]));}
export function translate(p,t){return {x:p.x+t.x,y:p.y+t.y,z:p.z+t.z};}
export async function sourceBindings({verify=true}={}){
 assert.equal(checks.master_route_admission,true);assert.equal(frame.quarter_turns,0);
 const pins={};const add=(p,h)=>{assert(!pins[p]||pins[p]===h,`conflicting source ${p}`);pins[p]=h;};
 for(const [name,v]of Object.entries(frame.instances)){
  assert.deepEqual(v.translation,checks.per_instance[name].translation);
  assert.equal(await shaFile(v.manifest),v.manifest_sha256,v.manifest);
  add(v.manifest,v.manifest_sha256);
  const m=json(v.manifest),map=m.source_sha256??m.files;assert(map&&typeof map==='object');
  for(const [p,h]of Object.entries(map))add(p,h);
  assert.equal(pins[v.path],checks.source_sha256[v.path],v.path);
 }
 for(const p of ['frame-config.json','sparse-checks.json','obstacles.mjs'])add(`artifacts/full-gpu-layout-v1/floorplan-v2/${p}`,await shaFile(resolve(HERE,p)));
 if(verify)for(const [p,h]of Object.entries(pins))assert.equal(await shaFile(p),h,p);
 return pins;
}
// Loads one unique parent at a time, never a second assembled 5.6M-object master.
// Bounds are inclusive. Omitting bounds visits every real parent cell.
export async function* iterateObstacles({bounds=null,verify=true}={}){
 if(verify)await sourceBindings();
 const groups=new Map();
 for(const [instance,v]of Object.entries(frame.instances)){
  if(!intersects(checks.per_instance[instance].box,bounds))continue;
  if(!groups.has(v.path))groups.set(v.path,[]);groups.get(v.path).push({instance,...v});
 }
 for(const [path,instances]of groups){
  assert.equal(await shaFile(path),checks.source_sha256[path],path);
  const d=json(path);assert.equal(d.blocks.length,d.metrics.blocks);
  for(const v of instances)for(const row of d.blocks){
   const p=translate(row.position,v.translation);assert(['x','y','z'].every(a=>Number.isSafeInteger(p[a])));
   if(inside(p,bounds))yield {position:p,block:row.block,instance:v.instance};
  }
 }
}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export async function exportCorridor(){
 const source_sha256=await sourceBindings(),instances=Object.entries(frame.instances).map(([name,v])=>({name,...v,box:checks.per_instance[name].box}));
 const palette=[],pal=new Map(),cells=[],counts=Object.fromEntries(instances.map(v=>[v.name,0]));
 const indexes=new Map(instances.map((v,i)=>[v.name,i]));const seen=new Set();
 for await(const row of iterateObstacles({bounds:CORRIDOR,verify:false})){
  const {x,y,z}=row.position,k=`${x},${y},${z}`;assert(!seen.has(k),`overlap ${k}`);seen.add(k);
  const block=canonical(row.block),s=JSON.stringify(block);if(!pal.has(s)){pal.set(s,palette.length);palette.push(block);}
  cells.push([x,y,z,pal.get(s),indexes.get(row.instance)]);counts[row.instance]++;
 }
 // Confirm the three corrected root endpoints are actual slice cells.
 for(const p of [[-2232,233,-863],[-2332,233,-804],[-1212,200,-664]])assert(seen.has(p.join(',')),`missing corrected endpoint ${p}`);
 const d={status:'offline_actual_parent_obstacle_slice',bounds:CORRIDOR,all_y:true,cell_format:['x','y','z','palette_index','instance_index'],palette,instances,counts,cell_count:cells.length,source_sha256,cells,scope:'Only these inclusive X/Z bounds. Routes and their contact neighborhoods outside the slice require iterateObstacles or a complete all-parent check. This does not draw or prove any new circuit.',native_acceptance:false};
 writeFileSync(resolve(HERE,'corridor-obstacles.json'),JSON.stringify(d)+'\n');
 return {cell_count:cells.length,counts,palette:palette.length,sha256:await shaFile(resolve(HERE,'corridor-obstacles.json')),source_pins:Object.keys(source_sha256).length};
}
export function* decodeSlice(d){for(const [x,y,z,p,i]of d.cells){assert(d.palette[p]&&d.instances[i]);yield {position:{x,y,z},block:d.palette[p],instance:d.instances[i].name};}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await exportCorridor()));
