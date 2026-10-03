// Offline whole-layout component: 16-word single-address writable subarray.
// No bridge/service constructors and no runtime memory implementation.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeAddressDecoder4} from './address-decoder4.mjs';
export const key=p=>`${p.x},${p.y},${p.z}`;
const axes=['x','y','z'],solid='minecraft:light_gray_concrete',F={east:'west',west:'east',south:'north',north:'south'};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function makeMemorySubarray({bits=8,id='memory16x8',kind='ram',image=Array(16).fill(0)}={}){
 assert([8,16].includes(bits));assert(['ram','rom'].includes(kind));assert(/^[a-z][a-z0-9_]{0,20}$/.test(id));
 assert(Array.isArray(image)&&image.length===16&&image.every(v=>Number.isInteger(v)&&v>=0&&v<2**bits));
 const decoderHash='b0872a2188089f10494cfa89f531c38d0e7328b84460533bcd24db936c993776';
 assert.equal(hash(readFileSync(new URL('./address-decoder4.mjs',import.meta.url))),decoderHash);
 const cells=new Map(),inputs=[],ports={},groups={},rows=bits/2,lastZ=8*(rows-1);let group='';
 const p=(x,y,z)=>({x,y,z});
 function put(x,y,z,block){const position=p(x,y,z),k=key(position);assert(!cells.has(k),'Collision '+k+' '+group);cells.set(k,{position,block});groups[k]=group;}
 const block=(x,y,z)=>put(x,y,z,{id:solid});
 const comp=(x,y,z,name,properties)=>{block(x,y-1,z);put(x,y,z,{id:'minecraft:'+name,...(properties?{properties}:{})});};
 const wire=(x,y,z)=>comp(x,y,z,'redstone_wire');
 const rep=(x,y,z,t)=>comp(x,y,z,'repeater',{facing:F[t],delay:'1'});
 const cmp=(x,y,z,t)=>comp(x,y,z,'comparator',{facing:F[t],mode:'subtract'});
 const wall=(x,y,z,facing)=>put(x,y,z,{id:'minecraft:redstone_wall_torch',properties:{facing}});
 const tower=(x,z,low,high)=>{for(let y=low;y<=high;y++)if((y-low)%2===0)block(x,y,z);else put(x,y,z,{id:'minecraft:redstone_torch'});};
 const port=(name,positions,direction,semantics)=>ports[name]={width:positions.length,bit_order:'lsb_first',direction,polarity:'active_high',positions,semantics};
 // Reuse the complete four-bit decoder, mirror to the right of storage.
 // Its final match torch becomes a refreshed mismatch diode, as in the
 // accepted full register read header. Original external levers become pads.
 group='address_decoder';
 const decoder=makeAddressDecoder4({origin:p(0,0,0),id:'source_decoder'});
 for(const v of decoder.blocks){const{x,y,z}=v.position;let b=structuredClone(v.block);
  if(x===7&&z===6&&b.id==='minecraft:redstone_wall_torch')b={id:'minecraft:repeater',properties:{facing:'west',delay:'1'}};
  if(b.properties?.facing)b.properties.facing=({east:'west',west:'east'})[b.properties.facing]??b.properties.facing;
  if(b.id==='minecraft:lever')b={id:'minecraft:redstone_wire'};
  put(30-x,y,z-18,b);
 }
 for(let w=0;w<16;w++)block(23,8*w,-12);
 const addresses=decoder.inputs.map(v=>p(30-v.position.x,v.position.y,v.position.z-18));
 port('address',addresses,'input','Shared read/write local address [3:0]. Hold stable while write_open is high; output is valid only after measured settlement.');
 inputs.push(...addresses.map((position,b)=>({name:'address'+b,position})));
 group='write_data_columns';const data=[];
 if(kind==='ram'){
 for(let b=0;b<bits;b++){const right=b>=rows,z=8*(b%rows),x=right?12:0;
  const pad=p(right?14:-2,1,z);wire(pad.x,pad.y,pad.z);data.push(pad);inputs.push({name:'write_data'+b,position:pad});
  rep(right?13:-1,1,z,right?'west':'east');block(x,0,z);tower(x,z,1,121);
 }
 port('write_data',data,'input','Parallel physical data; all storage local-D columns receive this word even when their locks are closed.');
 group='write_enable_column';wire(6,1,-16);rep(6,1,-15,'south');block(6,0,-14);tower(6,-14,1,121);
 port('write_open',[p(6,1,-16)],'input','High opens only the addressed word after decoder settles. Default low closes every word after propagation. Not a transaction valid or ready signal.');
 inputs.push({name:'write_open',position:p(6,1,-16)});
 }
 const mismatch=[],qualified=[],read=[];
 for(let w=0;w<16;w++){
  const y=1+8*w,ry=y+4;mismatch.push(p(23,y,-12));if(kind==='ram')qualified.push(p(6,y,-12));
  // The same mismatch source supplies the read mask and write qualification.
  group='read_mask_rise';wire(20,y,-12);for(let n=1;n<=4;n++)wire(20-n,y+n,-12);wire(15,ry,-12);
  if(kind==='ram'){
  group='write_mismatch_feed';wire(20,y,-11);wire(20,y,-10);for(let x=19;x>=8;x--)if(x===13)rep(x,y,-10,'west');else wire(x,y,-10);wire(8,y,-11);wire(8,y,-12);rep(7,y,-12,'west');
  group='qualified_write_and_hold';rep(6,y,-13,'south');cmp(6,y,-12,'south');block(6,y,-11);wall(6,y,-10,'south');
  for(let z=-9;z<=lastZ+2;z++)if((z+7)%12===0)rep(6,y,z,'south');else wire(6,y,z);
  }
  group='read_mask_trunk';for(let z=-11;z<=lastZ-6;z++)if((z+7)%12===0)rep(15,ry,z,'south');else wire(15,ry,z);
  for(let b=0;b<bits;b++){
   const right=b>=rows,z=8*(b%rows),driver=right?11:1,store=right?10:2,gate=right?9:3;
   if(kind==='ram'){
    group='storage_devices_and_locks';rep(driver,y,z,right?'west':'east');rep(store,y,z,right?'west':'east');cmp(gate,y,z,right?'west':'east');rep(store,y,z+1,'north');
    for(const x of right?[8,9,10]:[2,3,4])wire(x,y,z+2);rep(right?7:5,y,z+2,right?'east':'west');
   }else{
    group='program_configuration_cells';put(store,y,z,{id:image[w]&(2**b)?'minecraft:redstone_block':solid});cmp(gate,y,z,right?'west':'east');
   }
   group='read_mask_stairs';for(let n=0;n<=4;n++)wire(gate,ry-n,z-6+n);rep(gate,y,z-1,'south');
  }
  group='read_mask_crossbars';for(let z=-6;z<=lastZ-6;z+=8){rep(14,ry,z,'west');for(let x=3;x<=13;x++)if(x!==3&&x!==9){if(x===5)rep(x,ry,z,'west');else wire(x,ry,z);}}
 }
 group='read_or_columns';for(let b=0;b<bits;b++){const right=b>=rows,z=8*(b%rows),x=right?8:4;tower(x,z,1,123);put(x,124,z,{id:'minecraft:redstone_torch'});rep(right?9:3,124,z,right?'east':'west');wire(right?10:2,124,z);read.push(p(right?10:2,124,z));}
 port('read_data',read,'output','Combinational selected word from isolated per-row comparators and the physical positive OR columns. Receiver latches and ready timing are outside this subarray.');
 port('mismatch',mismatch,'diagnostic','One high bit for every unselected row; selected row is zero.');ports.mismatch.polarity='high_means_unselected';
 if(kind==='ram')port('qualified_write',qualified,'diagnostic','Exactly the selected write comparator may be high while write_open is high.');
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={},groupCounts={};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 for(const v of blocks){histogram[v.block.id]=(histogram[v.block.id]??0)+1;groupCounts[groups[key(v.position)]]=(groupCounts[groups[key(v.position)]]??0)+1;}
 const signals=[...addresses.map((position,b)=>({name:'address'+b,position,property:'power'})),...(kind==='ram'?[{name:'write_open',position:p(6,1,-16),property:'power'}]:[]),...read.map((position,b)=>({name:'read'+b,position,property:'power'})),...mismatch.map((position,w)=>({name:'mismatch'+w,position,property:'powered'})),...qualified.map((position,w)=>({name:'qualified'+w,position,property:'powered'}))];
 const circuit={id,dimension:'minecraft:overworld',description:'Unplaced single-address16-word memory subarray. Physical request controller, bank fabric and loader remain external.',signals,buses:[{name:'address',bits:addresses.map((_,b)=>'address'+b)},{name:'read',bits:read.map((_,b)=>'read'+b)},{name:'mismatch',bits:mismatch.map((_,w)=>'mismatch'+w)},...(kind==='ram'?[{name:'qualified',bits:qualified.map((_,w)=>'qualified'+w)}]:[])]};
 const configuration=kind==='rom'?Array.from({length:16},(_,w)=>Array.from({length:bits},(_,b)=>({address:w,bit:b,position:p(b>=rows?10:2,1+8*w,8*(b%rows)),value:(image[w]>>b)&1}))).flat():[];
 return{status:'offline_routed_subarray_proposal_native_unverified',id,kind,words:16,bits,blocks,box,ports,inputs,circuit,groups,configuration,sources:{'hardware/address-decoder4.mjs':decoderHash},metrics:{blocks:blocks.length,logical_bits:16*bits,histogram,group_counts:groupCounts,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1)},missing:['No request/ready controller or output latch.',...(kind==='ram'?['No bank-enable/write qualification: outer controller must prevent writes to unselected subarrays.']:['ROM configuration cells may only change before execution; no runtime program writes.']),'No channel ownership, payload latches, arbitration, bank crossbar or whole-memory routes.',...(kind==='ram'?['No reset source: initialize through addressed zero writes; ordinary core reset must not clear backing storage.']:[]),'No native timing/initialization/read/write/hold acceptance.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out,'Explicit offline output directory required');mkdirSync(out,{recursive:true});for(const[kind,bits]of[['ram',8],['ram',16],['rom',16]]){const d=makeMemorySubarray({bits,kind,id:kind+'16x'+bits});writeFileSync(join(out,kind+'16x'+bits+'.json'),JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({bits,kind,...d.metrics}));}}
