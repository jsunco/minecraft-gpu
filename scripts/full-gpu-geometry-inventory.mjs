// Exact offline material/volume/chunk accounting for a declared unique-cell union.
// This counts an authored map; it does not establish electrical or native acceptance.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../hardware/memory-layout-large-json-v2.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=async path=>{const h=createHash('sha256');for await(const b of createReadStream(resolve(ROOT,path)))h.update(b);return h.digest('hex');};
const K=p=>`${p.x},${p.y},${p.z}`;
export function chunkRectangles(keys,limit=256){
 assert(Number.isInteger(limit)&&limit>0);
 const rows=new Map();for(const key of keys){const[x,z]=key.split(',').map(Number);assert(Number.isInteger(x)&&Number.isInteger(z));if(!rows.has(z))rows.set(z,[]);rows.get(z).push(x);}
 const completed=[],active=new Map();let previousZ=null;
 for(const[z,xs]of[...rows].sort((a,b)=>a[0]-b[0])){
  if(previousZ!==null&&z!==previousZ+1){completed.push(...active.values());active.clear();}
  xs.sort((a,b)=>a-b);const runs=[];for(const x of xs){const last=runs.at(-1);if(last&&x===last.to+1&&last.to-last.from+1<limit)last.to=x;else runs.push({from:x,to:x});}
  const now=new Set();for(const run of runs){const key=run.from+','+run.to,width=run.to-run.from+1;now.add(key);let r=active.get(key);if(r&&(z-r.from.z+1)*width<=limit)r.to.z=z;else{if(r)completed.push(r);r={from:{x:run.from,z},to:{x:run.to,z}};active.set(key,r);}}
  for(const[key,r]of active)if(!now.has(key)){completed.push(r);active.delete(key);}previousZ=z;
 }
 completed.push(...active.values());
 const actual=new Set();for(const r of completed){r.columns=(r.to.x-r.from.x+1)*(r.to.z-r.from.z+1);assert(r.columns<=limit);for(let z=r.from.z;z<=r.to.z;z++)for(let x=r.from.x;x<=r.to.x;x++){const k=x+','+z;assert(keys.has(k)&&!actual.has(k),'Missing or duplicate exact coverage '+k);actual.add(k);}r.native_block_bounds={from:{x:16*r.from.x,z:16*r.from.z},to:{x:16*r.to.x+15,z:16*r.to.z+15}};}
 assert.equal(actual.size,keys.size);return completed;
}
export async function inventory(config){
 assert(Array.isArray(config.instances)&&config.instances.length);
 const occupied=new Map(),materials={},columns=new Map(),perInstance=[],groups=new Map(),pins={};
 for(const c of config.instances){assert(typeof c.name==='string'&&c.name);assert(typeof c.sha256==='string'&&c.sha256.length===64,'Required exact design hash '+c.name);assert(c.translation&&['x','y','z'].every(a=>Number.isSafeInteger(c.translation[a])));if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push(c);assert(!pins[c.path]||pins[c.path]===c.sha256,'Conflicting design version');pins[c.path]=c.sha256;}
 const bounds={from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}};
 for(const[path,instances]of groups){assert.equal(await sha(path),pins[path],path);const d=readLargeDesign(resolve(ROOT,path));assert(Array.isArray(d.blocks)&&d.blocks.length);
  for(const c of instances){const localMaterials={},localColumns=new Set(),box={from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}};let count=0;
   assert(!c.removals,'Materialize an explicitly checked replacement derivative before inventory; do not hide patch semantics here.');
   for(const row of d.blocks){const p={x:row.position.x+c.translation.x,y:row.position.y+c.translation.y,z:row.position.z+c.translation.z},key=K(p);assert(['x','y','z'].every(a=>Number.isSafeInteger(p[a]))&&p.y>=-64&&p.y<=319,'Invalid Java26.3 build coordinate '+key);assert(row.block.id.startsWith('minecraft:')&&row.block.id!=='minecraft:air','Actual vanilla block required');assert(!occupied.has(key),'Duplicate cell '+key+' '+occupied.get(key)+' / '+c.name);occupied.set(key,c.name);count++;
    for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],p[a]);box.to[a]=Math.max(box.to[a],p[a]);bounds.from[a]=Math.min(bounds.from[a],p[a]);bounds.to[a]=Math.max(bounds.to[a],p[a]);}
    const id=row.block.id;materials[id]=(materials[id]??0)+1;localMaterials[id]=(localMaterials[id]??0)+1;const chunk=Math.floor(p.x/16)+','+Math.floor(p.z/16);columns.set(chunk,(columns.get(chunk)??0)+1);localColumns.add(chunk);
   }perInstance.push({name:c.name,path,sha256:c.sha256,translation:c.translation,actual_cells:count,bounds:box,occupied_chunk_columns:localColumns.size,materials:localMaterials});
  }
 }
 const span=Object.fromEntries(['x','y','z'].map(a=>[a,bounds.to[a]-bounds.from[a]+1])),volume=span.x*span.y*span.z;assert(Number.isSafeInteger(volume));
 return{status:'offline_unique_cell_geometry_inventory_only',source_design_sha256:pins,actual_unique_cells:occupied.size,materials,bounds,span,bounding_volume:volume,occupied_fraction_of_bounding_volume:occupied.size/volume,occupied_chunk_columns:columns.size,chunk_cells:Object.fromEntries([...columns].sort()),forceload_rectangles:chunkRectangles(new Set(columns.keys())),per_instance:perInstance,complete_gpu_layout:false,electrical_acceptance:false,native_acceptance:false,world_mutations:0,limits:['A exact cell/material count does not establish that every required circuit or connection exists.','Rectangles cover exactly the occupied chunk columns in this declared map; this is a later loading plan, not evidence of live vanilla ticking coverage.','No background forceload, client rendering or game command is issued. Practical whole-machine ticking throughput remains unmeasured.','Nested component totals must not be added to this unique-cell total. Only explicit supplied instances are included.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[configPath,out]=process.argv.slice(2);assert(configPath&&out);const bytes=readFileSync(configPath),result=await inventory(JSON.parse(bytes));result.config_sha256=createHash('sha256').update(bytes).digest('hex');writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cells:result.actual_unique_cells,span:result.span,chunk_columns:result.occupied_chunk_columns,forceload_rectangles:result.forceload_rectangles.length,complete_gpu_layout:false,native_acceptance:false}));
}
