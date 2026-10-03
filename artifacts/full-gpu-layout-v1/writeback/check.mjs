import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeWritebackMux} from '../../../hardware/full-gpu-writeback.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),plus=(p,d,n=1)=>({x:p.x+d.x*n,y:p.y+d.y*n,z:p.z+d.z*n});
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},dirs=Object.values(D),S='minecraft:light_gray_concrete';
const d=makeWritebackMux();assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const map=new Map(d.blocks.map(v=>[K(v.position),v])),at=p=>map.get(K(p))?.block;
let supports=0,sides=0,dustEdges=0;
for(const v of d.blocks){const b=v.block,p=v.position;
 if(b.id===S)continue;let required={...p,y:p.y-1};
 if(b.id==='minecraft:redstone_wall_torch')required=plus(p,D[b.properties.facing]);
 assert.equal(at(required)?.id,S,'Support at '+K(p));supports++;
 if(b.id==='minecraft:repeater')for(const side of dirs.filter(s=>s.x*D[b.properties.facing].x+s.z*D[b.properties.facing].z===0)){assert(!at(plus(p,side))||at(plus(p,side)).id===S,'Diode side at '+K(p));sides++;}
}
function dustNet(v){const p=v.position,g=v.part;
 if(g==='select_columns')return 'select'+(p.x<0?0:1);
 if(g.startsWith('select_mismatch_')){const row=g.split('_').at(-1);return p.z===2?'mask'+row:`literal${row}_${p.x<6?0:1}`;}
 if(g.startsWith('mask_distribution_')||g.startsWith('mask_branch_'))return 'mask'+g.split('_')[2];
 if(g.startsWith('data_gate_'))return g+'_'+p.x;
 if(g==='output_collectors')return 'output'+p.z;
 throw Error('Unknown wire '+g);
}
for(const v of d.blocks.filter(v=>v.block.id==='minecraft:redstone_wire'))for(const dir of dirs)for(const dy of[-1,0,1]){
 const p=plus(v.position,dir);p.y+=dy;const other=map.get(K(p));if(other?.block.id!=='minecraft:redstone_wire')continue;
 if(dy===1&&at({...v.position,y:v.position.y+1}))continue;if(dy===-1&&at({...p,y:v.position.y}))continue;
 assert.equal(dustNet(v),dustNet(other),'Foreign dust contact '+K(v.position)+' > '+K(p));dustEdges++;
}
// Exact flat mask/data routes only: vanilla dust loses one strength per edge,
// repeaters take their rear input and refresh to15. This is not a simulator.
function propagate(start){const power=new Map([[K(start),15]]),todo=[start];
 for(let i=0;i<todo.length;i++){const p=todo[i],b=at(p),n=power.get(K(p));
  const out=b?.id==='minecraft:repeater'?[D[b.properties.facing]]:dirs;
  for(const dir of out){const q=plus(p,dir),qb=at(q);let next;
   if(qb?.id==='minecraft:redstone_wire')next=b.id==='minecraft:repeater'?15:n-1;
   else if(qb?.id==='minecraft:repeater'&&K(D[qb.properties.facing])===K(dir))next=n>0?15:0;
   else continue;
   if(next>0&&next>(power.get(K(q))??0)){power.set(K(q),next);todo.push(q);}
  }
 }return power;
}
let masks=0,dataPaths=0;
for(let row=0;row<3;row++){
 const y=1+row*8,reached=propagate(P(6,y,1));
 for(let bit=0;bit<8;bit++){
  const z=8+bit*8;assert.equal(reached.get(K(P(24,y,z-1))),15,'Mask not refreshed');masks++;
  const data=propagate(d.ports[['alu','lsu','immediate'][row]].bits[bit].position);assert.equal(data.get(K(P(23,y,z))),15);dataPaths++;
  const cmp=at(P(24,y,z));assert.equal(cmp.id,'minecraft:comparator');assert.deepEqual(cmp.properties,{facing:'west',mode:'subtract'});
  assert.equal(at(P(24,y,z+1)),undefined);assert.deepEqual(at(P(25,y,z)).properties,{facing:'west',delay:'1'});
  assert.equal(at(P(26,y,z)).id,S);
 }
}
// Static logical gate expansion from each actual row target and comparator.
//32 select+three-data combinations per bit; this is settled truth, not timing.
let cases=0;
for(let select=0;select<4;select++)for(let inputs=0;inputs<8;inputs++)for(let bit=0;bit<8;bit++){
 let actual=0;
 for(let row=0;row<3;row++){
  const y=1+8*row;let mismatch=0;
  for(let b=0;b<2;b++){
   const x=b?12:0,step=b?-1:1;const inverted=at(P(x+2*step,y,0)).id===S;
   assert.equal(inverted,!!(row&(1<<b)));mismatch|=inverted?1-((select>>b)&1):(select>>b)&1;
  }
  const rear=((inputs>>row)&1)*15,side=mismatch*15;actual|=Number(Math.max(0,rear-side)>0);
 }
 assert.equal(actual,select===3?0:(inputs>>select)&1);cases++;
}
for(let bit=0;bit<8;bit++){const z=8+8*bit;for(let y=1;y<=20;y++)assert.equal(at(P(26,y,z)).id,y%2?S:'minecraft:redstone_torch');assert.deepEqual(at(P(27,20,z)).properties,{facing:'west',delay:'1'});}
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const report={status:'offline_geometry_and_settled_logic_checks_passed',supports,repeater_side_faces:sides,directed_dust_contact_edges:dustEdges,refreshed_mask_routes:masks,refreshed_data_routes:dataPaths,settled_bit_cases:cases,blocks:d.blocks.length,
 sources:{generator:sha('../../../hardware/full-gpu-writeback.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},
 limitations:['Route check covers flat dust/repeater mask and data paths, not all vanilla weak/strong power behavior.','Known positive-column topology checked structurally; no dynamic torch propagation or burnout simulation.','All input timing/skew/closure/loaded output behavior requires native validation.'],native_acceptance:false};
writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
