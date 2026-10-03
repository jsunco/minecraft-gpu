// Physical fixed-priority ownership plus held request payload. This is an
// unselected bank-owned fabric component, not a complete LSU memory controller.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},AX=['x','y','z'];
export function makeDataOwner(){
 const cells=new Map(),groups={},nets={},stores=[],priority=[],muxes=[],routes=[];let group='',net='';
 const put=(p,block)=>{const k=K(p),old=cells.get(k);if(old){assert.deepEqual(old.block,block,'collision '+k+' '+groups[k]+'/'+group);assert(block.id===S||nets[k]===net,'net collision '+k);return;}cells.set(k,{position:p,block});groups[k]=group;nets[k]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});};
 const w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,t)=>dev(x,y,z,'repeater',{facing:F[t],delay:'1'}),c=(x,y,z,t)=>dev(x,y,z,'comparator',{facing:F[t],mode:'subtract'}),wall=(x,y,z,facing)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing}});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(P(x,y,z),{id:'minecraft:redstone_torch'});};
 const line=(name,a,b,wireOnly=[])=>{assert(a.y===b.y&&(a.x===b.x||a.z===b.z));const n=Math.abs(a.x-b.x)+Math.abs(a.z-b.z),dx=Math.sign(b.x-a.x),dz=Math.sign(b.z-a.z),path=[],refresh=[];let run=0,max=0;for(let i=0;i<=n;i++){const p=P(a.x+i*dx,a.y,a.z+i*dz);path.push(p);if(i>0&&i<n&&run>=10&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,dx>0?'east':dx<0?'west':dz>0?'south':'north');refresh.push(p);run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);}}routes.push({name,net,path,refresh,max_dust_run:max});};
 const eligible=[],candidates=[],owners=[],payload=[],fieldNames=[...Array.from({length:6},(_,b)=>'local_address'+b),...Array.from({length:8},(_,b)=>'write_data'+b),'is_write'];
 group='eligible_columns';for(let j=0;j<8;j++){net='eligible'+j;const x=5*j;w(x,1,-7);r(x,1,-6,'south');tower(x,-5,1,29);eligible.push(P(x,1,-7));}
 // Product i = Ei AND !E0 AND ... AND !E(i-1), using normalized masks.
 // Eight physically separate retained grants avoid a hidden binary decoder.
 for(let i=0;i<8;i++){
  const y=1+4*i;group='priority_product';net='product'+i;put(P(-2,y,0),{id:'minecraft:redstone_block'});r(-1,y,0,'east');
  for(let j=0;j<=i;j++){
   const x=5*j;net='eligible'+j;r(x,y,-4,'south');if(j===i){solid(x,y,-3);net='not_eligible'+j;wall(x+1,y,-3,'east');}else{w(x,y,-3);w(x+1,y,-3);}w(x+2,y,-3);w(x+2,y,-2);r(x+2,y,-1,'south');
   net='product'+i;w(x,y,0);r(x+1,y,0,'east');c(x+2,y,0,'east');r(x+3,y,0,'east');if(j<i)w(x+4,y,0);
   priority.push({consumer:i,mask_consumer:j,wanted:j===i,gate:P(x+2,y,0),rear:P(x+1,y,0),side:P(x+2,y,-1),inverter:j===i?P(x+1,y,-3):null});
  }
  line('priority_tail_'+i,P(5*i+4,y,0),P(42,y,0));r(43,y,0,'east');net='owner'+i;group='owner_store';r(44,y,0,'east');w(45,y,0);r(46,y,0,'east');w(47,y,0);owners.push(P(47,y,0));stores.push({name:'owner',bit:i,driver:P(43,y,0),storage:P(44,y,0),lock:P(44,y,1),terminal:P(47,y,0)});
  net='hold_owner';r(44,y,1,'north');for(let x=44;x<=46;x++)w(x,y,2);r(47,y,2,'west');
 }
 group='owner_hold';net='open_owner';w(52,1,10);r(51,1,10,'west');solid(50,1,10);net='hold_owner';wall(49,1,10,'west');w(48,1,10);r(48,1,9,'north');for(let z=8;z>=6;z--)w(48,1,z);r(48,1,5,'north');tower(48,4,1,29);
 // Positive hold taps at each word level return north, separated from owner Q.
 for(let i=0;i<8;i++){const y=1+4*i;r(48,y,3,'north');w(48,y,2);}
 // Owner Q is inverted once per consumer, then drives all15 branch masks.
 for(let i=0;i<8;i++){
  const y=1+4*i;group='owner_mask';net='owner'+i;r(48,y,0,'east');solid(49,y,0);net='not_owner'+i;wall(50,y,0,'east');line('owner_mask_feed_'+i,P(51,y,0),P(64,y,0));line('owner_mask_spine_'+i,P(64,y,1),P(64,y,122),Array.from({length:15},(_,b)=>K(P(64,y,8*b+6))));
  for(let b=0;b<15;b++){
   const z=8*b+8;group='payload_branch';net='candidate_'+i+'_'+b;w(62,y,z);r(61,y,z,'west');candidates.push(P(62,y,z));net='selected_'+b;c(60,y,z,'west');r(59,y,z,'west');muxes.push({consumer:i,field:b,gate:P(60,y,z),rear:P(61,y,z),mask:P(60,y,z-1),collector:P(58,y,z),input:P(62,y,z)});
   net='not_owner'+i;r(63,y,z-2,'west');w(62,y,z-2);w(61,y,z-2);w(60,y,z-2);r(60,y,z-1,'south');
  }
 }
 for(let b=0;b<15;b++){
  const z=8*b+8;group='payload_collector';net='selected_'+b;tower(58,z,1,29);put(P(58,30,z),{id:'minecraft:redstone_torch'});solid(58,31,z);put(P(58,32,z),{id:'minecraft:redstone_torch'});r(57,32,z,'west');w(56,32,z);r(55,32,z,'west');
  group='payload_store';net='payload'+b;r(54,32,z,'west');w(53,32,z);r(52,32,z,'west');w(51,32,z);stores.push({name:'payload',bit:b,field:fieldNames[b],driver:P(55,32,z),storage:P(54,32,z),lock:P(54,32,z+1),terminal:P(51,32,z)});
  net='hold_payload';r(54,32,z+1,'north');r(49,32,z+2,'east');for(let x=50;x<=54;x++)w(x,32,z+2);
 }
 for(let b=0;b<15;b++){const z=8*b+8;group='payload_export';net='payload'+b;r(51,31,z-1,'north');solid(51,32,z-1);tower(51,z-2,31,35);r(50,35,z-2,'west');w(49,35,z-2);payload.push(P(49,35,z-2));}
 group='payload_hold';net='open_payload';w(48,32,-4);r(48,32,-3,'south');solid(48,32,-2);net='hold_payload';wall(48,32,-1,'south');line('payload_hold_spine',P(48,32,0),P(48,32,122),Array.from({length:15},(_,b)=>K(P(48,32,8*b+10))));
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={},group_counts={};for(const a of AX){box.from[a]=Infinity;box.to[a]=-Infinity;}for(const v of blocks){for(const a of AX){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}histogram[v.block.id]=(histogram[v.block.id]??0)+1;group_counts[groups[K(v.position)]]=(group_counts[groups[K(v.position)]]??0)+1;}
 const port=(direction,positions,meaning)=>({direction,width:positions.length,positions,polarity:'active_high',bit_order:'consumer_major_lsb_first',meaning});
 return{status:'unselected_offline_owned_payload_component_not_complete_channel',blocks,groups,nets,box,routes,stores,priority,muxes,field_names:fieldNames,ports:{eligible:port('input',eligible,'Eight post-bank-match eligible consumers; upstream must physically implement read-first write exclusion.'),candidate_payload:port('input',candidates,'8x15 bank-local address6,data8,is_write1; fixed while eligible valid and until owned acknowledgement.'),owner:port('diagnostic',owners,'Eight retained one-hot owner Q pads; valid only once controller verifies one owner and closes bank.'),payload:port('output',payload,'Fifteen retained request fields; no bank routes included.'),open_owner:port('unresolved_controller_input',[P(52,1,10)],'Default low closes owner stores after propagation.'),open_payload:port('unresolved_controller_input',[P(48,32,-4)],'Default low closes payload stores; only open after owner bank closed.')},metrics:{blocks:blocks.length,retained_owner_bits:8,retained_request_bits:15,priority_product_comparators:36,payload_select_comparators:120,dimensions:Object.fromEntries(AX.map(a=>[a,box.to[a]-box.from[a]+1])),histogram,group_counts},missing:['Raw8-LSU read/write-valid/address/data mux and global read-first eligibility; four bank-match routes.','Actual phase generator/ACTIVE/owner-valid/reset-drain logic; stores are not an autonomous arbiter.','Bank address/data/write routes, closed-row write acknowledgement, response latch and owner-qualified read/write ready returns.','Complete comparison against original arbitrary-channel then bank-arbiter baseline; variant remains unselected.','Native initialization, ownership/closure timing, all eight contender races and SRAM write/read retention.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDataOwner();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
