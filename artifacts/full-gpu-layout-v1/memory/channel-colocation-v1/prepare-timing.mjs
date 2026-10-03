// Exact changed control-transport slice; unchanged logic is copied from its
// frozen actual-cell timing slice, never assigned an opaque zero delay.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),read=n=>readLargeDesign(fileURLToPath(new URL(n,H))),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>({x:p.x+q.x,y:p.y+q.y,z:p.z+q.z});
const base=read('extracted-map.json'),d=read('trial-design.json'),e=read('extraction.json'),local=read('local-qualified.json'),ctl=read('../internal-runtime-timing-v1/control-slice.json');
const removed=new Set(base.removed.map(v=>K(v.position))),oldMap=new Map([...base.blocks,...base.removed].map(v=>[K(v.position),v])),map=new Map(ctl.blocks.filter(v=>!removed.has(K(v.position))).map(v=>[K(v.position),v]));
for(const v of d.blocks)if(v.part!=='relocated_complete_backend')map.set(K(v.position),v);
const portMap={};for(const [name,p]of Object.entries(e.backend_ports))for(let b=0;b<p.positions.length;b++){const old=p.positions[b],pos=A(local.ports[name].positions[b],d.candidate.origin);portMap[K(old)]=pos;const v=d.blocks.find(v=>K(v.position)===K(pos));assert(v);map.set(K(pos),v);}
const sections=structuredClone(ctl.sections);for(const s of Object.values(sections))for(const k of Object.keys(s.endpoints))s.endpoints[k]=s.endpoints[k].map(p=>portMap[K(p)]??p);
const suffixes={};for(const [name,part,kind]of[['response_d','qualified_response_d_cables','qualified_backend_d'],['response_q','actual_retained_response_joins','retained_response'],['consumer_ready','actual_ready_source_joins','backend_ready']]){
 const links=e.incident_interfaces.filter(v=>(v.kind??v.name)===kind),m=new Map(base.removed.filter(v=>v.part===part).map(v=>[K(v.position),v]));
 for(const r of links)for(const p of[r.source,r.destination]){const v=oldMap.get(K(p));assert(v);m.set(K(p),v);}
 suffixes[name]={blocks:[...m.values()],connections:links.map(v=>({source:v.source,destination:v.destination,bit:v.bit??0}))};
}
const sources={};for(const n of['prepare-timing.mjs','trial-design.json','extraction.json','local-qualified.json','../internal-runtime-timing-v1/control-slice.json'])sources[new URL(n,H).pathname]=createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const patchMap=new Map(d.blocks.map(v=>[K(v.position),v])),cableCells=d.blocks.filter(v=>v.part!=='relocated_complete_backend'),allowed=new Set(cableCells.map(v=>K(v.position))),newWorld=new Map();
for(const r of d.connections)for(const p of[r.source,r.destination])allowed.add(K(p));
for(const k of allowed){const [x,y,z]=k.split(',').map(Number);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){const q={x:x+dx,y:y+dy,z:z+dz},qk=K(q),v=patchMap.get(qk)??(!removed.has(qk)?oldMap.get(qk):null);if(v)newWorld.set(qk,v);}}
const facing={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
for(const v of [...newWorld.values()])if(['minecraft:redstone_torch','minecraft:redstone_wall_torch'].includes(v.block.id)){const p=v.position,t=v.block.id==='minecraft:redstone_torch'?{x:p.x,y:p.y-1,z:p.z}:{x:p.x+facing[v.block.properties.facing][0],y:p.y,z:p.z+facing[v.block.properties.facing][1]},k=K(t),s=patchMap.get(k)??(!removed.has(k)?oldMap.get(k):null);assert(s?.block.id.endsWith('_concrete'));newWorld.set(k,s);}
const new_transport={blocks:[...newWorld.values()],allowed_positions:[...allowed].map(k=>k.split(',').map(Number)),connections:d.connections.map(({name,source,destination})=>({name,source,destination}))};
writeFileSync(new URL('timing-slices.json',H),JSON.stringify({blocks:[...map.values()],sections,suffixes,new_transport,source_sha256:sources})+'\n');
console.log(JSON.stringify({control_cells:map.size,suffixes:Object.fromEntries(Object.entries(suffixes).map(([n,s])=>[n,s.blocks.length]))}));
