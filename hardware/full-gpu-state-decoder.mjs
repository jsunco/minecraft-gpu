// Offline 5-bit/32-state decoder, sharing four original input columns.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {makeAddressDecoder4} from './address-decoder4.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},cross={north:'side',east:'side',south:'side',west:'side'};
export function makeStateDecoder(){
 const map=new Map(),parent=makeAddressDecoder4({origin:P(0,0,0),id:'gpu_state_decoder_source'}),removed=[],inputs=[],outputs=[],maskBranches=[];let part='';
 function put(p,id,properties){const block={id:'minecraft:'+id,...(properties?{properties}:{})};const old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'Collision '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=(p,props)=>dev(p,'redstone_wire',props),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 for(let bank=0;bank<2;bank++){
  for(const v of parent.blocks){const p={...v.position,y:v.position.y+128*bank};assert(!map.has(K(p)));map.set(K(p),{position:p,block:structuredClone(v.block),part:'decoder4_'+bank});}
  for(const source of parent.inputs){const p={...source.position,y:source.position.y+128*bank},sign=p.x<0?-1:1;for(const q of[p,{...p,y:p.y-1},{...p,x:p.x-sign},{...p,x:p.x-sign,y:p.y-1}]){assert(map.has(K(q)));removed.push(map.get(K(q)));map.delete(K(q));}}
 }
 const columns=[[0,0,0],[1,12,0],[2,0,12],[3,12,12]];
 part='four_column_bridge';for(const[,x,z]of columns)for(let y=122;y<=128;y++){if(y%2)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}
 part='fifth_column';for(let y=1;y<=249;y++){if(y%2)solid(P(20,y,0));else put(P(20,y,0),'redstone_torch');}
 for(const[bit,x,z]of[...columns,[4,20,0]]){
  part='state_input_'+bit;solid(P(x,-3,z));put(P(x,-2,z),'redstone_torch');solid(P(x,-1,z));put(P(x,0,z),'redstone_torch');
  const sign=x===0?-1:1;wire(P(x+2*sign,-3,z));rep(P(x+sign,-3,z),sign<0?'east':'west');
  inputs.push({bit,position:P(x+2*sign,-3,z),receiver:P(x+sign,-3,z),travel:P(-sign,0,0),column:P(x,1,z)});
 }
 for(let state=0;state<32;state++){
  const y=1+8*state,high=state>>4;part='state_mask_'+state;
  wire(P(19,y,0),high?cross:undefined);
  if(high){solid(P(18,y,0));put(P(17,y,0),'redstone_wall_torch',{facing:'west'});}else{rep(P(18,y,0),'west');wire(P(17,y,0));}
  wire(P(16,y,0));rep(P(15,y,0),'west');wire(P(14,y,0));for(let z=1;z<=4;z++)wire(P(14,y,z));wire(P(13,y,4));wire(P(12,y,4));rep(P(12,y,5),'south');
  part='state_match_'+state;wire(P(10,y,6));rep(P(11,y,6),'east');dev(P(12,y,6),'comparator',{facing:'west',mode:'subtract'});wire(P(13,y,6));rep(P(14,y,6),'east');wire(P(15,y,6));
  outputs.push({bit:state,position:P(15,y,6),source:P(14,y,6),travel:P(1,0,0)});maskBranches.push({state,high,source_column:P(20,y,0),inverter:high?P(17,y,0):null,mask:P(12,y,5),low_match:P(9,y,6),low_receiver:P(11,y,6),comparator:P(12,y,6),output:P(15,y,6)});
 }
 const ports={state:{direction:'input',width:5,polarity:'active_high',bit_order:'lsb_first',bits:inputs},one_hot:{direction:'output',width:32,polarity:'active_high',bit_order:'state_index',bits:outputs}};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_shared_column_32state_decoder_native_unverified',blocks,ports,box,maskBranches,removed_source_cells:removed,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),states:32,shared_state_columns:5},source:{path:'hardware/address-decoder4.mjs',sha256:createHash('sha256').update(readFileSync(new URL('./address-decoder4.mjs',import.meta.url))).digest('hex')},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Every output is combinational; all architectural actions must be blanked while state changes and until the far decoder settles.','Five real source columns feed32 rows; no independent host-selected row or precomputed match value.','Fresh initialization may require conditioning all32 states with actions blanked; the physical conditioning/controller path is not included.','No microinstruction-output matrix, conditional next-state logic, state storage, phase clock or full routing is included.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeStateDecoder();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
