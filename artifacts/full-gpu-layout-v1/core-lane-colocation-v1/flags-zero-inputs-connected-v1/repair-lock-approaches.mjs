import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {inputs,active} from '../../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,E=(a,b)=>K(a)+'>'+K(b),under=p=>P(p.x,p.y-1,p.z);
const parent=read('../final-stage-clear-connected-v1/design.json'),oldRoutes=read('../final-lock-observers-v1/design.json').connections;
const before=new Map(parent.blocks.map(b=>[K(b.position),b.block])),world=new Map(before),removed=[],added=[],patches=[],edges=[];
const W='minecraft:redstone_wire',R='minecraft:repeater',S='minecraft:light_gray_concrete';
for(let lane=0;lane<4;lane++){
 const c=oldRoutes.find(c=>c.name==='locks_closed_flags'+lane),start=c.path[2],end=c.path[12];
 assert.deepEqual(start,P(c.source.x-2,247,c.source.z));assert.deepEqual(end,P(c.source.x-12,239,c.source.z));
 const oldPart=c.path.slice(2,13),removePoints=c.path.slice(3,12).flatMap(p=>[under(p),p]);
 for(const p of removePoints){assert(world.has(K(p)));assert(parent.blocks.some(b=>K(b.position)===K(p)&&b.part===c.name),'Patch cannot remove unrelated body cell');removed.push({position:p,block:world.get(K(p)),route:c.name});world.delete(K(p));}
 // Move the obstructing observer prefix two blocks outward; its source, far
 // receiver and the remaining original cable are unchanged. One refresh
 // compensates the longer dust path before it rejoins the retained descent.
 const local=[start,P(start.x,247,start.z+1),P(start.x,247,start.z+2),P(start.x-1,247,start.z+2),P(start.x-2,247,start.z+2)];
 for(let i=1;i<=8;i++)local.push(P(start.x-2-i,247-i,start.z+2));
 local.push(P(end.x,end.y,end.z+1),end);
 const cells=local.slice(1,-1).flatMap((p,i)=>[{position:under(p),block:{id:S},part:c.name+'_mask_clearance_repair'},{position:p,block:i===2?{id:R,properties:{facing:'east',delay:'1'}}:{id:W},part:c.name+'_mask_clearance_repair'}]);
 assert.equal(new Set(cells.map(b=>K(b.position))).size,cells.length);
 for(const b of cells){assert(!world.has(K(b.position)),'Patch occupied collision '+K(b.position));world.set(K(b.position),b.block);added.push(b);}
 const path=[...c.path.slice(0,2),...local,...c.path.slice(13)];
 for(let i=1;i<local.length;i++)edges.push({from:local[i-1],to:local[i],route:c.name+'_mask_clearance_repair'});
 const replacement={...c,path,nominal_repeater_ticks:path.slice(1,-1).reduce((n,p)=>n+(world.get(K(p)).id===R?2*Number(world.get(K(p)).properties.delay):0),0),source_bound_parent_route:'../final-lock-observers-v1/design.json#'+c.name,repair:{removed_path:oldPart,replacement_path:local,removed_cells:removePoints.length,added_cells:cells.length,reason:'Restore original final-NZP side-mask approach without coupling to lock-closure observation'}};
 patches.push(replacement);
}
const removedKeys=new Set(removed.map(r=>K(r.position))),expected=new Set;
for(const b of parent.blocks)if(active(b.block))for(const p of inputs(before,b.position)){
 const incident=removedKeys.has(K(p))||removedKeys.has(K(b.position));
 if(!incident)expected.add(E(p,b.position));else{
  const patch=patches.find(r=>r.repair.removed_path.some(q=>K(q)===K(p))&&r.repair.removed_path.some(q=>K(q)===K(b.position)));
  assert(patch,'Removed prefix has an unrelated incident edge '+E(p,b.position));
 }
}
for(const e of edges){expected.add(E(e.from,e.to));if(world.get(K(e.from)).id===W&&world.get(K(e.to)).id===W)expected.add(E(e.to,e.from));}
const rows=parent.blocks.filter(b=>!removedKeys.has(K(b.position))).concat(added),actual=new Set,unexpected=[],lost=[],unsupported=[];
for(const b of rows){if([W,R,'minecraft:comparator','minecraft:redstone_torch'].includes(b.block.id)&&!world.get(K(under(b.position)))?.id.endsWith('_concrete'))unsupported.push(b.position);if(active(b.block))for(const p of inputs(world,b.position)){const e=E(p,b.position);actual.add(e);if(!expected.has(e))unexpected.push(e);}}
for(const e of expected)if(!actual.has(e))lost.push(e);
const report={status:unexpected.length||lost.length||unsupported.length?'refused':'four_lock_observer_prefixes_repaired_with_complete_input_map',parent_cells:parent.blocks.length,removed_cells:removed.length,new_cells:added.length,total_cells:rows.length,effective_inputs:actual.size,unexpected,lost,unsupported,patches,removed,added,edges,complete_core:false,native_acceptance:false};
writeFileSync(new URL('lock-repair.json',H),JSON.stringify(report,null,2)+'\n');assert.equal(report.status,'four_lock_observer_prefixes_repaired_with_complete_input_map');
const out={...parent,blocks:rows,route_replacements:patches,parent_delta:{removed,added,edges},metrics:{...parent.metrics,cells:rows.length,parent_cells:parent.blocks.length,lock_approach_repair_removed:removed.length,lock_approach_repair_added:added.length},complete_core:false,native_acceptance:false};
writeFileSync(new URL('repaired-parent-design.json',H),JSON.stringify(out)+'\n');
const arrivals=read('../final-lock-observers-v1/arrival-obligations.json');arrivals.routes=arrivals.routes.map(r=>{const c=patches.find(c=>c.name===r.name);return c?{...r,actual_path:c.path,nominal_origin_to_receiver_ticks:c.nominal_repeater_ticks,nominal_new_segment_ticks:c.nominal_repeater_ticks,explicit_prefix_repair:true}:r;});
writeFileSync(new URL('lock-repair-arrivals.json',H),JSON.stringify(arrivals,null,2)+'\n');
console.log(JSON.stringify({...report,patches:patches.map(p=>({name:p.name,ticks:p.nominal_repeater_ticks,old_ticks:oldRoutes.find(c=>c.name===p.name).nominal_repeater_ticks})),removed:removed.length,added:added.length,edges:edges.length}));
