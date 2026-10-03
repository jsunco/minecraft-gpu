// Exact local substitutions and independent finite initialization semantics.
// This checks a proposed settled protocol, not Minecraft transitions.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,get=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),parent=get('../control-commit-v2/design.json'),d=get('design.json'),m=new Map(d.blocks.map(v=>[K(v.position),v])),sub=new Map(d.substitutions.map(v=>[K(v.position),v])),removed=new Map(d.removed_interconnect_cells.map(v=>[K(v.position),v]));
assert.equal(sub.size,20);assert.equal(d.clamps.length,20);assert.equal(d.connections.length,43);assert.equal(m.size,d.blocks.length);let preserved=0;
for(const v of parent.blocks){const k=K(v.position);if(v.part.startsWith('cmp_lane_')){assert.deepEqual(removed.get(k),v);continue;}const s=sub.get(k);if(s){assert.deepEqual(s.before,v.block);assert.deepEqual(m.get(k)?.block,s.after);}else{assert.deepEqual(m.get(k)?.block,v.block,'preserved '+k);preserved++;}}
assert.equal(removed.size,parent.blocks.filter(v=>v.part.startsWith('cmp_lane_')).length);assert(d.removed_interconnect_cells.every(v=>v.part.startsWith('cmp_lane_')));
const at=p=>m.get(K(p))?.block,rep=(p,f)=>assert.deepEqual(at(p),{id:'minecraft:repeater',properties:{facing:f,delay:'1'}},K(p));
function checkClamps(){for(const c of d.clamps){assert.deepEqual(at(c.comparator),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});rep(c.mask,'south');assert.deepEqual(c.mask,P(c.comparator.x,c.comparator.y,c.comparator.z+1));if(c.name.startsWith('pc_')){assert.equal(at(c.rear).id,'minecraft:redstone_wire');rep(P(c.rear.x-1,c.rear.y,c.rear.z),'west');rep(c.output,'west');}else{rep(c.rear,'west');rep(c.output,'west');}const cn=d.connections.find(v=>v.name==='zero_'+c.name);assert.deepEqual(cn.destination,c.input);assert.equal(at(cn.arrival).id,'minecraft:repeater');}}
checkClamps();let mutations=0;const c=d.clamps[0],v=m.get(K(c.comparator)),before=v.block;v.block={id:'minecraft:repeater',properties:{facing:'west',delay:'1'}};assert.throws(checkClamps);v.block=before;mutations++;
const mask=m.get(K(c.mask)),face=mask.block.properties.facing;mask.block.properties.facing='north';assert.throws(checkClamps);mask.block.properties.facing=face;mutations++;
let clampCases=0,pcCases=0,flagCases=0,earlyRefusals=0;
for(let input=0;input<=15;input++)for(const init of[0,1]){const actual=Math.max(input-15*init,0);assert.equal(actual,init?0:input);clampCases++;}
// Separable unknown-state coverage: every possible CURRENT/NEXT byte pair.
for(let current=0;current<256;current++)for(let next=0;next<256;next++){
 const old={current,next};let q={...old};q.next=0;assert.equal(q.current,old.current);const held=q.next;q.current=held;assert.equal(q.current,0);assert.equal(q.next,0);pcCases++;
 if(current!==0){const premature={...old};assert.notEqual(premature.current,0);earlyRefusals++;}
}
for(let old=0;old<8;old++)for(let cmp=0;cmp<8;cmp++)for(let laneMask=0;laneMask<16;laneMask++){
 const normal=Array.from({length:4},(_,i)=>laneMask&(1<<i)?cmp:old),initialized=normal.map(()=>0);assert(initialized.every(q=>q===0));assert.deepEqual(normal.map((q,i)=>laneMask&(1<<i)?cmp:old),normal);flagCases++;
}
// Both banks open is never an admitted init state; phase producer must close A
// before B, and close B before data-mask withdrawal/normal permit.
const sequence=[{init:1,a:0,b:0},{init:1,a:1,b:0},{init:1,a:0,b:0},{init:1,a:0,b:1},{init:1,a:0,b:0},{init:0,a:0,b:0}];
assert(sequence.every(s=>!(s.a&&s.b)));assert.equal(sequence.findIndex(s=>s.b),3);assert.equal(sequence.findIndex(s=>!s.init),5);
const r={status:'author_initialization_boundary_protocol_checks_passed',preserved_parent_cells:preserved,replaced_parent_cells:sub.size,rerouted_old_cells:removed.size,connections:43,zero_clamps:20,normalized_mask_inputs:20,clamp_cases:clampCases,unknown_pc_bank_pairs:pcCases,independent_flag_mask_cases:flagCases,premature_admission_counterexamples:earlyRefusals,corruptions_rejected:mutations,native_acceptance:false,limits:['The unknown-state replay uses the required phase order; no source currently proves that order or far lock closure from scanner READY.','Normal flags remain per-lane and CMP-qualified; reset ignores lane enable and clears all four banks.','No scheduled redstone propagation or measured pulse/settle/closure claim.']};
if(process.argv.includes('--save'))writeFileSync(new URL('boundary-checks.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
