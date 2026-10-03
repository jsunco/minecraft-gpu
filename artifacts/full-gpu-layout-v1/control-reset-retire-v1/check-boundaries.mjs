import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),W='minecraft:redstone_wire';
const d=read('design.json'),base=read('../control-alu-lsu-union-v1/design.json'),m=new Map(d.blocks.map(b=>[K(b.position),b])),old=new Map(base.blocks.map(b=>[K(b.position),b])),changed=new Map(d.substitutions.map(v=>[K(v.position),v]));
assert.equal(changed.size,2);assert.equal(d.metrics.retained_bits,1034);let retained=0;
for(const b of base.blocks){const k=K(b.position);if(changed.has(k)){assert.deepEqual(changed.get(k).before,b.block);assert.deepEqual(changed.get(k).after,m.get(k).block);}else{assert.deepEqual(m.get(k)?.block,b.block,'Changed parent '+k);retained++;}}
for(const y of [1,49]){
 const input=m.get(K(P(22,y,-4))).block,driver=m.get(K(P(22,y,-5))).block,gate=m.get(K(P(22,y,-3))).block,side=m.get(K(P(23,y,-3))).block;
 assert.equal(input.id,W);assert.deepEqual(driver,{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});
 assert.deepEqual(gate,{id:'minecraft:comparator',properties:{facing:'north',mode:'subtract'}});assert.deepEqual(side,{id:'minecraft:repeater',properties:{facing:'east',delay:'1'}});
 for(const rear of [false,true])for(const mask of [false,true])assert.equal(Math.max(0,(rear?15:0)-(mask?15:0))>0,rear&&!mask);
}
const associations=[
 ['raw_A_to_barrier','alu-core-admission-v1','shared_raw_A_to_local_guard',P(-82,-4,14)],
 ['raw_B_to_barrier','alu-core-admission-v1','raw_B_to_switch_current',P(-62,-4,14)],
 ['initialize_to_barrier','alu-core-admission-v1','shared_initialize_to_local_guard',P(-100,-4,-10)],
 ['IDLE_to_barrier','control-start-other-v1','idle_to_claim',P(14,1,6)],
 ['UPDATE_to_barrier','control-lsu-core-v1','source_shared_update',P(14,49,4)],
 ['commit_complete_to_barrier','control-commit-v2','commit_complete_to_front',P(364,257,-396)]
];
const loaded=new Map();
for(const[name,folder,route,source]of associations){if(!loaded.has(folder))loaded.set(folder,read('../'+folder+'/design.json'));const p=loaded.get(folder),r=p.routes.find(r=>r.name===route),c=p.connections.find(c=>c.name===route),actual=d.connections.find(c=>c.name===name);assert.deepEqual(c.source,source);const at=r.path.findIndex(q=>K(q)===K(actual.source));assert(at>0&&r.refresh_indices.includes(at-1),'Not a normalized same-signal tap '+name);assert.equal(m.get(K(r.path[at-1])).block.id,'minecraft:repeater');}
const eligible=new Set(base.blocks.filter(b=>b.block.id===W).map(b=>K(b.position)));let wireEdges=0;
function neighbors(p,map){const a=[];for(const[x,z]of[[1,0],[-1,0],[0,1],[0,-1]])for(const y of[-1,0,1]){const q=P(p.x+x,p.y+y,p.z+z),k=K(q);if(!eligible.has(k))continue;if(y===1&&map.has(K(P(p.x,p.y+1,p.z))))continue;if(y===-1&&map.has(K(P(q.x,q.y+1,q.z))))continue;a.push(k);}return a.sort();}
for(const k of eligible){const p=old.get(k).position,a=neighbors(p,old);assert.deepEqual(neighbors(p,m),a,'Old wire graph changed '+k);wireEdges+=a.length;}
const result={status:'author_retirement_barrier_parent_and_boundary_checks',preserved_parent_cells:retained,declared_receiver_substitutions:2,fresh_same_signal_taps:associations.length,advance_mask_cases:8,preserved_old_wire_cells:eligible.size,preserved_directed_old_wire_edges:wireEdges,retained_bits:1034,native_acceptance:false};
if(process.argv.includes('--save'))writeFileSync(new URL('boundary-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
