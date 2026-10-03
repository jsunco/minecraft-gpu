// Four retained bank response bytes -> four channel D bytes, qualified by actual owner-qualified bank/channel READY. Offline component for connected internal bus derivative.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeBankResponseCollector(){
 const m=new Map(),nets={},columns=[],routes=[],branches=[],owners=[];let net='';
 function put(p,id,properties){const block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},old=m.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p));assert(id===S||nets[K(p)]===net,'net '+K(p));return;}m.set(K(p),{position:p,block});nets[K(p)]=net;}
 const solid=(x,y,z)=>put(P(x,y,z),S),dev=(x,y,z,id,q)=>{solid(x,y-1,z);put(P(x,y,z),id,q);},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,t)=>dev(x,y,z,'repeater',{facing:F[t],delay:'1'}),cmp=(x,y,z)=>dev(x,y,z,'comparator',{facing:'west',mode:'subtract'});
 function tower(name,x,z,lo,hi){assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)put(P(x,y,z),(y-lo)%2?'redstone_torch':S);columns.push({name,net,x,z,lo,hi});}
 function line(name,a,b,{wireOnly=[]}={}){assert(a.y===b.y&&(a.x===b.x||a.z===b.z));const n=Math.abs(a.x-b.x)+Math.abs(a.z-b.z),path=Array.from({length:n+1},(_,i)=>P(a.x+Math.sign(b.x-a.x)*i,a.y,a.z+Math.sign(b.z-a.z)*i));let last=-1;const reps=[];for(let end=path.length;end-last>12;){let i=Math.min(last+11,path.length-2);while(i>last&&(wireOnly.includes(K(path[i]))||m.has(K(path[i]))))i--;assert(i>last,'no refresh '+name);reps.push(i);last=i;}
  for(let i=0;i<path.length;i++){const p=path[i],old=m.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire');assert.equal(nets[K(p)],net);}else if(reps.includes(i))r(p.x,p.y,p.z,b.x>a.x?'east':b.x<a.x?'west':b.z>a.z?'south':'north');else w(p.x,p.y,p.z);}routes.push({name,net,path,refresh_indices:reps});}
 const rr=[],wr=[],data=[],inputData=[],inputRead=[],inputWrite=[],owner=[];
 for(let ch=0;ch<4;ch++)for(let f=0;f<8;f++){
  const x=16*ch,z=8*f;net='channel'+ch+'_field'+f;w(x,1,z-2);r(x,1,z-1,'south');tower(net,x,z,1,25);inputData.push({bank:ch,bit:f,position:P(x,1,z-2)});
 }
 for(let i=0;i<4;i++){
  const y=1+8*i;
  for(let ch=0;ch<4;ch++){
   const x=16*ch;net='owner'+ch+'_'+i;w(x+10,y,-8);r(x+10,y,-7,'south');solid(x+10,y,-6);net='not_owner'+ch+'_'+i;put(P(x+10,y,-5),'redstone_wall_torch',{facing:'south'});owner.push({bank:ch,channel:i,position:P(x+10,y,-8)});owners.push({channel:ch,consumer:i,input:P(x+10,y,-8),inverter:P(x+10,y,-5)});
   line('mask_header'+ch+'_'+i,P(x+10,y,-4),P(x+10,y,54),{wireOnly:Array.from({length:8},(_,f)=>K(P(x+10,y,8*f-2)))});
   for(let f=0;f<8;f++){
    const z=8*f;net='not_owner'+ch+'_'+i;r(x+9,y,z-2,'west');line('mask_branch'+ch+'_'+i+'_'+f,P(x+8,y,z-2),P(x+4,y,z-2));r(x+4,y,z-1,'south');
    net='channel'+ch+'_field'+f;r(x+1,y,z,'east');w(x+2,y,z);r(x+3,y,z,'east');
    net='consumer'+i+'_field'+f;cmp(x+4,y,z);r(x+5,y,z,'east');w(x+6,y,z);w(x+6,y+1,z+1);w(x+6,y+2,z+2);
    branches.push({channel:ch,consumer:i,field:f,source:P(x,y,z),rear:P(x+3,y,z),side:P(x+4,y,z-1),gate:P(x+4,y,z),output:P(x+5,y,z),collector:P(x+6,y+2,z+2)});
   }
  }
  for(let f=0;f<8;f++){
   const z=8*f;net='consumer'+i+'_field'+f;line('return_bus'+i+'_'+f,P(6,y+2,z+2),P(62,y+2,z+2),{wireOnly:[6,22,38,54].map(x=>K(P(x,y+2,z+2)))});r(63,y+2,z+2,'east');w(64,y+2,z+2);data.push(P(64,y+2,z+2));
  }
 }
 const port=(direction,positions,bit_order)=>({direction,width:positions.length,positions,polarity:'active_high',bit_order}),blocks=[...m.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_bank_response_qualification_component',blocks,nets,columns,routes,branches,owners,ports:{bank_channel_owned_ready:port('input',owner.map(v=>v.position),'channel_major_bank_minor'),bank_read_data:port('input',inputData.map(v=>v.position),'bank_major_bit_lsb_first'),channel_response_d:port('output',data,'channel_major_bit_lsb_first')},input_map:{owned_ready:owner,data:inputData},box,metrics:{blocks:blocks.length,owned_ready_masks:16,comparators:128,response_fields:32,shared_signal_columns:32,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},contract:'D[channel][bit] = OR_bank(actual_bank_owned_ready[bank][channel] AND held_bank_response[bank][bit]). Unselected retained bank data never feeds the OR. READY must be actual owner/type/phase qualified; the backend must capture only after the qualified data arrives and close before ready withdrawal. No scheduled timing proof.',native_acceptance:false,connected_sources:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeBankResponseCollector();writeFileSync(join(out,'collector.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
