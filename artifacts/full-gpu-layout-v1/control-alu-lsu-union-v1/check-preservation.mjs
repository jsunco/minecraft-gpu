import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,W='minecraft:redstone_wire';
const d=read('design.json'),m=new Map(d.blocks.map(v=>[K(v.position),v])),replacement=d.inherited_replacements;
const removedCore=new Set(replacement.removed_original_core_route.cells.map(v=>K(v.position))),changed=new Map(replacement.substituted_immediate_parent_cells.map(v=>[K(v.position),v]));
assert.equal(m.size,d.blocks.length);assert.equal(d.metrics.retained_bits,1028);
let kept=0,wireCells=0,edgeChecks=0;const reports={};
function neighbors(p,map,eligible){const out=[];for(const[x,z]of[[1,0],[-1,0],[0,1],[0,-1]])for(const dy of[-1,0,1]){const q={x:p.x+x,y:p.y+dy,z:p.z+z},k=K(q);if(!eligible.has(k)||map.get(k)?.block.id!==W)continue;if(dy===1&&map.has(K({x:p.x,y:p.y+1,z:p.z})))continue;if(dy===-1&&map.has(K({x:q.x,y:q.y+1,z:q.z})))continue;out.push(k);}return out.sort();}
for(const [id,path]of [['alu','../alu-core-admission-v1/design.json'],['lsu','../control-lsu-core-v1/design.json']]){
 const old=read(path),oldMap=new Map(old.blocks.map(v=>[K(v.position),v])),eligible=new Set();let count=0,skipped=0;
 for(const v of old.blocks){const k=K(v.position);
  if(id==='lsu'&&(['source_shared_phase_b','source_shared_initialize'].includes(v.part)||removedCore.has(k)||changed.has(k))){skipped++;continue;}
  assert.deepEqual(m.get(k)?.block,v.block,id+' changed inherited cell '+k);count++;kept++;
  if(v.block.id===W)eligible.add(k);
 }
 for(const k of eligible){const p=oldMap.get(k).position,a=neighbors(p,oldMap,eligible),b=neighbors(p,m,eligible);assert.deepEqual(b,a,id+' changed old-to-old dust step '+k);wireCells++;edgeChecks+=a.length;}
 reports[id]={preserved_cells:count,declared_replaced_cells:skipped,preserved_wire_cells:eligible.size};
}
assert.equal(reports.alu.declared_replaced_cells,0);
const partCount=d.blocks.filter(v=>v.owners.includes('repair')).length;assert(partCount>0);
const result={status:'author_single_copy_parent_and_wire_graph_preservation',parents:reports,total_preservation_comparisons:kept,wire_cells:wireCells,directed_old_wire_edges:edgeChecks,retained_bits:1028,shared_same_source_cells:d.shared_overlaps.length,repaired_shared_route_cells:partCount,limits:['Two preservation counts intentionally include the common parent twice as comparisons; physical blocks are counted only once in the design.','ALU declares the old status route and seven driver substitutions; LSU declares only replacement of its B and initialize delivery routes.','Unchanged saved geometry and graph do not prove native initialization or timing.'],native_calls:0};
if(process.argv.includes('--save'))writeFileSync(new URL('preservation-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
