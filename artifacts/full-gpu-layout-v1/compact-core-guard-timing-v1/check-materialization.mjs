// Independent frozen extraction, complete materialization and semantic endpoint check.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
const here=new URL('./',import.meta.url),base=new URL('../compact-core-guard-v1/',import.meta.url),root=new URL('../../../',import.meta.url);
const read=n=>readLargeDesign(fileURLToPath(new URL(n,base))),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),key=p=>`${p.x},${p.y},${p.z}`,add=(p,t)=>({x:p.x+t.x,y:p.y+t.y,z:p.z+t.z});
assert.equal(hash(new URL('source-manifest.json',base)),'cb4b955e6e7405a637e4573ef629f3a53ca3065377f9d519d0e9730150fab922');
const manifest=read('source-manifest.json'),e=read('extraction.json'),patch=read('trial-design.json'),mat=read('materialization.json'),checks=read('checks.json'),parent=read('../compact-core-fault-v1/design.json'),candidate=read('design.json');
const removed=new Map(patch.removed.map(r=>[key(r.position),r.block])),added=new Map(patch.blocks.map(r=>[key(r.position),r.block])),old=new Map(parent.blocks.map(r=>[key(r.position),r.block])),actual=new Map(candidate.blocks.map(r=>[key(r.position),r.block]));
assert.equal(old.size,parent.blocks.length);assert.equal(actual.size,candidate.blocks.length);assert.equal(removed.size,71469);assert.equal(added.size,46469);
for(const[k,b]of removed)assert.deepEqual(old.get(k),b,`removed source ${k}`);
for(const[k,b]of actual)assert.deepEqual(b,added.has(k)?added.get(k):removed.has(k)?undefined:old.get(k),`unexpected candidate ${k}`);
for(const[k,b]of old)if(!removed.has(k))assert.deepEqual(actual.get(k),b,`survivor ${k}`);
for(const[k,b]of added)assert.deepEqual(actual.get(k),b,`addition ${k}`);
assert.equal(actual.size,old.size-removed.size+added.size);assert.equal(e.cluster_cells.length,8853);
for(const r of e.cluster_cells){assert.deepEqual(old.get(key(r.position)),r.block);assert.deepEqual(actual.get(key(add(r.position,patch.candidate.translation))),r.block);}
const wanted=["input_operand", "input_update_intent", "input_kind0", "input_kind1", "input_owner_idle", "input_owner_complete", "input_rf_ack", "input_agreement", "input_commit1", "input_commit2", "input_commit3", "input_commit4", "input_commit5", "input_commit6", "input_commit7", "input_window", "input_nzp_write", "input_enable0", "input_enable1", "input_enable3", "input_release_latched", "input_arch_execute", "owned_update_feedback", "output_owner_go0", "output_exact_one", "output_owner_go7", "output_commit_go0", "output_done_update", "output_commit_go7", "output_done_operand", "output_pc_next", "output_pc_current", "output_flags0", "output_flags1", "output_flags2", "output_flags3", "output_release_D", "held_alu_request", "input_enable2", "held_other_to_owner", "other_complete_to_idle"];
assert.deepEqual(patch.connections.map(r=>r.name),wanted);const oldRoutes=new Map(e.connections.map(r=>[r.name,r]));
for(const r of patch.connections){const o=oldRoutes.get(r.name);assert.deepEqual(r.source,o.source_moves_with_cluster?add(o.source,patch.candidate.translation):o.source);assert.deepEqual(r.destination,o.destination_moves_with_cluster?add(o.destination,patch.candidate.translation):o.destination);assert(actual.has(key(r.source))&&actual.has(key(r.destination)));}
let protectedCells=0;
const original=read('extraction-unclipped.json');
assert.equal(e.shared_boundary_clips.length,8);
for(const clip of e.shared_boundary_clips){const before=original.connections.find(r=>r.name===clip.route),now=oldRoutes.get(clip.route);assert(before&&now);
 const stop=before.path.findIndex(p=>key(p)===key(clip.side==='source'?now.source:now.destination));assert(stop>=0);
 const retained=clip.side==='source'?[before.source,before.tap,...before.path.slice(0,stop+1)]:[...before.path.slice(stop),before.arrival,before.destination];
 for(const p of retained)for(const q of[p,{...p,y:p.y-1}]){assert(!removed.has(key(q)),`shared clip removed ${clip.route} ${key(q)}`);assert.deepEqual(actual.get(key(q)),old.get(key(q)));protectedCells++;}
 for(const p of clip.shared_taps){assert(!removed.has(key(p)));assert.deepEqual(actual.get(key(p)),old.get(key(p)));}
}
assert.equal(oldRoutes.get('input_enable2').source_file,'control-rf-composed-v1/routes.json');
assert.deepEqual(e.preserved_later_qualifiers,[{name:'held_alu_request',original_destination:{x:1434,y:-37,z:13},new_destination:{x:1400,y:-37,z:10},fixed_qualifier:{x:1402,y:-37,z:10}}]);
assert.deepEqual(actual.get('1402,-37,10'),old.get('1402,-37,10'));
for(const r of e.connections)for(const p of[r.source,r.tap,...r.path,r.arrival,r.destination])assert(old.has(key(p)),`stale source cable ${r.name} ${key(p)}`);
// Every advertised coordinate moves exactly when listed in the separate materialization inventory.
const moved=new Map(mat.port_moves.map(r=>[r.path,r]));let fields=0;
function ports(a,b,path='ports'){if(a&&typeof a==='object'&&['x','y','z'].every(k=>Number.isInteger(a[k]))){fields++;const m=moved.get(path);assert.deepEqual(b,m?m.to:a,path);if(m)assert.deepEqual(a,m.from);if(old.has(key(a)))assert(actual.has(key(b)),path);return;}if(Array.isArray(a)){assert.equal(a.length,b.length,path);a.forEach((v,i)=>ports(v,b[i],path+'.'+i));return;}if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))ports(a[k],b[k],path+'.'+k);return;}assert.deepEqual(a,b,path);}
ports(parent.ports,candidate.ports);assert.equal(moved.size,43);const computed={from:{},to:{}};for(const a of ['x','y','z']){computed.from[a]=Infinity;computed.to[a]=-Infinity;for(const r of candidate.blocks){computed.from[a]=Math.min(computed.from[a],r.position[a]);computed.to[a]=Math.max(computed.to[a],r.position[a]);}assert(computed.from[a]>=parent.box.from[a]&&computed.to[a]<=parent.box.to[a]);}assert.deepEqual(candidate.box,computed);assert.equal(candidate.metrics.retained_bits,1117);
assert.equal(checks.status,'relocation_actual_cell_dependency_screen_passed');for(const f of checks.frames){assert.equal(f.audited_receivers,65565);assert.deepEqual(f.unexpected_new_dependencies,[]);assert.deepEqual(f.changed_survivor_dependencies,[]);}
const files=['source-manifest.json','design.json','trial-design.json','extraction.json','extraction-unclipped.json','clip-shared-boundaries.mjs','materialization.json','checks.json','check.mjs','prepare-base.mjs','foreign-obstacles.json','obstacles.json','layout.mjs','materialize.mjs'];const pins={};for(const n of files){const p=new URL(n,base),rel=fileURLToPath(p).slice(fileURLToPath(root).length),sha=hash(p);if(n!=='source-manifest.json')assert.equal(manifest.source_sha256[rel],sha,rel);pins[rel]=sha;}pins[fileURLToPath(import.meta.url).slice(fileURLToPath(root).length)]=hash(new URL(import.meta.url));
const report={status:'bounded_independent_materialization_and_endpoint_review_passed',parent_cells:old.size,candidate_cells:actual.size,preserved_parent_cells:old.size-removed.size,translated_cluster_cells:8853,removed_cells:removed.size,added_cells:added.size,incident_routes:wanted.length,shared_prefix_suffix_cells:protectedCells,advertised_coordinate_fields:fields,moved_exported_fields:43,source_sha256:pins,author_contact_proof_review:'Read frozen actual-input differential: full maps per frame, radius-two affected receiver enumeration, effective directional/solid/torch/step inputs, retained-survivor comparison and declared endpoint/internal-cluster allowance. Its two-frame execution is source-bound saved author evidence, not independently rerun here.',limits:['Independent count/state/port/route-identity conservation does not itself prove all contact or timing behavior.','The new timing graph independently reconstructs candidate electrical edges from actual blocks. Native events and dynamic admission remain unproved.'],native_acceptance:false,full_timing_acceptance:false};
writeFileSync(new URL('materialization-review.json',here),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cells:actual.size,ports:fields,protectedCells}));
