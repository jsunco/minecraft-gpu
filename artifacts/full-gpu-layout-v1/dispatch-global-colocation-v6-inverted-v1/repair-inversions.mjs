// Actual NOT READY transport repairs; original positive draft stays immutable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
import {searchPath,refreshIndices,P,K,F} from '../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={},A=(p,v)=>P(p.x+v.x,p.y+v.y,p.z+v.z),S=(p,n)=>P(p.x*n,p.y*n,p.z*n),dir=v=>v.x===1?'east':v.x===-1?'west':v.z===1?'south':'north';
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
read('../dispatch-global-colocation-v6/mutable-checkpoint.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6/mutable-checkpoint.json'],'1b66b38e54d2b80716b8f8bc3c5402f6e0d52b5feb919d8f4bd720d2bb257894');
const d=read('../dispatch-global-colocation-v6/connected-candidate.json'),oldRows=d.blocks.slice(),refusal=read('../dispatch-global-colocation-v6/source-transport-checks.json');assert.equal(refusal.non_positive.length,5);
const W='minecraft:redstone_wire',R='minecraft:repeater',WT='minecraft:redstone_wall_torch',C='minecraft:light_gray_concrete',stages=[],attempts=[];
for(const failure of refusal.non_positive){const route=d.routes.find(r=>r.name===failure.name),connection=d.connections.find(c=>c.name===failure.name),oldWorld=new Map(d.blocks.map(v=>[K(v.position),v.block])),rows=new Map(d.blocks.map(v=>[K(v.position),v])),usage=new Map();for(const r of d.routes)for(const p of r.path){const names=usage.get(K(p))??[];names.push(r.name);usage.set(K(p),names);}
 let accepted=null;
 outer:for(let i=route.path.length-18;i>8;i--){const p=route.path[i],b=oldWorld.get(K(p));if(b?.id!==R)continue;const nextIndex=route.path.findIndex((q,n)=>n>i+4&&oldWorld.get(K(q))?.id===R);if(nextIndex<0||nextIndex>=route.path.length-1)continue;const j=nextIndex-1,removedPoints=route.path.slice(i+1,j),removeKeys=new Set(removedPoints.flatMap(q=>[K(q),K(A(q,P(0,-1,0)))]));if(removedPoints.some(q=>usage.get(K(q))?.length!==1)||[...removeKeys].some(k=>rows.get(k)?.part!==route.name))continue;
  const forward={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)}[b.properties.facing],support=A(p,forward);if(K(support)!==K(route.path[i+1]))continue;
  for(const side of [P(forward.z,0,-forward.x),P(-forward.z,0,forward.x)]){const w=new Map(oldWorld),added=[];for(const k of removeKeys)w.delete(k);const torch=A(support,side),normalizer=A(support,S(side,2)),out=A(support,S(side,3)),goal=route.path[j];let collision=false;
   function put(position,block){if(w.has(K(position))){collision=true;return;}w.set(K(position),block);added.push({position,block,part:route.name});}
   function dev(position,block){put(A(position,P(0,-1,0)),{id:C});put(position,block);}
   dev(support,{id:C});dev(torch,{id:WT,properties:{facing:dir(side)}});dev(normalizer,{id:R,properties:{facing:F[dir(side)],delay:'1'}});dev(out,{id:W});if(collision)continue;
   let cable;try{cable=searchPath(w,goal,out,{limit:120000,ignore:[...added.map(v=>v.position),p,A(p,P(0,-1,0)),goal,A(goal,P(0,-1,0)),route.path[j+1],A(route.path[j+1],P(0,-1,0))]}).path.reverse();}catch(error){attempts.push({route:route.name,index:i,side,reason:String(error.message)});continue;}
   const refresh=new Set(refreshIndices(cable));for(let k=1;k<cable.length-1;k++){const q=cable[k],v=P(cable[k+1].x-q.x,0,cable[k+1].z-q.z);dev(q,refresh.has(k)?{id:R,properties:{facing:F[dir(v)],delay:'1'}}:{id:W});}if(collision)continue;
   const path=[...route.path.slice(0,i+1),torch,normalizer,...cable,...route.path.slice(j+1)],allowed=new Set();for(let k=1;k<path.length;k++){allowed.add(K(path[k-1])+'>'+K(path[k]));allowed.add(K(path[k])+'>'+K(path[k-1]));}
   const affected=new Set();for(const q of [...removedPoints,...added.map(v=>v.position)])for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)if(Math.abs(x)+Math.abs(y)+Math.abs(z)<=3)affected.add(K(A(q,P(x,y,z))));let bad=null;
   for(const k of affected){const block=w.get(k);if(!block||!active(block))continue;const q=P(...k.split(',').map(Number)),own=rows.get(k)?.part===route.name||added.some(v=>K(v.position)===k);if(own){if(inputs(w,q).some(v=>!allowed.has(K(v)+'>'+k))){bad='unexpected own cable input '+k;break;}}else if(JSON.stringify(inputs(w,q).map(K).sort())!==JSON.stringify(inputs(oldWorld,q).map(K).sort())){bad='changed foreign input '+k;break;}}
   if(!bad)for(let k=1;k<path.length;k++)if(!inputs(w,path[k]).some(q=>K(q)===K(path[k-1]))){bad='lost path edge '+K(path[k]);break;}
   if(bad){attempts.push({route:route.name,index:i,side,reason:bad});continue;}
   accepted={route:route.name,torch,support,input_normalizer:p,output_normalizer:normalizer,old_indices:{from:i+1,to:j-1},removed_cells:removeKeys.size,added_cells:added.length,old_transport_truth_table:failure.settled_truth_table};
   d.blocks=d.blocks.filter(v=>!removeKeys.has(K(v.position))).concat(added);d.added=d.added.filter(v=>!removeKeys.has(K(v.position))).concat(added);route.path=path;connection.inverting_stages=[accepted];connection.actual_points=path.length;stages.push(accepted);console.log(JSON.stringify(accepted));break outer;
  }
 }if(!accepted){writeFileSync(new URL('attempts.json',H),JSON.stringify(attempts,null,2)+'\n');assert.fail('No isolated actual inverter detour for '+failure.name);}
}
const before=new Map(oldRows.map(v=>[K(v.position),v])),after=new Map(d.blocks.map(v=>[K(v.position),v])),removed=oldRows.filter(v=>!after.has(K(v.position))),added=d.blocks.filter(v=>!before.has(K(v.position))),modified=[];for(const row of d.blocks){const old=before.get(K(row.position));if(old&&JSON.stringify(old.block)!==JSON.stringify(row.block))modified.push({position:row.position,part:row.part,before:old.block,after:row.block});}
assert([...removed,...modified].every(v=>!v.body));d.new_cells=added;d.metrics={body_cells:100448,prior_cells:oldRows.length,removed_parent_cable_cells:removed.length,new_cells:added.length,modified_parent_cable_cells:modified.length,complete_cells:d.blocks.length,connected_routes:d.routes.length,retained_stores:187};d.status='mutable_repaired_five_negative_ready_branches_pending_full_checks';
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6-inverted-v1/repair-inversions.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');d.source_sha256=pins;writeFileSync(new URL('connected-candidate.json',H),JSON.stringify(d)+'\n');writeFileSync(new URL('inversion-repair.json',H),JSON.stringify({status:'five_actual_wall_torch_inverter_detours_drawn_pending_full_check',stages,modified_cells:modified,removed_cells:removed,added_cells:added,attempts,source_sha256:pins,native_acceptance:false},null,2)+'\n');console.log(JSON.stringify(d.metrics));
