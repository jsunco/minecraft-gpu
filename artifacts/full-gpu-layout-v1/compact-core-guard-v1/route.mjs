// Fully wired relocation pilot, never a runtime computation or game operation.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readLargeDesign,writeLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
import {P,K,V,F,W,S,under,step,basePatch} from './layout.mjs';
const read=n=>readLargeDesign(fileURLToPath(new URL(n,import.meta.url))),e=read('extraction.json'),base=read('obstacles.json'),foreign=read('../compact-core-fault-v1/foreign-obstacles.json');
const candidateIndex=Number(process.argv[2]??0),candidate=read('placement-candidates-fast.json').candidates[candidateIndex];assert(candidate);
const patch=basePatch(e,base,candidate.translation),map=new Map([...base.blocks,...foreign.blocks,...patch.blocks].map(v=>[K(v.position),v])),newMap=new Map(patch.blocks.map(v=>[K(v.position),v]));
const routeFile=new URL('routes-candidate-'+candidateIndex+'.json',import.meta.url),cached=existsSync(routeFile)?JSON.parse(readFileSync(routeFile)):{};
// Reserve the future stub's upper clearance too: a route three levels above
// empty future dust otherwise leaves its support two levels above that dust.
const pending=patch.connections.filter(r=>!r.internal),reserveFor=r=>[...Array.from({length:16},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:16},(_,i)=>step(r.destination,r.arrival_direction,-i-2))].flatMap(p=>[p,P(p.x,p.y+1,p.z)]),reserved=pending.flatMap(reserveFor);
const wire=p=>put(p,W),rep=(p,d)=>put(p,'minecraft:repeater',{facing:F[d],delay:'1'});let current='';
function put(p,id,properties){for(const row of [{position:under(p),block:{id:S}},{position:p,block:{id,...properties?{properties}:{}}}]){const k=K(row.position),prev=map.get(k);if(prev){assert.deepEqual(prev.block,row.block,'New route collision '+current+' '+k);assert(newMap.has(k)||id===S,'Cannot overwrite fixed parent '+k);continue;}const v={...row,part:current};map.set(k,v);newMap.set(k,v);patch.blocks.push(v);}}
// Longest/farthest attachment first leaves nearby control cables more options.
pending.sort((a,b)=>(Math.abs(b.start.x-b.end.x)+Math.abs(b.start.z-b.end.z))-(Math.abs(a.start.x-a.end.x)+Math.abs(a.start.z-a.end.z)));
for(const r of pending){current=r.name;let path=cached[r.name]?.path;assert(!cached[r.name]||JSON.stringify(cached[r.name].translation)===JSON.stringify(candidate.translation),'Stale candidate cache');
 if(!path){const own=reserveFor(r),ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...own];
  if(process.argv.includes('--inspect-next')){const near=p=>Math.abs(p.x-r.end.x)<=8&&Math.abs(p.y-r.end.y)<=5&&Math.abs(p.z-r.end.z)<=8;const diagnostic={status:'unrouted_attachment_diagnostic',route:r,nearby_blocks:[...map.values()].filter(v=>near(v.position)),nearby_reserved:reserved.filter(near),ignore,completed_routes:Object.keys(cached),native_calls:0};writeFileSync(new URL('next-route-diagnostic.json',import.meta.url),JSON.stringify(diagnostic,null,2)+'\n');console.log(JSON.stringify({name:r.name,start:r.start,end:r.end,blocks:diagnostic.nearby_blocks.length}));process.exit(0);}
  const out=searchPath(map,r.start,r.end,{ignore,reserved,limit:800000});path=out.path;
  cached[r.name]={translation:candidate.translation,source:r.source,destination:r.destination,path,expanded:out.expanded};writeFileSync(routeFile,JSON.stringify(cached)+'\n');console.error(JSON.stringify({route:r.name,points:path.length,expanded:out.expanded}));
 }
 assert.deepEqual(path[0],r.start);assert.deepEqual(path.at(-1),r.end);const refresh=refreshIndices(path),indices=new Set(refresh);
 for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(indices.has(i)){const d=Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z);assert(d);rep(p,d);}else wire(p);}
 for(let i=1;i<path.length;i++)patch.edges.push({from:path[i-1],to:path[i],route:r.name});r.path=path;r.refresh_indices=refresh;
}
for(const r of patch.connections){assert(r.path);for(const p of r.path)assert(['minecraft:redstone_wire','minecraft:repeater'].includes(map.get(K(p))?.block.id));}
const sourceFiles=['extraction.json','ownership-checks.json','foreign-obstacle-reference.json','placement-candidates-fast.json','routes-candidate-'+candidateIndex+'.json','layout.mjs','route.mjs'];
const result={status:'offline_routed_cluster_trial_not_accepted',candidate,blocks:patch.blocks,connections:patch.connections,edges:patch.edges,removed:base.removed,source_sha256:{...e.source_sha256,...Object.fromEntries(sourceFiles.map(n=>['artifacts/full-gpu-layout-v1/compact-core-guard-v1/'+n,createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex')]))},metrics:{cluster_cells:e.cluster_cells.length,all_incident_connections:patch.connections.length,removed_cells:base.removed.length,new_cells:patch.blocks.length,net_cell_reduction:base.removed.length-patch.blocks.length,original_core_cells:base.blocks.length+base.removed.length,candidate_core_cells:base.blocks.length+patch.blocks.length},complete_gpu_layout:false,native_calls:0,native_acceptance:false,limits:['Routed collision-screened trial; full removal/support/contact/attenuation and phase timing checks are required before replacement admission.','Foreign geometry from both core placements was used as routing obstacles; sparse full-master electrical effects remain to be checked.']};
writeLargeDesign(fileURLToPath(new URL('trial-design.json',import.meta.url)),result);console.log(JSON.stringify(result.metrics));
