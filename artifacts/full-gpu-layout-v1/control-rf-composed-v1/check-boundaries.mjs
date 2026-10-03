// Bounded exact-map and physical-boundary checks; no native/timing inference.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))), K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
const d=read('design.json'),core=read('../control-initialize-v1/design.json'),rf=read('../register-startup-v1/distribution-v1/design.json');
const m=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>m.get(K(p));assert.equal(m.size,d.blocks.length);
const rm=new Set(d.removed_routes.map(v=>K(v.position))),changed=new Set(d.rf_substitutions.map(v=>K(v.position)));
let preservedCore=0,preservedRf=0;
for(const v of core.blocks){if(rm.has(K(v.position))||changed.has(K(v.position)))continue;assert.deepEqual(at(v.position)?.block,v.block,'core preservation '+K(v.position));preservedCore++;}
for(const v of rf.blocks){const p=P(v.position.x+900,v.position.y+53,v.position.z);assert.deepEqual(at(p)?.block,v.block,'RF preservation '+K(p));preservedRf++;}
assert.equal(preservedCore,core.blocks.length-rm.size-5);assert.equal(preservedRf,280585);assert.equal(d.shared_cells,88807);assert.equal(changed.size,5);assert.equal(d.metrics.union_retained_bits,347+4*128+14+2);
const expectedConnections=['shared_phase_a','shared_phase_b','shared_initialize','alu_reset_request','actual_all_ready','update_kind_high','input_enable2'];assert.deepEqual(d.connections.map(v=>v.name),expectedConnections);
const travel={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
function diodeLinks(blocks,cs){const mm=new Map(blocks.map(v=>[K(v.position),v]));for(const c of cs){for(const [p,s,t]of[[c.tap,c.source,d.routes.find(r=>r.name===c.name).path[0]],[c.arrival,d.routes.find(r=>r.name===c.name).path.at(-1),c.destination]]){const b=mm.get(K(p))?.block;assert.equal(b?.id,'minecraft:repeater');const[x,z]=travel[b.properties.facing];assert.deepEqual(s,P(p.x-x,p.y,p.z-z));assert.deepEqual(t,P(p.x+x,p.y,p.z+z));}}}
diodeLinks(d.blocks,d.connections);
function positiveTowers(blocks){const mm=new Map(blocks.map(v=>[K(v.position),v]));for(const t of d.input_injections){const p=t.parent_wire;for(const y of[-5,-4,-2,0])assert.equal(mm.get(K(P(p.x,y,p.z)))?.block.id,'minecraft:light_gray_concrete');for(const y of[-3,-1])assert.equal(mm.get(K(P(p.x,y,p.z)))?.block.id,'minecraft:redstone_torch');assert.equal(mm.get(K(p))?.block.id,'minecraft:redstone_wire');const r=mm.get(K(P(p.x,-4,p.z-1)))?.block;assert.equal(r?.id,'minecraft:repeater');assert.equal(r.properties.facing,'north');assert.deepEqual(t.input,P(p.x,-4,p.z-2));}}
positiveTowers(d.blocks);assert.equal(d.input_injections.length,3);
let sourceBindings=0;for(const t of d.input_injections){if(!t.shared_source)continue;const s=t.shared_source,r=rf.routes.find(v=>v.name===s.route),p=r.path[s.index],prev=r.path[s.index-1];assert(r.refresh_indices.includes(s.index-1));assert.deepEqual(s.position,P(p.x+900,p.y+53,p.z));const driver=at(P(prev.x+900,prev.y+53,prev.z));assert.equal(driver.block.id,'minecraft:repeater');const[x,z]=travel[driver.block.properties.facing];assert.deepEqual(s.position,P(driver.position.x+x,driver.position.y,driver.position.z+z));sourceBindings++;}assert.equal(sourceBindings,2);
let polarityCases=0;for(let bits=0;bits<8;bits++){for(let i=0;i<3;i++){const input=!!(bits&(1<<i)),first=!input,second=!first;assert.equal(second,input);}polarityCases++;}
let corruptions=0;function corrupt(p,change,check){const k=K(p),blocks=d.blocks.map(v=>K(v.position)===k?change(structuredClone(v)):v);assert.throws(()=>check(blocks));corruptions++;}
corrupt(d.connections[0].tap,v=>{v.block.properties.facing=({east:'west',west:'east',north:'south',south:'north'})[v.block.properties.facing];return v},blocks=>diodeLinks(blocks,d.connections));
corrupt(d.input_injections[0].torch2,v=>{v.block.id='minecraft:redstone_wire';return v},positiveTowers);
corrupt(P(-62,-4,15),v=>{v.block.properties.facing='south';return v},positiveTowers);
const result={status:'author_checked_exact_composition_boundaries',blocks:d.blocks.length,preserved_core_cells:preservedCore,preserved_rf_cells:preservedRf,shared_rf_cells:88807,explicit_rf_substitutions:5,removed_overlay_cells:rm.size,rerouted_old_connections:4,new_shared_phase_initialize_connections:3,positive_injection_towers:3,normalized_parent_phase_taps:sourceBindings,polarity_cases:polarityCases,corruptions,retained_bits:875,route_nominal_added_ticks:d.routes.map(r=>({name:r.name,repeaters:r.refresh_indices.length+2,nominal_repeater_ticks:2*(r.refresh_indices.length+2),extra_torch_ticks:r.name.startsWith('shared_')?4:0})),native_acceptance:false,measured_timing:false};
if(process.argv.includes('--save'))writeFileSync(new URL('boundary-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
