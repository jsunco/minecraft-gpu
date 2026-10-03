// Reject/measure the simplest straight136-field bus before authoring a full
// 544-sink fanout. This is a collision screen of an INCOMPLETE route proposal.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
const H=new URL('./',import.meta.url),R=new URL('../../../../',H),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
const path='artifacts/full-gpu-layout-v1/memory/channel-payload-v1/design.json',b=readFileSync(new URL(path,R)),old=JSON.parse(b),localBytes=readFileSync(new URL('direct-design.json',H)),local=JSON.parse(localBytes),map=new Map(local.blocks.map(v=>[K(v.position),v]));
const proposed=new Map();function put(p,role){const k=K(p);if(!proposed.has(k))proposed.set(k,{position:p,roles:[]});proposed.get(k).roles.push(role);}
for(const v of old.blocks)if(old.groups[K(v.position)]==='raw_request_selectors')put(P(v.position.x+40,v.position.y-40,v.position.z-20),'raw_selector_body');
for(let i=0;i<8;i++)for(let field=0;field<17;field++){
 const y=-39+4*i,z=old.fields[field].z-18,busZ=field===14?z-2:z;
 for(let x=128+4*i;x<=644;x++)for(const yy of[y-1,y])put(P(x,yy,busZ),'shared_bus_'+i+'_'+field);
 if(field===14)for(let zz=busZ;zz<=z;zz++)for(const yy of[y-1,y])put(P(644,yy,zz),'type_turn_'+i);
 for(const x of[128+4*i,608+4*i]){
  for(let yy=y;yy<=y+176;yy++)put(P(x,yy,busZ+2),'positive_column_'+i+'_'+field);
  for(const yy of[y-1,y])put(P(x,yy,busZ+1),'column_input_'+i+'_'+field);
 }
}
const conflicts=[];for(const[k,v]of proposed)if(map.has(k))conflicts.push({...v,existing:map.get(k)});
const byExistingPart={};for(const c of conflicts)byExistingPart[c.existing.part]=(byExistingPart[c.existing.part]??0)+1;
assert(conflicts.length>0,'Expected rejected straightforwardbus proposal changed');
const out={status:'incomplete_raw_fanout_proposal_rejected_for_occupied_positions',source_sha256:{[path]:createHash('sha256').update(b).digest('hex'),'direct-design.json':createHash('sha256').update(localBytes).digest('hex')},candidate_scope:'10,032 raw selector body cells,136 straight shared buses and272 vertical columns; no full544 terminal adapters or current96-route replacements yet',proposed_cells:proposed.size,occupied_positions:conflicts.length,byExistingPart,conflicts,limits:['Occupied-cell check only; not headroom, power, directed transport or acceptance.','Two same-height owner banks put the right-bank control rail across the naive shared field bus.','Lookup and backend columns also need an explicit joint placement change.','Do not solve this by allowing same-net overlap or copying only the no-conflict rows.'],selected:false,native_acceptance:false};writeFileSync(new URL('raw-bus-clearance.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,proposed_cells:out.proposed_cells,occupied_positions:conflicts.length,byExistingPart}));
