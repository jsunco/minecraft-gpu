// Real dispatcher action/predicate joins atop frozen requester subgroup v2. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {searchPath,refreshIndices,P,K,F} from '../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),S=(p,n)=>P(p.x*n,p.y*n,p.z*n),dir=d=>d.x>0?'east':d.x<0?'west':d.z>0?'south':'north';
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const manifest=read('../dispatch-global-colocation-v4/source-manifest.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v4/source-manifest.json'],'74ffab32875101617523fa6160bfe65b10ae54db8061a2bb6519ba06e34ed105');
const base=read('../dispatch-global-colocation-v4/connected-candidate.json'),cuts=read('../dispatch-global-colocation-v1/transport-cuts.json');
assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v4/connected-candidate.json'],manifest.source_sha256['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v4/connected-candidate.json']);
// These four v4 cables block still-required lane-mask output escapes. Keep the
// immutable parent, remove only their owned cable cells, then redraw all four.
const parentCellCount=base.blocks.length,reroutedNames=new Set(base.connections.filter(c=>/^dispatch_input_(59|60|61|62)_/.test(c.name)).map(c=>c.name));assert.equal(reroutedNames.size,4);
const removed=base.blocks.filter(v=>reroutedNames.has(v.part));assert(removed.every(v=>!v.body));
const removedConnections=base.connections.filter(c=>reroutedNames.has(c.name));
base.blocks=base.blocks.filter(v=>!reroutedNames.has(v.part));base.added=base.added.filter(v=>!reroutedNames.has(v.part));base.connections=base.connections.filter(c=>!reroutedNames.has(c.name));base.routes=base.routes.filter(r=>!reroutedNames.has(r.name));
writeFileSync(new URL('parent-cable-replacement.json',H),JSON.stringify({status:'exact_four_cable_route_removal_for_new_output_access',parent_cells:parentCellCount,retained_parent_cells:base.blocks.length,removed_cells:removed.length,route_names:[...reroutedNames],removed,connections:removedConnections,all_bodies_unchanged:true},null,2)+'\n');
const original=new Map(base.blocks.filter(v=>v.body).map(v=>[K(v.original_position),v])),world=new Map(base.blocks.map(v=>[K(v.position),v.block]));
const added=[],routes=[],connections=[],pending=[],cache=existsSync(new URL('paths.json',H))?JSON.parse(readFileSync(new URL('paths.json',H))):{};
const planned=[],selected=cuts.transfers.filter(c=>
 (['dispatch/dispatched','dispatch/lane_mask','dispatch/admission_logic'].includes(c.source_body)&&['dispatch/payload0','dispatch/payload1'].includes(c.target_body))||
 (c.source_body==='dispatch/compare_last'&&c.target_body==='dispatch/lane_mask')||
 (['dispatch/output_stores','dispatch/microdecode'].includes(c.source_body)&&c.target_body==='dispatch/admission_logic'));
assert.equal(selected.length,36);
for(const [i,c]of selected.entries()){const source=original.get(K(c.source)),target=original.get(K(c.target));assert(source&&target);const arrive=P(c.target.x-c.immediate_source.x,0,c.target.z-c.immediate_source.z);assert.equal(Math.abs(arrive.x)+Math.abs(arrive.z),1);
 planned.push({name:'dispatch_payload_admission_'+i+'_'+c.source_body.slice(9)+'_to_'+c.target_body.slice(9),source:source.position,destination:target.position,depart:P(1,0,0),arrive,original_source:c.source,original_destination:c.target});}
