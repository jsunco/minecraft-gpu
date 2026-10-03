// Offline lossless vanilla block export. This tool never contacts Minecraft.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, createReadStream} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../hardware/memory-layout-large-json-v2.mjs';
import {chunkRectangles} from './full-gpu-geometry-inventory.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const shaBytes=b=>createHash('sha256').update(b).digest('hex');
const shaFile=async p=>{const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');};
const axes=['x','y','z'],K=p=>axes.map(a=>p[a]).join(',');
function canonicalBlock(block){
 assert(block&&typeof block.id==='string'&&/^minecraft:[a-z0-9_]+$/.test(block.id)&&block.id!=='minecraft:air','Expected nonair vanilla block identifier');
 assert(Object.keys(block).every(k=>['id','properties'].includes(k)),'Unsupported block payload must not be discarded');
 const properties=block.properties??{};assert(properties&&typeof properties==='object'&&!Array.isArray(properties));
 assert(Object.entries(properties).every(([k,v])=>/^[a-z0-9_]+$/.test(k)&&typeof v==='string'&&/^[a-z0-9_]+$/.test(v)),'Invalid blockstate');
 return{id:block.id,...(Object.keys(properties).length?{properties:Object.fromEntries(Object.entries(properties).sort())}:{})};
}
export function decodeChunk(chunk){
 assert.equal(chunk.format,'tinygpu-vanilla-chunk-v1');assert(Number.isSafeInteger(chunk.chunk.x)&&Number.isSafeInteger(chunk.chunk.z));
 const palette=chunk.palette.map(canonicalBlock),seen=new Set();
 return chunk.cells.map(row=>{assert(Array.isArray(row)&&row.length===4);const[x,y,z,id]=row;assert([x,y,z,id].every(Number.isSafeInteger)&&x>=0&&x<16&&z>=0&&z<16&&y>=-64&&y<=319&&id>=0&&id<palette.length,'Invalid chunk cell');const position={x:16*chunk.chunk.x+x,y,z:16*chunk.chunk.z+z},k=K(position);assert(!seen.has(k),'Duplicate chunk cell');seen.add(k);return{position,block:palette[id]};});
}
export async function exportChunks(configPath,outputDirectory){
 const configBytes=readFileSync(configPath),config=JSON.parse(configBytes);assert(Array.isArray(config.instances)&&config.instances.length);
 const destination=resolve(outputDirectory),staging=destination+'.staging';assert(!existsSync(destination)&&!existsSync(staging),'Export is immutable; choose a fresh directory');
 const groups=new Map(),pins={},names=new Set();
 for(const c of config.instances){assert(typeof c.name==='string'&&!names.has(c.name));names.add(c.name);assert(c.translation&&axes.every(a=>Number.isSafeInteger(c.translation[a])));assert(!c.removals,'Use an explicitly materialized replacement design');assert(typeof c.sha256==='string'&&/^[0-9a-f]{64}$/.test(c.sha256));assert(!pins[c.path]||pins[c.path]===c.sha256);pins[c.path]=c.sha256;if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push(c);}
 const chunks=new Map(),materials={},bounds={from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}};let count=0;
 for(const[path,instances]of groups){const full=resolve(ROOT,path);assert.equal(await shaFile(full),pins[path],'Source hash mismatch '+path);const d=readLargeDesign(full);assert(Array.isArray(d.blocks)&&d.blocks.length);
  for(const c of instances)for(const row of d.blocks){const p=Object.fromEntries(axes.map(a=>[a,row.position[a]+c.translation[a]]));assert(axes.every(a=>Number.isSafeInteger(p[a]))&&p.y>=-64&&p.y<=319,'Illegal coordinate '+K(p));const block=canonicalBlock(row.block),cx=Math.floor(p.x/16),cz=Math.floor(p.z/16),ck=cx+','+cz;let chunk=chunks.get(ck);if(!chunk){chunk={chunk:{x:cx,z:cz},palette:[],pal:new Map(),cells:[],occupied:new Set(),instances:new Set()};chunks.set(ck,chunk);}const x=p.x-16*cx,z=p.z-16*cz,cell=(p.y+64)*256+z*16+x;assert(!chunk.occupied.has(cell),'Overlapping composed cell '+K(p));chunk.occupied.add(cell);const bk=JSON.stringify(block);if(!chunk.pal.has(bk)){chunk.pal.set(bk,chunk.palette.length);chunk.palette.push(block);}chunk.cells.push([x,p.y,z,chunk.pal.get(bk)]);chunk.instances.add(c.name);count++;materials[block.id]=(materials[block.id]??0)+1;for(const a of axes){bounds.from[a]=Math.min(bounds.from[a],p[a]);bounds.to[a]=Math.max(bounds.to[a],p[a]);}}
  assert.equal(await shaFile(full),pins[path],'Source changed during export '+path);
 }
 mkdirSync(staging,{recursive:true});mkdirSync(join(staging,'chunks'));
 const files=[];let decodedCount=0;
 for(const[key,chunk]of[...chunks].sort((a,b)=>a[1].chunk.z-b[1].chunk.z||a[1].chunk.x-b[1].chunk.x)){
  chunk.cells.sort((a,b)=>a[1]-b[1]||a[2]-b[2]||a[0]-b[0]);
  const payload={format:'tinygpu-vanilla-chunk-v1',chunk:chunk.chunk,palette:chunk.palette,cells:chunk.cells,source_instances:[...chunk.instances].sort()},bytes=Buffer.from(JSON.stringify(payload)+'\n'),file='chunks/'+key.replace(',','_')+'.json';
  // Exact decode compares every emitted blockstate and coordinate before writing.
  const decoded=decodeChunk(payload);assert.equal(decoded.length,chunk.cells.length);for(let i=0;i<decoded.length;i++){const r=chunk.cells[i],v=decoded[i];assert.deepEqual(v.position,{x:16*chunk.chunk.x+r[0],y:r[1],z:16*chunk.chunk.z+r[2]});assert.deepEqual(v.block,chunk.palette[r[3]]);}decodedCount+=decoded.length;
  writeFileSync(join(staging,file),bytes);files.push({path:file,sha256:shaBytes(bytes),chunk:chunk.chunk,cells:chunk.cells.length,bytes:bytes.length});
 }
 assert.equal(decodedCount,count);
 for(const[path,h]of Object.entries(pins))assert.equal(await shaFile(resolve(ROOT,path)),h,'Source changed before export seal '+path);
 assert.equal(shaBytes(readFileSync(configPath)),shaBytes(configBytes),'Config changed before export seal');
 const manifest={status:'lossless_offline_block_export_not_build_admission',format:'tinygpu-vanilla-chunks-v1',config_sha256:shaBytes(configBytes),source_design_sha256:pins,actual_unique_cells:count,materials,bounds,occupied_chunk_columns:chunks.size,forceload_rectangles:chunkRectangles(new Set(chunks.keys())),chunks:files,complete_gpu_layout:false,electrical_acceptance:false,native_acceptance:false,world_mutations:0,construction_requirements:['Verify the intended Workshop session, body clearance, shared writer lease and quiescent jobs before any future mutation.','Inspect and back up every bounded placement area. This export does not authorize clearing unrelated cells or existing builds.','Use complete sparse readback plus population checks and verify vanilla ticking coverage, then the designed cold-initialize sequence.','Run targeted native primitive tests before replicating unverified circuits. Keep runtime answers, memory and control entirely in vanilla blocks.'],limits:['This export preserves only the exact explicitly selected instances. It does not prove architecture completeness, signal correctness, timing or compactness.','Palette validation checks vanilla namespace and blockstate syntax, not the target game registry. Confirm IDs/properties against the actual Java26.3 registry before placement.','There are no game commands, host runtime logic, automatic world writes or implicit removals in this package.']};
 writeFileSync(join(staging,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');renameSync(staging,destination);return manifest;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const[cfg,out]=process.argv.slice(2);assert(cfg&&out,'Usage: node full-gpu-chunk-export.mjs CONFIG_JSON FRESH_OUTPUT_DIR');const m=await exportChunks(cfg,out);console.log(JSON.stringify({status:m.status,cells:m.actual_unique_cells,chunks:m.occupied_chunk_columns,world_mutations:0}));
}
