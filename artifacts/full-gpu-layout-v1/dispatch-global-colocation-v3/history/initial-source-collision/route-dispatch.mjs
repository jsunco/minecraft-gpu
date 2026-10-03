// Real requester/global joins atop the frozen v1 subgroup. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {searchPath,refreshIndices,P,K,F} from '../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),S=(p,n)=>P(p.x*n,p.y*n,p.z*n),dir=d=>d.x>0?'east':d.x<0?'west':d.z>0?'south':'north';
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const manifest=read('../dispatch-global-colocation-v2/source-manifest.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v2/source-manifest.json'],'d1d171a001fb7e4314eee3125cb7efea6e23743dbec94df0a5b9cd96165d7930');
const base=read('../dispatch-global-colocation-v2/connected-candidate.json'),cuts=read('../dispatch-global-colocation-v1/transport-cuts.json');
assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v2/connected-candidate.json'],manifest.source_sha256['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v2/connected-candidate.json']);
const original=new Map(base.blocks.filter(v=>v.body).map(v=>[K(v.original_position),v])),world=new Map(base.blocks.map(v=>[K(v.position),v.block]));
const added=[],routes=[],connections=[],pending=[],cache=existsSync(new URL('paths.json',H))?JSON.parse(readFileSync(new URL('paths.json',H))):{};
const planned=[],DT=P(-1712,55,-600),allOld=[];
for(const [folder,prefix]of [['dispatch-actions-v1','action'],['dispatch-counter-actions-v1','counter_action'],['dispatch-predicates-v1/assembly','predicate']]){
 const parent=read('../'+folder+'/design.json');for(const c of parent.connections){const sourceOriginal=A(c.source,DT),targetOriginal=A(c.destination,DT),source=original.get(K(sourceOriginal)),target=original.get(K(targetOriginal));allOld.push({...c,source_original:sourceOriginal,target_original:targetOriginal});if(!source||!target){pending.push({...c,source_original:sourceOriginal,target_original:targetOriginal,reason:'actual body root not yet resolved; no guessed source'});continue;}
 const match=cuts.transfers.find(v=>K(v.source)===K(sourceOriginal)&&K(v.target)===K(targetOriginal));assert(match,'No exact old transfer '+c.name);const arrive=P(targetOriginal.x-match.immediate_source.x,0,targetOriginal.z-match.immediate_source.z);assert.equal(Math.abs(arrive.x)+Math.abs(arrive.z),1);
 planned.push({name:prefix+'_'+c.name,source:source.position,destination:target.position,depart:source.body==='dispatch/output_stores'?P(1,0,0):P(0,0,1),arrive,original_source:sourceOriginal,original_destination:targetOriginal});
 }}
// The current owner byte also feeds predicates. Give its second new sink an
// isolated south tap, retaining the frozen north feedback and new east tap.
for(const c of planned)if(c.name==='predicate_state_owner')c.depart=P(0,0,1);
function put(p,id,properties,name){assert(!world.has(K(p)),'Collision '+name+' '+K(p));const block={id:'minecraft:'+id,...(properties?{properties}:{})};world.set(K(p),block);added.push({position:p,block,part:name});}
function dev(p,id,properties,name){put(A(p,P(0,-1,0)),'light_gray_concrete',undefined,name);put(p,id,properties,name);}
for(const c of planned){const front=[1,2,3].map(n=>A(c.source,S(c.depart,n))),tail=[-3,-2,-1].map(n=>A(c.destination,S(c.arrive,n))),fixed=[];for(const[i,p]of front.entries()){dev(p,i===0?'repeater':'redstone_wire',i===0?{facing:F[dir(c.depart)],delay:'1'}:undefined,c.name);fixed.push(p,A(p,P(0,-1,0)));}for(const[i,p]of tail.entries()){dev(p,i===2?'repeater':'redstone_wire',i===2?{facing:F[dir(c.arrive)],delay:'1'}:undefined,c.name);fixed.push(p,A(p,P(0,-1,0)));}
 const start=front.at(-1),end=tail[0],allow=new Set([start,end,...[start,end].flatMap(p=>[P(1,0,0),P(-1,0,0),P(0,0,1),P(0,0,-1)].map(v=>A(p,v)))].map(K)),forbidden=[];
 for(const q of [c.source,c.destination,...front,...tail])for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-2;dy<=2;dy++){if(Math.abs(dx)+Math.abs(dz)>1)continue;const p=A(q,P(dx,dy,dz));if(!allow.has(K(p)))forbidden.push(p);}
 const reserved=planned.filter(v=>v.name!==c.name).flatMap(v=>[1,2,3,4].map(n=>A(v.source,S(v.depart,n))).concat([-4,-3,-2,-1].map(n=>A(v.destination,S(v.arrive,n))))).flatMap(p=>[-1,0,1].map(dy=>A(p,P(0,dy,0))));let path=cache[c.name];if(!path){path=searchPath(world,end,start,{limit:700000,ignore:[c.source,c.destination,...fixed],forbidden,reserved}).path.reverse();cache[c.name]=path;writeFileSync(new URL('paths.json',H),JSON.stringify(cache)+'\n');}assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);
 const refresh=new Set(refreshIndices(path));for(let i=1;i<path.length-1;i++){const p=path[i],v=P(path[i+1].x-p.x,0,path[i+1].z-p.z);dev(p,refresh.has(i)?'repeater':'redstone_wire',refresh.has(i)?{facing:F[dir(v)],delay:'1'}:undefined,c.name);}
 const complete=[c.source,...front.slice(0,-1),...path,...tail.slice(1),c.destination];routes.push({name:c.name,path:complete});connections.push({...c,source_isolator:front[0],normalizer:tail.at(-1),actual_points:complete.length});console.log(JSON.stringify({name:c.name,points:complete.length,added:added.length}));
}
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v3/route-dispatch.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const result={status:'mutable_partial_dispatch_global_requester_actions_pending_checks',blocks:[...base.blocks,...added],added:[...base.added,...added],new_cells:added,connections:[...base.connections,...connections],routes:[...base.routes,...routes],body_transforms:base.body_transforms,new_branch_sources:[...(base.new_branch_sources??[]),...planned.map(c=>c.source)],metrics:{body_cells:base.metrics.body_cells,prior_cells:base.blocks.length,new_cells:added.length,complete_cells:base.blocks.length+added.length,connected_routes:base.connections.length+connections.length,retained_stores:187},source_sha256:pins,unresolved_canonical_sources:pending,complete_connected_candidate:false,native_acceptance:false};
writeFileSync(new URL('connected-candidate.json',H),JSON.stringify(result)+'\n');
