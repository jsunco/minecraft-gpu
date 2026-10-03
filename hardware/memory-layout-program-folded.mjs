// Separate folded ROM derivative. Preserves every logical source and local card
// circuit; changes only placement, shared address spine, and complete return bus.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeProgramROM} from './memory-layout-program.mjs';
import {key} from './memory-layout-subarray.mjs';
const S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},P=(x,y,z)=>({x,y,z}),A=['x','y','z'];
const sha=b=>createHash('sha256').update(b).digest('hex');
export const FOLD_AXIS=68;
export function foldPosition(p,stack){return{x:stack<4?p.x:2*FOLD_AXIS-p.x,y:p.y,z:p.z-(stack<4?0:384)};}
export function foldBlock(b,stack){b=structuredClone(b);if(stack<4)return b;const q=b.properties;if(q?.facing&&['east','west'].includes(q.facing))q.facing=q.facing==='east'?'west':'east';if(q&&('east'in q||'west'in q)){[q.east,q.west]=[q.west,q.east];}return b;}
export function makeFoldedProgramROM({image=Array(256).fill(0),id='program_rom_folded'}={}){
 const baselineHash='7f073256af28a94fee2c37a82a440c314e116a7a96b85b236e3a1e92bacfc64b';assert.equal(sha(readFileSync(new URL('./memory-layout-program.mjs',import.meta.url))),baselineHash);
 const base=makeProgramROM({image}),cells=new Map(),groups={},nets={},routes=[],mappings=[];let group='',net='';
 const put=(p,b)=>{const k=key(p),old=cells.get(k);if(old){assert.deepEqual(old.block,b,'Collision '+k+' '+groups[k]+' / '+group);assert(b.id===S||nets[k]===net,'Net collision '+k);return;}cells.set(k,{position:p,block:b});groups[k]=group;nets[k]=net;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),comp=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});};
 const wire=(x,y,z)=>comp(x,y,z,'redstone_wire'),rep=(x,y,z,t)=>comp(x,y,z,'repeater',{facing:F[t],delay:'1'});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2===0)solid(x,y,z);else put(P(x,y,z),{id:'minecraft:redstone_torch'});};
 const lineX=(from,to,y,z,travel)=>{let run=0;const step=Math.sign(to-from),path=[];for(let x=from;;x+=step){if(x===from||x===to||run===11){rep(x,y,z,travel);run=0;}else{wire(x,y,z);run++;}path.push(P(x,y,z));if(x===to)break;}routes.push({net,type:'return_cross_collector',travel,path});};
 for(const v of base.blocks){const k=key(v.position),g=base.groups[k];if(['address_global_rails','global_read_return'].includes(g))continue;
  const stack=Math.floor((v.position.z+36)/96);assert(stack>=0&&stack<8);if(g==='address_branch'&&v.position.x>=67)continue;
  group=g;net=base.nets[k];const p=foldPosition(v.position,stack),b=foldBlock(v.block,stack);put(p,b);mappings.push({from:v.position,to:p,stack});
 }
 for(const r of base.routes){if(['address_trunk','return_trunk'].includes(r.type))continue;const stack=Math.floor((r.path[0].z+36)/96),path=r.path.filter(p=>!(r.type==='horizontal'&&r.net.startsWith('address')&&p.x>=67)).map(p=>foldPosition(p,stack));routes.push({...r,path,travel:stack>=4&&['east','west'].includes(r.travel)?F[r.travel]:r.travel});}
 const depth=[-4,-8,-12,-16,-25,-21,-33,-29],address=[];
 for(let b=0;b<8;b++){
  group='address_shared_spine';net='address'+b;const y=depth[b],end=(b%4<2?-18:-6)+(b>=4?-18:0)+288,path=[];
  wire(FOLD_AXIS,y,-54);rep(FOLD_AXIS,y,-53,'south');address.push(P(FOLD_AXIS,y,-54));path.push(P(FOLD_AXIS,y,-54),P(FOLD_AXIS,y,-53));
  for(let z=-52;z<=end;z++){if(((z%12)+12)%12===(b<4?0:6))rep(FOLD_AXIS,y,z,'south');else wire(FOLD_AXIS,y,z);path.push(P(FOLD_AXIS,y,z));}routes.push({net,type:'address_trunk',travel:'south',path});
  group='address_branch_source';for(let row=0;row<4;row++){const z=(b%4<2?-18:-6)+(b>=4?-18:0)+96*row;rep(FOLD_AXIS-1,y,z,'west');rep(FOLD_AXIS+1,y,z,'east');}
 }
 const read=[];
 for(let b=0;b<16;b++){
  const right=b>=8,j=b%8,col=right?36+4*j:-4-4*j,x0=right?col+2:col-2,zFront=-60-2*b;net='read'+b;
  for(let side=0;side<2;side++){
   const x=side?2*FOLD_AXIS-x0:x0;group='folded_read_longitudinal';const path=[];
   for(let z=8*j-2+288;z>zFront;z--){if(z===zFront+1||((z%12)+12)%12===(8*j+4)%12)rep(x,271,z,'north');else wire(x,271,z);path.push(P(x,271,z));}routes.push({net,type:'return_trunk',travel:'north',path});
   group='return_isolated_rise';tower(x,zFront,271,275);
   group='return_horizontal_merge';lineX(side?x-1:x+1,side?FOLD_AXIS+1:FOLD_AXIS-1,275,zFront,side?'west':'east');
  }
  group='return_output_column';tower(FOLD_AXIS,zFront,275,279);rep(FOLD_AXIS+1,279,zFront,'east');wire(FOLD_AXIS+2,279,zFront);read.push(P(FOLD_AXIS+2,279,zFront));
 }
 const configuration=base.configuration.map(v=>({...v,position:foldPosition(v.position,v.card%8)})),cards=base.cards.map(c=>({...c,column:c.stack<4?0:1,row:c.stack%4,transform:c.stack<4?'identity':'mirror_x_about_68_then_z_minus_384',origin:foldPosition(c.origin,c.stack)}));
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={},group_counts={};for(const a of A){box.from[a]=Infinity;box.to[a]=-Infinity;}for(const v of blocks){for(const a of A){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}histogram[v.block.id]=(histogram[v.block.id]??0)+1;group_counts[groups[key(v.position)]]=(group_counts[groups[key(v.position)]]??0)+1;}
 const occupied=new Set(blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)),rect=(Math.floor(box.to.x/16)-Math.floor(box.from.x/16)+1)*(Math.floor(box.to.z/16)-Math.floor(box.from.z/16)+1);
 const ports={address:{...base.ports.address,positions:address},read_data:{...base.ports.read_data,positions:read}},signals=[...address.map((position,b)=>({name:'address'+b,position,property:'power'})),...read.map((position,b)=>({name:'read'+b,position,property:'power'}))];
 return{status:'offline_folded_program_backing_generated_not_native_or_complete_memory',id,words:256,bits:16,blocks,box,ports,cards,configuration,groups,nets,routes,inherited_cell_mapping:mappings,sources:{'hardware/memory-layout-program.mjs':baselineHash,...base.sources},circuit:{id,dimension:'minecraft:overworld',description:'Folded ROM address/read backend only; controller and handshake missing.',signals,buses:[{name:'address',bits:Array.from({length:8},(_,b)=>'address'+b)},{name:'read',bits:Array.from({length:16},(_,b)=>'read'+b)}]},metrics:{blocks:blocks.length,configuration_bits:configuration.length,cards:16,paired_stacks:8,histogram,group_counts,dimensions:Object.fromEntries(A.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:A.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),relative_occupied_chunk_columns:occupied.size,relative_rectangular_chunk_columns:rect,legal_overworld_origin_y_range:[-64-box.from.y,319-box.to.y]},comparison:{baseline_blocks:base.metrics.blocks,block_delta:blocks.length-base.metrics.blocks,baseline_dimensions:base.metrics.dimensions,baseline_bounding_volume:base.metrics.bounding_volume,baseline_occupied_columns:444,baseline_rectangular_columns:450,baseline_sources_preserved:true},missing:['Physical owned request/address/response registers and two-consumer arbitration/handshake.','Actual response-settle qualification and native/transient/initialization acceptance.','Whole-machine placement, loading access and build plans.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out,'Explicit offline output directory required');mkdirSync(out,{recursive:true});const d=makeFoldedProgramROM();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify({metrics:d.metrics,comparison:d.comparison,ports:d.ports}));}
