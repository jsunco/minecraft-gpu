// Offline four-lane architectural action plane with real lane/window fanout.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{makeRegisterDataSelector}from'./full-gpu-register-data-selector.mjs';
import{makeRegisterCounterPhases}from'./full-gpu-register-counter-phases.mjs';
import{makeCounterGuards}from'./full-gpu-counter-guards.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterActions(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],bits=[];let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:blocks.length});}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),cmp=p=>dev(p,'comparator',{facing:'west',mode:'subtract'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}
 function escaped(out,input){const p=out.position,d=out.travel,q=P(p.x+2*d.x,p.y,p.z+2*d.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]],right=input.x+8;if(d.x<0){const zz=input.z-8;ws.push([q.x,q.y,zz],[right,q.y,zz]);}else if(d.z!==0){ws.push([right,q.y,q.z]);}return ws;}


 const cell=makeRegisterDataSelector(),short={...cell,blocks:cell.blocks.filter(v=>v.position.y<=13),ports:{...cell.ports,writeback:{...cell.ports.writeback,width:4,bits:cell.ports.writeback.bits.slice(0,4)},data:{...cell.ports.data,width:4,bits:cell.ports.data.bits.slice(0,4)}}};
 const names=['gpr','a','b','assign'],groups=[],connections=[];
 const ports={};
 const input=(bits,meaning)=>({direction:'input',width:bits.length,polarity:'active_high',bit_order:'lsb_first',bits,meaning}),output=(bits,meaning)=>({...input(bits,meaning),direction:'output'});
 for(const[name,i]of names.map((n,i)=>[n,i])){
  const oz=24*i,partName=name+'_selector',d=materializeInstance(short,{id:partName,translation:P(0,0,oz)});insert(partName,d.blocks);groups.push({name,origin:P(0,0,oz),parent_blocks:d.blocks.length});
  // Existing data selector applies RESET OR(NORMAL AND enabled_lane).
  // This new column is !window at every four-level bit tap.
  part=name+'_window_column';for(let y=0;y<=12;y+=2){solid(P(2,y,oz+6));put(P(2,y+1,oz+6),'redstone_torch');}columns.push({name:part,x:2,z:oz+6,bottom:0,top:13,negative_output:true});
  part=name+'_window_entry';wire(P(0,0,oz+6));rep(P(1,0,oz+6),'east');edge(P(0,0,oz+6),P(1,0,oz+6));edge(P(1,0,oz+6),P(2,0,oz+6));
  const outs=[];
  for(let lane=0;lane<4;lane++){const y=1+4*lane;part=name+'_window_gate_'+lane;wire(P(5,y,oz+3));wire(P(5,y,oz+4));rep(P(5,y,oz+5),'south');dev(P(5,y,oz+6),'comparator',{facing:'north',mode:'subtract'});wire(P(5,y,oz+7));rep(P(5,y,oz+8),'south');wire(P(5,y,oz+9));for(let z=2;z<9;z++)edge(P(5,y,oz+z),P(5,y,oz+z+1));
   wire(P(3,y,oz+6));rep(P(4,y,oz+6),'east');for(let x=2;x<5;x++)edge(P(x,y,oz+6),P(x+1,y,oz+6));
   outs.push({bit:lane,position:P(5,y,oz+9),source:P(5,y,oz+8),travel:P(0,0,1)});
  }
  ports[name+'_normal']=d.ports.pass_writeback;ports[name+'_reset']=d.ports.fill_ones;ports[name+'_open']=output(outs,'Actual per-lane window-qualified action; upstream meanings below must be supplied by physical producers.');
 }
 // Actual four enable inputs feed all four command cells. Isolate every branch.
 for(let lane=0;lane<4;lane++){const y=1+4*lane,taps=names.map((_,i)=>P(-6,y,24*i));route('lane_enable_bus_'+lane,[[-6,y,-8],[-6,y,72]],{branchPoints:taps});
  for(let i=0;i<4;i++){const z=24*i;part='lane_enable_branch_'+lane+'_'+i;rep(P(-5,y,z),'east');wire(P(-4,y,z));edge(P(-6,y,z),P(-5,y,z));edge(P(-5,y,z),P(-4,y,z));route(part+'_arrive',[[-4,y,z],[0,y,z]]);connections.push({name:'lane'+lane+'_to_'+names[i],source:P(-6,y,-8),destination:P(0,y,z)});}
 }
 ports.lane_enable=input(Array.from({length:4},(_,lane)=>({bit:lane,position:P(-6,1+4*lane,-8),travel:P(0,0,1)})),'Stable assignment mask; inactive lanes blocked from normal actions, but initialization/reset can still clear all lanes.');
 // One common window arrives at all four real gate columns through positive lifts.
 route('window_bus',[[-14,-5,-8],[-14,-5,78]],{branchPoints:names.map((_,i)=>P(-14,-5,24*i+6))});
 for(let i=0;i<4;i++){const z=24*i+6;part='window_branch_'+i;rep(P(-13,-5,z),'east');wire(P(-12,-5,z));edge(P(-14,-5,z),P(-13,-5,z));edge(P(-13,-5,z),P(-12,-5,z));route(part+'_arrive',[[-12,-5,z],[-6,-5,z]]);part='window_lift_'+i;rep(P(-5,-5,z),'east');edge(P(-6,-5,z),P(-5,-5,z));edge(P(-5,-5,z),P(-4,-5,z));column(part,-4,z,-5,0,{wireTop:true});route('window_output_'+i,[[-4,0,z],[0,0,z]]);connections.push({name:'window_to_'+names[i],source:P(-14,-5,-8),destination:P(0,0,z)});}
 ports.action_window=input([{bit:0,position:P(-14,-5,-8),travel:P(0,0,1)}],'Stable phase-qualified window with cold-start/reset/fault admission. Must close and far locks settle before address/data change. Producer is not included.');
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_four_lane_register_action_distribution_candidate',blocks,ports,parents,groups,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:0,qualified_action_bits:16,physical_lane_enable_connections:16,physical_window_connections:4,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},input_contract:{gpr_normal:'open_gpr_normal AND reg_write AND Rd<13; physical common eligibility producer still required',gpr_reset:'open_gpr_reset',a_normal:'open_a_normal',a_reset:'open_a_reset',b_normal:'open_b_normal',b_reset:'open_b_reset',assign_normal:'open_assign',assign_reset:'open_assign AND boot; actual common conjunction still required'},native_acceptance:false,complete_gpu_layout:false,missing:['Actual microcontroller intent connections, gpr eligibility and assignment-boot conjunction, action-window startup/fault/phase producer.','All16output routes to four files, shared read/write-address selectors, write/assignment byte selectors, completion timing and whole-machine placement.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterActions();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
