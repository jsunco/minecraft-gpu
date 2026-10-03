// Repair exactly the five proved NOT READY transports. Offline block geometry.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),K=p=>`${p.x},${p.y},${p.z}`,A=(p,v)=>({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z}),pins={};
function read(n){const p=new URL(n,H),b=readFileSync(p);pins[fileURLToPath(p).slice(fileURLToPath(ROOT).length)]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);}
const checkpoint=read('../dispatch-global-colocation-v6/mutable-checkpoint.json');assert.equal(pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6/mutable-checkpoint.json'],'1b66b38e54d2b80716b8f8bc3c5402f6e0d52b5feb919d8f4bd720d2bb257894');
const d=read('../dispatch-global-colocation-v6/connected-candidate.json'),refusal=read('../dispatch-global-colocation-v6/source-transport-checks.json');assert.equal(refusal.non_positive.length,5);
const baseCount=d.blocks.length,w=new Map(d.blocks.map(v=>[K(v.position),v.block])),rowAt=new Map(d.blocks.map(v=>[K(v.position),v])),changes=[],extra=[],stages=[];
const W='minecraft:redstone_wire',R='minecraft:repeater',T='minecraft:redstone_torch',C='minecraft:light_gray_concrete';
const rowsAt=new Map();for(const r of d.routes)for(const p of r.path){const a=rowsAt.get(K(p))??[];a.push(r.name);rowsAt.set(K(p),a);}
const facing=v=>v.x===1?'west':v.x===-1?'east':v.z===1?'north':'south';
for(const failure of refusal.non_positive){const route=d.routes.find(r=>r.name===failure.name),connection=d.connections.find(c=>c.name===failure.name);assert(route&&connection);let accepted=null;
 // Stay near the sink, downstream of all shared branch points. Trial every
 // actual old input locally; proximity alone does not admit a replacement.
 for(let i=route.path.length-9;i>=Math.max(5,route.path.length-100);i--){const ps=route.path.slice(i,i+7);if(ps.length!==7)continue;const v={x:ps[1].x-ps[0].x,y:0,z:ps[1].z-ps[0].z};if(Math.abs(v.x)+Math.abs(v.z)!==1||!ps.every((p,j)=>p.y===ps[0].y&&p.x===ps[0].x+j*v.x&&p.z===ps[0].z+j*v.z))continue;
  if(ps.slice(1,6).some(p=>rowAt.get(K(p))?.part!==route.name||rowsAt.get(K(p))?.length!==1||![W,R].includes(w.get(K(p))?.id)))continue;
  const torch=A(ps[2],{x:0,y:1,z:0}),dust=A(ps[3],{x:0,y:1,z:0});if(w.has(K(torch))||w.has(K(dust)))continue;
  const edits=[{position:ps[1],block:{id:R,properties:{facing:facing(v),delay:'1'}}},{position:ps[2],block:{id:C}},{position:ps[3],block:{id:C}},{position:ps[4],block:{id:W}},{position:ps[5],block:{id:R,properties:{facing:facing(v),delay:'1'}}}],adds=[{position:torch,block:{id:T},part:route.name},{position:dust,block:{id:W},part:route.name}],old=new Map(w),newPath=route.path.map((p,j)=>j===i+2?torch:j===i+3?dust:p),allowed=new Set();
  for(let j=1;j<newPath.length;j++){allowed.add(K(newPath[j-1])+'>'+K(newPath[j]));allowed.add(K(newPath[j])+'>'+K(newPath[j-1]));}for(const p of [...edits,...adds])w.set(K(p.position),p.block);
  const affected=new Set();for(const p of [...edits,...adds])for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++)if(Math.abs(x)+Math.abs(y)+Math.abs(z)<=3)affected.add(K(A(p.position,{x,y,z})));
  let bad=false,foreignChecked=0;for(const k of affected){const b=w.get(k);if(!b||!active(b))continue;const p={x:Number(k.split(',')[0]),y:Number(k.split(',')[1]),z:Number(k.split(',')[2])};if(rowAt.get(k)?.part===route.name||adds.some(q=>K(q.position)===k)){if(inputs(w,p).some(q=>!allowed.has(K(q)+'>'+k))){bad=true;break;}}else{if(JSON.stringify(inputs(w,p).map(K).sort())!==JSON.stringify(inputs(old,p).map(K).sort())){bad=true;break;}foreignChecked++;}}
  if(!bad)for(let j=i+1;j<=i+6;j++)if(!inputs(w,newPath[j]).some(q=>K(q)===K(newPath[j-1]))){bad=true;break;}
  if(bad){for(const p of edits)w.set(K(p.position),old.get(K(p.position)));for(const p of adds)w.delete(K(p.position));continue;}
  accepted={route:route.name,torch,input_normalizer:ps[1],support:ps[2],raised_output:dust,output_normalizer:ps[5],foreign_receivers_checked:foreignChecked,old_segment:ps,new_segment:newPath.slice(i,i+7),old_transport_truth_table:failure.settled_truth_table};
  for(const p of edits){const before=old.get(K(p.position));if(JSON.stringify(before)!==JSON.stringify(p.block))changes.push({position:p.position,part:route.name,before,after:p.block});for(const list of [d.blocks,d.added]){const row=list.find(q=>K(q.position)===K(p.position));assert(row);row.block=p.block;}rowAt.get(K(p.position)).block=p.block;}
  for(const p of adds){d.blocks.push(p);d.added.push(p);rowAt.set(K(p.position),p);extra.push(p);}route.path=newPath;connection.inverting_stages=[accepted];stages.push(accepted);break;
 }assert(accepted,'No safe actual inverter site for '+failure.name);
}
assert.equal(stages.length,5);assert.equal(extra.length,10);d.new_cells=extra;d.status='mutable_repaired_five_negative_ready_branches_pending_full_checks';d.metrics={body_cells:100448,prior_cells:baseCount,new_cells:extra.length,modified_parent_cable_cells:changes.length,complete_cells:d.blocks.length,connected_routes:d.routes.length,retained_stores:187};
pins['artifacts/full-gpu-layout-v1/dispatch-global-colocation-v6-inverted-v1/add-inversions.mjs']=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');d.source_sha256=pins;
writeFileSync(new URL('connected-candidate.json',H),JSON.stringify(d)+'\n');writeFileSync(new URL('inversion-repair.json',H),JSON.stringify({status:'five_actual_torch_inverters_drawn_pending_full_check',stages,modified_cells:changes,added_cells:extra,source_sha256:pins,native_acceptance:false},null,2)+'\n');console.log(JSON.stringify(d.metrics));
