import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeStateBank} from '../../../../hardware/full-gpu-state-bank.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},dirs=Object.values(D);
function check(d){const map=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>map.get(K(p));let supports=0,locks=0,links=0;
 for(const v of d.blocks){if(v.block.id==='minecraft:light_gray_concrete')continue;assert.equal(at({...v.position,y:v.position.y-1})?.block.id,'minecraft:light_gray_concrete');supports++;}
 const expectedLocks=new Set(d.banks.flatMap(b=>b.latches.map(v=>[K(v.storage),K(v.lock)].join('|'))));
 for(const v of d.blocks.filter(v=>v.block.id==='minecraft:repeater')){const delta=D[v.block.properties.facing];for(const side of dirs.filter(s=>s.x*delta.x+s.z*delta.z===0)){const p=add(v.position,side),other=at(p);if(!other||other.block.id==='minecraft:light_gray_concrete')continue;
  assert(expectedLocks.has([K(v.position),K(p)].join('|')),'Unexpected diode-side contact '+K(v.position));assert.deepEqual(add(p,D[other.block.properties.facing]),v.position,'Wrong side-lock direction');locks++;
 }}assert.equal(locks,d.metrics.stored_bits);
 for(const bank of d.banks){for(const bit of bank.latches){assert.equal(at(bit.storage).block.id,'minecraft:repeater');assert.deepEqual(add(bit.data,D[at(bit.data).block.properties.facing]),bit.storage);const y=bit.storage.y;assert.equal((y-1)%4,0);assert.equal(at(bit.lock_source).block.id,'minecraft:redstone_torch');}
  let inverted=false;for(let y=1;y<=4*(d.metrics.width-1)+1;y+=2){assert.equal(at(P(bank.latches[0].storage.x,y,3)).block.id,'minecraft:redstone_torch');inverted=!inverted;if((y-1)%4===0)assert(inverted,'Lock tap must be NOT open');}
 }
 for(const link of d.links){assert.deepEqual(link.path[0],d.banks[0].out[link.bit].position);assert.deepEqual(link.path.at(-1),d.banks[1].data[link.bit].position);let high=15;for(let i=1;i<link.path.length;i++){const prev=link.path[i-1],p=link.path[i],b=at(p).block;assert.equal(Math.abs(p.x-prev.x)+Math.abs(p.y-prev.y)+Math.abs(p.z-prev.z),1);if(b.id==='minecraft:repeater'){assert.deepEqual(add(prev,D[b.properties.facing]),p);high=15;}else{assert.equal(b.id,'minecraft:redstone_wire');if(at(prev).block.id==='minecraft:redstone_wire')high--;}assert(high>0);}links++;}
 return{supports,intended_side_locks:locks,connected_next_current_bits:links};
}
const d=makeStateBank();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));const base=check(d),variants=[];for(let width=1;width<=8;width++)for(const pair of[false,true])variants.push({width,pair,...check(makeStateBank({width,pair}))});
const wrong=structuredClone(d);wrong.blocks.find(v=>K(v.position)==='2,1,1').block.properties.facing='north';assert.throws(()=>check(wrong));
const cut=structuredClone(d);cut.blocks=cut.blocks.filter(v=>K(v.position)!=='11,1,0');assert.throws(()=>check(cut));
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');const result={status:'offline_retained_control_banks_structurally_checked',blocks:d.blocks.length,stored_bits:d.metrics.stored_bits,...base,width_and_pair_variants:variants,corruption_refusals:2,sources:{generator:sha('../../../../hardware/full-gpu-state-bank.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['Structural direction/polarity/attenuation review is not dynamic latch simulation.','No claim that phase pulses reach local locks simultaneously or never overlap.','Explicit physical zero initialization and safe full-cycle phase generator still required.']};writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,width_and_pair_variants:variants.length}));
