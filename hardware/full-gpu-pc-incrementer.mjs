// Offline-only eight-bit PC+1 geometry. No game connection or runtime computation.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makePcIncrementer(){
 const map=new Map(),halves=[],links=[],ports={};let part='';
 function put(p,id,properties){const block={id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'Conflicting cell '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const dev=(p,id,props)=>{put({...p,y:p.y-1},'light_gray_concrete');put(p,id,props);};
 const w=p=>dev(p,'redstone_wire'),r=(p,travel)=>dev(p,'repeater',{facing:F[travel],delay:'1'});
 function line(a,b){assert.equal(['x','y','z'].filter(k=>a[k]!==b[k]).length,1);const n=Math.abs(a.x-b.x)+Math.abs(a.z-b.z);assert.equal(a.y,b.y);for(let i=0;i<=n;i++)w(P(a.x+Math.sign(b.x-a.x)*i,a.y,a.z+Math.sign(b.z-a.z)*i));}
 const inputs=[],outputs=[];
 for(let bit=0;bit<8;bit++){
  const back=bit>=4,ox=back?58-16*(bit-4):16*bit,oz=back?32:0;
  const at=(x,y,z)=>P(ox+(back?-x:x),1+y,oz+(back?-z:z));
  const travel=d=>back?{east:'west',west:'east',north:'south',south:'north'}[d]:d;
  const wire=(x,y,z)=>w(at(x,y,z)),rep=(x,y,z,d)=>r(at(x,y,z),travel(d));
  const cmp=(x,z)=>dev(at(x,0,z),'comparator',{facing:F[travel('east')],mode:'subtract'});
  const ln=(x1,z1,x2,z2,y=0)=>line(at(x1,y,z1),at(x2,y,z2));
  part=`half_${bit}`;
  for(const z of[0,8]){ln(0,z,3,z);rep(4,0,z,'east');cmp(5,z);wire(6,0,z);rep(7,0,z,'east');ln(8,z,9,z);}
  ln(1,8,1,2);ln(1,2,5,2);rep(5,0,1,'north');
  for(let k=1;k<=3;k++)wire(1,k,-k);
  ln(1,-3,5,-3,3);ln(5,-3,5,3,3);
  // Replace planned dust with the two isolation/refresh repeaters.
  for(const[x,z,d]of[[3,-3,'east'],[5,0,'south']]){map.delete(K(at(x,3,z)));rep(x,3,z,d);}
  for(let k=1;k<=3;k++)wire(5,3-k,3+k);
  rep(5,0,7,'south');ln(9,0,9,8);wire(10,0,4);
  ln(1,8,1,12);ln(1,12,3,12);rep(4,0,12,'east');cmp(5,12);wire(6,0,12);rep(7,0,12,'east');wire(8,0,12);
  ln(6,8,6,10);wire(5,0,10);rep(5,0,11,'south');
  part=`pc_input_${bit}`;wire(-2,0,0);rep(-1,0,0,'east');
  part=`pc_plus_one_${bit}`;rep(11,0,4,'east');wire(12,0,4);
  inputs.push({bit,position:at(-2,0,0),receiver:at(-1,0,0),travel:back?P(-1,0,0):P(1,0,0)});
  outputs.push({bit,position:at(12,0,4),source:at(11,0,4),travel:back?P(-1,0,0):P(1,0,0)});
  halves.push({bit,origin:at(0,0,0),half_turn:back,a:at(0,0,0),b:at(0,0,8),sum:at(10,0,4),carry:at(8,0,12)});
 }
 // One fixed carry-in; no writable bit here and no host-provided increment.
 part='constant_one';dev(P(-2,1,8),'redstone_block');r(P(-1,1,8),'east');
 for(let bit=0;bit<7;bit++){
  part=`carry_${bit}_${bit+1}`;const a=halves[bit].carry,b=halves[bit+1].b;let path=[];
  function seg(from,to){const n=Math.abs(from.x-to.x)+Math.abs(from.z-to.z);assert.equal(from.y,to.y);for(let i=0;i<=n;i++){
   const p=P(from.x+Math.sign(to.x-from.x)*i,from.y,from.z+Math.sign(to.z-from.z)*i);if(!path.length||K(path.at(-1))!==K(p))path.push(p);if(!map.has(K(p)))w(p);
  }}
  let refresh=[];
  if(bit===3){seg(a,P(62,1,12));seg(P(62,1,12),P(62,1,24));seg(P(62,1,24),b);refresh=[{p:P(62,1,18),d:'south'},{p:P(59,1,24),d:'west'}];}
  else{const step=bit<3?1:-1;seg(a,P(a.x+3*step,1,a.z));seg(P(a.x+3*step,1,a.z),P(a.x+3*step,1,b.z));seg(P(a.x+3*step,1,b.z),b);refresh=[{p:P(b.x-2*step,1,b.z),d:step===1?'east':'west'}];}
  for(const{p,d}of refresh){map.delete(K(p));r(p,d);}
  links.push({from_bit:bit,to_bit:bit+1,path,refresh:refresh.map(v=>v.p)});
 }
 ports.pc={direction:'input',width:8,bit_order:'lsb_first',polarity:'active_high',meaning:'Shared core PC held stable through settled increment and UPDATE capture.',bits:inputs};
 ports.incremented_pc={direction:'output',width:8,bit_order:'lsb_first',polarity:'active_high',meaning:'(PC+1) modulo256, combinational; carry beyond bit7 discarded.',bits:outputs};
 const blocks=[...map.values()],box={from:{},to:{}};for(const axis of['x','y','z']){box.from[axis]=Math.min(...blocks.map(b=>b.position[axis]));box.to[axis]=Math.max(...blocks.map(b=>b.position[axis]));}
 return{status:'offline_connected_pc_incrementer_native_unverified',blocks,ports,halves,links,box,metrics:{blocks:blocks.length,half_adders:8,carry_links:7,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,source_reference:{path:'hardware/compact-adder.mjs',sha256:createHash('sha256').update(readFileSync(new URL('./compact-adder.mjs',import.meta.url))).digest('hex'),derivation:'Eight copies of its single half-adder topology with sparse supports, no manual levers, isolated PC input/output terminals and a physically connected serpentine carry chain.'},limits:['Shared incrementer is once per core; each lane retains own comparison flags and branch decision.','PC input changes may create transients. Capture only after measured worst-case settle; timing is not established offline.','The constant carry-in produces modulo256 increment. No host arithmetic in the running circuit.','Global/core placement, PC register routes and branch selector routes are external.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makePcIncrementer();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
