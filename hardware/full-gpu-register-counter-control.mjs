// Offline compact four-bit retained increment/hold/zero datapath. No host steps.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import {makeRegisterCounterDatapath} from './full-gpu-register-counter-datapath.mjs';
import{makeCounterGuards}from'./full-gpu-counter-guards.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterCounterControl(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],bits=[];let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:blocks.length});}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),cmp=p=>dev(p,'comparator',{facing:'west',mode:'subtract'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}
 const counter=makeRegisterCounterDatapath();insert('counter',counter.blocks);
 const guard=materializeInstance(makeCounterGuards(),{id:'terminal_guards',translation:P(160,0,40)});insert(guard.id,guard.blocks);
 const connections=[];
 for(let bit=0;bit<4;bit++){
  const y=1+8*bit,base=-8-4*bit,desc=materializeInstance(makeSignalDescent({drop:y-base}),{id:'address_descent_'+bit,translation:P(80+12*bit,y,-20)});insert(desc.id,desc.blocks);
  route('address_to_guard_descent_'+bit,[[20,y,-8],[20,y,-12],[80+12*bit,y,-12],[80+12*bit,y,-20]]);
  const out=desc.ports.output.bits[0],p=out.position,dir=out.travel,q=P(p.x+3*dir.x,p.y,p.z+3*dir.z),dest=guard.ports.address.bits[bit],x=dest.position.x+(bit%2?2:-2),z=dest.position.z,corridor=-44-12*bit;
  route('address_guard_return_'+bit,[[p.x,p.y,p.z],[q.x,q.y,q.z],[q.x,q.y,corridor],[x,base,corridor],[x,base,z-2]]);part='guard_lift_'+bit;rep(P(x,base,z-1),'south');edge(P(x,base,z-2),P(x,base,z-1));edge(P(x,base,z-1),P(x,base,z));column(part,x,z,base,1,{wireTop:true});rep(P(x+(bit%2?-1:1),1,z),bit%2?'west':'east');edge(P(x,1,z),P(x+(bit%2?-1:1),1,z));edge(P(x+(bit%2?-1:1),1,z),dest.position);
  connections.push({name:'address_to_guard_'+bit,source:counter.bits[bit].current,tap:P(20,y,-8),destination:dest.position});
 }
 // Increment = sweep OR (zero_advance AND !is12). This preserves the
 // reference's held12 after the final register reset instead of increment13.
 route('terminal12_to_mask',[[172,1,46],[180,1,46],[180,1,42],[190,1,42],[190,1,44]]);part='increment_qualifier';rep(P(190,1,45),'south');edge(P(190,1,44),P(190,1,45));edge(P(190,1,45),P(190,1,46));
 wire(P(188,1,46));rep(P(189,1,46),'east');cmp(P(190,1,46));wire(P(191,1,46));rep(P(192,1,46),'east');wire(P(193,1,46));rep(P(194,1,46),'east');wire(P(195,1,46));for(let x=188;x<195;x++)edge(P(x,1,46),P(x+1,1,46));
 wire(P(193,1,42));rep(P(193,1,43),'south');wire(P(193,1,44));wire(P(193,1,45));for(let z=42;z<46;z++)edge(P(193,1,z),P(193,1,z+1));
 route('increment_qualified_return',[[195,1,46],[198,1,46],[198,-2,49],[198,-2,56],[50,-2,56],[50,-2,-3]]);
 connections.push({name:'is12_to_increment_mask',source:guard.ports.is_12.bits[0].position,destination:P(190,1,45)},{name:'increment_to_counter',source:P(195,1,46),destination:counter.ports.increment.bits[0].position});
 const boot=materializeInstance(makeStateBank({width:1}),{id:'boot_bank',translation:P(130,0,80)});insert(boot.id,boot.blocks);
 part='boot_logic';rep(P(148,1,80),'east');for(let x=149;x<=151;x++)wire(P(x,1,80));rep(P(152,1,80),'east');cmp(P(153,1,80));wire(P(154,1,80));rep(P(155,1,80),'east');wire(P(156,1,80));for(let x=147;x<156;x++)edge(P(x,1,80),P(x+1,1,80));
 wire(P(150,1,76));rep(P(150,1,77),'south');wire(P(150,1,78));wire(P(150,1,79));for(let z=76;z<80;z++)edge(P(150,1,z),P(150,1,z+1));
 wire(P(156,1,78));rep(P(155,1,78),'west');wire(P(154,1,78));wire(P(153,1,78));rep(P(153,1,79),'south');for(let x=156;x>153;x--)edge(P(x,1,78),P(x-1,1,78));edge(P(153,1,78),P(153,1,79));edge(P(153,1,79),P(153,1,80));
 wire(P(153,1,74));rep(P(153,1,75),'south');wire(P(153,1,76));wire(P(153,1,77));for(let z=74;z<78;z++)edge(P(153,1,z),P(153,1,z+1));
 route('boot_next_feedback',[[156,1,80],[158,1,80],[158,1,88],[124,1,88],[124,1,80],[130,1,80]]);
 const input=(p,receiver,travel,meaning)=>({direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',meaning,bits:[{bit:0,position:p,receiver,travel}]});
 const ports=Object.fromEntries(Object.entries(counter.ports).filter(([n])=>n!=='increment'));
 ports.branch_sweep=input(P(193,1,42),P(193,1,43),P(0,0,1),'Retained stable microstate4 intent.');ports.branch_zero=input(P(188,1,46),P(189,1,46),P(1,0,0),'Retained stable microstate9 intent.');ports.is_12=guard.ports.is_12;
 ports.boot_set=input(P(150,1,76),P(150,1,77),P(0,0,1),'Stable microstate0 intent; initialize must already be released before boot may set.');ports.boot_clear=input(P(156,1,78),P(155,1,78),P(-1,0,0),'Stable microstate19 intent.');ports.boot_initialize=input(P(153,1,74),P(153,1,75),P(0,0,1),'Initial clamp overrides boot_set; boot clear and initialize share the actual side-mask OR.');ports.boot=boot.ports.state;ports.boot_next_open=boot.ports.next_open;ports.boot_current_open=boot.ports.current_open;
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_connected_register_counter_guard_boot_geometry',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:10,half_adders:4,address_guard_connections:4,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Microstate→sweep/zero/boot set/clear and counter_zero OR initialize production/routes; root state loop integration.','All ten qualified physical bank OPEN routes and startup admission.','Native timing, reliable edges and all whole-machine routes.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterCounterControl();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
