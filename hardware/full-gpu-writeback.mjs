// Complete combinational writeback component geometry, designed offline only.
// No bridge, service, runtime oracle or live construction entrypoint.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const axes=['x','y','z'],K=p=>axes.map(a=>p[a]).join(','),F={east:'west',west:'east',north:'south',south:'north'};
const S='minecraft:light_gray_concrete';
export function makeWritebackMux(){
 const cells=new Map(),ports={},routes=[],P=(x,y,z)=>({x,y,z});let group='';
 function put(x,y,z,id,properties){const position=P(x,y,z),k=K(position),block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})};assert(!cells.has(k),'Collision '+k);cells.set(k,{position,block,part:group});}
 const solid=(x,y,z)=>put(x,y,z,S);
 function component(x,y,z,id,properties){solid(x,y-1,z);put(x,y,z,id,properties);}
 const wire=(x,y,z,props)=>component(x,y,z,'redstone_wire',props),rep=(x,y,z,t)=>component(x,y,z,'repeater',{facing:F[t],delay:'1'});
 const torch=(x,y,z,f)=>put(x,y,z,'redstone_wall_torch',{facing:f});
 const port=(name,direction,bits,meaning)=>ports[name]={direction,width:bits.length,bit_order:'lsb_first',polarity:'active_high',meaning,bits:bits.map((v,bit)=>({bit,...v}))};
 const select=[];
 group='select_columns';
 for(const[bit,x,sign]of[[0,0,-1],[1,12,1]]){
  for(let y=1;y<=17;y++)if(y%2)solid(x,y,0);else put(x,y,0,'redstone_torch');
  const travel={x:-sign,y:0,z:0};wire(x+2*sign,1,0);rep(x+sign,1,0,sign<0?'east':'west');
  select.push({position:P(x+2*sign,1,0),receiver:P(x+sign,1,0),travel,required_high_power:15});
 }
 port('select','input',select,'00 ALU,01 LSU,10 immediate,11 all gates masked. Hold until downstream writes close.');
 const towers=[],branches=[];
 for(let row=0;row<3;row++){
  const y=1+8*row;
  group='select_mismatch_'+row;
  for(const[bit,x,step]of[[0,0,1],[1,12,-1]]){
   wire(x+step,y,0,row&(1<<bit)?{north:'side',east:'side',south:'side',west:'side'}:undefined);
   if(row&(1<<bit)){solid(x+2*step,y,0);torch(x+3*step,y,0,step>0?'east':'west');}
   else{rep(x+2*step,y,0,step>0?'east':'west');wire(x+3*step,y,0);}
   wire(x+4*step,y,0);rep(x+5*step,y,0,step>0?'east':'west');
  }
  solid(6,y,0);rep(6,y,1,'south');wire(6,y,2);
  group='mask_distribution_'+row;
  for(let x=7;x<=30;x++)if([14,26].includes(x))rep(x,y,2,'east');else wire(x,y,2);
  for(let z=3;z<=62;z++)if((z-4)%12===0)rep(30,y,z,'south');else wire(30,y,z);
  const input=[];
  for(let bit=0;bit<8;bit++){
   const z=8+8*bit;
   group='mask_branch_'+row+'_'+bit;rep(29,y,z-2,'west');for(let x=28;x>=24;x--)wire(x,y,z-2);rep(24,y,z-1,'south');
   group='data_gate_'+row+'_'+bit;wire(20,y,z);rep(21,y,z,'east');wire(22,y,z);rep(23,y,z,'east');component(24,y,z,'comparator',{facing:'west',mode:'subtract'});rep(25,y,z,'east');
   input.push({position:P(20,y,z),receiver:P(21,y,z),travel:{x:1,y:0,z:0},required_high_power:15});
   branches.push({row,bit,select_bits:row,mask:P(24,y,z-1),data:P(23,y,z),comparator:P(24,y,z),output:P(25,y,z),or_column:P(26,y,z)});
  }
  port(['alu','lsu','immediate'][row],'input',input,'Full byte, each high terminal15; selected-path settlement required before capture.');
 }
 const output=[];group='output_collectors';
 for(let bit=0;bit<8;bit++){
  const z=8+8*bit;for(let y=1;y<=19;y++)if(y%2)solid(26,y,z);else put(26,y,z,'redstone_torch');put(26,20,z,'redstone_torch');rep(27,20,z,'east');wire(28,20,z);
  output.push({position:P(28,20,z),source:P(27,20,z),travel:{x:1,y:0,z:0},driven_high_power:15});towers.push({bit,base:P(26,1,z),top:P(26,20,z)});
 }
 port('wb','output',output,'OR of exactly the selected source gates after settling. Not stored; destination must stay closed during select/input changes.');
 const blocks=[...cells.values()],histogram={},groups={};for(const b of blocks){histogram[b.block.id]=(histogram[b.block.id]??0)+1;groups[b.part]=(groups[b.part]??0)+1;}
 const box={from:{},to:{}};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_complete_combinational_component_native_unverified',id:'writeback3x8',box,blocks,ports,branches,towers,
  metrics:{blocks:blocks.length,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),histogram,group_counts:groups,source_bits:24,select_bits:2,output_bits:8},
  inheritance:'Two-bit mismatch topology and positive torch OR columns from accepted register/header family; changed3-row/8-bit arrangement has not been tested.',
  complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,
  limits:['All external producer/receiver routes excluded. No state, clock or write-enable generator.','11 produces zero but never authorizes a write; controller independently suppresses illegal select.','Select and data transitions can glitch; physical settle/closure timing remains unmeasured.','All24 inputs need fresh isolated drivers at strength15. No default-placement state or software output is native proof.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeWritebackMux();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));
}
