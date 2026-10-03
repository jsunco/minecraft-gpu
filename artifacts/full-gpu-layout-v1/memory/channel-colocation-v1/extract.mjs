// Offline channel-0 relocation boundary, against actual selected memory bytes.
// Extraction does not authorize deletion: every physical boundary is audited.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign,writeLargeDesign} from '../../../../hardware/memory-layout-large-json-v2.mjs';
const H=new URL('./',import.meta.url),B=new URL('../',H),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
const hashes={},read=(f,large=false)=>{const p=fileURLToPath(new URL(f,B)),buf=readFileSync(p);hashes['artifacts/full-gpu-layout-v1/memory/'+f]=createHash('sha256').update(buf).digest('hex');return large?readLargeDesign(p):JSON.parse(buf);};
const current=read('internal-bank-response-v1/design.json',true);assert.equal(hashes['artifacts/full-gpu-layout-v1/memory/internal-bank-response-v1/design.json'],'1cf502bc9cd5a5b9f4bf3227fa2ab7659bcd73888b3a9142127b4c39555ea0fc');
const map=new Map(current.blocks.map(v=>[K(v.position),v])),owned=new Map(),oldRoutes=[],links=[];
const laterSubstitutions={'1142,297,646':{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}}};
const own=(v,part)=>{const k=K(v.position),actual=map.get(k);assert(actual,'Missing extracted cell '+k);assert.deepEqual(actual.block,laterSubstitutions[k]??v.block,'Changed extracted cell '+k);if(!owned.has(k))owned.set(k,{...actual,part});};
const old=read('channel-backend-control-v1/design.json'),compact=read('channel-backend-compact-v1/design.json'),O=P(1024,0,640),body=new Set();
for(const v of old.blocks){const row={...v,position:A(v.position,O)};own(row,'backend');body.add(K(row.position));}
const ports=Object.fromEntries(Object.entries(old.ports).map(([k,v])=>[k,{...v,positions:v.positions.map(p=>A(p,O))}]));
function layer(folder,group,nets,selectBindings,routeName=null){
 const d=read(folder+'/design.json');let count=0;
 for(const v of d.blocks){const k=K(v.position);if(d.groups[k]===group&&nets.includes(d.nets[k])){own(v,folder+'/'+group);count++;}}
 const rs=d.routes??[];for(const r of rs)if(nets.includes(r.net)&&(!routeName||routeName(r.name)))oldRoutes.push({folder,...r});
 const bs=d.bindings??d.return_bindings??[];for(const b of bs.filter(selectBindings))links.push({folder,...b});
 return {d,count};
}
const lifecycle=read('channel-backend-v1/design.json');
for(const [group,net]of [['active_to_backend','active0'],['retire_return','backend0/retire'],['backend_busy_return','backend0/backend_busy']]){
 for(const v of lifecycle.blocks){const k=K(v.position);if(lifecycle.groups[k]===group&&lifecycle.nets[k]===net)own(v,'lifecycle/'+group);}
 oldRoutes.push(...lifecycle.routes.filter(r=>r.net===net).map(r=>({folder:'channel-backend-v1',...r})));
}
links.push(...lifecycle.bindings.filter(v=>v.channel===0).map(v=>({folder:'channel-backend-v1',...v})));
// Shared reset trunk stays fixed; only channel 0's isolated branch is movable.
const ownAt=(p,part)=>{const v=map.get(K(p));assert(v,'Missing branch cell '+K(p));own(v,part);};
const rr=lifecycle.routes.find(r=>r.name==='reset0_branch');assert(rr);oldRoutes.push({folder:'channel-backend-v1',...rr});
for(const p of rr.path){ownAt(p,'reset_branch');ownAt(P(p.x,p.y-1,p.z),'reset_branch');}
const rc=lifecycle.columns.find(c=>c.name==='reset0_lift');assert(rc);for(let y=rc.lo;y<=rc.hi;y++)ownAt(P(rc.x,y,rc.z),'reset_branch');
for(const p of[P(741,-31,504),P(743,-7,504),P(1039,1,632)]){ownAt(p,'reset_branch');ownAt(P(p.x,p.y-1,p.z),'reset_branch');}
layer('channel-withdrawal-v1','matching_valid_withdrawal_return',['lookup0/owner_valid'],v=>v.channel===0&&v.name==='owner_valid');
layer('channel-typed-request-v1','backend_request_route',['backend0/bank_request'],v=>v.channel===0&&v.kind==='request');
layer('bank-ready-return-v1','actual_channel_ready_inputs',['channel0_bank_ready/next_or_0'],v=>v.channel===0&&v.kind==='actual_backend_ready');
layer('bank-busy-return-v1','busy_retire_qualification',['channel0_bank_busy/next_or_0'],v=>v.channel===0&&['retire_mask','busy_or'].includes(v.kind));
// These later layers preserve their route arrays with explicit prefixes.
for(const [group,nets,bname,prefix]of[
 ['actual_retained_response_joins',Array.from({length:8},(_,b)=>`backend0/response/state_bit_${b}`),'retained_response','return'],
 ['actual_ready_source_joins',['typed_ready_source0'],'backend_ready','return'],
 ['qualified_response_d_cables',Array.from({length:8},(_,b)=>`bank_response_matrix/consumer0_field${b}`),'qualified_backend_d','bank_response']]){
 // This author layer leaves the shared group variable at the final typed
 // field while its deferred ready high/low searches run. The unique ready
 // net is authoritative for the complete cable, not that incidental group.
 for(const v of current.blocks){const k=K(v.position);if((current.groups[k]===group||group==='actual_ready_source_joins')&&nets.includes(current.nets[k]))own(v,group);}
 oldRoutes.push(...current[prefix+'_routes'].filter(r=>nets.includes(r.net)).map(r=>({folder:'internal-bank-response-v1',...r})));
 links.push(...current[prefix+'_bindings'].filter(v=>v.channel===0&&v.kind===bname).map(v=>({folder:'internal-bank-response-v1',...v})));
}
assert.equal(links.length,26,'24 original bit interfaces plus the actual downstream RETIRE mask and BUSY OR');
const maskTargets=new Set(links.filter(v=>['retire_mask','busy_or'].includes(v.kind)).map(v=>K(v.destination)));
const fixed=new Set();for(const v of links)for(const p of[v.source,v.destination])if(!body.has(K(p))&&!maskTargets.has(K(p)))fixed.add(K(p));
fixed.add('740,-31,504'); // Actual retained shared reset trunk branch.
// ACTIVE column top and BUSY tail are already shared by later witness/owner
// consumers. Keep their exact local source geometry, and rejoin beyond it.
const shared=[];for(const [k,v]of owned){const p=v.position;
 if(v.part==='lifecycle/active_to_backend'&&p.x===50&&p.z>=173&&p.z<=176&&p.y<=5 || v.part==='lifecycle/backend_busy_return'&&p.x<=56&&p.z<=22){owned.delete(k);shared.push(v);}}
