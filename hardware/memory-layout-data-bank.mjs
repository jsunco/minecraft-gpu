// Offline four-card writable bank. Real storage/address/write/read geometry;
// no host memory, service imports or native calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeMemorySubarray,key} from './memory-layout-subarray.mjs';
const P=(x,y,z)=>({x,y,z}),S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},A=['x','y','z'];
export function makeDataBank64(){
 const source='d7b65b4434cdd3ffa31de4ae1e015ff6683ba1e47cbe7a765f24cea0bea1cc19';assert.equal(createHash('sha256').update(readFileSync(new URL('./memory-layout-subarray.mjs',import.meta.url))).digest('hex'),source);
 const card=makeMemorySubarray({kind:'ram',bits:8,id:'ram16x8'}),m=new Map(),nets={},groups={},routes=[],cards=[],omitted=[],edges=[];let net='',group='';
 const put=(p,block)=>{const k=key(p),old=m.get(k);if(old){assert.deepEqual(old.block,block,'collision '+k+' '+groups[k]+'/'+group);assert(block.id===S||nets[k]===net,'net collision '+k+' '+nets[k]+'/'+net);return;}m.set(k,{position:p,block});nets[k]=net;groups[k]=group;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});};
 const w=(x,y,z,props)=>dev(x,y,z,'redstone_wire',props),r=(x,y,z,d)=>dev(x,y,z,'repeater',{facing:F[d],delay:'1'}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'}),wall=(x,y,z,f)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing:f}}),E=(a,b,k)=>edges.push({from:a,to:b,kind:k});
 const tower=(x,z,lo,hi)=>{assert((hi-lo)%2===0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(P(x,y,z),{id:'minecraft:redstone_torch'});};
 const route=(name,points,{force=[],wireOnly=[]}={})=>{const path=[P(...points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],delta=b.map((v,j)=>v-a[j]),n=Math.abs(delta[0])+Math.abs(delta[2]);if(!n){assert.equal(delta[1],0);continue;}assert(n&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===n));for(let j=1;j<=n;j++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*j)));}let run=0,max=0;const refresh=[];for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1],old=m.get(key(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire',name+' '+key(p));assert.equal(nets[key(p)],net);run=0;}else{const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(key(p)))&&!wireOnly.includes(key(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');refresh.push(p);run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);assert(run<=14,name+' attenuation '+key(p));}}if(i)E(path[i-1],p,name);}routes.push({name,net,path,refresh,max_dust_run:max});return path;};
 // Tier140 retains the positive phases, leaves a real gap between independent
 // card-mismatch columns, and preserves each original RAM word/lock device.
 for(let stack=0;stack<2;stack++)for(let tier=0;tier<2;tier++){
  const n=stack+2*tier,Y=140*tier,Z=64*stack,omit=new Set();if(tier){for(const pad of card.ports.address.positions)for(const dx of[0,pad.x===32?-1:1])for(const dy of[0,-1])omit.add(key(P(pad.x+dx,pad.y+dy,pad.z)));for(const pad of card.ports.write_data.positions)for(const dx of[0,pad.x===-2?1:-1])for(const dy of[0,-1])omit.add(key(P(pad.x+dx,pad.y+dy,pad.z)));for(let bit=0;bit<8;bit++)omit.add(key(P(bit<4?0:12,0,8*(bit%4))));}
  group='inherited_card';net='card'+n;for(const v of card.blocks){const p=P(v.position.x,v.position.y+Y,v.position.z+Z);if(omit.has(key(v.position))){omitted.push({card:n,position:p,block:v.block,reason:'Upper external address/data pads replaced by continuous positive columns; no storage or lock omitted.'});continue;}put(p,structuredClone(v.block));}cards.push({card:n,stack,tier,origin:P(0,Y,Z),source_blocks:card.blocks.length,omitted_cells:omit.size});
 }
 group='shared_address_data_columns';for(let s=0;s<2;s++)for(const[x,z,n]of[[30,-18,'address0'],[18,-18,'address1'],[30,-6,'address2'],[18,-6,'address3'],...Array.from({length:8},(_,b)=>[b<4?0:12,8*(b%4),'data'+b])]){net=n;for(let y=122;y<=140;y++)if(y%2)solid(x,y,z+64*s);else put(P(x,y,z+64*s),{id:'minecraft:redstone_torch'});}
 const address=[],depth=[-4,-8,-12,-16,-25,-21];
 for(let b=0;b<6;b++){
  group='global_address_spine';net='address'+b;const y=depth[b],last=(b<4?(b<2?-18:-6):-36)+64;w(88,y,-54);r(88,y,-53,'south');address.push(P(88,y,-54));route('address_spine_'+b,[[88,y,-52],[88,y,last]]);
  for(let s=0;s<2;s++){const z=(b<4?(b<2?-18:-6):-36)+64*s,x=b<4?(b%2?14:34):(b%2?12:0);group='address_branches';r(87,y,z,'west');route('address_branch_'+b+'_'+s,[[86,y,z],[x+2,y,z]]);r(x+1,y,z,'west');group='address_rises';if(b<4){tower(x,z,y,0);r(b%2?15:33,0,z,b%2?'east':'west');E(P(b%2?15:33,0,z),P(b%2?16:32,0,z),'low_address_floor_feed');}else tower(x,z,y,135);}
 }
 const writeData=[],dataDepth=Array.from({length:8},(_,b)=>-28-4*b);
 for(let b=0;b<8;b++){
  const y=dataDepth[b],j=b%4,right=b>=4;net='data'+b;group='global_write_data_spine';w(6,y,-54);r(6,y,-53,'south');writeData.push(P(6,y,-54));route('data_spine_'+b,[[6,y,-52],[6,y,8*j+64]],{wireOnly:[key(P(6,y,8*j)),key(P(6,y,8*j+64))]});
  for(let s=0;s<2;s++){const z=8*j+64*s,x=right?16:-4;group='write_data_branches';r(right?7:5,y,z,right?'east':'west');route('data_branch_'+b+'_'+s,[[right?8:4,y,z],[right?14:-2,y,z]]);r(right?15:-3,y,z,right?'east':'west');tower(x,z,y,0);r(right?15:-3,0,z,right?'west':'east');E(P(right?15:-3,0,z),P(right?14:-2,0,z),'data_floor_feed');}
 }
 const mismatch=[],qualified=[];net='write_open';group='global_write_spine';w(88,-59,-54);r(88,-59,-53,'south');const writeOpen=P(88,-59,-54);route('write_open_spine',[[88,-59,-52],[88,-59,35]]);
 for(let s=0;s<2;s++){const Z=64*s;net='write_open';group='write_open_branch';r(87,-59,Z-29,'west');route('write_branch_'+s,[[86,-59,Z-29],[16,-59,Z-29]]);r(15,-59,Z-29,'west');tower(14,Z-29,-59,-3);r(14,-3,Z-28,'south');w(14,-3,Z-27);r(14,-3,Z-26,'south');w(14,-3,Z-25);tower(14,Z-24,-3,137);
  for(let tier=0;tier<2;tier++){
   const cardNo=s+2*tier,y=-5+140*tier,high=y+136;net='card_mismatch'+cardNo;group='two_bit_card_mismatch';const z=Z-36;
   for(let a=0;a<2;a++){const wanted=(cardNo>>a)&1,x=a?11:1;w(x,y,z,wanted?{north:'side',south:'side',east:'side',west:'side'}:undefined);if(wanted){solid(a?10:2,y,z);wall(a?9:3,y,z,a?'west':'east');}else{r(a?10:2,y,z,a?'west':'east');w(a?9:3,y,z);}w(a?8:4,y,z);r(a?7:5,y,z,a?'west':'east');}solid(6,y,z);r(6,y,z+1,'south');route('card_mismatch_export_'+cardNo,[[6,y,z+2],[10,y,z+2]]);r(10,y,z+3,'south');tower(10,z+4,y,high);mismatch.push(P(6,y,z+1));
   // Mismatch to the only local write-open comparator; shared raw WE is
   // independent of card selection and cannot by itself open a RAM row.
   group='card_write_qualifier';r(9,y,z+4,'west');route('mismatch_to_write_'+cardNo,[[8,y,z+4],[6,y,z+4],[4,y+2,z+4],[4,y+2,Z-21]]);r(5,y+2,Z-21,'east');
   net='write_open';r(13,y+2,Z-24,'west');route('write_rear_'+cardNo,[[12,y+2,Z-24],[6,y+2,Z-24],[6,y+2,Z-23]]);r(6,y+2,Z-22,'south');
   net='qualified_write'+cardNo;c(6,y+2,Z-21,'south');r(6,y+2,Z-20,'south');tower(6,Z-19,y+2,y+6);r(6,y+6,Z-18,'south');w(6,y+6,Z-17);E(P(6,y+6,Z-17),P(6,y+6,Z-16),'qualified_write_parent_pad');qualified.push(P(6,y+2,Z-21));
   // Same card mismatch masks the eight return branches at its top.
   net='card_mismatch'+cardNo;group='card_read_mask';r(10,high,Z-31,'south');route('read_mask_rise_'+cardNo,[[10,high,Z-30],[10,high+4,Z-26],[6,high+4,Z-26],[6,high+4,Z+20]],{force:[key(P(6,high+4,Z-25))]});
   for(let j=0;j<4;j++)for(const right of[false,true]){const z=8*j+Z,g=right?12:0;r(right?7:5,high+4,z-4,right?'east':'west');for(let n=0;n<=4;n++)w(right?8+n:4-n,high+4-n,z-4);r(g,high,z-3,'south');}
   for(let b=0;b<8;b++){const right=b>=4,j=b%4,z=8*j+Z,x=right?10:2,base=123+140*tier;net='selected_'+cardNo+'_'+b;group='capped_card_read_tap';r(x,base,z-1,'north');solid(x,base+1,z-1);tower(x,z-2,base,high);group='card_read_select';r(right?11:1,high,z-2,right?'east':'west');c(right?12:0,high,z-2,right?'east':'west');r(right?13:-1,high,z-2,right?'east':'west');const col=right?36+4*j:-4-4*j;route('card_return_'+cardNo+'_'+b,[[right?14:-2,high,z-2],[col+(right?-2:2),high,z-2]]);r(col+(right?-1:1),high,z-2,right?'east':'west');}
  }
 }
 const read=[];for(let b=0;b<8;b++){const right=b>=4,j=b%4,x=right?36+4*j:-4-4*j,rail=x+(right?2:-2);net='read'+b;group='read_return_columns';for(let s=0;s<2;s++){const z=8*j-2+64*s;tower(x,z,131,275);r(x+(right?1:-1),275,z,right?'east':'west');}group='bank_return_spine';route('read_return_'+b,[[rail,275,8*j-2+64],[rail,275,-54]]);r(rail,275,-55,'north');w(rail,275,-56);read.push(P(rail,275,-56));}
 const blocks=[...m.values()],box={from:{},to:{}},histogram={};for(const a of A){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const port=(direction,positions,meaning)=>({direction,width:positions.length,positions,bit_order:'lsb_first',polarity:'active_high',meaning});
 return{status:'offline_writable64_byte_bank_geometry_pending_static_native_checks',blocks,nets,groups,routes,edges,cards,omitted_source_cells:omitted,box,ports:{address:port('input',address,'Bank row/card6-bit address; stable before and throughout write_open.'),write_data:port('input',writeData,'8 actual parallel data sources; stable throughout write_open.'),write_open:port('input',[writeOpen],'Physical bank write phase, not request valid; only selected card/row may open.'),read_data:port('output',read,'Selected combinational8-bit bank return; external response latch/ready required.'),card_mismatch:port('diagnostic',mismatch,'High for unselected card.'),card_write_qualified:port('diagnostic',qualified,'Actual write-open comparator percard.')},metrics:{blocks:blocks.length,logical_bits:512,cards:4,inherited_card_blocks:4*card.blocks.length,omitted_external_cells:omitted.length,integration_blocks:blocks.length-(4*card.blocks.length-omitted.length),histogram,dimensions:Object.fromEntries(A.map(a=>[a,box.to[a]-box.from[a]+1])),legal_overworld_origin_y_range:[-64-box.from.y,319-box.to.y]},sources:{'hardware/memory-layout-subarray.mjs':source},missing:['Four independent bank placement and exact physical channel/bank selection fabric.','Request owners/address/data/response latches, write close/ready timing, reset/drain and all runtime arbitration.','Loader through actual write interface, native cold initialization, read/write/retention/race proof.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDataBank64();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
