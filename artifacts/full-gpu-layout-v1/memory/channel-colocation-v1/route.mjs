// Offline complete incident-cable trial; no runtime or Minecraft imports.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{fileURLToPath}from'node:url';
import{readLargeDesign,writeLargeDesign}from'../../../../hardware/memory-layout-large-json-v2.mjs';
import{searchPath,refreshIndices}from'../../control-commit-v2/route.mjs';
import{makePatch,P,K,V,F,W,S,under,step}from'./layout.mjs';
const H=new URL('./',import.meta.url),read=n=>readLargeDesign(fileURLToPath(new URL(n,H))),base=read('extracted-map.json'),e=read('extraction.json'),local=read('local-qualified.json'),placement=read('placement-search.json'),index=Number(process.argv[2]??3),candidate=placement.ranked_origins[index];assert(candidate);
const boundary=read('boundary-checks.json');assert.equal(boundary.unknown_edges.length,0,'Unaccounted electrical cut');
const foreign=read('foreign-obstacles.json');
const patch=makePatch(e,base,local,candidate.origin),map=new Map([...base.blocks,...foreign.blocks,...patch.blocks].map(v=>[K(v.position),v])),newMap=new Map(patch.blocks.map(v=>[K(v.position),v]));
const foreignKeys=new Set(foreign.blocks.map(v=>K(v.position)));for(const v of patch.blocks)assert(!foreignKeys.has(K(v.position)),'Attachment overlaps foreign map');
const file=new URL('routes-with-foreign-candidate-'+index+'.json',H),cache=existsSync(file)?JSON.parse(readFileSync(file)):{};let part='';
function put(p,id,properties){for(const row of[{position:under(p),block:{id:S}},{position:p,block:{id,...properties?{properties}:{}}}]){const k=K(row.position),old=map.get(k);if(old){assert.deepEqual(old.block,row.block,'Route overlap '+part+' '+k);assert(newMap.has(k)||id===S,'Fixed active overwrite '+k);continue;}const v={...row,part};map.set(k,v);newMap.set(k,v);patch.blocks.push(v);}}
const reserve=r=>[...Array.from({length:12},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:12},(_,i)=>step(r.destination,r.arrival_direction,-i-2))],reserved=patch.connections.flatMap(reserve);
// Wide data routes first. All 25 sources/receivers already exist physically.
const pending=[...patch.connections].sort((a,b)=>(Math.abs(b.start.x-b.end.x)+Math.abs(b.start.z-b.end.z))-(Math.abs(a.start.x-a.end.x)+Math.abs(a.start.z-a.end.z)));
for(const r of pending){part=r.name;let ps=cache[r.name]?.path;assert(!cache[r.name]||JSON.stringify(cache[r.name].origin)===JSON.stringify(candidate.origin),'Stale trial cache');
 if(!ps){const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...reserve(r)],found=searchPath(map,r.start,r.end,{ignore,reserved,limit:800000});ps=found.path;cache[r.name]={origin:candidate.origin,source:r.source,destination:r.destination,path:ps,expanded:found.expanded};writeFileSync(file,JSON.stringify(cache)+'\n');console.error(JSON.stringify({route:r.name,points:ps.length,expanded:found.expanded}));}
 assert.deepEqual(ps[0],r.start);assert.deepEqual(ps.at(-1),r.end);const rs=refreshIndices(ps),refresh=new Set(rs);
 for(let i=1;i<ps.length-1;i++){const p=ps[i],n=ps[i+1];if(refresh.has(i)){const direction=Object.keys(V).find(k=>p.x+V[k][0]===n.x&&p.z+V[k][1]===n.z);assert(direction);put(p,'minecraft:repeater',{facing:F[direction],delay:'1'});}else put(p,W);}
 r.path=ps;r.refresh_indices=rs;for(let i=1;i<ps.length;i++)patch.edges.push({from:ps[i-1],to:ps[i],route:r.name});
}
const result={status:'fully_incident_routed_channel_colocation_trial_unverified',candidate,blocks:patch.blocks,connections:patch.connections,edges:patch.edges,removed:base.removed,local_qualification:local.bank_tail_qualification,metrics:{old_memory_cells:base.blocks.length+base.removed.length,unchanged_memory_cells:base.blocks.length,removed_cells:base.removed.length,new_cells:patch.blocks.length,net_cell_reduction:base.removed.length-patch.blocks.length,new_memory_cells:base.blocks.length+patch.blocks.length,complete_backend_cells:local.blocks.length,all_incident_connections:patch.connections.length,added_retained_state:0},source_sha256:e.source_sha256,selected:false,native_acceptance:false,limitations:['All 25 incident links are drawn, but static contact/support/source preservation and updated nominal event timing are required before any replacement admission.','This is one complete channel-backend relocation within the unchanged owner/payload/bank/consumer fabric, not a selected whole-memory or whole-machine compact layout.']};
writeLargeDesign(fileURLToPath(new URL('trial-design.json',H)),result);console.log(JSON.stringify(result.metrics));
