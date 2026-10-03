import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeCounterGuards} from '../../../../hardware/full-gpu-counter-guards.mjs';
import {makeAddressDecoder4} from '../../../../hardware/address-decoder4.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
const d=makeCounterGuards(),parent=makeAddressDecoder4({origin:P(0,0,0),id:'gpu_counter_guard_source'}),pm=new Map(parent.blocks.map(v=>[K(v.position),v]));
assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
function check(blocks){const m=new Map(blocks.map(v=>[K(v.position),v])),at=p=>m.get(K(p)),input=new Set(d.ports.address.bits.map(b=>K(b.position)));assert.equal(m.size,blocks.length);let inherited=0,supports=0;
 for(const c of d.inheritance){const expected=structuredClone(pm.get(K(c.source)).block);if(input.has(K(c.target)))expected.id='minecraft:redstone_wire',delete expected.properties;assert.deepEqual(at(c.target)?.block,expected,'Changed inherited cell '+K(c.target));inherited++;}
 for(const v of blocks){if(v.block.id.endsWith('_concrete'))continue;const p=v.block.id.endsWith(':redstone_wall_torch')?add(v.position,D[v.block.properties.facing]):{...v.position,y:v.position.y-1};assert.equal(at(p)?.block.id,'minecraft:light_gray_concrete','Unsupported '+K(v.position));supports++;}
 let outputs=0;for(const value of[12,15]){const y=value===12?1:9;for(const x of[9,11]){const p=P(x,y,6);assert.equal(at(p).block.id,'minecraft:repeater');assert.deepEqual(add(p,D[at(p).block.properties.facing]),P(x+1,y,6));}for(const x of[10,12])assert.equal(at(P(x,y,6)).block.id,'minecraft:redstone_wire');outputs++;}
 // Cropping removes levels, never logic. Evaluate actual selected rows and the
 // copied even-length tower between them; this is an authored settled model.
 let cases=0;for(let value=0;value<16;value++)for(let row=0;row<2;row++){
  const y=1+8*row,target=d.targets[row],tap=[];
  for(const [bit,x,z]of[[0,0,0],[1,12,0],[2,0,12],[3,12,12]]){let power=(value>>bit)&1;for(let level=2;level<y;level+=2){assert.equal(at(P(x,level,z)).block.id,'minecraft:redstone_torch');power=1-power;}tap.push(power);}
  const mismatch=tap.some((v,b)=>Boolean(v)!==Boolean(target>>b&1));
  assert.equal(!mismatch,value===target);cases++;
 }
 return{inherited_cells:inherited,support_checks:supports,isolated_guard_outputs:outputs,settled_guard_cases:cases};}
const checks=check(d.blocks);const bad=structuredClone(d.blocks);bad.find(v=>K(v.position)==='11,9,6').block.properties.facing='east';assert.throws(()=>check(bad));const cut=d.blocks.filter(v=>K(v.position)!=='12,6,12');assert.throws(()=>check(cut));
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');const result={status:'offline_terminal_guard_inheritance_and_polarity_checks_pass',blocks:d.blocks.length,...checks,corruption_refusals:2,sources:{generator:sha('../../../../hardware/full-gpu-counter-guards.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['Inherited row topology and tower parity, not a full electrical or transient simulator.','Only terminal predicates12/15; no counter or conditional next-state feedback.']};writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
