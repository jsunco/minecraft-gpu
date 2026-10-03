// Whole-lane integration increment only. No plans, services or native entry.
import assert from 'node:assert/strict';
import {makeFullLaneAluLayout} from './full-lane-alu-layout.mjs';

const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
const opposite={east:'west',west:'east',north:'south',south:'north'};
export function makeFullLaneAluAdapters(){
 const base=makeFullLaneAluLayout(),map=new Map(base.blocks.map(v=>[K(v.position),structuredClone(v)])),owner={...base.owner};
 const adapters=[],selectors=[],routes=[],counts={base:map.size};
 function put(p,id,properties,net){const k=K(p);assert(!map.has(k),`Collision ${k}: ${net}/${owner[k]}`);map.set(k,{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})}});owner[k]=net;}
 function support(p,net){const q={...p,y:p.y-1},old=map.get(K(q));if(old){assert(old.block.id.endsWith('_concrete'),`Support ${K(q)} ${net}`);return;}put(q,'light_gray_concrete',null,net);}
 function comp(p,id,properties,net){support(p,net);put(p,id,properties,net);}
 const wire=(p,n)=>comp(p,'redstone_wire',null,n),rep=(p,d,n)=>comp(p,'repeater',{facing:opposite[d],delay:'1'},n);
 function route(points,net){const ps=[P(...points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=b.map((v,k)=>v-a[k]),n=Math.abs(d[0])+Math.abs(d[2]);assert(n&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===n));for(let j=1;j<=n;j++)ps.push(P(...a.map((v,k)=>v+Math.sign(d[k])*j)));}
  const candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1];if(a.y===b.y&&b.y===c.y&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z)candidates.push(i);}candidates.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(const b of candidates.slice(1))for(const a of candidates){if(a>=b)break;if(costs.has(a)&&b-a<=13&&(costs.get(b)??Infinity)>costs.get(a)+(b===ps.length?0:1)){costs.set(b,costs.get(a)+(b===ps.length?0:1));prev.set(b,a);}}
  assert(prev.has(ps.length),'Unrefreshable '+net);const chosen=[];for(let a=prev.get(ps.length);a!==-1;a=prev.get(a))chosen.push(a);
  for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(chosen.includes(i))rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north',net);else wire(p,net);}
  routes.push({net,positions:ps,refresh_indices:chosen.sort((a,b)=>a-b)});
 }
 // Positive two-inversion columns preserve the old source's complete horizontal
 // fanout. In particular LOAD's packed north/east neighbors cannot accept a
 // naive same-height wire without coupling carry or the closed-lock trunk.
 for(const old of base.blocks.filter(v=>v.block.id==='minecraft:lever')){
  const p=old.position,n='source_adapter_'+K(p),y=p.y;
  assert(map.get(K({...p,y:y-1})).block.id.endsWith('_concrete'));
  map.set(K(p),{position:p,block:{id:'minecraft:redstone_wire'}});owner[K(p)]=n;
  put({...p,y:y-2},'redstone_torch',null,n);put({...p,y:y-3},'light_gray_concrete',null,n);
  put({...p,y:y-4},'redstone_torch',null,n);put({...p,y:y-5},'light_gray_concrete',null,n);
  rep(P(p.x-1,y-5,p.z),'east',n);wire(P(p.x-2,y-5,p.z),n);
  adapters.push({original_source:p,before:old.block,input:P(p.x-2,y-5,p.z),receiver:P(p.x-1,y-5,p.z),output:p,polarity:'positive_two_inversions',native_verified:false});
 }
 counts.source_adapters=map.size-counts.base;
 const choices=['zero','a','trial','self','q','cmp'];
 // Six separately inhibited byte branches. Select polarity is active high;
 // each local wall torch generates !select. Every side input is refreshed to15.
 // Choice-data sources remain explicit disconnected ports in this increment.
 for(let c=0;c<choices.length;c++){
  const x=-90+12*c,select='w_parallel_select_'+choices[c],n='W_select_mask_'+choices[c];
  wire(P(x,-8,3),n);rep(P(x,-8,4),'south',n);put(P(x,-8,5),'light_gray_concrete',null,n);
  put(P(x,-8,6),'redstone_wall_torch',{facing:'south'},n);
  for(let z=7;z<=97;z++){if(z>=19&&(z-19)%12===0)rep(P(x,-8,z),'south',n);else wire(P(x,-8,z),n);}
  const data=[];
  for(let b=0;b<8;b++){
   const z=14+12*b,cx=x+8,dn='W_choice_'+choices[c]+'_'+b;
   rep(P(x+1,-8,z-1),'east',n);
   route([[x+2,-8,z-1],[x+6,-12,z-1]],n);
   rep(P(x+7,-12,z-1),'east',n);
   wire(P(cx,-12,z-4),dn);rep(P(cx,-12,z-3),'south',dn);wire(P(cx,-12,z-2),dn);
   comp(P(cx,-12,z-1),'comparator',{facing:'north',mode:'subtract'},dn);rep(P(cx,-12,z),'south',dn);
   data.push({bit:b,input:P(cx,-12,z-4),comparator:P(cx,-12,z-1),mask_receiver:P(x+7,-12,z-1),isolated_output:P(cx,-12,z)});
  }
  selectors.push({select,input:P(x,-8,3),inverter:P(x,-8,6),bits:data,one_hot_group:'w_parallel_select'});
 }
 counts.w_selector_branches=map.size-counts.base-counts.source_adapters;
 const outputs=[];
 for(let b=0;b<8;b++){
  const z=14+12*b,n='W_parallel_OR_'+b;
  // Keep collector repeaters away from the six branch injection positions.
  for(let x=-82;x<=-18;x++){if(x===-19||(x>-82&&(x+82)%12===6))rep(P(x,-12,z+1),'east',n);else wire(P(x,-12,z+1),n);}
  route([[-18,-12,z+2],[-18,-12,z+3],[-10,-12,z+3],[-2,-4,z+3],[-2,-4,z],[1,-4,z]],n);
  // Existing adapter input at (2,-4,z) continues to receiver3 and column4.
  outputs.push({bit:b,collector_start:P(-82,-12,z+1),collector_end:P(-18,-12,z+1),route_end:P(1,-4,z),destination:P(4,1,z),adapter_input:P(2,-4,z)});
 }
 counts.w_output_collectors_and_routes=map.size-Object.values(counts).reduce((a,b)=>a+b,0);
 const blocks=[...map.values()],axes=['x','y','z'],box={from:{},to:{}};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 const histogram={};for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'partial_alu_adapter_and_W_mux_geometry_not_buildable',blocks,owner,box,counts,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),histogram},adapters,selectors,outputs,routes,base_geometry:base.metrics,missing_geometry:[...base.missing_geometry.filter(v=>!v.startsWith('Replace diagnostic')),'New source adapters replace every remaining manual lever, but most adapter inputs are still unconnected.','W six-way mux output reaches all eight physical parallel inputs; its48 choice-data ports and six select inputs still need actual source routes.','M/Q selectors and remaining mode/control/condition/final-result routes are not mapped.'],limits:['No standalone fixture, build plans, or selected world site.','Supports/collisions and local selector contacts can be checked offline; complete cross-net audit and native electrical timing remain pending.','Removing manual sources is not the same as implementing the external/controller paths that drove them.'],native_calls:0,build_plans_emitted:false};
}
