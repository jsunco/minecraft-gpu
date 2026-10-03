// Four-bit physical global BOOT / staged warm-reset controller feedback.
// BOOT is held through a full NEXT/CURRENT transfer; no power-on state is assumed.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeGlobalControlLogic} from './full-gpu-global-control-logic-v3.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeGlobalControlFeedback(){
 const map=new Map(),instances=[],routes=[],edges=[],links=[];let part='';
 const insert=instance=>{instances.push(instance);for(const v of instance.blocks){assert(!map.has(K(v.position)),'Component collision '+K(v.position));map.set(K(v.position),{...v,part:instance.id});}};
 const next=materializeInstance(makeGlobalControlLogic(),{id:'conditional_next',translation:P(150,64,0)}),bank=materializeInstance(makeStateBank({width:4}),{id:'state_banks',translation:P(150,0,0)});insert(next);insert(bank);
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]);assert.equal(delta.filter(Boolean).length,1);for(let i=1;i<=delta.reduce((n,v)=>n+Math.abs(v),0);i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'No refreshed route '+name);
  const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal route overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}
  routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 for(let bit=0;bit<4;bit++){
  const src=next.ports.next_values.bits[bit].position,y=1+4*bit,id='next_descent_'+bit,drop=src.y-y,descent=materializeInstance(makeSignalDescent({drop}),{id,translation:P(src.x,src.y,20+12*bit),quarter_turns:1});insert(descent);
  const input=descent.ports.input.bits[0].position,output=descent.ports.output.bits[0],p=output.position,dir=output.travel;
  route('next_to_descent_'+bit,[[src.x,src.y,src.z],[input.x,input.y,input.z]]);
  const a=P(p.x+3*dir.x,p.y,p.z+3*dir.z),corridor=a.z+(dir.x>0?4:0);
  const points=[[p.x,p.y,p.z],[a.x,a.y,a.z],...(dir.x>0?[[a.x,a.y,corridor]]:[]),[145,y,corridor],[145,y,0]];
  route('descent_to_clamp_'+bit,points);
  part='next_arrival_'+bit;rep(P(146,y,0),'east');wire(P(147,y,0));wire(P(148,y,0));rep(P(149,y,0),'east');for(let x=145;x<150;x++)edge(P(x,y,0),P(x+1,y,0));
  links.push({bit,source:src,descent_input:input,descent_output:p,arrival:P(149,y,0),next_input:bank.ports.next_data.bits[bit].position,current_output:bank.ports.state.bits[bit].position});
 }
 const feedback=[],columns=[];
 const stateNames=['q0','q1','q2','q3'];
 for(let bit=0;bit<4;bit++){const name=stateNames[bit],a=bank.ports.state.bits[bit].position,b=next.ports[name].bits[0].position,x=300+4*bit,y=a.y,z=-27+4*bit;
  part=name+'_isolate';rep(P(a.x+1,y,a.z),'east');wire(P(a.x+2,y,a.z));edge(a,P(a.x+1,y,a.z));edge(P(a.x+1,y,a.z),P(a.x+2,y,a.z));route(name+'_depart',[[a.x+2,y,a.z],[a.x+2,y,-12],[x,y,-12]]);
  part=name+'_lift';wire(P(x,y-1,-13));edge(P(x,y,-12),P(x,y-1,-13));if(bit<3){rep(P(x,y-1,-14),'north');wire(P(x,y-1,-15));edge(P(x,y-1,-13),P(x,y-1,-14));edge(P(x,y-1,-14),P(x,y-1,-15));route(name+'_lower',[[x,y-1,-15],[x,y-1,z+2]]);}part=name+'_driver';rep(P(x,y-1,z+1),'north');edge(P(x,y-1,z+2),P(x,y-1,z+1));edge(P(x,y-1,z+1),P(x,y-1,z));assert.equal((b.y-(y-1))%4,1);for(let yy=y-1;yy<b.y;yy++)put(P(x,yy,z),(yy-(y-1))%2===0?'light_gray_concrete':'redstone_torch');put(P(x,b.y,z),'redstone_wire');columns.push({name,x,z,bottom:y-1,top:b.y});route(name+'_arrive',[[x,b.y,z],[b.x,b.y,z],[b.x,b.y,b.z]]);feedback.push({name,source:a,destination:b});
 }
 const consumed=new Set(['next_values',...stateNames]),ports=Object.fromEntries(Object.entries(next.ports).filter(([n])=>!consumed.has(n)));for(const n of['next_open','current_open','state'])ports[n]=bank.ports[n];for(const [i,n]of ['next0','next1','next2','next3','cold_initialize','core_reset_force','cold_initialized','launch_permit','memory_admission_block'].entries())if(i>=4)ports[n]={...next.ports.next_values,width:1,bits:[{...next.ports.next_values.bits[i],bit:0}]};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_global_staged_reset_four_bit_reset_load_feedback',blocks,ports,box,routes,edges,links,feedback,columns,instances:instances.map(i=>({id:i.id,blocks:i.blocks.length,ports:i.ports})),metrics:{blocks:blocks.length,conditional_network_blocks:next.blocks.length,state_bank_blocks:bank.blocks.length,descent_blocks:instances.filter(i=>i.id.startsWith('next_descent')).reduce((n,i)=>n+i.blocks.length,0),stored_state_bits:8,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Actual shared phase routes and all component completion/global reset/BOOT/launch sources and recipients.','Nominal stages are not elapsed-time guarantees: full initial BOOT transfer, far clear duration and closure timing require complete route bounds and later native checks.','Cold initialized stays true during reset/load drain and LOAD hold. New memory admissions remain enabled through core retirement; only afterward does the explicit memory block initiate closure.','RESET clears only after both core ACKs and true program/global/bank quiet; LOAD keeps initialization complete and holds quietly without repeatedly clearing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeGlobalControlFeedback();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
