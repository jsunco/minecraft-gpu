import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import {makeArchitecturalZero}from'./prepare.mjs';
import {screen}from'./check-interactions.mjs';
import {checkLogic}from'./check-logic.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),W='minecraft:redstone_wire';
const d=makeArchitecturalZero(),base=read('../control-rf-status-v1/design.json'),oldZero=read('../control-initialize-v1/design.json'),m=new Map(d.blocks.map(v=>[K(v.position),v])),old=new Map(base.blocks.map(v=>[K(v.position),v])),removed=new Set(d.removed.map(v=>K(v.position)));
assert.deepEqual(d,read('design.json'));assert.equal(removed.size,d.removed.length);assert.equal(d.metrics.retained_bits,1102);assert.equal(d.substitutions.length,0);
let preserved=0;for(const v of base.blocks)if(!removed.has(K(v.position))){assert.deepEqual(m.get(K(v.position))?.block,v.block,'Unexpected parent edit '+K(v.position));preserved++;}
const expectedRemoved=[...oldZero.blocks.filter(v=>['init_gate_0','init_gate_1'].includes(v.part)),...read('../control-assignment-v1/design.json').blocks.filter(v=>v.part==='reset_to_rf')].map(v=>K(v.position));
for(const x of[-30,-26])expectedRemoved.push(`${x},310,-89`,`${x},309,-89`);
assert.deepEqual([...removed].sort(),expectedRemoved.sort());
for(const k of removed)assert(!m.has(k)||m.get(k).part!=='base','Removed old cable silently retained');
let locks=0;for(const n of['active','prepared','transferred','stop']){const t=d.parents[n==='stop'?'zero_stop_after_full_transfer':'zero_'+n].translation;for(const x of n==='stop'?[0]:[0,12]){
 assert.deepEqual(m.get(K(P(t.x+x+2,t.y+1,t.z))).block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
 assert.deepEqual(m.get(K(P(t.x+x+2,t.y+1,t.z+1))).block,{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}});
 assert.equal(m.get(K(P(t.x+x+2,t.y+1,t.z+2))).block.id,W);locks++;
}}
assert.equal(locks,7);assert.equal(d.clamps.length,20);
for(let i=0;i<20;i++){
 const c=d.clamps[i];for(const[n,value]of Object.entries(oldZero.clamps[i]))assert.deepEqual(c[n],value);
 assert.deepEqual(m.get(K(c.comparator)).block,{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
 const side=P(c.comparator.x,c.comparator.y,c.comparator.z+1);assert.deepEqual(m.get(K(side)).block,{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}});
 assert.deepEqual(c.input,P(side.x,side.y,side.z+1));
 assert.deepEqual(d.connections.find(v=>v.name===c.name+'_arrival_return').source,c.return_source);
 if(/^flags_[123]_/.test(c.name)){assert.deepEqual(c.return_source,P(c.input.x,c.input.y,c.input.z+2));assert.deepEqual(m.get(K(P(c.input.x,c.input.y,c.input.z+1))).block,{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}});}
 else assert.deepEqual(c.return_source,c.input);
}
const conn=n=>d.connections.find(v=>v.name===n);
function boundary(candidate){const find=n=>candidate.connections.find(v=>v.name===n);
 assert.deepEqual(find('actual_A_held_NEXT_witness').source,P(-165,141,310));
 assert.deepEqual(find('qualified_zero_NEXT_into_existing_fanout').destination,P(-98,310,-116));
 assert.deepEqual(find('qualified_zero_CURRENT_into_existing_route').destination,P(-82,310,-116));
 assert.deepEqual(find('post_scratch_RF_reset').destination,base.ports.rf.reset_request.bits[0].position);
 assert.deepEqual(find('original_cold_before_warm_OR').source,P(-116,310,-90));
 assert.deepEqual(find('warm_active_to_existing_zero_masks').destination,P(-114,310,-90));
}
boundary(d);const phases=read('../control-core-guards-v1/routes.json');
for(const[name,path]of[['real_A_to_fanout','actual_A_to_done_store'],['real_B_to_fanout','actual_B_to_sampler_column']])assert(phases[path].path.some(p=>K(p)===K(conn(name).source)),'Phase source must be on frozen actual delivered cable');
// Every retained old wire has exactly the same retained-neighbor graph. This
// catches accidental new steps exposed by deleting old supports as well.
const eligible=new Set(base.blocks.filter(v=>v.block.id===W&&!removed.has(K(v.position))).map(v=>K(v.position)));let oldEdges=0;
function neighbors(p,map){const a=[];for(const[x,z]of[[1,0],[-1,0],[0,1],[0,-1]])for(const dy of[-1,0,1]){const q=P(p.x+x,p.y+dy,p.z+z);if(!eligible.has(K(q)))continue;if(dy===1&&map.has(K(P(p.x,p.y+1,p.z))))continue;if(dy===-1&&map.has(K(P(q.x,q.y+1,q.z))))continue;a.push(K(q));}return a.sort();}
for(const k of eligible){const before=neighbors(old.get(k).position,old);assert.deepEqual(neighbors(old.get(k).position,m),before,'Retained old wire graph '+k);oldEdges+=before.length;}
let corruptions=0;for(const[name,source]of[['actual_A_held_NEXT_witness',P(-153,141,310)],['original_cold_before_warm_OR',P(-114,310,-90)]]){const corrupt={...d,connections:d.connections.map(c=>c.name===name?{...c,source}:c)};assert.throws(()=>boundary(corrupt));corruptions++;}
const low=P(-173,140,315),high=P(-172,141,315),cap=P(-173,141,315);assert.equal(m.get(K(low)).block.id,W);assert.equal(m.get(K(high)).block.id,W);assert.equal(m.get(K(cap)).block.id,'minecraft:light_gray_concrete');
const stepExists=map=>map.get(K(low))?.block.id===W&&map.get(K(high))?.block.id===W&&!map.has(K(cap));assert(!stepExists(m));const capRemoved=new Map(m);capRemoved.delete(K(cap));assert(stepExists(capRemoved),'Removing the cap exposes a real data/OPEN dust-step coupling');corruptions++;
const report={status:'author_checked_architectural_zero_transfer_candidate',...d.metrics,removed_obsolete_cable_cells:removed.size,preserved_parent_cells:preserved,preserved_old_wire_edges:oldEdges,explicit_lock_directions:locks,mask_return_scope:{direct_input:11,one_final_normalizer_before_input:9,all_final_side_diodes_preserved:20},...checkLogic(),boundary_corruptions:corruptions,...screen(d),native_acceptance:false,complete_core_reset:false,final_reset_ack:false};
if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,taps:undefined}));
