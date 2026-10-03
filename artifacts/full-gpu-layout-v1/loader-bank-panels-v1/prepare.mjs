// Exact pre-run panel relocation into the frozen bank frame. No game APIs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {inputs,active} from '../memory/fabric-colocation-v2/cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../',H),pins={};
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),T=p=>P(p.x,p.y-8,p.z+40);
function read(n,expected){const path=new URL(n,H),bytes=readFileSync(path),sha=createHash('sha256').update(bytes).digest('hex');if(expected)assert.equal(sha,expected);pins[fileURLToPath(path).slice(fileURLToPath(ROOT).length)]=sha;return JSON.parse(bytes);}
const parentPath='../memory/fabric-colocation-v2/channel2-write-data-design.json';
const parent=read(parentPath,'a94d1751152baaa55d7f3dc040ac07d1652e944a44aa7565d953a87fb41e1224');
const original=read('../loader-program-colocation-v1/reference-scope.json'),cuts=read('../loader-program-colocation-v1/actual-cuts.json');
const iface=read('../loader-program-colocation-v1/interfaces.json'),banks=read('../memory/fabric-colocation-v2/bank-tail-bodies.json');
assert.deepEqual(banks.translation,P(0,-8,40));
const chosen=g=>/^loader\/bank[0-3]_(load_(address|data)[0-7]|loader_strobe)$/.test(g??'');
const own=original.blocks.filter(v=>chosen(v.group));assert.equal(own.length,648);
const old=new Map([...original.blocks,...original.foreign_context].map(v=>[K(v.position),v.block]));
const before=new Map(parent.blocks.map(v=>[K(v.position),v.block])),world=new Map(before);
assert.equal(before.size,1327786);
const delta=own.map(v=>({position:T(v.position),original_position:v.position,block:v.block,group:v.group}));
for(const v of delta){assert(!world.has(K(v.position)),'Panel collision '+K(v.position));world.set(K(v.position),v.block);}
const outgoing=cuts.external.filter(v=>chosen(v.source_group));assert.equal(outgoing.length,68);
const between=cuts.between_groups.filter(v=>chosen(v.source_group)!==chosen(v.target_group));assert.equal(between.length,11);
const expectedNew=new Map();
for(const c of outgoing){const s=T(c.source),t=T(c.target);assert.deepEqual(world.get(K(s)),c.source_block);assert.deepEqual(before.get(K(t)),c.target_block);const xs=expectedNew.get(K(t))??[];xs.push(K(s));expectedNew.set(K(t),xs);}
const ownKeys=new Set(own.map(v=>K(v.position))),pendingInputs=between.filter(v=>!chosen(v.source_group));assert.equal(pendingInputs.length,4);
let receivers=0,unchangedInputs=0,newInputs=0,supports=0;const fullDiff=[];
const solid=b=>b?.id.endsWith('_concrete'),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};
for(const [key,b] of world){const p=P(...key.split(',').map(Number));let support;
 if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch','minecraft:lever'].includes(b.id))support=P(p.x,p.y-1,p.z);
 if(b.id==='minecraft:redstone_wall_torch'){const q=D[b.properties.facing];support=P(p.x+q.x,p.y,p.z+q.z);}
 if(support){assert(solid(world.get(K(support))),'Unsupported '+key);supports++;}
 if(!active(b))continue;receivers++;const actual=inputs(world,p).map(K).sort();
 if(before.has(key)){const inherited=inputs(before,p).map(K);unchangedInputs+=inherited.length;const addition=expectedNew.get(key)??[];assert.deepEqual(actual,[...new Set([...inherited,...addition])].sort(),'Unexpected old contact '+key);if(addition.length)fullDiff.push({target:p,added:addition});}
 else{const oldPos=P(p.x,p.y+8,p.z-40);const expected=inputs(old,oldPos).filter(q=>ownKeys.has(K(q))).map(T).map(K).sort();assert.deepEqual(actual,expected,'Unexpected panel contact '+key);newInputs+=actual.length;}
}
assert.equal(fullDiff.reduce((n,v)=>n+v.added.length,0),68);
function move(v){if(Array.isArray(v))return v.map(move);if(v&&typeof v==='object')return ['x','y','z'].every(a=>Number.isInteger(v[a]))?T(v):Object.fromEntries(Object.entries(v).map(([k,w])=>[k,move(w)]));return v;}
const panels=iface.loader.panels.map(p=>({...move(p),original:p}));
const allCuts=[...outgoing.map(c=>({...c,current_source:T(c.source),current_target:T(c.target),status:'exact_panel_to_bank_delivery'})),...between.map(c=>({...c,current_panel_endpoint:T(chosen(c.source_group)?c.source:c.target),status:'pending_global_grant_or_writer_observation'}))];
const bankLedger=read('../memory/fabric-colocation-v2/channel2-write-data-cut-ledger.json');
const matched=bankLedger.bank_inventory.entries.filter(e=>outgoing.some(c=>K(c.source)===K(e.original.source.position)&&K(c.target)===K(e.original.target.position)));
assert.equal(matched.length,68);assert(matched.every(e=>e.status==='outside_this_group_reconciliation_pending'));
const materials={};for(const v of delta)materials[v.block.id]=(materials[v.block.id]??0)+1;
const columns=new Set(parent.blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`));const oldColumnCount=columns.size;
for(const v of delta)columns.add(`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`);
const report={status:'exact_panel_relocation_whole_union_static_pass',metrics:{parent_cells:before.size,panel_cells:delta.length,total_cells:world.size,unchanged_parent_cells:before.size,active_receivers:receivers,preserved_parent_inputs:unchangedInputs,panel_internal_inputs:newInputs,added_bank_inputs:68,supports,columns_before:oldColumnCount,columns_after:columns.size,pending_panel_cuts:between.length},materials,full_input_diff:fullDiff,source_sha256:pins,limits:['68 actual bank boundary deliveries only. Four grant producers, four writer observation routes and three chained grant fanouts remain unbound.','No change to parent cells or runtime channels. Loading must occur with granted ownership before runtime launch.','Actual panel and bank geometry only; no state, memory write/readback, timing, native or full-layout acceptance.'],native_acceptance:false,world_mutations:0};
writeFileSync(new URL('delta.json',H),JSON.stringify({blocks:delta,parent:{path:fileURLToPath(new URL(parentPath,H)).slice(fileURLToPath(ROOT).length),sha256:pins['artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/channel2-write-data-design.json']},translation:P(0,-8,40),panels,source_sha256:pins})+'\n');
writeFileSync(new URL('remaining-cuts.json',H),JSON.stringify({panel_cuts:allCuts,bank_cut_indices:matched.map(e=>e.index),source_sha256:pins},null,2)+'\n');
writeFileSync(new URL('checks.json',H),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.metrics));console.log(JSON.stringify(materials));