for(const c of removedConnections)planned.push({...c,source_tap_provenance:undefined,deferred_branch:undefined});
// Choose source-isolated stubs by their actual effective-input differential.
// Existing electrical dependencies must remain equal, including same-net ones.
let stubWorld=new Map(world);const branchChecks=[];
const stubRefusals=[];
function trial(c,v){
 const refuse=reason=>{stubRefusals.push({name:c.name,source:c.source,depart:v,reason});return null;};
 // A stub must also leave a clear straight escape for the route finder.
 // This rejects electrically isolated but geometrically trapped side taps.
 for(let i=4;i<=5;i++){const p=A(c.source,S(v,i));for(const q of [p,A(p,P(0,-1,0)),A(p,P(0,1,0)),A(p,P(0,2,0)),A(p,P(0,-2,0)),...[P(1,0,0),P(-1,0,0),P(0,0,1),P(0,0,-1)].flatMap(d=>[-1,0,1].map(y=>A(A(p,d),P(0,y,0))))])if(stubWorld.has(K(q)))return refuse({kind:'escape_occupied',point:q});}
 const rows=[],path=[c.source],old=new Map(stubWorld);
 for(let i=1;i<=3;i++){const p=A(c.source,S(v,i)),support=A(p,P(0,-1,0));if(stubWorld.has(K(p))||stubWorld.has(K(support)))return refuse({kind:'stub_occupied',point:p});rows.push({position:support,block:{id:'minecraft:light_gray_concrete'}},{position:p,block:i===1?{id:'minecraft:repeater',properties:{facing:F[dir(v)],delay:'1'}}:{id:'minecraft:redstone_wire'}});path.push(p);}
 for(const row of rows)stubWorld.set(K(row.position),row.block);
 const affected=new Set();for(const row of rows)for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)if(Math.abs(x)+Math.abs(y)+Math.abs(z)<=3)affected.add(K(A(row.position,P(x,y,z))));
 let receivers=0,bad=null;for(const k of affected){const b=old.get(k);if(!b||!active(b))continue;const p=P(...k.split(',').map(Number)),before=inputs(old,p).map(K).sort(),after=inputs(stubWorld,p).map(K).sort();if(JSON.stringify(before)!==JSON.stringify(after)){bad={kind:'changes_existing_effective_input',receiver:p,before,after};break;}receivers++;}
 if(!bad)for(let i=1;i<path.length;i++){const actual=inputs(stubWorld,path[i]).map(K),allowed=[path[i-1],path[i+1]].filter(Boolean).map(K);if(!actual.includes(K(path[i-1]))||actual.some(p=>!allowed.includes(p))){bad={kind:'unexpected_stub_effective_input',receiver:path[i],actual,allowed};break;}}
 for(const row of rows)stubWorld.delete(K(row.position));if(bad)return refuse(bad);return {depart:v,rows,old_effective_receivers_checked:receivers};
}
const priorStubs=[],firstOrigins=new Set();
for(const c of planned){if(firstOrigins.has(K(c.original_source))){c.deferred_branch=true;continue;}firstOrigins.add(K(c.original_source));let chosen=null,selectedSource=null;const candidates=[{p:c.source,kind:'exact_body_output'}];
 for(const r of base.routes)if(K(r.path[0])===K(c.source))for(const p of r.path.slice(2,-1))if(stubWorld.get(K(p))?.id==='minecraft:redstone_wire')candidates.push({p,kind:'actual_parent_path_tap',path:r.name});
 for(const q of priorStubs)if(K(q.original_source)===K(c.original_source))for(const row of q.rows)if(row.block.id==='minecraft:redstone_wire')candidates.push({p:row.position,kind:'actual_planned_source_stub_tap',path:q.name});
 outer:for(const candidate of candidates)for(const v of [c.depart,P(0,0,1),P(0,0,-1),P(-1,0,0)])if(chosen=trial({...c,source:candidate.p},v)){selectedSource=candidate;break outer;}
 if(!chosen)writeFileSync(new URL('stub-refusal.json',H),JSON.stringify(stubRefusals.filter(v=>v.name===c.name),null,2)+'\n');assert(chosen,'No isolated source branch '+c.name);c.source=selectedSource.p;c.source_tap_provenance=selectedSource;c.depart=chosen.depart;branchChecks.push({name:c.name,source:c.source,depart:c.depart,provenance:selectedSource,old_effective_receivers_checked:chosen.old_effective_receivers_checked});for(const row of chosen.rows)stubWorld.set(K(row.position),row.block);priorStubs.push({name:c.name,original_source:c.original_source,rows:chosen.rows});}

