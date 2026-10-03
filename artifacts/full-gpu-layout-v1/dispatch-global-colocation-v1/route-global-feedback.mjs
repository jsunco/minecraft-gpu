// Actual global feedback, sampled guard and held command wires in the proposed placement.
// Phase and the remaining dispatch/requester/master connections are still pending.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {searchPath,refreshIndices,P,K,F} from '../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
function read(n){const p=new URL(n,H),bytes=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes);}
const d=read('body-placement.json'),old=read('../global-control-v3/feedback/design.json'),A=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z),scale=(p,n)=>P(p.x*n,p.y*n,p.z*n),base=P(-1000,-55,550),convert=(p,n)=>A(A(p,base),d.transforms[n]);
const world=new Map(d.blocks.map(v=>[K(v.position),v.block])),added=[],routes=[],connections=[],cached=existsSync(new URL('global-feedback-paths.json',H))?JSON.parse(readFileSync(new URL('global-feedback-paths.json',H))):{};
const planned=[...old.feedback.map((v,i)=>({name:'global_current_'+i,source:convert(v.source,'global/state_stores'),destination:convert(v.destination,'global/next_logic'),depart:P(0,0,-1),arrive:P(0,0,1),bit:i})),...old.links.map(v=>({name:'global_next_'+v.bit,source:convert(v.source,'global/next_logic'),destination:convert(v.next_input,'global/state_stores'),depart:P(0,0,1),arrive:P(1,0,0),bit:v.bit}))];
const originalBodies=new Map(d.blocks.map(v=>[K(v.original_position),v]));
const actual=p=>{const q=originalBodies.get(K(A(p,base)));assert(q,'Unknown actual source/body port '+K(p));return q;};
for(const [file,prefix]of [['global-input-sampler-v1','sample_predicate'],['global-held-commands-v1','held_command'],['global-sampled-control-v1','sample_to_next'],['global-command-assembly-v3','command_gate']]){
 const parent=read('../'+file+'/design.json');for(const c of parent.connections){const a=actual(c.source),b=actual(c.destination);planned.push({name:prefix+'_'+c.name,source:a.position,destination:b.position,depart:['global/next_logic','global/conjunctions'].includes(a.body)?P(0,0,1):P(1,0,0),arrive:b.body==='global/held_commands'?P(1,0,0):P(0,0,1),historical_source:c.source,historical_destination:c.destination});}
}
const phaseParent=read('../global-clocked-control-v1/design.json'),junctions={a:P(420,240,-32),b:P(452,240,-32)};
for(const phase of ['a','b']){const c=phaseParent.connections.find(c=>c.phase===phase),src=actual(c.source);planned.push({name:'phase_'+phase+'_root',source:src.position,destination:junctions[phase],depart:P(0,0,-1),arrive:P(0,0,1),new_junction:true,historical_source:c.source,phase});}
for(const [i,c]of phaseParent.connections.entries()){const dest=actual(c.destination),depart={A_next:P(-1,0,0),A_commands:P(1,0,0),B_current:P(-1,0,0),B_sample0:P(0,0,1),B_sample1:P(1,0,0)}[c.name];planned.push({name:'phase_'+c.name,source:junctions[c.phase],destination:dest.position,depart,arrive:P(1,0,0),historical_source:c.source,historical_destination:c.destination,phase:c.phase});}
const DT=P(-1712,55,-600);
for(const [file,prefix,offset]of [['dispatch-output-v1/feedback','dispatch_output',P(160,0,-32)],['dispatch-startup-v1/admission-feedback','dispatch_admission',P(-540,0,280)]]){
 const parent=read('../'+file+'/design.json'),ref=p=>{const q=originalBodies.get(K(A(A(p,offset),DT)));assert(q,'Missing actual dispatch feedback endpoint');return q;};
 for(const c of parent.links){planned.push({name:prefix+'_next_'+c.bit,source:ref(c.source).position,destination:ref(c.next_input).position,depart:P(0,0,1),arrive:P(1,0,0),historical_source:A(A(c.source,offset),DT),historical_destination:A(A(c.next_input,offset),DT)});}
 for(const c of parent.feedback){planned.push({name:prefix+'_feedback_'+c.name,source:ref(c.source).position,destination:ref(c.destination).position,depart:P(0,0,-1),arrive:P(0,0,1),historical_source:A(A(c.source,offset),DT),historical_destination:A(A(c.destination,offset),DT)});}
}
const micro=read('../dispatch-controller-v1/state-feedback/design.json');
for(const c of micro.links){const src=originalBodies.get(K(A(c.source,DT))),gate=originalBodies.get(K(A(c.clamp,DT))),dst=originalBodies.get(K(A(c.next_input,DT)));assert(src&&gate&&dst);
 planned.push({name:'dispatch_microstate_next_'+c.bit,source:src.position,destination:gate.position,depart:P(0,0,1),arrive:P(1,0,0),historical_source:A(c.source,DT),historical_destination:A(c.clamp,DT),receiver_kind:'comparator_rear'});
 planned.push({name:'dispatch_microstate_clamp_to_next_'+c.bit,source:gate.position,destination:dst.position,short_path:[gate.position,A(gate.position,P(1,0,0)),A(gate.position,P(2,0,0)),dst.position],depart:P(1,0,0),arrive:P(1,0,0),source_kind:'comparator',historical_source:A(c.clamp,DT),historical_destination:A(c.next_input,DT)});
 const current=originalBodies.get(K(A(c.current_output,DT))),decoder=d.blocks.find(v=>v.body==='dispatch/boundary_gate_'+(5+c.bit)&&v.block.id==='minecraft:comparator');assert(current&&decoder);const east=decoder.block.properties.facing==='west';
 planned.push({name:'dispatch_microstate_decode_'+c.bit,source:current.position,destination:decoder.position,depart:P(0,0,-1),arrive:P(east?1:-1,0,0),historical_source:A(c.current_output,DT),historical_destination:decoder.original_position,receiver_kind:'comparator_rear'});
}
planned.sort((a,b)=>(Number(Boolean(b.short_path))*2+Number(b.name.startsWith('phase_')))-(Number(Boolean(a.short_path))*2+Number(a.name.startsWith('phase_'))));
const dir=d=>d.x>0?'east':d.x<0?'west':d.z>0?'south':'north';
function put(p,id,properties,name){assert(!world.has(K(p)),'Added collision '+name+' '+K(p));const block={id:'minecraft:'+id,...(properties?{properties}:{})};world.set(K(p),block);added.push({position:p,block,part:name});}
function device(p,id,properties,name){put(P(p.x,p.y-1,p.z),'light_gray_concrete',undefined,name);put(p,id,properties,name);}
for(const c of planned.filter(c=>c.new_junction))device(c.destination,'redstone_wire',undefined,c.name);
for(const c of planned){assert.equal(world.get(K(c.source))?.id,'minecraft:'+(c.source_kind??'redstone_wire'));assert.equal(world.get(K(c.destination))?.id,'minecraft:'+(c.receiver_kind?'comparator':'redstone_wire'));
 if(c.short_path){for(let i=1;i<c.short_path.length-1;i++){const p=c.short_path[i];device(p,i===c.short_path.length-2?'repeater':'redstone_wire',i===c.short_path.length-2?{facing:F[dir(c.arrive)],delay:'1'}:undefined,c.name);}routes.push({name:c.name,path:c.short_path});connections.push({...c,source_isolator:null,normalizer:c.short_path.at(-2),actual_points:c.short_path.length});continue;}

 const front=[1,2,3].map(n=>A(c.source,scale(c.depart,n))),tail=[-3,-2,-1].map(n=>A(c.destination,scale(c.arrive,n)));const fixed=[];
 for(const [i,p]of front.entries()){device(p,i===0?'repeater':'redstone_wire',i===0?{facing:F[dir(c.depart)],delay:'1'}:undefined,c.name);fixed.push(p,P(p.x,p.y-1,p.z));}
 for(const [i,p]of tail.entries()){device(p,i===2?'repeater':'redstone_wire',i===2?{facing:F[dir(c.arrive)],delay:'1'}:undefined,c.name);fixed.push(p,P(p.x,p.y-1,p.z));}
 const start=front.at(-1),end=tail[0],approach=[start,end].flatMap(p=>[P(1,0,0),P(-1,0,0),P(0,0,1),P(0,0,-1)].map(v=>A(p,v))),allowedApproach=new Set([start,end,...approach].map(K)),forbidden=[];
 for(const q of [c.source,c.destination,...front,...tail])for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-2;dy<=2;dy++){if(Math.abs(dx)+Math.abs(dz)>1)continue;const p=A(q,P(dx,dy,dz));if(!allowedApproach.has(K(p)))forbidden.push(p);}
 const forbiddenKeys=new Set(forbidden.map(K));let path=cached[c.name];if(path?.slice(1,-1).some(p=>forbiddenKeys.has(K(p)))){console.log(JSON.stringify({reroute_fixed_stub_halo:c.name}));path=null;}
