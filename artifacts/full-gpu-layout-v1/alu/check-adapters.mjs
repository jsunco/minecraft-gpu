// Authored finite static screen; not an independent review or a native simulator.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeFullLaneAluAdapters} from '../../../hardware/full-lane-alu-adapters.mjs';
const d=makeFullLaneAluAdapters(),file=new URL('layout-adapters.json',import.meta.url);
assert.deepEqual(d,JSON.parse(readFileSync(file)));assert.equal(d.metrics.blocks,13802);
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),plus=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
const map=new Map(d.blocks.map(v=>[K(v.position),v.block]));assert.equal(map.size,d.blocks.length);
const at=p=>map.get(K(p)),solid=p=>at(p)?.id.endsWith('_concrete'),wire=p=>at(p)?.id==='minecraft:redstone_wire';
const dirs={east:P(1,0,0),west:P(-1,0,0),south:P(0,0,1),north:P(0,0,-1)};
let supports=0;
for(const {position:p,block:b}of d.blocks){if(b.id.endsWith('_concrete'))continue;let q={...p,y:p.y-1};if(b.id==='minecraft:redstone_wall_torch'){const v=dirs[b.properties.facing];q=P(p.x-v.x,p.y,p.z-v.z);}assert(solid(q),'Unsupported '+K(p));supports++;}
assert.equal(d.adapters.length,40);assert.equal(d.blocks.filter(v=>v.block.id==='minecraft:lever').length,0);
for(const a of d.adapters){const p=a.output;assert(wire(p));for(const delta of[-1,-3,-5])assert(solid({...p,y:p.y+delta}));for(const delta of[-2,-4])assert.equal(at({...p,y:p.y+delta}).id,'minecraft:redstone_torch');assert.deepEqual(at(a.receiver),{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});assert(wire(a.input));}
assert.equal(d.selectors.length,6);assert.equal(d.outputs.length,8);
let motifs=0;
for(const s of d.selectors){assert.equal(at(s.inverter).id,'minecraft:redstone_wall_torch');assert.equal(at(s.inverter).properties.facing,'south');for(const b of s.bits){assert.deepEqual(at(b.comparator),{id:'minecraft:comparator',properties:{facing:'north',mode:'subtract'}});assert.deepEqual(at(b.mask_receiver),{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});assert.deepEqual(at(b.isolated_output),{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});motifs++;}}
// New basement wire edges may join only the eight intentional W input adapters.
const allowed=new Set(d.outputs.map(o=>[K(o.route_end),K(o.adapter_input)].sort().join('|'))),edges=new Map(),foreign=new Set();
for(const {position:p}of d.blocks){if(!wire(p))continue;for(const v of Object.values(dirs)){const q=plus(p,v),qs=[q];if(solid(q)&&!solid({...p,y:p.y+1}))qs.push({...q,y:q.y+1});if(!solid(q))qs.push({...q,y:q.y-1});for(const r of qs)if(wire(r)){edges.set(K(p)+'|'+K(r),[p,r]);if((p.y<0||r.y<0)&&d.owner[K(p)]!==d.owner[K(r)]){const k=[K(p),K(r)].sort().join('|');assert(allowed.has(k),'Foreign basement wire edge '+k);foreign.add(k);}}}}
assert.deepEqual(foreign,allowed);
// No added repeater has an adjacent diode pointing into its locking side.
let sides=0;
for(const {position:p,block:b}of d.blocks){if(p.y>=0||b.id!=='minecraft:repeater')continue;const f=dirs[b.properties.facing],side=f.x?[dirs.north,dirs.south]:[dirs.east,dirs.west];for(const v of side){const q=plus(p,v),qb=at(q);if(!['minecraft:repeater','minecraft:comparator'].includes(qb?.id))continue;const qf=dirs[qb.properties.facing];assert.notDeepEqual(P(q.x-qf.x,q.y,q.z-qf.z),p,'Unintended side lock '+K(p));sides++;}}
// Check signal distance across joined collector/route/adapter, not each route alone.
// Each diode is a possible source here; this is a wiring reachability screen.
const power=new Map(d.blocks.filter(v=>wire(v.position)).map(v=>[K(v.position),0]));
for(const {position:p,block:b}of d.blocks){let supply=[];if(['minecraft:repeater','minecraft:comparator'].includes(b.id)){const f=dirs[b.properties.facing];supply=[P(p.x-f.x,p.y,p.z-f.z)];}else if(b.id==='minecraft:redstone_wall_torch')supply=Object.values(dirs).map(v=>plus(p,v));for(const q of supply)if(power.has(K(q)))power.set(K(q),15);}
for(let i=0;i<15;i++)for(const [p,q]of edges.values())power.set(K(q),Math.max(power.get(K(q)),power.get(K(p))-1));
let minimum=15;for(const o of d.outputs){assert.equal(at(P(-19,-12,o.collector_end.z)).id,'minecraft:repeater');const strength=power.get(K(o.adapter_input));assert(strength>0);minimum=Math.min(minimum,strength);}
let selectorCases=0;for(let bits=0;bits<64;bits++)for(let select=-1;select<6;select++){const outputs=d.selectors.map((_,i)=>Math.max(0,((bits>>i)&1)*15-(i===select?0:15)));assert.equal(Number(outputs.some(x=>x>0)),select<0?0:(bits>>select)&1);selectorCases++;}
const result={status:'authored_partial_geometry_checks_passed',blocks:d.metrics.blocks,counts:d.counts,support_checks:supports,positive_source_adapters:d.adapters.length,selector_comparator_motifs:motifs,selector_single_bit_cases:selectorCases,exact_intended_basement_dust_joins:foreign.size,unexpected_basement_dust_joins:0,adjacent_diode_side_checks:sides,minimum_possible_W_adapter_input_strength:minimum,scope:'Exact supports, local motifs, basement dust contacts/side locks and possible-source strength only. No whole-map simultaneous-state/transient or native acceptance;48 W branch data ports and six select ports remain unconnected.',native_calls:0};
if(process.argv.includes('--save'))writeFileSync(new URL('adapter-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
