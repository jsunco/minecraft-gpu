// Offline register-sequencer data sources: ZERO, FF-prime or per-lane writeback.
// This is concrete component geometry, not the sequencer itself.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterDataSelector(){
 const map=new Map(),bits=[],outputs=[];let part='';
 function put(p,id,properties){const block={id:'minecraft:'+id,...(properties?{properties}:{})};const old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'Collision '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},w=p=>dev(p,'redstone_wire'),r=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 // Each four-level increment is two inversions, preserving the tap polarity.
 // !PASS powers the comparator side; FILL uses one more bottom inversion.
 part='mask_column';for(let y=0;y<=28;y+=2){solid(P(2,y,-3));put(P(2,y+1,-3),'redstone_torch');}
 part='fill_column';for(let y=-2;y<=28;y+=2){solid(P(8,y,0));put(P(8,y+1,0),'redstone_torch');}
 part='pass_input';w(P(0,0,-3));r(P(1,0,-3),'east');
 part='fill_input';w(P(10,-2,0));r(P(9,-2,0),'west');
 for(let bit=0;bit<8;bit++){
  const y=1+4*bit;part='bit_'+bit;
  w(P(0,y,0));r(P(1,y,0),'east');dev(P(2,y,0),'comparator',{facing:'west',mode:'subtract'});w(P(3,y,0));r(P(4,y,0),'east');w(P(5,y,0));
  w(P(2,y,-2));r(P(2,y,-1),'south');
  w(P(7,y,0));r(P(6,y,0),'west');
  r(P(5,y,1),'south');w(P(5,y,2));
  bits.push({bit,position:P(0,y,0),receiver:P(1,y,0),travel:P(1,0,0)});outputs.push({bit,position:P(5,y,2),source:P(5,y,1),travel:P(0,0,1)});
 }
 const port=(direction,bits,meaning)=>({direction,width:bits.length,bit_order:'lsb_first',polarity:'active_high',meaning,bits});
 const ports={writeback:port('input',bits,'Held per-lane writeback value; never a host runtime result.'),pass_writeback:port('input',[{bit:0,position:P(0,0,-3),receiver:P(1,0,-3),travel:P(1,0,0)}],'1 permits writeback; 0 masks every WB bit before the output OR.'),fill_ones:port('input',[{bit:0,position:P(10,-2,0),receiver:P(9,-2,0),travel:P(-1,0,0)}],'1 drives FF for pre-execution priming. Held low during normal writes.'),data:port('output',outputs,'FILL OR (PASS AND WB). Both controls0 produces reset zero; FILL1 produces FF regardless of WB.')};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_register_data_selector_native_unverified',blocks,ports,box,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),stored_bits:0},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,limits:['Four copies provide32 independent WB bits per core; block-ID8 uses one extra shared selector before fanout.','Controller must close WE/ASSIGN before PASS/FILL/data changes. No pulse/state/ack source is included.','FILL is startup-only. Actual two-inversion column delays and reset/hold timing are unmeasured.','All external fanout, reset gating and file input routes still require geometry.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterDataSelector();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
