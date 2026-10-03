// Matched physical word-plane comparison only. This is not a complete sequencer.
import assert from 'node:assert/strict';
import {makeAluControlWord} from './full-gpu-alu-control-word.mjs';
import {makeStateDecoder} from './full-gpu-state-decoder.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluOneHotWord(){
 const word=makeAluControlWord(),decoder=makeStateDecoder(),binary=makeStateBank({width:5}),removed=new Set(decoder.blocks.map(v=>K(v.position))),map=new Map(),edges=[],banks=[],ports={};let part='';
 const put=(p,id,properties)=>{assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to}),join=ps=>{for(let i=1;i<ps.length;i++)edge(ps[i-1],ps[i]);};
 for(let bank=0;bank<2;bank++){
  const x=-2+12*bank,name=bank?'current':'next',bits=[];part=name+'_hold';
  for(let y=0;y<=248;y+=2){solid(P(x+2,y,9));put(P(x+2,y+1,9),'redstone_torch');}
  wire(P(x,0,9));rep(P(x+1,0,9),'east');join([P(x,0,9),P(x+1,0,9),P(x+2,0,9)]);
  for(let bit=0;bit<32;bit++){const y=1+8*bit;part=name+'_'+bit;wire(P(x,y,6));rep(P(x+1,y,6),'east');rep(P(x+2,y,6),'east');wire(P(x+3,y,6));rep(P(x+4,y,6),'east');wire(P(x+5,y,6));wire(P(x+2,y,8));rep(P(x+2,y,7),'north');join(Array.from({length:6},(_,i)=>P(x+i,y,6)));join([P(x+2,y,9),P(x+2,y,8),P(x+2,y,7),P(x+2,y,6)]);bits.push({bit,data:P(x,y,6),store:P(x+2,y,6),lock:P(x+2,y,7),output:P(x+5,y,6)});}
  banks.push({name,bits});ports[name+'_open']={direction:'input',width:1,bits:[{bit:0,position:P(x,0,9),travel:P(1,0,0)}]};
 }
 for(let bit=0;bit<32;bit++){const y=1+8*bit;part='next_to_current_'+bit;for(let x=4;x<=8;x++)wire(P(x,y,6));rep(P(9,y,6),'east');join(Array.from({length:8},(_,i)=>P(3+i,y,6)));}
 const bankBlocks=map.size;
 for(const v of word.blocks){if(removed.has(K(v.position)))continue;assert(!map.has(K(v.position)),'word collision '+K(v.position));map.set(K(v.position),{...structuredClone(v),part:'word_parent'});}
 for(let bit=0;bit<32;bit++)assert.equal(map.get(K(P(15,1+8*bit,6)))?.block.id,'minecraft:redstone_wire');
 for(const[name,p]of Object.entries(word.ports))if(name!=='macro')ports[name]=structuredClone(p);
 ports.next_one_hot={direction:'input',width:32,bits:banks[0].bits.map(v=>({bit:v.bit,position:v.data})),meaning:'Unimplemented physical conditional one-hot successor network. Initialize must force exactly bit0 high, all31 others low, then NEXT-close/CURRENT-close.'};
 ports.current_one_hot={direction:'output',width:32,bits:banks[1].bits.map(v=>({bit:v.bit,position:v.output})),meaning:'Actual retained state bits directly feed the unchanged32 command rows; invalid zero/multiple-hot state is not silently repaired.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_matched_32_row_word_plane_with_64_one_hot_stores_not_a_sequencer',blocks,box,ports,banks,edges,word_edges:word.edges,matrix:word.matrix,metrics:{blocks:blocks.length,one_hot_stores:64,binary_reference_stores:10,added_retained_bits:54,one_hot_bank_blocks:bankBlocks,binary_bank_blocks:binary.blocks.length,removed_decoder_blocks:decoder.blocks.length,unchanged_word_blocks:word.blocks.length-decoder.blocks.length,matched_binary_word_and_bank_blocks:word.blocks.length+binary.blocks.length,matched_block_difference:blocks.length-word.blocks.length-binary.blocks.length},native_calls:0,missing:['Actual conditional one-hot successor products and all32 NEXT return routes, including reset/fault overrides and invalid-state handling.','Physical ADVANCE and common initialize one-hot(0) distribution/blanking, plus complete phase and loop controls.','The36 tall command OR columns remain unchanged; no complete-controller area or cold-start savings claimed.']};
}
