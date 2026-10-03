// Read-only selected-machine obstacle extraction. No native/service imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLargeDesign,writeLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),ROOT=fileURLToPath(new URL('../../../../',H));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
const configPath=resolve(ROOT,'artifacts/full-gpu-layout-v1/machine-candidate-v1/config.json');
const configBytes=readFileSync(configPath),cfg=JSON.parse(configBytes);
const d=readLargeDesign(fileURLToPath(new URL('trial-design.json',H)));
const changed=[...d.blocks,...d.removed],bounds={from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}};
for(const r of changed)for(const a of ['x','y','z']){bounds.from[a]=Math.min(bounds.from[a],r.position[a]-4);bounds.to[a]=Math.max(bounds.to[a],r.position[a]+4);}
const inside=p=>['x','y','z'].every(a=>bounds.from[a]<=p[a]&&p[a]<=bounds.to[a]);
const fresh=new Set(d.blocks.map(v=>K(v.position))),removed=new Set(d.removed.map(v=>K(v.position)));
const rows=[],collision=[],sources={},instances=[];
const groups=new Map;for(const c of cfg.instances){if(c.name==='memory')continue;if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push(c);}
for(const [path,group]of groups){
 const file=resolve(ROOT,path);assert.equal(sha(file),group[0].sha256,'Selected source changed: '+path);sources[path]=group[0].sha256;
 const design=readLargeDesign(file);let included=0;
 for(const c of group){let n=0;for(const v of design.blocks){const p=Object.fromEntries(['x','y','z'].map(a=>[a,v.position[a]+c.translation[a]]));if(!inside(p))continue;
  rows.push({position:p,block:v.block,instance:c.name});n++;if(fresh.has(K(p))||removed.has(K(p)))collision.push({position:p,instance:c.name,kind:fresh.has(K(p))?'new':'removed'});
 }instances.push({name:c.name,source:path,total_cells:design.blocks.length,selected_in_slice:n,translation:c.translation});included+=n;}
 console.error(JSON.stringify({source:path,selected:included}));
}
assert.equal(sha(configPath),createHash('sha256').update(configBytes).digest('hex'),'Selection changed while reading');
writeFileSync(new URL('selected-frame.json',H),configBytes);
writeLargeDesign(fileURLToPath(new URL('foreign-obstacles.json',H)),{blocks:rows,bounds,source_sha256:sources,config_sha256:sha(configPath),trial_sha256:sha(fileURLToPath(new URL('trial-design.json',H))),instances,collisions:collision,native_acceptance:false});
console.log(JSON.stringify({foreign_rows:rows.length,unique_foreign_cells:new Set(rows.map(v=>K(v.position))).size,bounds,collisions:collision.slice(0,40),collision_count:collision.length}));
assert.equal(collision.length,0,'Foreign cells intersect replacement/removal');
