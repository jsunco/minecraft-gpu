// Single-copy composition only. Callers must bind and verify frozen input maps.
// Neither source package is modified. New B fanout is drawn in the union.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
const W='minecraft:redstone_wire';
export function compose(alu,lsu,{plan=false}={}){
 const removedNames=new Set(['source_shared_phase_b','source_shared_initialize']),removed=lsu.blocks.filter(v=>removedNames.has(v.part)),removeKeys=new Set(removed.map(v=>K(v.position)));
 const map=new Map(alu.blocks.map(v=>[K(v.position),{...v,part:'alu',owners:['alu'],source_part:v.part}]));
 const aliases=new Map([['source_shared_phase_a','shared_raw_A_to_local_guard']]);
 for(const [a,b] of aliases)assert.deepEqual(lsu.connections.find(c=>c.name===a)?.source,alu.connections.find(c=>c.name===b)?.source,'Shared device must have the same real source '+a);
 const overlaps=[];let inserted=0;
 for(const b of lsu.blocks){if(b.part==='core_parent'||removeKeys.has(K(b.position)))continue;const k=K(b.position),old=map.get(k);
  if(old){assert.deepEqual(old.block,b.block,'Unresolved union state conflict '+k);if(!b.block.id.endsWith('_concrete'))assert.equal(old.source_part,aliases.get(b.part),'Undeclared shared electrical device '+k);old.owners.push('lsu');overlaps.push({position:b.position,block:b.block,alu_part:old.source_part,lsu_part:b.part});}
  else{map.set(k,{...b,part:'lsu',owners:['lsu'],source_part:b.part});inserted++;}
 }
 const edges=[...alu.edges,...lsu.edges.filter(e=>!removeKeys.has(K(e.from))&&!removeKeys.has(K(e.to)))],routes=[...alu.routes.map(r=>({...r,name:'alu/'+r.name})),...lsu.routes.filter(r=>!removedNames.has(r.name)).map(r=>({...r,name:'lsu/'+r.name}))];
 const repairs=[];let part='';const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to});
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};const old=at(p);if(old){assert.equal(id,'light_gray_concrete','Union route collision '+K(p));assert.deepEqual(old.block,block);return;}map.set(K(p),{position:p,block,part,owners:['repair'],source_part:part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 const cacheURL=new URL('routes.json',import.meta.url),cache=existsSync(cacheURL)?JSON.parse(readFileSync(cacheURL)):{};
 for(const [name,oldName,aluName,source]of[['shared_B_repair','source_shared_phase_b','raw_B_to_switch_current',P(-52,2,15)],['shared_initialize_repair','source_shared_initialize','shared_initialize_to_local_guard',P(-67,21,-10)]]){
  part=name;const connection=lsu.connections.find(c=>c.name===oldName),a=alu.connections.find(c=>c.name===aluName),r=alu.routes.find(r=>r.name===aluName);assert(connection&&a&&r);assert.deepEqual(a.source,connection.source,'Both branches must have the same actual source '+name);
  const index=r.path.findIndex(p=>K(p)===K(source));assert(index>0&&r.refresh_indices.includes(index-1),'Branch must follow an existing refresh '+name);const driver=at(r.path[index-1]);assert.equal(driver?.block.id,'minecraft:repeater');assert.equal(at(source)?.block.id,W);
  const destination=connection.destination,sd='north',ad='north',tap=step(source,sd),start=step(source,sd,2),arrival=step(destination,ad,-1),end=step(destination,ad,-2);assert.equal(at(destination)?.block.id,W);
  rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(source,tap);edge(tap,start);edge(end,arrival);edge(arrival,destination);
  let path=cache[name]?.path;if(!path){assert(plan,'Missing union-only route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![source,start,end,destination].some(q=>K(p)===K(q)));const found=searchPath(map,start,end,{ignore,forbidden});path=found.path;cache[name]={source,destination,path,expanded:found.expanded};writeFileSync(cacheURL,JSON.stringify(cache)+'\n');}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});repairs.push({name,source,tap,destination,arrival,original_lsu_route:oldName,shared_alu_route:aluName,original_source:connection.source,source_refresh:r.path[index-1]});
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'single_copy_core_ALU_LSU_union_candidate',blocks,box,ports:{...alu.ports,lsus:lsu.ports.lsus,lsu_reset_ack:lsu.ports.lsu_reset_ack,lsu_fault:lsu.ports.lsu_fault},edges,routes,shared_overlaps:overlaps,removed_lsu_routes:removed,repairs,metrics:{blocks:blocks.length,alu_parent_blocks:alu.blocks.length,inserted_lsu_cells:inserted,removed_lsu_route_cells:removed.length,shared_cells:overlaps.length,retained_bits:alu.metrics.retained_bits+148},native_acceptance:false,complete_gpu:false,missing:['Full global reset/admission closure and measured far phase/lock timing.','Actual memory requester/ready/data/drain interconnects; no READY-low substitution for downstream drain.']};
}
