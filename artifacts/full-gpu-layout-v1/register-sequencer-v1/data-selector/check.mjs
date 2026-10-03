// Focused static topology + bounded settled-value evaluation. Not Minecraft.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeRegisterDataSelector} from '../../../../hardware/full-gpu-register-data-selector.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},dirs=Object.values(D);
const d=makeRegisterDataSelector();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
function check(blocks){const m=new Map(blocks.map(v=>[K(v.position),v.block])),at=p=>m.get(K(p)),type=(p,id)=>assert.equal(at(p)?.id,'minecraft:'+id,K(p));
 let supports=0,lockedSides=0,torchStages=0;for(const v of blocks){if(v.block.id==='minecraft:light_gray_concrete')continue;type({...v.position,y:v.position.y-1},'light_gray_concrete');supports++;}
 const repeater=(p,output)=>{type(p,'repeater');assert.deepEqual(add(p,D[at(p).properties.facing]),output,'Wrong device direction '+K(p));};
 repeater(P(1,0,-3),P(2,0,-3));repeater(P(9,-2,0),P(8,-2,0));
 for(const[x,z,base]of[[2,-3,0],[8,0,-2]])for(let y=base;y<=28;y+=2){type(P(x,y,z),'light_gray_concrete');type(P(x,y+1,z),'redstone_torch');torchStages++;}
 for(let bit=0;bit<8;bit++){const y=1+4*bit;type(P(0,y,0),'redstone_wire');repeater(P(1,y,0),P(2,y,0));type(P(2,y,0),'comparator');assert.deepEqual(at(P(2,y,0)).properties,{facing:'west',mode:'subtract'});
  type(P(2,y,-2),'redstone_wire');repeater(P(2,y,-1),P(2,y,0));type(P(3,y,0),'redstone_wire');repeater(P(4,y,0),P(5,y,0));type(P(5,y,0),'redstone_wire');type(P(7,y,0),'redstone_wire');repeater(P(6,y,0),P(5,y,0));repeater(P(5,y,1),P(5,y,2));type(P(5,y,2),'redstone_wire');
 }
 // Only the intended normalized side feeds may touch a diode. Repeaters must
 // never be side-locked; comparator's opposite side remains clear.
 for(const v of blocks.filter(v=>['minecraft:repeater','minecraft:comparator'].includes(v.block.id))){const delta=D[v.block.properties.facing];for(const side of dirs.filter(s=>s.x*delta.x+s.z*delta.z===0)){const q=add(v.position,side),neighbor=at(q);if(!neighbor||neighbor.id==='minecraft:light_gray_concrete')continue;assert(v.block.id==='minecraft:comparator'&&neighbor.id==='minecraft:repeater'&&q.z===v.position.z-1,'Foreign diode side');lockedSides++;}}
 assert.equal(lockedSides,8);
 // Inversion polarity is computed from the actual tower torch list, then each
 // normalized subtract/isolated-OR slice is evaluated. It is a settled model.
 const invertColumn=(x,z,base,input)=>{const taps=new Map();let power=input;for(let y=base;y<=28;y+=2){assert(at(P(x,y+1,z)).id.endsWith(':redstone_torch'));power=power?0:15;taps.set(y+1,power);}return taps;};
 let cases=0;for(let pass=0;pass<2;pass++)for(let fill=0;fill<2;fill++){const mask=invertColumn(2,-3,0,pass*15),fillPower=invertColumn(8,0,-2,fill*15);for(let wb=0;wb<256;wb++){let actual=0;for(let bit=0;bit<8;bit++){const y=1+4*bit,rear=(wb>>bit&1)*15,selected=Math.max(0,rear-mask.get(y)),out=Math.max(selected,fillPower.get(y));actual|=(out>0?1:0)<<bit;}assert.equal(actual,fill?255:pass?wb:0);cases++;}}
 return{supports,comparator_intended_side_contacts:lockedSides,torch_stages:torchStages,settled_selection_cases:cases};}
const checks=check(d.blocks);
const bad=structuredClone(d.blocks);bad.find(v=>K(v.position)==='2,1,-1').block.properties.facing='south';assert.throws(()=>check(bad));
const cut=d.blocks.filter(v=>K(v.position)!=='8,15,0');assert.throws(()=>check(cut));
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');const result={status:'offline_register_data_selection_topology_pass',blocks:d.blocks.length,...checks,corruption_refusals:2,sources:{generator:sha('../../../../hardware/full-gpu-register-data-selector.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['The model evaluates verified column polarity and settled normalized subtract/OR slices, not the entire Minecraft block-update engine.','Torch-column skew/burnout, dust direction changes and transient gate ordering still need native tests.','This source selector is only part of the missing physical register sequencer.']};writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
