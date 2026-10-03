// Offline 8-bit device-control register with real reset/data/write/held-output ports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeResetRegister} from './register-reset.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),S='minecraft:light_gray_concrete';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function makeDcr(){
 const source=readFileSync(new URL('./register-reset.mjs',import.meta.url));assert.equal(hash(source),'4c40b2e3f198ba153fe706a4b3de08d9c7f383a1572dc469683026a8d8e36a09');
 const parent=makeResetRegister({origin:P(0,0,0),bits:8,id:'gpu_register_dcr8'}),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'parent_device'}])),ports={},replacements=[];
 const floor=[];for(const v of parent.blocks){const at={...v.position,y:0};if(!map.has(K(at))){map.set(K(at),{position:at,block:{id:'minecraft:cyan_concrete'},part:'retained_parent_support'});floor.push(at);}}
 function put(x,y,z,id,properties,part){const position=P(x,y,z);assert(!map.has(K(position)),'Collision '+K(position));map.set(K(position),{position,block:{id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=(x,y,z,part)=>put(x,y,z,S,undefined,part);
 function device(x,y,z,id,properties,part){solid(x,y-1,z,part+'_support');put(x,y,z,id,properties,part);}
 const wire=(x,y,z,part)=>device(x,y,z,'redstone_wire',undefined,part);
 const rep=(x,y,z,part)=>device(x,y,z,'repeater',{facing:'west',delay:'1'},part);
 const adapted=[];
 for(const input of parent.inputs){const{x,z}=input.position,old=map.get(K(input.position));assert.equal(old.block.id,'minecraft:lever');replacements.push({position:input.position,from:old.block,to:{id:'minecraft:redstone_wire'}});old.block={id:'minecraft:redstone_wire'};old.part='converted_source_'+input.name;
  // Two inversions drive the existing support from below. No new same-level
  // source terminal can touch the nearby reset or write-enable rail.
  solid(x,-4,z,'input_column_'+input.name);put(x,-3,z,'redstone_torch',undefined,'input_column_'+input.name);solid(x,-2,z,'input_column_'+input.name);put(x,-1,z,'redstone_torch',undefined,'input_column_'+input.name);
  wire(x-2,-4,z,'input_terminal_'+input.name);rep(x-1,-4,z,'input_receiver_'+input.name);
  adapted.push({name:input.name,position:P(x-2,-4,z),receiver:P(x-1,-4,z),original_pad:input.position,travel:P(1,0,0),required_high_power:15});
 }
 const output=[];
 for(let bit=0;bit<8;bit++){const z=8*bit,part='output_'+bit;
  // Raise three levels before crossing the old WE rail; keep air above it.
  for(let n=1;n<=3;n++)wire(6,1+n,z-n,part+'_rise');
  for(let x=7;x<=9;x++)wire(x,4,z-3,part+'_route');rep(10,4,z-3,part+'_isolate');wire(11,4,z-3,part+'_terminal');
  output.push({bit,position:P(11,4,z-3),source:P(10,4,z-3),parent_source:P(5,1,z),parent_pad:P(6,1,z),travel:P(1,0,0),driven_high_power:15});
 }
 const port=(name,direction,bits,meaning)=>ports[name]={direction,width:bits.length,polarity:'active_high',bit_order:'lsb_first',meaning,bits:bits.map((b,bit)=>({bit,...b}))};
 port('data','input',Array.from({length:8},(_,b)=>adapted.find(a=>a.name==='d'+b)),'Configuration byte; hold through WRITE closure. Not runtime host memory.');
 port('write','input',[adapted.find(a=>a.name==='write_enable')],'High opens the DCR after stable data; close and settle before START.');
 port('reset','input',[adapted.find(a=>a.name==='reset')],'Reset-priority zero using real data clamps and opened storage; settle before release.');
 port('thread_count','output',output,'Held8-bit dispatch thread count; keep DCR closed throughout the launch.');
 const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 return{status:'offline_dcr_interface_derivative_native_unverified',blocks,box,ports,replacements,metrics:{blocks:blocks.length,parent_devices:parent.blocks.length,preserved_floor_supports:floor.length,full_original_floor_positions:828,omitted_air_above_floor:828-floor.length,input_adapter_additions:80,output_additions:128,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},
 sources:{'hardware/register-reset.mjs':hash(source)},complete_component_geometry:true,native_acceptance:false,
 boundaries:['No physical launch/configuration panel or dispatch wires yet.','Original RTL is edge-triggered; physical admission stages data, opens WRITE, closes, waits, then starts dispatch.','Reset/source adapters and output stairs need native timing/retention/release checks; the old8-bit reset tests do not accept this derivative.','Every original Y1device keeps its original support. Only old floor cells with air above are omitted; this density derivative still needs review.','No selected world/site or native construction plans.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDcr();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
