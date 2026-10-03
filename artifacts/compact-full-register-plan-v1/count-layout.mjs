// Coordinate accounting only: no build plans, service construction or native calls.
import assert from 'node:assert/strict';
import {makeAddressDecoder4} from '../../hardware/address-decoder4.mjs';
import {makeDenseOperands} from '../../hardware/dense-operand-capture.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const cells=new Map(),key=p=>`${p.x},${p.y},${p.z}`,facing={east:'west',west:'east',north:'south',south:'north'};
let group='';
function put(x,y,z,id,properties){const next={position:{x,y,z},block:{id:'minecraft:'+id,...(properties?{properties}:{})},group},k=key(next.position);assert(!cells.has(k),'duplicate/collision '+k);cells.set(k,next);}
const solid=(x,y,z)=>put(x,y,z,'light_gray_concrete');
const comp=(x,y,z,id,properties)=>{solid(x,y-1,z);put(x,y,z,id,properties);};
const wire=(x,y,z)=>comp(x,y,z,'redstone_wire');
const rep=(x,y,z,travel)=>comp(x,y,z,'repeater',{facing:facing[travel],delay:'1'});
const cmp=(x,y,z,travel)=>comp(x,y,z,'comparator',{facing:facing[travel],mode:'subtract'});
const lever=(x,y,z)=>comp(x,y,z,'lever',{face:'floor',facing:'west',powered:'false'});
const tower=(x,z,lo,hi)=>{for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(x,y,z,'redstone_torch');};
const decoder=makeAddressDecoder4({origin:{x:0,y:0,z:0},id:'account_only'});
for(const read of[false,true]){
 group=read?'read_decoder':'write_decoder';
 for(const v of decoder.blocks){const{x,y,z}=v.position,props={...v.block.properties};let name=v.block.id.slice(10);
  if(x===7&&z===6&&name==='redstone_wall_torch'){name='repeater';delete props.facing;props.facing='west';props.delay='1';}
  if(read&&props.facing)props.facing=({east:'west',west:'east'})[props.facing]??props.facing;
  put(read?30-x:x-18,y,z-18,name,Object.keys(props).length?props:undefined);
 }
 for(let w=0;w<16;w++)solid(read?23:-11,8*w,-12);
}
group='ordinary_data_columns';
for(let bit=0;bit<8;bit++){const r=bit>=4,z=8*(bit%4),x=r?12:0;lever(r?14:-2,1,z);rep(r?13:-1,1,z,r?'west':'east');solid(x,0,z);tower(x,z,1,97);}
group='ordinary_write_enable';lever(6,1,-16);rep(6,1,-15,'south');solid(6,0,-14);tower(6,-14,1,97);
group='block_id_adapters';
for(let bit=0;bit<8;bit++){const r=bit>=4,z=8*(bit%4),x=r?12:0;lever(r?14:-2,105,z);rep(r?13:-1,105,z,r?'west':'east');solid(x,104,z);solid(x,105,z);}
group='assignment_adapter';lever(6,105,-16);rep(6,105,-15,'south');solid(6,104,-14);solid(6,105,-14);
for(let w=0;w<16;w++){
 const y=1+8*w,ry=y+4;
 if(w<14){
  group='write_headers';rep(6,y,-13,'south');cmp(6,y,-12,'south');solid(6,y,-11);put(6,y,-10,'redstone_wall_torch',{facing:'south'});
  group='hold_rails';for(let z=-9;z<=26;z++)if([-7,5,17].includes(z))rep(6,y,z,'south');else wire(6,y,z);
 }
 if(w<13){group='write_mismatch_feeds';for(let x=-8;x<=0;x++)wire(x,y,-12);rep(1,y,-12,'east');for(let x=2;x<=4;x++)wire(x,y,-12);rep(5,y,-12,'east');}
 group='read_inhibit_rise';wire(20,y,-12);for(let n=1;n<=4;n++)wire(20-n,y+n,-12);wire(15,ry,-12);
 group='read_inhibit_trunk';for(let z=-11;z<=18;z++)if([-7,5,17].includes(z))rep(15,ry,z,'south');else wire(15,ry,z);
 for(let bit=0;bit<8;bit++){
  const r=bit>=4,z=8*(bit%4),driver=r?11:1,store=r?10:2,gate=r?9:3;
  if(w<14){group='stored_bit_devices';rep(driver,y,z,r?'west':'east');rep(store,y,z,r?'west':'east');cmp(gate,y,z,r?'west':'east');rep(store,y,z+1,'north');for(const x of r?[8,9,10]:[2,3,4])wire(x,y,z+2);rep(r?7:5,y,z+2,r?'east':'west');}
  else{group='constant_sources_and_gates';const value=w===14?4:1;put(store,y,z,value&(1<<bit)?'redstone_block':'light_gray_concrete');cmp(gate,y,z,r?'west':'east');}
  group='read_inhibit_stairs';for(let n=0;n<=4;n++)wire(gate,ry-n,z-6+n);rep(gate,y,z-1,'south');
 }
 group='read_inhibit_crossbars';for(const z of[-6,2,10,18]){rep(14,ry,z,'west');for(let x=3;x<=13;x++)if(x!==3&&x!==9){if(x===5)rep(x,ry,z,'west');else wire(x,ry,z);}}
}
group='read_collectors';
for(let bit=0;bit<8;bit++){const r=bit>=4,z=8*(bit%4),x=r?8:4;tower(x,z,1,123);put(x,124,z,'redstone_torch');rep(r?9:3,124,z,r?'east':'west');wire(r?10:2,124,z);}
group='operands';for(const v of makeDenseOperands().additions){const p=v.position;put(p.x-2,p.y+112,p.z-16,v.block.id.slice(10),v.block.properties);}
let supports=0;const attachments={east:[-1,0],west:[1,0],south:[0,-1],north:[0,1]};
for(const v of cells.values())if(!['minecraft:light_gray_concrete','minecraft:redstone_block'].includes(v.block.id)){const p=v.position;let s={...p,y:p.y-1};if(v.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=attachments[v.block.properties.facing];s={...p,x:p.x+dx,z:p.z+dz};}assert.equal(cells.get(key(s))?.block.id,'minecraft:light_gray_concrete','support missing '+key(p));supports++;}
const counts={},histogram={};for(const v of cells.values()){counts[v.group]=(counts[v.group]??0)+1;histogram[v.block.id]=(histogram[v.block.id]??0)+1;}
const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...[...cells.values()].map(v=>v.position[a]));box.to[a]=Math.max(...[...cells.values()].map(v=>v.position[a]));}
const source_sha256=Object.fromEntries(['hardware/address-decoder4.mjs','hardware/dense-register-pair.mjs','hardware/dense-operand-capture.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
console.log(JSON.stringify({status:'coordinate_accounting_proposal_not_native_or_build_ready',source_sha256,blocks:cells.size,box,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),volume:['x','y','z'].reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),counts,histogram,supports,duplicate_positions:0,ordinary_words:13,retained_block_id_words:1,constant_words:2,operand_bytes:2,manual_control_ports:28,scope:'One lane file plus two core-shareable decoder headers and physical A/B. No phase controller, reset counter, instruction-address mux, ALU, core routing, placement plans or native specs.',native_calls:0,service_constructors:0},null,2));
