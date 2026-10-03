// Both selected core placements must admit the same replacement. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLargeDesign,writeLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),B='artifacts/full-gpu-layout-v1/';
const sha=p=>createHash('sha256').update(readFileSync(resolve(ROOT,p))).digest('hex');
const cfg=JSON.parse(readFileSync(new URL('./machine-config.json',import.meta.url)));
const coreRows=cfg.instances.filter(v=>v.name==='core0'||v.name==='core1');assert.equal(coreRows.length,2);
const base=readLargeDesign(fileURLToPath(new URL('./obstacles.json',import.meta.url)));
const bounds={from:{},to:{}};for(const a of ['x','y','z']){bounds.from[a]=Math.min(...base.blocks.slice(0,1).map(v=>v.position[a]));bounds.to[a]=bounds.from[a];for(const v of base.blocks){bounds.from[a]=Math.min(bounds.from[a],v.position[a]-4);bounds.to[a]=Math.max(bounds.to[a],v.position[a]+4);}}
// The complete original box is deliberately retained. A changed layout cannot
// silently escape this obstacle slice without regenerating it.
const inside=p=>['x','y','z'].every(a=>p[a]>=bounds.from[a]&&p[a]<=bounds.to[a]);
const K=p=>[p.x,p.y,p.z].join(','),removed=new Set(base.removed.map(v=>K(v.position))),cells=[],overlaps=[];
const groups=new Map;for(const c of cfg.instances){if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push(c);}
for(const[path,instances]of groups){assert.equal(sha(path),instances[0].sha256,'Source drift '+path);const d=readLargeDesign(resolve(ROOT,path));let count=0;
 for(const c of instances)for(const core of coreRows){if(c.name===core.name)continue;
  for(const v of d.blocks){const p={};for(const a of ['x','y','z'])p[a]=v.position[a]+c.translation[a]-core.translation[a];if(!inside(p))continue;
   cells.push({position:p,block:v.block,instance:c.name,relative_to_core:core.name});count++;
   if(removed.has(K(p)))overlaps.push({position:p,instance:c.name,relative_to_core:core.name});
  }
 }
 console.error(JSON.stringify({component:path,foreign_cells:count}));
}
assert.equal(overlaps.length,0,'Removal owns foreign cells');
writeLargeDesign(fileURLToPath(new URL('./foreign-obstacles.json',import.meta.url)),{blocks:cells,bounds,config_sha256:sha(B+'compact-core-guard-v1/machine-config.json'),source_sha256:Object.fromEntries(cfg.instances.map(v=>[v.path,v.sha256])),complete_gpu_layout:false,native_acceptance:false});
console.log(JSON.stringify({foreign_rows:cells.length,unique_local_obstacles:new Set(cells.map(v=>K(v.position))).size,bounds,foreign_removal_overlaps:overlaps.length}));
