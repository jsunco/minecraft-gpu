// Offline compact four-bit retained increment/hold/zero datapath. No host steps.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import {makeRegisterCounterControl} from './full-gpu-register-counter-control.mjs';
import{makeCounterGuards}from'./full-gpu-counter-guards.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterCounterPhases(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],bits=[];let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:blocks.length});}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),cmp=p=>dev(p,'comparator',{facing:'west',mode:'subtract'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}
 const counter=makeRegisterCounterControl();insert('counter_control',counter.blocks);const connections=[];
 for(const[bank,x]of[['next',-4],['current',8]]){
  part=bank+'_phase_column';for(let y=-2;y<=24;y++){if(y%2===0)solid(P(x,y,3));else put(P(x,y,3),'redstone_torch');}columns.push({name:part,x,z:3,bottom:-2,top:24,ends_solid:true});
  for(let bit=0;bit<4;bit++){const y=8*bit;part=bank+'_open_'+bit;put(P(x+1,y,3),'redstone_wall_torch',{facing:'east'});wire(P(x+2,y,3));rep(P(x+3,y,3),'east');edge(P(x,y,3),P(x+1,y,3));edge(P(x+1,y,3),P(x+2,y,3));edge(P(x+2,y,3),P(x+3,y,3));edge(P(x+3,y,3),P(x+4,y,3));connections.push({name:part,source:P(x+1,y,3),destination:counter.ports[bank+'_open_'+bit].bits[0].position});}
 }
 route('phase_next_entry',[[-10,-2,3],[-6,-2,3]]);part='phase_next_entry';rep(P(-5,-2,3),'east');edge(P(-6,-2,3),P(-5,-2,3));edge(P(-5,-2,3),P(-4,-2,3));
 route('phase_current_entry',[[4,-2,3],[6,-2,3]]);part='phase_current_entry';rep(P(7,-2,3),'east');edge(P(6,-2,3),P(7,-2,3));edge(P(7,-2,3),P(8,-2,3));
 route('phase_boot_next',[[-10,-2,3],[-14,-2,3],[-14,-5,6],[-14,-5,100],[126,-5,100],[126,-5,85]]);
 route('phase_boot_current',[[4,-2,3],[4,-2,-1],[4,-9,-8],[12,-9,-8],[12,-9,104],[138,-9,104],[138,-9,85]]);
 for(const[bank,x]of[['next',126],['current',138]]){const base=bank==='next'?-5:-9;part='phase_boot_'+bank+'_arrive';rep(P(x,base,84),'north');edge(P(x,base,85),P(x,base,84));edge(P(x,base,84),P(x,base,83));column(part,x,83,base,0,{wireTop:true});rep(P(x+1,0,83),'east');wire(P(x+2,0,83));rep(P(x+3,0,83),'east');for(let q=0;q<4;q++)edge(P(x+q,0,83),P(x+q+1,0,83));connections.push({name:'boot_'+bank,source:P(x,0,83),destination:counter.ports['boot_'+bank+'_open'].bits[0].position});}
 const input=(p,receiver)=>({direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',meaning:'Already-qualified stable phase. Must be generated by real shared control with enough far-lock closure margin; this component does not admit reset or protect bad phase overlap.',bits:[{bit:0,position:p,receiver,travel:P(1,0,0)}]});
 const ports=Object.fromEntries(Object.entries(counter.ports).filter(([n])=>!n.includes('_open')));ports.qualified_next=input(P(-10,-2,3),P(-5,-2,3));ports.qualified_current=input(P(4,-2,3),P(7,-2,3));
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_counter_guard_boot_with_actual_phase_fanout',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:10,half_adders:4,physical_phase_connections:10,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Microstate→sweep/zero/boot set/clear and counter_zero OR initialize production/routes; root state loop integration.','Actual common qualified phase sources and startup admission; all ten local OPEN routes are now drawn.','Native timing, reliable edges and all whole-machine routes.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterCounterPhases();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
