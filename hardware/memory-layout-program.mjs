// Offline program-ROM interconnect. No services, native calls or runtime memory.
// Two 16-word cards share each low-address tower; eight stacks form 256 words.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeMemorySubarray,key} from './memory-layout-subarray.mjs';
const S='minecraft:light_gray_concrete',F={east:'west',west:'east',south:'north',north:'south'},A=['x','y','z'];
const p=(x,y,z)=>({x,y,z}),sha=b=>createHash('sha256').update(b).digest('hex');
export function makeProgramROM({image=Array(256).fill(0),id='program_rom256'}={}){
 assert(Array.isArray(image)&&image.length===256&&image.every(v=>Number.isInteger(v)&&v>=0&&v<=65535));
 const expected='d7b65b4434cdd3ffa31de4ae1e015ff6683ba1e47cbe7a765f24cea0bea1cc19';
 assert.equal(sha(readFileSync(new URL('./memory-layout-subarray.mjs',import.meta.url))),expected);
 const cells=new Map(),nets={},groups={},routes=[],cards=[],configuration=[],removed=[];let group='',net='';
 function put(x,y,z,block){const position=p(x,y,z),k=key(position),old=cells.get(k);if(old){assert.deepEqual(old.block,block,'Collision '+k+' '+groups[k]+' / '+group);assert(block.id===S||nets[k]===net,'Net collision '+k+' '+nets[k]+' / '+net);return;}cells.set(k,{position,block});nets[k]=net;groups[k]=group;}
 const block=(x,y,z)=>put(x,y,z,{id:S});
 function comp(x,y,z,name,properties){block(x,y-1,z);put(x,y,z,{id:'minecraft:'+name,...(properties?{properties}:{})});}
 const wire=(x,y,z)=>comp(x,y,z,'redstone_wire'),rep=(x,y,z,t)=>comp(x,y,z,'repeater',{facing:F[t],delay:'1'}),cmp=(x,y,z,t)=>comp(x,y,z,'comparator',{facing:F[t],mode:'subtract'});
 const wall=(x,y,z,facing)=>put(x,y,z,{id:'minecraft:redstone_wall_torch',properties:{facing}});
 function tower(x,z,lo,hi){assert.equal((hi-lo)%2,0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)block(x,y,z);else put(x,y,z,{id:'minecraft:redstone_torch'});}
 function lineX(from,to,y,z,{lastRepeater=false}={}){const sign=Math.sign(to-from),travel=sign>0?'east':'west',path=[];let dust=0;for(let x=from;;x+=sign){if((x===to&&lastRepeater)||dust===11){rep(x,y,z,travel);dust=0;}else{wire(x,y,z);dust++;}path.push(p(x,y,z));if(x===to)break;}routes.push({net,type:'horizontal',path,travel});}
 const reference=makeMemorySubarray({kind:'rom',bits:16,id:'rom16x16'});
 for(let stack=0;stack<8;stack++)for(let tier=0;tier<2;tier++){
  const card=stack+8*tier,origin=p(0,136*tier,96*stack),d=makeMemorySubarray({kind:'rom',bits:16,id:'rom16x16',image:image.slice(card*16,card*16+16)}),omit=new Set();
  if(tier)for(const pad of d.ports.address.positions){for(const dx of[0,pad.x===32?-1:1])for(const dy of[0,-1])omit.add(key(p(pad.x+dx,pad.y+dy,pad.z)));}
  group='card';net='card'+card;
  for(const v of d.blocks){const q=p(v.position.x,v.position.y+origin.y,v.position.z+origin.z);if(omit.has(key(v.position))){removed.push({card,position:q,block:v.block,reason:'Upper card uses continuous shared low-address columns.'});continue;}put(q.x,q.y,q.z,v.block);}
  for(const c of d.configuration)configuration.push({...c,address:16*card+c.address,card,position:p(c.position.x,c.position.y+origin.y,c.position.z+origin.z)});
  cards.push({card,stack,tier,origin,source_blocks:d.blocks.length,removed_source_cells:omit.size});
 }
 // The 136-level offset preserves the positive solid phase of all four towers.
 group='shared_low_address_extensions';for(let s=0;s<8;s++)for(let b=0;b<4;b++){net='address'+b;const x=b%2?18:30,z=(b<2?-18:-6)+96*s;for(let y=122;y<=136;y++)if(y%2)block(x,y,z);else put(x,y,z,{id:'minecraft:redstone_torch'});}
 const address=[];
 // All eight external binary address rails have distinct height planes.
 const depths=[-4,-8,-12,-16,-25,-21,-33,-29];
 for(let b=0;b<8;b++){
  group='address_global_rails';net='address'+b;const y=depths[b],last=(b%4<2?-18:-6)+(b>=4?-18:0)+7*96;
  wire(88,y,-54);rep(88,y,-53,'south');address.push(p(88,y,-54));const path=[p(88,y,-54),p(88,y,-53)];
  for(let z=-52;z<=last;z++){if(((z%12)+12)%12===(b<4?0:6))rep(88,y,z,'south');else wire(88,y,z);path.push(p(88,y,z));}routes.push({net,type:'address_trunk',path,travel:'south'});
  for(let s=0;s<8;s++){
   const local=b%4,z=(local<2?-18:-6)+(b>=4?-18:0)+96*s;
   group='address_branch';rep(87,y,z,'west');
   if(b<4){const x=local%2?14:34;lineX(86,x+1,y,z,{lastRepeater:true});group='address_pad_rise';tower(x,z,y,0);rep(local%2?15:33,0,z,local%2?'east':'west');}
   else{const x=local%2?12:0;lineX(86,x+1,y,z,{lastRepeater:true});group='high_address_towers';tower(x,z,y,267);}
  }
 }
 const highMismatch=[];
 for(let stack=0;stack<8;stack++)for(let tier=0;tier<2;tier++){
  const card=stack+8*tier,y=131+136*tier,Z=96*stack;group='high_card_decoder';net='card_mask'+card;
  // Exact paired-mismatch motif, refreshed into an OR block; no final inversion.
  for(let pair=0;pair<2;pair++){
   const z=-36+12*pair+Z;
   for(let arm=0;arm<2;arm++){
    const target=(card>>(2*pair+arm))&1,left=arm===0;
    comp(left?1:11,y,z,'redstone_wire',target?{north:'side',south:'side',east:'side',west:'side'}:undefined);
    if(target){block(left?2:10,y,z);wall(left?3:9,y,z,left?'east':'west');}else{rep(left?2:10,y,z,left?'east':'west');wire(left?3:9,y,z);}
    wire(left?4:8,y,z);rep(left?5:7,y,z,left?'east':'west');
   }
   block(6,y,z);const sign=pair?-1:1;rep(6,y,z+sign,pair?'north':'south');for(let n=2;n<=4;n++)wire(6,y,z+sign*n);rep(6,y,z+sign*5,pair?'north':'south');
  }
  block(6,y,Z-30);rep(7,y,Z-30,'east');wire(8,y,Z-30);rep(9,y,Z-30,'east');highMismatch.push(p(9,y,Z-30));
  group='high_card_mask_distribution';wire(10,y,Z-30);for(let n=1;n<=4;n++)wire(10,y+n,Z-30+n);for(let x=9;x>=6;x--)wire(x,y+4,Z-26);
  for(let z=-25;z<=52;z++)if(((z%12)+12)%12===2)rep(6,y+4,Z+z,'south');else wire(6,y+4,Z+z);
  routes.push({net,type:'high_mask_rise_turn_and_trunk',travel:'south',path:[p(10,y,Z-30),...Array.from({length:4},(_,n)=>p(10,y+n+1,Z-29+n)),...Array.from({length:4},(_,n)=>p(9-n,y+4,Z-26)),...Array.from({length:78},(_,n)=>p(6,y+4,Z-25+n))]});
  for(let j=0;j<8;j++)for(const right of[false,true]){
   const z=8*j+Z,gate=right?12:0;rep(right?7:5,y+4,z-4,right?'east':'west');
   for(let n=0;n<=4;n++)wire(right?8+n:4-n,y+4-n,z-4);rep(gate,y,z-3,'south');
  }
  for(let b=0;b<16;b++){
   const right=b>=8,j=b%8,z=8*j+Z,x=right?10:2,base=123+136*tier;net='selected_'+card+'_'+b;group='capped_read_tap';
   rep(x,base,z-1,'north');block(x,base+1,z-1);tower(x,z-2,base,y);
   group='high_card_output_selector';rep(right?11:1,y,z-2,right?'east':'west');cmp(right?12:0,y,z-2,right?'east':'west');rep(right?13:-1,y,z-2,right?'east':'west');
   group='card_selected_output_route';const col=right?36+4*j:-4-4*j;lineX(right?14:-2,col+(right?-1:1),y,z-2,{lastRepeater:true});
  }
 }
 const read=[];
 for(let b=0;b<16;b++){
  const right=b>=8,j=b%8,x=right?36+4*j:-4-4*j,rail=right?x+2:x-2;net='read'+b;group='paired_return_columns';
  for(let s=0;s<8;s++){const z=8*j-2+96*s;tower(x,z,131,271);rep(right?x+1:x-1,271,z,right?'east':'west');}
  group='global_read_return';const path=[];for(let z=8*j-2+7*96;z>=-54;z--){if(((z%12)+12)%12===(8*j+4)%12)rep(rail,271,z,'north');else wire(rail,271,z);path.push(p(rail,271,z));}rep(rail,271,-55,'north');wire(rail,271,-56);path.push(p(rail,271,-55),p(rail,271,-56));routes.push({net,type:'return_trunk',path,travel:'north'});read.push(p(rail,271,-56));
 }
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={},group_counts={};for(const a of A){box.from[a]=Infinity;box.to[a]=-Infinity;}for(const v of blocks){for(const a of A){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}histogram[v.block.id]=(histogram[v.block.id]??0)+1;group_counts[groups[key(v.position)]]=(group_counts[groups[key(v.position)]]??0)+1;}
 const ports={address:{width:8,bit_order:'lsb_first',direction:'input',positions:address,polarity:'active_high',protocol:'held physical address, not request valid'},read_data:{width:16,bit_order:'lsb_first',direction:'output',positions:read,polarity:'active_high',protocol:'combinational physical data; capture/ready outside module'}};
 const signals=[...address.map((position,b)=>({name:'address'+b,position,property:'power'})),...read.map((position,b)=>({name:'read'+b,position,property:'power'})),...highMismatch.map((position,n)=>({name:'card_mismatch'+cards[n].card,position,property:'powered'}))];
 return{status:'offline_generated_program_read_path_pending_static_and_native_checks',id,kind:'program_rom',words:256,bits:16,blocks,box,ports,cards,configuration,removed_source_cells:removed,groups,nets,routes,circuit:{id,dimension:'minecraft:overworld',description:'Proposed 256x16 ROM physical address/read path only; no arbitration, owner latches or handshake.',signals,buses:[{name:'address',bits:Array.from({length:8},(_,b)=>'address'+b)},{name:'read',bits:Array.from({length:16},(_,b)=>'read'+b)}]},sources:{'hardware/memory-layout-subarray.mjs':expected,...reference.sources},metrics:{blocks:blocks.length,configuration_bits:configuration.length,cards:16,stacks:8,removed_upper_input_cells:removed.length,histogram,group_counts,dimensions:Object.fromEntries(A.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:A.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1)},missing:['Program channel arbitration, owned address/response latches, reset/quiesce and valid/ready generation.','No construction plan or world coordinates selected.','Static adjacency/support/route review and native initialization/timing remain required.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out,'Explicit offline output directory required');mkdirSync(out,{recursive:true});const d=makeProgramROM();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
