// Two concrete4-bit equality rows for the register controller's terminal guards.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {makeAddressDecoder4} from './address-decoder4.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`;
export function makeCounterGuards(){
 const parent=makeAddressDecoder4({origin:P(0,0,0),id:'gpu_counter_guard_source'}),map=new Map(),inheritance=[],ports={};
 const isColumn=p=>[0,12].includes(p.x)&&[0,12].includes(p.z);
 function copy(v,dy,part){const p={...v.position,y:v.position.y+dy},cell={position:p,block:structuredClone(v.block),part};assert(!map.has(K(p)));map.set(K(p),cell);inheritance.push({source:v.position,target:p});}
 for(const v of parent.blocks.filter(v=>isColumn(v.position)&&v.position.y>=1&&v.position.y<=9))copy(v,0,'input_column');
 const targets=[12,15];for(let row=0;row<2;row++){const originalY=1+8*targets[row],newY=1+8*row;for(const v of parent.blocks.filter(v=>v.position.y>=originalY-1&&v.position.y<=originalY&&!isColumn(v.position)))copy(v,newY-originalY,'match_'+targets[row]);}
 const sourceBits=[];for(let bit=0;bit<4;bit++){
  const p=parent.inputs[bit].position,sign=p.x<0?-1:1;
  for(const q of[p,{...p,y:p.y-1},{...p,x:p.x-sign},{...p,x:p.x-sign,y:p.y-1}])copy(parent.blocks.find(v=>K(v.position)===K(q)),0,'counter_input_'+bit);
  const source=map.get(K(p));source.block={id:'minecraft:redstone_wire'};
  sourceBits.push({bit,position:p,receiver:{...p,x:p.x-sign},travel:P(-sign,0,0)});
 }
 ports.address={direction:'input',width:4,polarity:'active_high',bit_order:'lsb_first',bits:sourceBits};
 for(let row=0;row<2;row++){const y=1+8*row;for(const[x,id,properties]of[[10,'redstone_wire',null],[11,'repeater',{facing:'west',delay:'1'}],[12,'redstone_wire',null]])for(const v of[{position:P(x,y-1,6),block:{id:'minecraft:light_gray_concrete'}},{position:P(x,y,6),block:{id:'minecraft:'+id,...(properties?{properties}:{})}}]){assert(!map.has(K(v.position)));map.set(K(v.position),{...v,part:'guard_output_'+targets[row]});}
  ports['is_'+targets[row]]={direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(12,y,6),source:P(11,y,6),travel:P(1,0,0)}]};
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_counter_terminal_guard_geometry_native_unverified',blocks,ports,box,inheritance,targets,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},source:{path:'hardware/address-decoder4.mjs',sha256:createHash('sha256').update(readFileSync(new URL('./address-decoder4.mjs',import.meta.url))).digest('hex')},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Only equality12/15, not a counter, incrementer or transition controller.','Freshly cropped column/row geometry and timing require native checks.','Consume terminal guards only after the physical address has settled.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeCounterGuards();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
