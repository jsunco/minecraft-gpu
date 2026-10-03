import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeSignalDescent} from '../../../hardware/full-gpu-signal-descent.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,D={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},pair=(a,b)=>[K(a),K(b)].sort().join('|');
function check(d){const m=new Map(d.blocks.map(v=>[K(v.position),v])),allowed=new Set(d.path.slice(1).map((p,i)=>pair(d.path[i],p)));let supports=0,contacts=0,minPower=15,signal=15;
 assert.equal(m.size,d.blocks.length);assert.equal(d.path[0].y-d.path.at(-1).y,d.drop);
 for(const[i,p]of d.path.entries()){const b=m.get(K(p))?.block;assert(b);assert.equal(m.get(K({...p,y:p.y-1}))?.block.id,'minecraft:light_gray_concrete');supports++;if(b.id==='minecraft:repeater'){
   const[dx,dz]=D[b.properties.facing];assert.deepEqual(d.path[i+1],{x:p.x+dx,y:p.y,z:p.z+dz});assert.deepEqual(d.path[i-1],{x:p.x-dx,y:p.y,z:p.z-dz});assert(signal>0);minPower=Math.min(minPower,signal);signal=15;
   for(const[sx,sz]of Object.values(D).filter(([x,z])=>x*dx+z*dz===0))assert(!m.has(K({x:p.x+sx,y:p.y,z:p.z+sz})),'Unexpected diode side');
  }else{assert.equal(b.id,'minecraft:redstone_wire');if(i&&m.get(K(d.path[i-1])).block.id==='minecraft:redstone_wire')signal--;assert(signal>0);
   for(const[dx,dz]of Object.values(D))for(const dy of[-1,0,1]){const q={x:p.x+dx,y:p.y+dy,z:p.z+dz},other=m.get(K(q));if(!other||other.block.id.endsWith('_concrete'))continue;if(dy&&other.block.id!=='minecraft:redstone_wire')continue;if(dy===1&&m.has(K({...p,y:p.y+1})))continue;if(dy===-1&&m.has(K({...q,y:p.y})))continue;assert(allowed.has(pair(p,q)),'Unintended shortcut '+pair(p,q));contacts++;}
  }
 }
 return{support_checks:supports,listed_wire_contacts:contacts,minimum_repeater_input_power:minPower};}
let cases=0;for(let drop=1;drop<=350;drop++){check(makeSignalDescent({drop}));cases++;}
const d=makeSignalDescent(),checks=check(d);const reverse=structuredClone(d);reverse.blocks.find(v=>v.block.id==='minecraft:repeater').block.properties.facing='east';assert.throws(()=>check(reverse));const cut=structuredClone(d);cut.blocks=cut.blocks.filter(v=>K(v.position)!==K(cut.path[17]));assert.throws(()=>check(cut));
writeFileSync(new URL('./design.json',import.meta.url),JSON.stringify(d)+'\n');const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');const result={status:'offline_folded_signal_path_static_checks_pass',...d.metrics,drop:d.drop,...checks,drop_variants_checked:cases,corruption_refusals:2,sources:{generator:sha('../../../hardware/full-gpu-signal-descent.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['Listed local connectivity and normalized steady-high attenuation only; no game update simulation.','The repeaters consume80nominalredstone-delay settings for235block descent; this does not establish edge latency or safe minimum pulse width.','Smaller XZ span trades extra flat/refresher blocks for height. Compare final arriving/leaving routes before selecting it globally.']};writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
