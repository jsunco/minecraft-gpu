// Offline compact four-bit retained increment/hold/zero datapath. No host steps.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{makeRegisterSequencer}from'./full-gpu-register-sequencer.mjs';
import{makeRegisterCounterPhases}from'./full-gpu-register-counter-phases.mjs';
import{makeCounterGuards}from'./full-gpu-counter-guards.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterController(){
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
 const state=makeRegisterSequencer(),counter=materializeInstance(makeRegisterCounterPhases(),{id:'counter',translation:P(0,-80,0)});insert('microstate',state.blocks);insert(counter.id,counter.blocks);const connections=[];
 const down=[
  {name:'branch_sweep',source:P(150,36,-13),target:counter.ports.branch_sweep.bits[0].position,corridor:32,approach:193},
  {name:'branch_zero',source:P(155,76,-13),target:counter.ports.branch_zero.bits[0].position,corridor:60,approach:186},
  {name:'boot_set',source:state.ports.boot_set.bits[0].position,target:counter.ports.boot_set.bits[0].position,corridor:68,approach:150},
  {name:'boot_clear',source:P(160,156,-13),target:counter.ports.boot_clear.bits[0].position,corridor:72,approach:158},
  {name:'counter_zero',source:state.ports.counter_zero.bits[0].position,target:P(75,-82,-14),corridor:-26,approach:75},
 ];
 for(const[i,c]of down.entries()){
  const a=c.source,b=c.target,x=250+12*i,z=-166-12*i,sourceZ=i<2||i===3?a.z:i===2?-240:-72-8*i;
  const desc=materializeInstance(makeSignalDescent({drop:a.y-b.y}),{id:c.name+'_descent',translation:P(x,a.y,z)});insert(desc.id,desc.blocks);
  route(c.name+'_depart',[[a.x,a.y,a.z],...(sourceZ!==a.z?[[a.x,a.y,sourceZ]]:[]),[x,a.y,sourceZ],[x,a.y,z]]);
  const ws=escaped(desc.ports.output.bits[0],P(x,a.y,z)),q=ws.at(-1);
  route(c.name+'_arrive',[...ws,[q[0],b.y,c.corridor],[c.approach,b.y,c.corridor],[c.approach,b.y,b.z],...(c.approach!==b.x?[[b.x,b.y,b.z]]:[])]);

  connections.push({name:c.name,source:a,destination:b});
 }
 // Counter-zero and initialize are isolated real sources of one clear wire.
 // The secondary initialize pad remains explicit until global startup fanout.
 part='counter_clear_or';rep(P(75,-82,-13),'south');wire(P(75,-82,-12));wire(P(75,-82,-11));wire(P(75,-82,-10));wire(P(79,-82,-10));rep(P(78,-82,-10),'west');wire(P(77,-82,-10));wire(P(76,-82,-10));for(let z=-14;z<-10;z++)edge(P(75,-82,z),P(75,-82,z+1));for(let x=79;x>75;x--)edge(P(x,-82,-10),P(x-1,-82,-10));
 route('clear_or_to_counter',[[75,-82,-10],[65,-82,-10],[65,-82,-7]]);
 const up=[
  {name:'is_15',source:counter.ports.is_15.bits[0].position,depart:[[40,-55,12],[43,-58,12],[220,-58,12]],descent:P(220,-58,12),base:-108,x:240,z:-40},
  {name:'is_12',source:counter.ports.is_12.bits[0].position,depart:[[180,-79,44],[183,-82,44],[232,-82,44]],descent:P(232,-82,44),base:-112,x:244,z:-44},
  {name:'boot',source:counter.ports.boot.bits[0].position,depart:[[147,-79,80],[147,-82,83],[244,-82,83]],descent:P(244,-82,83),base:-116,x:248,z:-48},
 ];
 for(const c of up){const b=state.ports[c.name].bits[0].position;const desc=materializeInstance(makeSignalDescent({drop:c.descent.y-c.base}),{id:c.name+'_return_descent',translation:c.descent});insert(desc.id,desc.blocks);route(c.name+'_to_descent',c.depart);const ws=escaped(desc.ports.output.bits[0],c.descent),q=ws.at(-1),corridor=-260-4*up.indexOf(c);
  route(c.name+'_lower_return',[...ws,[q[0],c.base,corridor],[c.x,c.base,corridor],[c.x,c.base,c.z-2]]);part=c.name+'_return_lift';rep(P(c.x,c.base,c.z-1),'south');edge(P(c.x,c.base,c.z-2),P(c.x,c.base,c.z-1));edge(P(c.x,c.base,c.z-1),P(c.x,c.base,c.z));column(part,c.x,c.z,c.base,b.y,{wireTop:true});route(c.name+'_state_arrive',[[c.x,b.y,c.z],[b.x,b.y,c.z],[b.x,b.y,b.z]]);connections.push({name:c.name,source:c.source,tap:P(...c.depart[0]),destination:b});
 }
 const consumed=new Set(['is_12','is_15','boot','counter_zero','boot_set','boot_clear']),ports=Object.fromEntries(Object.entries(state.ports).filter(([n])=>!consumed.has(n)));
 for(const[n,p]of Object.entries(counter.ports))if(!['branch_sweep','branch_zero','boot_set','boot_clear','is_12','is_15','boot','clear'].includes(n))ports['counter_'+n]=p;
 ports.counter_initialize={direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(79,-82,-10),receiver:P(78,-82,-10),travel:P(-1,0,0)}],meaning:'Global initial clamp must fan out here as well as to state.initialize and counter_boot_initialize. This input is not yet internally driven.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_register_twenty_bit_controller_data_connections',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:20,interassembly_connections:8,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Real common phase qualification into microstate banks and counter_qualified_next/current; global init fanout still has3actual pads.','Reset admission/all32-state decoder conditioning and phase-qualified lane/regwrite/file action routes.','All original event input sources, full native timing/retention and whole-machine placement remain unaccepted.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterController();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
