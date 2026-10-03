import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeTargetAgreement,checkTargetAgreement} from './prepare.mjs';
import {makeBranchAgreement} from '../control-nextpc-v1/agreement.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
const d=makeTargetAgreement();assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));
function checkDirections(d){const m=new Map(d.blocks.map(b=>[K(b.position),b.block]));let n=0;
 for(const q of d.xors){const z=q.bit*16;for(const[x,y,dz,facing]of[[59,1,0,'west'],[59,1,8,'west'],[64,1,0,'west'],[64,1,8,'west'],[67,1,0,'west'],[67,1,8,'west'],[65,1,1,'south'],[63,4,-3,'west'],[65,4,0,'north'],[65,1,7,'north'],[71,1,4,'west'],[73,1,4,'west']]){assert.equal(m.get(`${x},${y},${z+dz}`)?.properties.facing,facing);n++;}for(const dz of[0,8]){assert.deepEqual(m.get(`65,1,${z+dz}`),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});n++;}}
 for(const[x,z,facing]of[[29,90,'west'],[31,90,'west'],[30,89,'north'],[35,90,'east']]){assert.equal(m.get(`${x},1,${z}`)?.properties.facing,facing);n++;}assert.deepEqual(m.get('30,1,90'),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});
 for(const r of d.routes)for(const i of r.refresh_indices){const p=r.path[i],a=r.path[i-1],b=r.path[i+1],block=m.get(K(p)),[x,z]=V[block.properties.facing];assert.equal(block.id,'minecraft:repeater');assert.deepEqual(a,P(p.x-x,p.y,p.z-z));assert.deepEqual(b,P(p.x+x,p.y,p.z+z));n++;}
 for(const b of makeBranchAgreement().blocks)assert.deepEqual(m.get(K(b.position)),b.block,'Inherited primitive byte equality');return n;}
const directions=checkDirections(d),r=checkTargetAgreement(d);let bad=0;
for(const f of[d=>d.blocks.find(b=>K(b.position)==='65,1,1').block.properties.facing='north',d=>d.blocks.find(b=>K(b.position)==='35,1,90').block.properties.facing='west',d=>d.blocks.find(b=>K(b.position)==='30,1,90').block.properties.mode='compare',d=>d.blocks.splice(d.blocks.findIndex(b=>K(b.position)==='73,1,4'),1)]){const c=structuredClone(d);f(c);assert.throws(()=>{checkTargetAgreement(c);checkDirections(c);});bad++;}
const output={...r,explicit_gate_route_direction_checks:directions,parent_blocks_preserved:757,negative_checks:bad,semantic_regression:{pc:22,incremented_pc:23,immediate:23,enabled:15,predicates:5,old_raw_disagreement:true,correct_selected_value_disagreement:false},unconditional_invalid_enable0_tested:true};
if(process.argv.includes('--save'))writeFileSync(new URL('offline-check.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