if(path){assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);}else{const reverse=c.name.startsWith('sample_to_next_')||c.name.startsWith('phase_')||c.name.includes('_feedback_');path=searchPath(world,reverse?end:start,reverse?start:end,{limit:700000,forbidden,ignore:[c.source,c.destination,...fixed],reserved:planned.filter(v=>v.name!==c.name&&!v.short_path).flatMap(v=>[1,2,3,4].map(n=>A(v.source,scale(v.depart,n))).concat([-4,-3,-2,-1].map(n=>A(v.destination,scale(v.arrive,n))))).flatMap(p=>[-1,0,1].map(dy=>A(p,P(0,dy,0))))}).path;if(reverse)path.reverse();cached[c.name]=path;writeFileSync(new URL('global-feedback-paths.json',H),JSON.stringify(cached)+'\n');}
 const refresh=new Set(refreshIndices(path));for(let i=1;i<path.length-1;i++){const p=path[i],v=P(path[i+1].x-p.x,0,path[i+1].z-p.z);device(p,refresh.has(i)?'repeater':'redstone_wire',refresh.has(i)?{facing:F[dir(v)],delay:'1'}:undefined,c.name);}
 const complete=[c.source,...front.slice(0,-1),...path,...tail.slice(1),c.destination];routes.push({name:c.name,path:complete});connections.push({...c,source_isolator:front[0],normalizer:tail.at(-1),actual_points:complete.length});console.log(JSON.stringify({name:c.name,points:complete.length,added:added.length}));
}
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v1/route-global-feedback.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');pins['artifacts/full-gpu-layout-v1/control-commit-v2/route.mjs']=createHash('sha256').update(readFileSync(new URL('../control-commit-v2/route.mjs',H))).digest('hex');
writeFileSync(new URL('global-feedback-candidate.json',H),JSON.stringify({status:'unselected_dispatch_global_body_placement_with_global_data_control_routes_pending_checks',blocks:[...d.blocks,...added],added,body_transforms:d.transforms,connections,routes,metrics:{body_cells:d.blocks.length,added_cells:added.length,complete_cells:d.blocks.length+added.length,connected_routes:connections.length,retained_stores:d.metrics.retained_stores},source_sha256:pins,remaining:'Global local feedback, held command and phase paths are drawn; dispatch, requester, panel and master incident wires remain required. Delivered phase timing is not yet checked. No complete controller or compaction saving is claimed.',complete_connected_candidate:false,native_acceptance:false})+'\n');
