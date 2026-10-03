// Read-only independent finite map/contact check; not a block-update simulator.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRegisterDataSelector} from '../../../../hardware/full-gpu-register-data-selector.mjs';
const d=makeRegisterDataSelector();
assert.deepEqual(d,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const K=p=>`${p.x},${p.y},${p.z}`, P=(x,y,z)=>({x,y,z}), plus=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z);
const m=new Map(d.blocks.map(v=>[K(v.position),v.block]));assert.equal(m.size,262);
const at=p=>m.get(K(p)), type=(p,id)=>assert.equal(at(p)?.id,'minecraft:'+id,K(p));
const dirs=[P(1,0,0),P(-1,0,0),P(0,0,1),P(0,0,-1)];
const travel={west:dirs[0],east:dirs[1],north:dirs[2],south:dirs[3]};
let support=0,wireEdges=0,sideContacts=0,rearSolids=0;
for(const v of d.blocks){const p=v.position,b=v.block;if(!b.id.endsWith(':light_gray_concrete')){type(plus(p,P(0,-1,0)),'light_gray_concrete');support++;}
 if(b.id.endsWith(':redstone_wire'))for(const dir of dirs)for(const dy of [-1,0,1]){const q=plus(plus(p,dir),P(0,dy,0));if(at(q)?.id.endsWith(':redstone_wire'))wireEdges++;}
 if(/:(repeater|comparator)$/.test(b.id)){
  const t=travel[b.properties.facing],rear=plus(p,P(-t.x,0,-t.z));
  // No gate gets its rear value through a solid: this rules out a concealed
  // neighboring strong-source input bypass in this particular map.
  if(at(rear)?.id.endsWith(':light_gray_concrete'))rearSolids++;
  for(const s of dirs.filter(a=>a.x*t.x+a.z*t.z===0)){const q=plus(p,s),nb=at(q);if(!nb||nb.id.endsWith(':light_gray_concrete'))continue;
   assert(b.id.endsWith(':comparator')&&q.x===2&&q.z===-1&&nb.id.endsWith(':repeater')&&nb.properties.facing==='north');sideContacts++;
  }
 }
}
assert.equal(wireEdges,0);assert.equal(sideContacts,8);assert.equal(rearSolids,0);
// Each standing torch is powered only by its support. The column support has
// exactly its immediately lower torch (or the base input diode) as a possible
// neighboring DIRECT source. Side support blocks do not recursively relay it.
let stages=0;
for(const [x,z,base,input] of [[2,-3,0,P(1,0,-3)],[8,0,-2,P(9,-2,0)]])for(let y=base;y<=28;y+=2){
 const p=P(x,y,z);type(p,'light_gray_concrete');type(P(x,y+1,z),'redstone_torch');
 const candidates=[];for(const t of [...dirs,P(0,-1,0),P(0,1,0)]){const q=plus(p,t),b=at(q);if(!b)continue;
  if(b.id.endsWith(':redstone_torch')&&q.y===y-1)candidates.push(K(q));
  if(/:(repeater|comparator)$/.test(b.id)&&K(plus(q,travel[b.properties.facing]))===K(p))candidates.push(K(q));
  if(b.id.endsWith(':redstone_wire'))candidates.push(K(q)); // conservative
 }
 assert.deepEqual(candidates,[K(y===base?input:P(x,y-1,z))]);stages++;
}
let vectors=0;
for(let pass=0;pass<2;pass++)for(let fill=0;fill<2;fill++)for(let wb=0;wb<256;wb++){
 let actual=0;
 for(let bit=0;bit<8;bit++){const y=1+4*bit;let mask=pass,ones=fill;
  for(let yy=0;yy<y;yy+=2)mask^=1;for(let yy=-2;yy<y;yy+=2)ones^=1;
  const selected=((wb>>bit)&1)&&!mask;actual|=Number(selected||ones)<<bit;
  type(P(2,y,-2),'redstone_wire');assert.equal(at(P(2,y,-1)).properties.facing,'north');
  assert.deepEqual(at(P(2,y,0)).properties,{facing:'west',mode:'subtract'});
  assert.equal(at(P(4,y,0)).properties.facing,'west');assert.equal(at(P(6,y,0)).properties.facing,'east');assert.equal(at(P(5,y,1)).properties.facing,'north');
 }
 assert.equal(actual,fill?255:pass?wb:0);vectors++;
}
console.log(JSON.stringify({status:'independent_static_pass',blocks:m.size,supports:support,torch_stages:stages,directed_same_or_step_wire_edges:wireEdges,intended_comparator_side_contacts:sideContacts,diode_rear_solid_shortcuts:rearSolids,settled_vectors:vectors,native_acceptance:false}));