// Source/destination pads owned by previous stages are never removed.
for(const k of fixed)owned.delete(k);
const mismatches=old.blocks.filter(v=>!body.has(K(A(v.position,O))));assert.equal(mismatches.length,0);
const counts={};for(const v of owned.values())counts[v.part]=(counts[v.part]??0)+1;
const summary={status:'extracted_backend_with_all_declared_incident_connections_not_relocated',source_sha256:hashes,old_origin:O,body_cells:body.size,old_local_cells:old.blocks.length,compact_local_cells:compact.blocks.length,incident_interfaces:links,old_routes:oldRoutes,removed_candidate_cells:owned.size,removal_groups:counts,shared_prefix_cells:shared,fixed_boundary_cells:[...fixed],backend_ports:ports,old_box:old.box,compact_box:compact.box,limits:['Shared power/diode/wire boundaries and cap effects must be audited before this extraction can become a replacement.','The fixed allocator, owner-valid lookup, held owner/payload and complete bank/consumer fabrics remain part of the full matched comparison.'],native_acceptance:false};
writeFileSync(new URL('extraction.json',H),JSON.stringify(summary,null,2)+'\n');
const remaining=current.blocks.filter(v=>!owned.has(K(v.position))),removed=[...owned.values()];assert.equal(remaining.length+owned.size,current.blocks.length);
writeLargeDesign(fileURLToPath(new URL('extracted-map.json',H)),{blocks:remaining,removed,compact,old_backend:old,source_sha256:hashes,nets:current.nets,groups:current.groups});
console.log(JSON.stringify({body:body.size,removed:owned.size,groups:counts,interfaces:links.length,old_routes:oldRoutes.length,shared:shared.length,remaining:remaining.length}));
