// Bind the actual comparator roles and complete body-only root sets.
// This is settled interface topology; it is not a phase/timing certificate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},K=p=>`${p.x},${p.y},${p.z}`;
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const d=read('connected-candidate.json'),coverage=read('coverage.json'),old=read('../dispatch-global-colocation-v1/transport-cuts.json');
const w=new Map(d.blocks.map(v=>[K(v.position),v.block])),bodies=d.blocks.filter(v=>v.body),original=new Map(bodies.map(v=>[K(v.original_position),v])),bodyAt=new Map(bodies.map(v=>[K(v.position),v]));
const byPair=new Map(coverage.drawn.map(c=>[K(c.source)+'>'+K(c.target),c])),connections=new Map(d.connections.map(c=>[c.name,c]));
const F={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
function role(block,source,target){const [x,z]=F[block.properties.facing],dx=target.x-source.x,dz=target.z-source.z;assert.equal(Math.abs(dx)+Math.abs(dz),1);assert.equal(source.y,target.y);if(dx===x&&dz===z)return'rear';assert(dx*x+dz*z===0,'Comparator output side is not an input');return'side';}
const comparatorRoles=[];
for(const t of old.transfers){const pair=byPair.get(K(t.source)+'>'+K(t.target));if(!pair)continue;const c=connections.get(pair.name),receiver=w.get(K(c.destination));if(receiver.id!=='minecraft:comparator')continue;
 assert(inputs(w,c.destination).some(p=>K(p)===K(c.normalizer)));const oldRole=role(original.get(K(t.target)).block,t.immediate_source,t.target),newRole=role(receiver,c.normalizer,c.destination);assert.equal(newRole,oldRole,'Changed comparator role '+c.name);
 assert.equal(receiver.properties.mode,'subtract');assert.equal(w.get(K(c.normalizer)).id,'minecraft:repeater');comparatorRoles.push({name:c.name,original_source:t.source,receiver:c.destination,normalizer:c.normalizer,old_role:oldRole,new_role:newRole,normalized_high:15});
}
// Reciprocal source==target rows are tracked separately in coverage.json. They
// are not required second signal drivers and are not accepted through this pass.
const groups=new Map();for(const t of old.transfers){if(K(t.source)===K(t.target))continue;const key=K(t.target);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
const completeBodyGroups=[],externalGroups=[],mergedGroups=[],negative=[];
for(const group of groups.values()){const target=original.get(K(group[0].target));if(!target||group.some(t=>!original.has(K(t.source)))){externalGroups.push(group);continue;}
 const contributors=[];for(const t of group){const pair=byPair.get(K(t.source)+'>'+K(t.target));if(pair){const c=connections.get(pair.name);assert(inputs(w,c.destination).some(p=>K(p)===K(c.normalizer)));contributors.push({original_source:t.source,source_body:t.source_body,route:c.name,arrival:c.normalizer});}
  else{const source=original.get(K(t.source));assert(inputs(w,target.position).some(p=>K(p)===K(source.position)),'Missing original body-only source '+K(t.source)+' -> '+K(t.target));contributors.push({original_source:t.source,source_body:t.source_body,route:null,arrival:source.position});}}
 const item={target:target.position,original_target:target.original_position,target_body:target.body,contributors};completeBodyGroups.push(item);
 if(contributors.length>1&&target.block.id==='minecraft:redstone_wire'){
  assert.equal(contributors.length,2);item.settled_truth_table=[false,true,true,true];mergedGroups.push(item);
  // Removing either actual arrival must remove that contributor at the receiver.
  // This prevents complete-OR credit for the single still-present branch.
  for(const c of contributors){const saved=w.get(K(c.arrival));w.delete(K(c.arrival));assert(!inputs(w,target.position).some(p=>K(p)===K(c.arrival)));negative.push({case:'remove_actual_OR_arrival',target:target.position,removed_source:c.original_source,removed_cell:c.arrival});w.set(K(c.arrival),saved);}
 }
}
const clearGroups=mergedGroups.filter(g=>['dispatch/dispatched','dispatch/completed','dispatch/output_next'].includes(g.target_body));assert.equal(clearGroups.length,3);
for(const g of clearGroups)assert.deepEqual(g.contributors.map(c=>c.source_body).sort(),['dispatch/admission_logic','dispatch/microdecode']);
assert.equal(comparatorRoles.length,30);assert.equal(mergedGroups.length,8);
const report={status:'all_body_only_transfer_root_sets_and_comparator_input_roles_match',comparator_roles:comparatorRoles,complete_body_target_groups:completeBodyGroups.length,complete_body_transfer_roots:completeBodyGroups.reduce((n,g)=>n+g.contributors.length,0),complete_body_groups:completeBodyGroups,external_target_groups_pending:externalGroups.length,merged_wire_groups:mergedGroups,clear_OR_groups:clearGroups.length,negative_cases:negative,source_sha256:pins,limits:['The original body-only transfer graph is now connected, including its multiple-source ORs. Foreign source groups and all foreign boundary cuts remain separate obligations.','Comparator rear/side identity is checked from actual orientation and directed arrivals; this does not prove delivered pulse width or settling.','No assertion about old reciprocal terminal-return edges, complete electrical equivalence, body truth/state behavior, timing, native execution or whole-machine completeness.'],native_acceptance:false};
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6-inverted-v1/check-port-semantics.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
writeFileSync(new URL('port-semantics-checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,comparator_roles:comparatorRoles.length,body_target_groups:completeBodyGroups.length,body_transfer_roots:report.complete_body_transfer_roots,merged_wire_groups:mergedGroups.length,clear_OR_groups:clearGroups.length,negative_cases:negative.length,external_groups:externalGroups.length}));
