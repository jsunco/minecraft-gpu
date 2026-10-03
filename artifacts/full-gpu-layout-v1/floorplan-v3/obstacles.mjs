// Import-safe actual-cell iteration for the separately checked frame3.
import assert from 'node:assert/strict';
import {readFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),P='artifacts/full-gpu-layout-v1/floorplan-v3/';
const read=p=>JSON.parse(readFileSync(resolve(ROOT,p)));
export async function shaFile(p){const h=createHash('sha256');for await(const b of createReadStream(resolve(ROOT,p)))h.update(b);return h.digest('hex');}
export function inside(p,b){return !b||['x','y','z'].every(a=>!b[a]||(p[a]>=b[a][0]&&p[a]<=b[a][1]));}
export const translate=(p,t)=>({x:p.x+t.x,y:p.y+t.y,z:p.z+t.z});
export async function sourceBindings({verify=true}={}){
 const f=read(P+'frame-config.json'),c=read(P+'composition-checks.json');assert.equal(c.status,'frozen_source_master_composition_checked');assert.equal(c.frame_sha256,await shaFile(P+'frame-config.json'));assert.equal(c.actual_sparse_collisions,0);assert.equal(c.three_cell_neighborhoods_unchanged,true);
 const pins=read(P+'source-bindings.json');for(const p of ['frame-config.json','composition-checks.json','source-bindings.json','obstacles.mjs'])pins[P+p]=await shaFile(P+p);
 if(verify)for(const[p,h]of Object.entries(pins))assert.equal(await shaFile(p),h,p);
 return pins;
}
export async function* iterateObstacles({bounds=null,verify=true}={}){
 const pins=await sourceBindings({verify}),f=read(P+'frame-config.json');assert.equal(f.quarter_turns,0);
 const groups=new Map();for(const[instance,c]of Object.entries({...f.instances,...f.route_deltas})){if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push({instance,...c});}
 for(const[path,instances]of groups){assert.equal(await shaFile(path),pins[path],path);const d=read(path);for(const c of instances)for(const row of d.blocks){const position=translate(row.position,c.translation);if(inside(position,bounds))yield{position,block:row.block,instance:c.instance};}}
}
export function* decodeSlice(d){for(const[x,y,z,p,i]of d.cells){assert(d.palette[p]&&d.instances[i]);yield{position:{x,y,z},block:d.palette[p],instance:d.instances[i].name};}}
