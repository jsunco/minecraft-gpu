// Pure retained control-state geometry. Initialization uses physical staged zeros.
// No game calls, hidden default-power writes, runtime oracle or timer service.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeStateBank({width=5,pair=true}={}){
 assert(Number.isSafeInteger(width)&&width>=1&&width<=8);
 const map=new Map(),banks=[],links=[],ports={};let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 const port=(name,direction,bits,meaning)=>ports[name]={direction,width:bits.length,polarity:'active_high',bit_order:'lsb_first',meaning,bits};
 for(let bank=0;bank<(pair?2:1);bank++){
  const x=12*bank,name=pair?(bank?'current':'next'):'state',data=[],out=[],latches=[];part=name+'_hold';
  for(let y=0;y<=4*(width-1);y+=2){solid(P(x+2,y,3));put(P(x+2,y+1,3),'redstone_torch');}
  wire(P(x,0,3));rep(P(x+1,0,3),'east');
  for(let bit=0;bit<width;bit++){const y=1+4*bit;part=name+'_bit_'+bit;
   wire(P(x,y,0));rep(P(x+1,y,0),'east');rep(P(x+2,y,0),'east');wire(P(x+3,y,0));rep(P(x+4,y,0),'east');wire(P(x+5,y,0));
   wire(P(x+2,y,2));rep(P(x+2,y,1),'north');
   data.push({bit,position:P(x,y,0),receiver:P(x+1,y,0),travel:P(1,0,0)});out.push({bit,position:P(x+5,y,0),source:P(x+4,y,0),travel:P(1,0,0)});latches.push({bit,data:P(x+1,y,0),storage:P(x+2,y,0),lock:P(x+2,y,1),lock_source:P(x+2,y,3),output:P(x+5,y,0)});
  }
  port(name+'_open','input',[{bit:0,position:P(x,0,3),receiver:P(x+1,0,3),travel:P(1,0,0)}],'High opens this bank after its own physical torch/lock propagation. Do not overlap actual NEXT and CURRENT transparency.');
  banks.push({name,data,out,latches});
 }
 if(pair){for(let bit=0;bit<width;bit++){const y=1+4*bit;part='next_to_current_'+bit;const path=[P(5,y,0)];for(let x=6;x<=10;x++){wire(P(x,y,0));path.push(P(x,y,0));}rep(P(11,y,0),'east');path.push(P(11,y,0),P(12,y,0));links.push({bit,path});}}
 port('next_data','input',banks[0].data,'Computed candidate state; held through NEXT closure. For initialization clamp this real bus to zero, then complete NEXT-close-CURRENT-close.');
 port('state','output',banks.at(-1).out,'Retained current state. In pair mode this bank always receives held NEXT through the included physical links.');
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_current_next_control_storage_native_unverified',blocks,ports,banks,links,box,metrics:{blocks:blocks.length,stored_bits:width*(pair?2:1),width,pair,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,initialization:'No RESET pin or assumed all-zero live state. Physical controller must blank architectural outputs, force next_data0, run a full ordered NEXT-close-CURRENT-close transfer, and only then release the clamp/blanking.',limits:['No autonomous state transition or clock exists in this component. All OPEN/data producers require geometry.','The two banks are independent physical storage; external phase overlap would be an error.','The generator writes only ordinary unpowered placement descriptions; reload/retention/initialization still need native checks.','OPEN→last lock delay depends on width; endpoint phase nonoverlap alone does not establish local closure.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeStateBank({width:Number(process.argv[3]??5)});writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
