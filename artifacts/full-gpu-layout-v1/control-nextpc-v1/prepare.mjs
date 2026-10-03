// Per-lane retained CMP flags and physical branch predicate. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',south:'north',north:'south'},V={east:[1,0],west:[-1,0],south:[0,1],north:[0,-1]};
const step=(p,d)=>P(p.x+V[d][0],p.y,p.z+V[d][1]);
export function makeBranchLane(){
 const map=new Map(),edges=[],cells=[],terms=[],sources=[],ports={};
 const edge=(a,b,kind='signal')=>edges.push({from:a,to:b,kind}),join=ps=>{for(let i=1;i<ps.length;i++)edge(ps[i-1],ps[i]);};
 function put(x,z,id,props,part,y=1){const p=P(x,y,z),block={id:'minecraft:'+id,...(props?{properties:props}:{})};assert(!map.has(K(p)),'collision '+K(p));map.set(K(p),{position:p,block,part});}
 const solid=(x,z,part,y=0)=>put(x,z,'light_gray_concrete',undefined,part,y);
 function dev(x,z,id,props,part){solid(x,z,part+'_support');put(x,z,id,props,part);}
 const wire=(x,z,part)=>dev(x,z,'redstone_wire',undefined,part),rep=(x,z,d,part)=>dev(x,z,'repeater',{facing:F[d],delay:'1'},part);
 function line(x1,z1,x2,z2,part){assert(x1===x2||z1===z2);const n=Math.abs(x2-x1)+Math.abs(z2-z1),ps=[];for(let i=0;i<=n;i++){const x=x1+Math.sign(x2-x1)*i,z=z1+Math.sign(z2-z1)*i;if(!map.has(K(P(x,1,z))))wire(x,z,part);ps.push(P(x,1,z));}join(ps);return ps;}
 for(let b=0;b<3;b++){
  const z=16*b,bit={bit:b,name:['P','Z','N'][b],data:P(-2,1,z),driver:P(1,1,z),storage:P(2,1,z),lock:P(2,1,z+1),q:P(-5,1,z-2),output:P(-5,1,z-4),mask:P(-9,1,z-12)};
  wire(-2,z,'cmp_data');rep(-1,z,'east','data_isolate');wire(0,z,'local_data');rep(1,z,'east','data_driver');rep(2,z,'east','flag_store');wire(3,z,'local_q');join([-2,-1,0,1,2,3].map(x=>P(x,1,z)));
  rep(3,z-1,'north','q_isolate');edge(P(3,1,z),P(3,1,z-1));const qpath=line(3,z-2,-3,z-2,'q_path');edge(P(3,1,z-1),qpath[0]);rep(-4,z-2,'west','q_export');wire(-5,z-2,'q_terminal');join([qpath.at(-1),P(-4,1,z-2),bit.q]);
  rep(-5,z-3,'north','flag_export');wire(-5,z-4,'flag_out');join([bit.q,P(-5,1,z-3),bit.output]);
  rep(2,z+1,'north','lock');rep(5,z+2,'west','lock_branch');const lockpath=line(4,z+2,2,z+2,'lock_dust');join([P(6,1,z+2),P(5,1,z+2),...lockpath,P(2,1,z+1)]);edge(bit.lock,bit.storage,'lock_side');
  // Q AND mask = Q - !mask, with both comparator inputs normalized to15.
  rep(-6,z-2,'west','term_input');wire(-7,z-2,'term_data');rep(-8,z-2,'west','term_rear');dev(-9,z-2,'comparator',{facing:'east',mode:'subtract'},'term');rep(-10,z-2,'west','term_output');const outpath=line(-11,z-2,-14,z-2,'term_to_or');join([bit.q,P(-6,1,z-2),P(-7,1,z-2),P(-8,1,z-2),P(-9,1,z-2),P(-10,1,z-2),...outpath]);
  wire(-9,z-12,'mask_input');rep(-9,z-11,'south','mask_inverter_input');solid(-9,z-10,'mask_inverter_floor');solid(-9,z-10,'mask_inverter_support',1);put(-9,z-9,'redstone_wall_torch',{facing:'south'},'mask_not');wire(-9,z-8,'mask_not_pad');rep(-9,z-7,'south','mask_normalize');const mp=line(-9,z-6,-9,z-4,'mask_wire');rep(-9,z-3,'south','term_side');join([bit.mask,P(-9,1,z-11),P(-9,1,z-10)]);join([P(-9,1,z-9),P(-9,1,z-8),P(-9,1,z-7),...mp,P(-9,1,z-3),P(-9,1,z-2)]);
  cells.push(bit);terms.push({bit:b,comparator:P(-9,1,z-2),data:P(-8,1,z-2),mask:P(-9,1,z-3),output:P(-10,1,z-2)});
 }
 // One active-high CMP-qualified open source; low closes the three flag stores.
 wire(6,-7,'flags_open');rep(6,-6,'south','flags_open_isolator');solid(6,-5,'hold_floor');solid(6,-5,'hold_support',1);put(6,-4,'redstone_wall_torch',{facing:'south'},'hold_not');wire(6,-3,'hold_pad');rep(6,-2,'south','hold_driver');join([P(6,1,-7),P(6,1,-6),P(6,1,-5)]);join([P(6,1,-4),P(6,1,-3),P(6,1,-2)]);
 let prev=P(6,1,-2);for(let z=-1;z<=34;z++){if([11,23].includes(z))rep(6,z,'south','hold_refresh');else wire(6,z,'hold_rail');edge(prev,P(6,1,z));prev=P(6,1,z);}
 // Isolated terms OR into a refreshed southbound collector; never backfeed Q.
 prev=P(-14,1,-2);for(let z=-1;z<=40;z++){if([4,16,28,40].includes(z))rep(-14,z,'south','or_refresh');else if(!map.has(K(P(-14,1,z))))wire(-14,z,'or_wire');edge(prev,P(-14,1,z));prev=P(-14,1,z);}
 rep(-14,41,'south','or_normalize');wire(-14,42,'or_pad');rep(-14,43,'south','branch_rear');dev(-14,44,'comparator',{facing:'north',mode:'subtract'},'branch_gate');rep(-14,45,'south','branch_out');wire(-14,46,'branch_terminal');join([prev,...[41,42,43,44,45,46].map(z=>P(-14,1,z))]);
 // branch_enable is decoded BR AND actual lane enable from qualified control.
 wire(-19,44,'branch_enable');rep(-18,44,'east','enable_input');solid(-17,44,'enable_floor');solid(-17,44,'enable_support',1);put(-16,44,'redstone_wall_torch',{facing:'east'},'not_enable');rep(-15,44,'east','enable_mask');join([P(-19,1,44),P(-18,1,44),P(-17,1,44)]);join([P(-16,1,44),P(-15,1,44),P(-14,1,44)]);
 function port(name,direction,bits){ports[name]={direction,width:bits.length,bit_order:'LSB_first',polarity:'active_high',geometry_status:'complete_local_component_native_unverified',bits:bits.map((p,bit)=>({bit,position:p,...(direction==='output'?{high_power:15}:{required_high_power:15})}))};}
 port('cmp_nzp','input',cells.map(c=>c.data));port('flags_open','input',[P(6,1,-7)]);port('branch_mask','input',cells.map(c=>c.mask));port('branch_enable','input',[P(-19,1,44)]);port('nzp','output',cells.map(c=>c.output));port('branch_taken','output',[P(-14,1,46)]);
 const blocks=[...map.values()],histogram={},box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=Math.min(...blocks.map(b=>b.position[a]));box.to[a]=Math.max(...blocks.map(b=>b.position[a]));}for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 return{status:'retained_flags_and_branch_predicate_offline_native_unverified',blocks,box,ports,cells,terms,edges,metrics:{blocks:blocks.length,stored_bits:3,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},protocol:{update:'Only qualified enabled CMP UPDATE opens flags. Hold ALU low3 stable through all three lock closures. Other opcodes never open.',branch:'At EXECUTE, held flags AND held instruction mask feed OR. Qualified branch_enable includes BR and lane enable. Retain mask/flags until agreement and PC selection close.',reset:'No internal forcing/asynchronous clamp. Before launch and with all effects invalid, write real zero CMP-data through flags_open and close. Default placement is not initialization.'},missing:['Three CMP data routes, mask/phase/lane enable producers and intermodule fanout.','Core-wide active-lane branch agreement, PC selection/storage and fetch sequencing.','Measured setup/hold, rise/fall, reset and output-loading acceptance.'],complete_gpu:false,native_acceptance:false};
}
export function checkBranchLane(d){
 const m=new Map(d.blocks.map(b=>[K(b.position),b]));assert.equal(m.size,d.blocks.length);const allowed=new Set(d.edges.map(e=>[K(e.from),K(e.to)].sort().join('|')));let supports=0,contacts=0,sides=0;
 for(const b of d.blocks){if(b.block.id.endsWith('_concrete'))continue;let p=P(b.position.x,0,b.position.z);if(b.block.id==='minecraft:redstone_wall_torch'){const dir=b.block.properties.facing,offset=V[dir];p=P(b.position.x-offset[0],1,b.position.z-offset[1]);}assert.equal(m.get(K(p))?.block.id,'minecraft:light_gray_concrete');supports++;}
 for(const b of d.blocks.filter(b=>b.block.id==='minecraft:redstone_wire'))for(const[x,z]of Object.values(V)){const p=P(b.position.x+x,1,b.position.z+z),other=m.get(K(p));if(other&&!other.block.id.endsWith('_concrete'))assert(allowed.has([K(b.position),K(p)].sort().join('|')),'foreign dust '+K(b.position)+' '+K(p));contacts++;}
 for(const b of d.blocks.filter(b=>['minecraft:repeater','minecraft:comparator'].includes(b.block.id))){const dir=Object.keys(F).find(d=>F[d]===b.block.properties.facing),[dx,dz]=V[dir];for(const[x,z]of[[dz,dx],[-dz,-dx]]){const p=P(b.position.x+x,1,b.position.z+z),o=m.get(K(p));if(o&&['minecraft:repeater','minecraft:comparator'].includes(o.block.id))assert(allowed.has([K(b.position),K(p)].sort().join('|')),'foreign diode side');sides++;}}
 for(const c of d.cells){const p=P(5,1,c.storage.z+2);assert.equal(m.get(K(p)).block.properties.facing,'east');assert.equal(K(step(p,'east')),K(P(6,1,c.storage.z+2)));assert.equal(K(step(p,'west')),K(P(4,1,c.storage.z+2)));assert.equal(m.get(K(c.lock)).block.properties.facing,'south');assert.equal(K(step(c.lock,'north')),K(c.storage));}
 let cases=0;for(let flags=0;flags<8;flags++)for(let mask=0;mask<8;mask++)for(let enable=0;enable<2;enable++){let or=0;for(let b=0;b<3;b++){const q=(flags>>>b)&1,m=(mask>>>b)&1,term=Math.max(15*q-15*(1-m),0);or|=+(term>0);}const result=+(Math.max(15*or-15*(1-enable),0)>0);assert.equal(result,+!!(enable&&(flags&mask)));cases++;}
 return{status:'author_static_branch_checks_passed',...d.metrics,support_checks:supports,dust_neighbor_screens:contacts,diode_side_faces:sides,truth_cases:cases,lock_direction_checks:3,native_calls:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeBranchLane(),r=checkBranchLane(d);if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(new URL('branch-lane.json',import.meta.url))),d);else{writeFileSync(new URL('branch-lane.json',import.meta.url),JSON.stringify(d)+'\n');writeFileSync(new URL('branch-lane-check.json',import.meta.url),JSON.stringify(r,null,2)+'\n');}console.log(JSON.stringify(r,null,2));}
