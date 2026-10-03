// Bounded independent static review; no native/service imports or writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRegisterSharedControl} from '../../../../hardware/full-gpu-register-shared-control.mjs';
import {possibleStrengths} from '../connected-controller/check-strength-independent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',W='minecraft:redstone_wire',D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},dirs=Object.values(D),diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const parent=JSON.parse(readFileSync(new URL('../connected-controller-v2/design.json',import.meta.url))),d=makeRegisterSharedControl();
assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const expected=[['next_open',[-41,-82,140],[150,0,3]],['counter_qualified_next',[-41,-82,140],[-10,-82,3]],['current_open',[-41,-82,160],[162,0,3]],['counter_qualified_current',[-41,-82,160],[4,-82,3]],['initialize',[330,-110,110],[145,-2,-3]],['counter_initialize',[330,-110,110],[79,-82,-10]],['counter_boot_initialize',[330,-110,110],[153,-79,74]]];
function inspect(d){
 const m=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>m.get(K(p));assert.equal(m.size,61907);assert.equal(d.metrics.stored_bits,20);
 for(const v of parent.blocks)assert.deepEqual(at(v.position)?.block,v.block,'Changed parent '+K(v.position));
 assert.deepEqual(d.connections.map(c=>[c.name,Object.values(c.source),Object.values(c.destination)]),expected);
 assert.equal(d.ports.initialize.direction,'input');for(const c of d.connections)assert.equal(at(c.destination)?.block.id,W);
 // Exact masks: normalized rear and side15, subtraction, normalized output.
 for(const z of[140,160]){
  for(const x of[-45,-42])assert.deepEqual(at(P(x,-82,z))?.block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
  assert.deepEqual(at(P(-44,-82,z))?.block,{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
  assert.deepEqual(at(P(-44,-82,z===140?141:159))?.block,{id:'minecraft:repeater',properties:{facing:z===140?'south':'north',delay:'1'}});
 }
 assert.deepEqual(at(P(-63,-82,148))?.block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
 assert.deepEqual(at(P(-61,-82,148))?.block,{id:'minecraft:redstone_wall_torch',properties:{facing:'east'}});
 assert.equal(at(P(-62,-82,148))?.block.id,S);
 // Each new positive lift has exactly its intended incoming diode and
 // preceding torch as block-power sources. Final top dust cannot self-feed.
 let sourceSets=0;
 for(const c of d.columns){assert.equal((c.top-c.bottom-1)/2%2,0);assert(c.wire_top);
  for(let y=c.bottom;y<c.top;y+=2){const p=P(c.x,y,c.z),got=[];assert.equal(at(p)?.block.id,S);
   for(const[x,z]of dirs){const q=P(p.x-x,y,p.z-z),b=at(q)?.block;if(b?.id===W||diode(b)&&eq(D[b.properties.facing],[x,z]))got.push(K(q));}
   for(const[dy,id]of[[1,W],[-1,'minecraft:redstone_torch']]){const q=P(c.x,y+dy,c.z);if(at(q)?.block.id===id)got.push(K(q));}
   const want=[K(y===c.bottom?P(c.x,y,c.z+1):P(c.x,y-1,c.z))];if(y===c.top-1)want.push(K(P(c.x,c.top,c.z)));assert.deepEqual(got.sort(),want.sort(),'Foreign lift feed '+K(p));sourceSets++;
  }
 }
 // Enumerate conservative solid-mediated contacts, including ones that do
 // NOT conduct: wire block-power queries suppress all wire signal sources.
 let mediated=0,sameNetStairs=0,blockedDustPairs=0;
 for(const v of d.blocks.filter(v=>v.block.id===S)){const p=v.position,src=[],dst=[];
  for(const[x,z]of dirs){let a=at(P(p.x-x,p.y,p.z-z)),b=a?.block;if(b?.id===W||diode(b)&&eq(D[b.properties.facing],[x,z]))src.push(a);a=at(P(p.x+x,p.y,p.z+z));b=a?.block;if(b?.id===W||diode(b)&&eq(D[b.properties.facing],[x,z])||b?.id==='minecraft:redstone_wall_torch'&&eq(D[b.properties.facing],[-x,-z]))dst.push(a);}
  const up=at(P(p.x,p.y+1,p.z)),down=at(P(p.x,p.y-1,p.z));if(up?.block.id===W)src.push(up);if(down?.block.id==='minecraft:redstone_torch')src.push(down);if([W,'minecraft:redstone_torch'].includes(up?.block.id))dst.push(up);if(down?.block.id===W)dst.push(down);
  for(const a of src)for(const b of dst){if(a===b||a.part==='controller'&&b.part==='controller')continue;mediated++;if(a.part===b.part)continue;
   if(['-34,-83,140','-26,-83,162'].includes(K(p))){assert.equal(a.block.id,W);assert.equal(b.block.id,W);assert.notEqual(a.part,'controller');assert.notEqual(b.part,'controller');sameNetStairs++;continue;}
   assert(['84,-81,-20','85,-82,-20'].includes(K(p)),'Unexpected cross-net solid contact '+K(p));assert.equal(a.block.id,W);assert.equal(b.block.id,W);assert([a.part,b.part].includes('controller'));assert([a.part,b.part].includes('counter_initialize_clamp_arrive'));blockedDustPairs++;
   // No diode or torch directly powers these solids, so a dust recipient's
   // getBlockSignal cannot acquire the neighboring address/init net.
   assert(src.every(q=>q.block.id===W));
  }
 }
 assert.equal(mediated,228);assert.equal(sameNetStairs,4);assert.equal(blockedDustPairs,6);
 const capacity=possibleStrengths(d);assert.equal(capacity.failed.length,0);assert.equal(capacity.new_wire_fed_rears,189);assert.equal(capacity.minimum_possible_rear_power,3);
 return{preserved_parent_cells:parent.blocks.length,exact_binding_checks:expected.length,positive_lift_source_sets:sourceSets,conservative_solid_paths:mediated,same_net_stair_pairs:sameNetStairs,nonconducting_cross_net_dust_solid_dust_pairs:blockedDustPairs,...capacity};
}
const report=inspect(d);let cases=0;for(const p of[0,1])for(const a of[0,1])for(const b of[0,1]){const side=p?0:15;assert.equal(Math.max(15*a-side,0)>0,!!(a&&p));assert.equal(Math.max(15*b-side,0)>0,!!(b&&p));cases++;}
let negatives=0;for(const f of[
 c=>c.blocks.find(v=>K(v.position)==='-44,-82,159').block.properties.facing='south',
 c=>c.blocks.find(v=>K(v.position)==='-26,-82,161').block={id:W},
 c=>c.connections.find(c=>c.name==='counter_boot_initialize').destination.x++,
 c=>c.blocks.push({position:P(149,-50,7),block:{id:W},part:'foreign_lift_feed'}),
 c=>c.blocks.find(v=>K(v.position)==='85,-81,-20').block={id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},
]){const v=structuredClone(d);f(v);assert.throws(()=>inspect(v));negatives++;}
console.log(JSON.stringify({status:'independent_static_shared_control_checks_pass',blocks:d.blocks.length,...report,settled_mask_cases:cases,corruptions_refused:negatives,native_acceptance:false}));
