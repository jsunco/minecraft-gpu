// Boundary refinement ends at stored requester outputs: never alias raw reset to held reset.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),sha=n=>createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex'),P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
const d=read('../master-reset-requesters-v2/connected-design.json'),iface=read('../master-reset-requesters-v2/interface.json'),t=read('../master-core-command-routes-v2/design.json');
assert.equal(iface.design_sha256,sha('../master-reset-requesters-v2/connected-design.json'));
const source_sha256={};
for(const folder of ['master-reset-requesters-v2','master-core-command-routes-v2']){
 const m=read(`../${folder}/source-manifest.json`);source_sha256[`artifacts/full-gpu-layout-v1/${folder}/source-manifest.json`]=sha(`../${folder}/source-manifest.json`);
 for(const [p,h]of Object.entries(m.files??m.source_sha256??m.pins)){if(p.endsWith('/connected-design.json')||p.endsWith('/design.json')&&p.includes('master-core-command-routes-v2')||p.endsWith('/interface.json')&&p.includes('master-reset-requesters-v2')){assert.equal(createHash('sha256').update(readFileSync(new URL('../../../'+p,import.meta.url))).digest('hex'),h);source_sha256[p]=h;}}
}
const graph=new Map;function edge(a,b){const k=K(a);if(!graph.has(k))graph.set(k,new Set);graph.get(k).add(K(b));}
for(const e of [...d.edges,...t.edges])edge(e.from,e.to);
for(const parent of Object.values(d.parents))for(const c of parent.columns??[])for(let y=c.bottom;y<c.top;y++)edge(add(P(c.x,y,c.z),parent.translation),add(P(c.x,y+1,c.z),parent.translation));
for(const c of t.columns)for(let y=c.bottom;y<c.output_y;y++)edge(P(c.x,y,c.z),P(c.x,y+1,c.z));
const cache=new Map;function reachable(p){let seen=cache.get(K(p));if(seen)return seen;seen=new Set([K(p)]);const q=[K(p)];for(let i=0;i<q.length;i++)for(const n of graph.get(q[i])??[])if(!seen.has(n)){seen.add(n);q.push(n);}cache.set(K(p),seen);return seen;}
const get=n=>{const c=d.connections.find(v=>v.name===n);assert(c,n);return c;},pt=(i,n)=>iface.cores[i].requester_ports[n].bits[0].position,ep=(instance,port,p,direction)=>({instance,port,positions:[p],direction,coordinate_frame:'master'}),links=[],replacements=[],additional=[];
function link(name,si,sp,s,di,dp,e,parts){assert(reachable(s).has(K(e)),`Missing physical path: ${name}`);const route={name,source_instance:si,source_port:sp,source:s,destination_instance:di,destination_port:dp,destination:e,physical_path_composition:parts};links.push(route);return{ name,driver:ep(si,sp,s,'output'),sink:ep(di,dp,e,'input'),width:1,scope:'explicit_serialized_reset_refinement'};}
for(let i=0;i<2;i++){
 const r=`serialized_reset_requester${i}`,a=iface.cores[i];
 for(const [prefix,field,input]of[['qualified_start_','start_command','start'],['qualified_warm_reset_','reset','demand']]){
  const name=prefix+i,c=t.connections.find(v=>v.name===name),raw=get(name+'_raw_to_sampler'),held=get(name+'_held_to_trunk');
  assert.deepEqual(held.source,pt(i,field));assert.deepEqual(held.destination,c.receiver);assert.deepEqual(raw.source,c.original_source);assert.deepEqual(raw.destination,pt(i,input));
  replacements.push(link(name,r,field,held.source,`core${i}`,c.destination_port,c.destination,[held.name,name]));
  additional.push(link(name+'_raw_to_requester','global',`core${i}_${field==='reset'?'reset':'start'}`,raw.source,r,input,raw.destination,[raw.name]));
  assert(!reachable(raw.source).has(K(c.receiver)),`Raw command bypasses storage: ${name}`);
 }
 replacements.push(link(`dispatch_reset_ack_${i}`,`core${i}`,'reset_ack',a.actual_core_ACK,'dispatch',`core_ack${i}`,a.dispatcher_ACK,[`core${i}_actual_ACK_source`,`core${i}_actual_ACK_fanout`,`core${i}_raw_ACK_to_dispatch`]));
 replacements.push(link(`global_core_ack${i}`,r,'held_reset',pt(i,'held_reset'),'global',`core_ack${i}`,a.global_epoch_completion,[`core${i}_qualified_completion_source`,`core${i}_qualified_completion_fanout`,`core${i}_qualified_completion_to_global`]));
 additional.push(link(`core${i}_ack_to_requester`,`core${i}`,'reset_ack',a.actual_core_ACK,r,'ack',pt(i,'ack'),[`core${i}_actual_ACK_source`,`core${i}_actual_ACK_fanout`,`core${i}_ACK_to_requester`]));
 const j=get(`core${i}_qualified_completion_to_join`);
 additional.push(link(`requester${i}_completion_to_join`,r,'held_reset',pt(i,'held_reset'),'reset_completion_join',`core${i}`,j.destination,[`core${i}_qualified_completion_source`,`core${i}_qualified_completion_fanout`,j.name]));
 for(const [port,base,sourcePort]of[['phase_A','actual_global_phase_A','clock.phase_A'],['phase_B','actual_global_phase_B','clock.phase_B'],['initialize','actual_global_initialize','cold_initialize'],['permit','actual_global_permit','normal_permit']]){
  const c=get(base);additional.push(link(`global_${port}_to_requester${i}`,'global',sourcePort,c.source,r,port,pt(i,port),[base,`${port}_two_core_fanout`,`${port}_requester${i}`]));
 }
}
const join=d.parents.two_current_held_reset_completion;assert.deepEqual(join.definition,{inputs:['core0','core1'],outputs:['cores_held_reset'],products:[{out:'cores_held_reset',literals:{core0:true,core1:true}}]});
const j=get('qualified_both_held_reset_to_loader');replacements.push(link('global_cores_reset_to_loader','reset_completion_join','cores_held_reset',j.source,'loader','loader.cores_held_reset',j.destination,[j.name]));
assert.equal(replacements.length,9);assert.equal(additional.length,16);assert.equal(links.length,25);assert.equal(new Set(links.map(x=>x.name)).size,25);
const report={status:'explicit_stored_requester_boundary_refinement_drawn',source_sha256,replacements,additional,links,raw_to_trunk_bypass_refusals:4,completion_join:join.definition,limits:['Directed authored geometry plus frozen block interaction screens; no alias crosses a stored requester boundary.','The old global reset command is sampled as a demand. Qualified completion is held separately from actual core ACK.','Full composition and event/physical timing remain separate acceptance gates.'],native_acceptance:false};
writeFileSync(new URL('requester-refinement.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,replacements:replacements.length,additional:additional.length,drawn_paths:links.length,bypass_refusals:4}));
