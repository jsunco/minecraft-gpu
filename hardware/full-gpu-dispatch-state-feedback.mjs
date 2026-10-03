// Physical conditional NEXT -> initialization clamp -> retained NEXT/CURRENT.
// Partial register sequencer assembly, offline only. No running host FSM.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeDispatchNextState} from './full-gpu-dispatch-next-state.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeDispatchStateFeedback(){
 const map=new Map(),instances=[],routes=[],edges=[],links=[];let part='';
 const insert=instance=>{instances.push(instance);for(const v of instance.blocks){assert(!map.has(K(v.position)),'Component collision '+K(v.position));map.set(K(v.position),{...v,part:instance.id});}};
 const next=materializeInstance(makeDispatchNextState(),{id:'conditional_next',translation:P(150,160,0)}),bank=materializeInstance(makeStateBank({width:5}),{id:'state_banks',translation:P(150,0,0)});insert(next);insert(bank);
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]);assert.equal(delta.filter(Boolean).length,1);for(let i=1;i<=delta.reduce((n,v)=>n+Math.abs(v),0);i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'No refreshed route '+name);
  const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal route overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}
  routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 part='initialize_column';for(let y=-2;y<=17;y++){if(y%2===0)solid(P(147,y,-3));else put(P(147,y,-3),'redstone_torch');}
 wire(P(145,-2,-3));rep(P(146,-2,-3),'east');edge(P(145,-2,-3),P(146,-2,-3));edge(P(146,-2,-3),P(147,-2,-3));
 for(let bit=0;bit<5;bit++){
  const src=next.ports.next_state.bits[bit].position,y=1+4*bit,id='next_descent_'+bit,drop=src.y-y,descent=materializeInstance(makeSignalDescent({drop}),{id,translation:P(src.x,src.y,20+12*bit),quarter_turns:1});insert(descent);
  const input=descent.ports.input.bits[0].position,output=descent.ports.output.bits[0],p=output.position,dir=output.travel;
  route('next_to_descent_'+bit,[[src.x,src.y,src.z],[input.x,input.y,input.z]]);
  const a=P(p.x+3*dir.x,p.y,p.z+3*dir.z),corridor=a.z+(dir.x>0?4:0);
  const points=[[p.x,p.y,p.z],[a.x,a.y,a.z],...(dir.x>0?[[a.x,a.y,corridor]]:[]),[145,y,corridor],[145,y,0]];
  route('descent_to_clamp_'+bit,points);
  part='init_clamp_'+bit;rep(P(146,y,0),'east');dev(P(147,y,0),'comparator',{facing:'west',mode:'subtract'});wire(P(148,y,0));rep(P(149,y,0),'east');
  wire(P(147,y,-2));rep(P(147,y,-1),'south');for(let x=145;x<150;x++)edge(P(x,y,0),P(x+1,y,0));for(let z=-3;z<0;z++)edge(P(147,y,z),P(147,y,z+1));
  links.push({bit,source:src,descent_input:input,descent_output:p,clamp:P(147,y,0),next_input:bank.ports.next_data.bits[bit].position,current_output:bank.ports.state.bits[bit].position});
 }
 const ports=Object.fromEntries(Object.entries(next.ports).filter(([n])=>n!=='next_state'));ports.initialize={direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(145,-2,-3),receiver:P(146,-2,-3),travel:P(1,0,0)}]};for(const n of['next_open','current_open','state'])ports[n]=bank.ports[n];
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_dispatch_conditional_state_capture_feedback_partial',blocks,ports,box,routes,edges,links,instances:instances.map(i=>({id:i.id,blocks:i.blocks.length,ports:i.ports})),metrics:{blocks:blocks.length,conditional_network_blocks:next.blocks.length,state_bank_blocks:bank.blocks.length,descent_blocks:instances.filter(i=>i.id.startsWith('next_descent')).reduce((n,i)=>n+i.blocks.length,0),stored_state_bits:10,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['CURRENT→microstate decoder→21conditional-network input routes/producers; no closed autonomous FSM yet.','Core phase source and physically safe local OPEN/init production.','Both counters, comparisons/partial masks, retained owner/core payload/reset/start/done, all phase/action/predicate routes.','Native edge timing/retention/initialization and all branch transitions.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchStateFeedback();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