function put(p,id,properties,name){assert(!world.has(K(p)),'Collision '+name+' '+K(p));const block={id:'minecraft:'+id,...(properties?{properties}:{})};world.set(K(p),block);added.push({position:p,block,part:name});}
function dev(p,id,properties,name){put(A(p,P(0,-1,0)),'light_gray_concrete',undefined,name);put(p,id,properties,name);}
for(const c of planned){if(c.deferred_branch){stubWorld=world;let chosen=null,selectedSource=null;const prior=connections.filter(v=>K(v.original_source)===K(c.original_source));const candidates=prior.flatMap(q=>routes.find(r=>r.name===q.name).path.slice(10,-10).map(p=>({p,path:q.name}))).filter(q=>world.get(K(q.p))?.id==='minecraft:redstone_wire');
 outer:for(const q of candidates)for(const v of [P(1,0,0),P(0,0,1),P(0,0,-1),P(-1,0,0)])if(chosen=trial({...c,source:q.p},v)){selectedSource=q;break outer;}assert(chosen,'No isolated existing route tap '+c.name);c.source=selectedSource.p;c.depart=chosen.depart;c.source_tap_provenance={kind:'actual_new_route_tap',...selectedSource};branchChecks.push({name:c.name,source:c.source,depart:c.depart,provenance:c.source_tap_provenance,old_effective_receivers_checked:chosen.old_effective_receivers_checked});}
 const front=[1,2,3].map(n=>A(c.source,S(c.depart,n))),tail=[-3,-2,-1].map(n=>A(c.destination,S(c.arrive,n))),fixed=[];for(const[i,p]of front.entries()){dev(p,i===0?'repeater':'redstone_wire',i===0?{facing:F[dir(c.depart)],delay:'1'}:undefined,c.name);fixed.push(p,A(p,P(0,-1,0)));}for(const[i,p]of tail.entries()){dev(p,i===2?'repeater':'redstone_wire',i===2?{facing:F[dir(c.arrive)],delay:'1'}:undefined,c.name);fixed.push(p,A(p,P(0,-1,0)));}
 const start=front.at(-1),end=tail[0],allow=new Set([start,end,...[start,end].flatMap(p=>[P(1,0,0),P(-1,0,0),P(0,0,1),P(0,0,-1)].map(v=>A(p,v)))].map(K)),forbidden=[];
 for(const q of [c.source,c.destination,...front,...tail])for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-2;dy<=2;dy++){if(Math.abs(dx)+Math.abs(dz)>1)continue;const p=A(q,P(dx,dy,dz));if(!allow.has(K(p)))forbidden.push(p);}
 const reserved=planned.filter(v=>v.name!==c.name).flatMap(v=>(v.deferred_branch?[]:[1,2,3,4].map(n=>A(v.source,S(v.depart,n)))).concat([-4,-3,-2,-1].map(n=>A(v.destination,S(v.arrive,n))))).flatMap(p=>[-1,0,1].map(dy=>A(p,P(0,dy,0))));let path=cache[c.name];if(!path){path=searchPath(world,end,start,{limit:700000,ignore:[c.source,c.destination,...fixed],forbidden,reserved}).path.reverse();cache[c.name]=path;writeFileSync(new URL('paths.json',H),JSON.stringify(cache)+'\n');}assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);
 const refresh=new Set(refreshIndices(path));for(let i=1;i<path.length-1;i++){const p=path[i],v=P(path[i+1].x-p.x,0,path[i+1].z-p.z);dev(p,refresh.has(i)?'repeater':'redstone_wire',refresh.has(i)?{facing:F[dir(v)],delay:'1'}:undefined,c.name);}
 const complete=[c.source,...front.slice(0,-1),...path,...tail.slice(1),c.destination];routes.push({name:c.name,path:complete});connections.push({...c,source_isolator:front[0],normalizer:tail.at(-1),actual_points:complete.length});console.log(JSON.stringify({name:c.name,points:complete.length,added:added.length}));
}
writeFileSync(new URL('source-stub-checks.json',H),JSON.stringify({status:'isolated_actual_source_stubs',checks:branchChecks},null,2)+'\n');
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v5/route-dispatch.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const result={status:'mutable_partial_dispatch_global_payload_admission_pending_checks',blocks:[...base.blocks,...added],added:[...base.added,...added],new_cells:added,connections:[...base.connections,...connections],routes:[...base.routes,...routes],body_transforms:base.body_transforms,new_branch_sources:[...(base.new_branch_sources??[]),...planned.map(c=>c.source)],metrics:{body_cells:base.metrics.body_cells,original_parent_cells:parentCellCount,removed_parent_cable_cells:removed.length,rerouted_parent_paths:reroutedNames.size,prior_cells:base.blocks.length,new_cells:added.length,complete_cells:base.blocks.length+added.length,connected_routes:base.connections.length+connections.length,retained_stores:187},source_sha256:pins,unresolved_canonical_sources:pending,complete_connected_candidate:false,native_acceptance:false};
writeFileSync(new URL('connected-candidate.json',H),JSON.stringify(result)+'\n');
