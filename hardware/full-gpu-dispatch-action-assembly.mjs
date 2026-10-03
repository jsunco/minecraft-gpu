// Actual dispatcher action/state joins. Offline block geometry, never a host runtime.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeDispatchSequencer} from './full-gpu-dispatch-sequencer.mjs';
import {makeDispatchTotals} from './full-gpu-dispatch-totals.mjs';
import {makeDispatchOutputFeedback} from './full-gpu-dispatch-output-feedback.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeDispatchActionAssembly(){
 const map=new Map(),parents=[],routes=[],edges=[],connections=[],columns=[];let part='';
 function insert(id,d,origin){const q=materializeInstance(d,{id,translation:origin});for(const v of q.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,origin,blocks:q.blocks.length});return q;}
 const seq=insert('sequencer',makeDispatchSequencer(),P(0,0,0)),counts=insert('totals',makeDispatchTotals(),P(0,0,400)),outputs=insert('outputs',makeDispatchOutputFeedback(),P(160,0,-32));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,outputY){assert(outputY>bottom&&(outputY-bottom)%4===1);part=name;for(let y=bottom;y<outputY;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:outputY});return P(x,outputY,z);}
 const actions=['clear_all','toggle_owner','set_done','lower_start','raise_start','assert_reset','lower_reset'];
 for(const[i,name]of actions.entries()){
  const a=seq.ports[name].bits[0].position,b=outputs.ports[name].bits[0].position,z=-168-8*i;
  if(name==='toggle_owner'){
   const tap=P(52,164,-8);part=name+'_isolate';rep(P(53,164,-8),'east');wire(P(54,164,-8));edge(tap,P(53,164,-8));edge(P(53,164,-8),P(54,164,-8));
   route(name+'_depart',[[54,164,-8],[60,164,-8],[60,166,-10],[60,166,z],[324,166,z],[324,166,-46],[324,161,-41],[324,161,-39],[322,161,-39]]);part=name+'_arrive';rep(P(321,161,-39),'west');edge(P(322,161,-39),P(321,161,-39));edge(P(321,161,-39),b);
   connections.push({name,source:a,source_tap:tap,destination:b});
  }else if(name==='set_done'){
   route(name+'_arrive',[[a.x,a.y,a.z],[a.x,a.y,z],[b.x,a.y,z],[b.x,a.y,-48],[b.x,b.y,-41],[b.x,b.y,b.z]]);connections.push({name,source:a,destination:b});
  }else{
   if(name==='clear_all'){part='clear_all_isolate';rep(P(21,4,2),'east');wire(P(22,4,2));edge(a,P(21,4,2));edge(P(21,4,2),P(22,4,2));route(name+'_depart',[[22,4,2],[22,4,z],[b.x,a.y,z],[b.x,a.y,-67]]);}else route(name+'_depart',[[a.x,a.y,a.z],[a.x,a.y,z],[b.x,a.y,z],[b.x,a.y,-63]]);
   if(name==='clear_all'){
    part='clear_or_global';rep(P(310,4,-66),'south');wire(P(310,4,-65));wire(P(310,4,-64));wire(P(310,4,-63));for(let zz=-67;zz<-63;zz++)edge(P(310,4,zz),P(310,4,zz+1));wire(P(312,4,-65));rep(P(311,4,-65),'west');edge(P(312,4,-65),P(311,4,-65));edge(P(311,4,-65),P(310,4,-65));
   }
   part=name+'_lift';rep(P(b.x,a.y,-62),'south');edge(P(b.x,a.y,-63),P(b.x,a.y,-62));edge(P(b.x,a.y,-62),P(b.x,a.y,-61));column(name+'_lift',b.x,-61,a.y,b.y);route(name+'_arrive',[[b.x,b.y,-61],[b.x,b.y,b.z]]);connections.push({name,source:a,destination:b});
  }
 }
 const a=outputs.ports.state.bits[0].position,b=seq.ports.predicate_owner.bits[0].position,tap=P(333,1,-44);
 part='owner_predicate_isolate';rep(P(333,1,-45),'north');wire(P(333,1,-46));edge(tap,P(333,1,-45));edge(P(333,1,-45),P(333,1,-46));
 route('owner_predicate_depart',[[333,1,-46],[333,1,-248],[282,1,-248],[281,0,-248]]);part='owner_predicate_lift';rep(P(280,0,-248),'west');edge(P(281,0,-248),P(280,0,-248));edge(P(280,0,-248),P(279,0,-248));column('owner_predicate_lift',279,-248,0,201);route('owner_predicate_return',[[279,201,-248],[205,201,-248],[205,201,-9]]);part='owner_predicate_arrive';rep(P(205,201,-8),'south');edge(P(205,201,-9),P(205,201,-8));edge(P(205,201,-8),b);connections.push({name:'owner_predicate',source:a,source_tap:tap,destination:b});
 const ports={};for(const[n,p]of Object.entries(seq.ports))if(n!=='predicate_owner'&&!actions.includes(n))ports['sequence_'+n]=p;for(const[n,p]of Object.entries(counts.ports))ports[n]=p;for(const[n,p]of Object.entries(outputs.ports))if(!actions.includes(n))ports['output_'+n]=p;
 ports.initialize_outputs={direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:P(312,4,-65),receiver:P(311,4,-65),travel:P(-1,0,0)}],meaning:'Real diode-OR into clear_all, which dominates retained output values. Must be driven together with sequencer/counters init and held through complete bank transfer; not automatic power-on.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const axis of['x','y','z']){box.from[axis]=Math.min(...blocks.map(v=>v.position[axis]));box.to[axis]=Math.max(...blocks.map(v=>v.position[axis]));}
 return{status:'offline_dispatch_decoded_actions_retained_outputs_owner_feedback',blocks,ports,parents,routes,edges,connections,columns,box,metrics:{blocks:blocks.length,stored_state_bits:54,actual_new_control_connections:connections.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,missing:['Count increment/clear, remaining dispatch predicates, held per-core payloads and mask routes.','Shared qualified phases, real global cold initialization/decoder conditioning and reset/reuse handshake.','DCR/global loading and both complete core connections; whole-machine timing and native validation.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchActionAssembly();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
