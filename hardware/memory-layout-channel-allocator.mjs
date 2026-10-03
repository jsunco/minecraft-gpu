// Original-order four-channel grant matrix. Pure physical combinational map.
// Free-request inputs must come from retained global-claim exclusion; a physical
// capture/close barrier is still required around this matrix. No host stepping.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeDataOwner} from './memory-layout-data-owner.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeChannelAllocator(){
 const h='c6858fd324568c5a467baa5f5cd10d414a0ce86b94ef13afa0ff86b0689231a3';assert.equal(createHash('sha256').update(readFileSync(new URL('./memory-layout-data-owner.mjs',import.meta.url))).digest('hex'),h);
 const parent=makeDataOwner(),map=new Map(),nets={},routes=[],matrices=[],links=[],grants=[],busy=[],last=[];let net='';
 const put=(p,b)=>{const old=map.get(K(p));if(old){assert.deepEqual(old.block,b,'collision '+K(p));assert(b.id===S||nets[K(p)]===net,'foreign net '+K(p));return;}map.set(K(p),{position:p,block:b});nets[K(p)]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d)=>dev(x,y,z,'repeater',{facing:F[d],delay:'1'}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2)put(P(x,y,z),{id:'minecraft:redstone_torch'});else solid(x,y,z);};
 function route(name,points){const path=[P(...points[0])];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dz=b[2]-a[2];assert.equal(a[1],b[1]);assert(!dx||!dz);for(let i=1;i<=Math.abs(dx)+Math.abs(dz);i++)path.push(P(a[0]+Math.sign(dx)*i,a[1],a[2]+Math.sign(dz)*i));}let run=0,max=0;for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1];if(map.has(K(p))){assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire',name+' occupied '+K(p));assert.equal(nets[K(p)],net);run=0;continue;}if(a&&b&&run>=10&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);assert(run<=14,name);}}routes.push({name,net,path,max_dust_run:max});}
 const subset=parent.blocks.filter(v=>['eligible_columns','priority_product'].includes(parent.groups[K(v.position)]));
 for(let channel=0;channel<4;channel++){
  const X=128*channel,Y=80*channel,Q=(x,y,z)=>P(x+X,y+Y,z);
  for(const v of subset){net='c'+channel+'/'+parent.nets[K(v.position)];put(Q(v.position.x,v.position.y,v.position.z),v.block);}
  net='busy'+channel;w(X+48,Y+1,8);r(X+48,Y+1,7,'north');w(X+48,Y+1,6);r(X+48,Y+1,5,'north');tower(X+48,4,Y+1,Y+29);busy.push(Q(48,1,8));
  for(let i=0;i<8;i++){
   const y=Y+1+4*i,top=y+36,z=-12-4*i,end=-54-4*i,x=X+5*i;
   net='busy'+channel;r(X+48,y,3,'north');w(X+48,y,2);r(X+47,y,2,'west');for(let u=46;u>=44;u--)w(X+u,y,2);r(X+44,y,1,'north');
   net='grant'+channel+'_'+i;c(X+44,y,0,'east');r(X+45,y,0,'east');w(X+46,y,0);grants.push(Q(46,1+4*i,0));const gx=X+68+4*i;r(X+47,y,0,'east');route('grant_to_rise_'+channel+'_'+i,[[X+48,y,0],[gx,y,0],[gx,y,z+2]]);r(gx,y,z+1,'north');tower(gx,z,y,top);r(gx,top,z-1,'north');route('grant_to_remove_'+channel+'_'+i,[[gx,top,z-2],[gx,top,end+2],[X+60,top,end+2]]);r(X+60,top,end+1,'north');
   // Each eligibility column extends with its original positive phase. Its
   // outgoing data travels above the priority plane, not through other columns.
   net='c'+channel+'/eligible'+i;for(let yy=Y+30;yy<=top;yy++)if((yy-(Y+1))%2)put(P(x,yy,-5),{id:'minecraft:redstone_torch'});else solid(x,yy,-5);
   r(x,top,-6,'north');route('availability_to_remove_'+channel+'_'+i,[[x,top,-7],[x,top,end],[X+58,top,end]]);r(X+59,top,end,'east');net='remaining'+channel+'_'+i;c(X+60,top,end,'east');r(X+61,top,end,'east');w(X+62,top,end);
   matrices.push({channel,consumer:i,grant_gate:Q(44,1+4*i,0),busy_mask:Q(44,1+4*i,1),availability_gate:P(X+60,top,end),grant_mask:P(X+60,top,end+1),available_source:P(x,top,-5)});
   if(channel<3){r(X+63,top,end,'east');tower(X+64,end,top,Y+81);r(X+65,Y+81,end,'east');const nx=X+128+5*i;route('remaining_to_next_'+channel+'_'+i,[[X+66,Y+81,end],[nx,Y+81,end],[nx,Y+81,-9]]);r(nx,Y+81,-8,'south');links.push({channel,consumer:i,driver:P(nx,Y+81,-8),next_input:P(nx,Y+81,-7)});}else last.push(P(X+62,top,end));
  }
 }
 const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const port=(direction,positions)=>({direction,width:positions.length,positions,polarity:'active_high',order:'channel_major_consumer_minor'});
 return{status:'offline_original_order_grant_matrix_barrier_and_claim_exclusion_pending',blocks,nets,routes,matrices,links,box,ports:{free_request:port('input',Array.from({length:8},(_,i)=>P(5*i,1,-7))),channel_busy:port('input',busy),grant:port('output',grants),remaining:port('diagnostic',last)},metrics:{blocks:blocks.length,preserved_priority_subset_positions:subset.length*4,priority_comparators:144,idle_mask_comparators:32,availability_remove_comparators:32,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},source_sha256:{'hardware/memory-layout-data-owner.mjs':h},logic:'For channels in ascending order: select the first available consumer only if this channel is idle, then remove its grant from availability before the next channel. Each active channel claims no new request.',missing:['Physical raw read/write eligibility and retained-active owner claim exclusion feeding free_request.','Retained full8-address/type/data for each global channel and physical owner capture/close admission barrier.','Four-channel bank routing, arbitration and return paths; original complete cost and fused comparison.','Dynamic/native timing and global placement.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeChannelAllocator();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
