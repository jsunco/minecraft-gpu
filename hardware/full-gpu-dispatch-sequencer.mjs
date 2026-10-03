// Connected register microstate data loop. Offline design, no game/runtime code.
import assert from 'node:assert/strict';
import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';
import{makeDispatchStateFeedback}from'./full-gpu-dispatch-state-feedback.mjs';
import{makeDispatchMicrodecode}from'./full-gpu-dispatch-microdecode.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeDispatchSequencer(){
 const map=new Map(),parents=[],routes=[],edges=[],connections=[],columns=[];let part='';
 function insert(id,d){for(const v of d.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{position:v.position,block:v.block,part:id});}parents.push({id,blocks:d.blocks.length});}
 const fb=makeDispatchStateFeedback(),micro=makeDispatchMicrodecode();insert('state_feedback',fb);insert('microdecode',micro);
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>13)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,outputY){assert(outputY>bottom&&(outputY-bottom)%4===1);part=name;for(let y=bottom;y<outputY;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:outputY});return P(x,outputY,z);}
 const branchNames=['branch_start','branch_completed','branch_reset_high','branch_available','branch_reset_low','branch_owner','branch_all_done','branch_both_reset'];
 for(const[i,name]of branchNames.entries()){
  const a=micro.ports[name].bits[0].position,b=fb.ports[name].bits[0].position;
  if(i<8){const corridor=-15-4*i;route(name+'_source',[[a.x,a.y,a.z],[a.x,a.y,corridor],[b.x,a.y,corridor],[b.x,a.y,-13]]);part=name+'_lift';rep(P(b.x,a.y,-12),'south');edge(P(b.x,a.y,-13),P(b.x,a.y,-12));edge(P(b.x,a.y,-12),P(b.x,a.y,-11));column(name+'_lift',b.x,-11,a.y,b.y);route(name+'_arrive',[[b.x,b.y,-11],[b.x,b.y,b.z]]);
  }else{const input=P(i===4?135:147,a.y,i===4?-40:-56),descent=materializeInstance(makeSignalDescent({drop:a.y-b.y}),{id:name+'_descent',translation:input});insert(name+'_descent',descent);route(name+'_source',[[a.x,a.y,a.z],[a.x,a.y,input.z],[input.x,input.y,input.z]]);const p=descent.ports.output.bits[0].position;route(name+'_arrive',[[p.x,p.y,p.z],[b.x,b.y,p.z],[b.x,b.y,b.z]]);}
  connections.push({name,source:a,destination:b});
 }
 for(let bit=0;bit<5;bit++){
  const name='fixed_next_'+bit,a=micro.ports[name].bits[0].position,b=fb.ports[name].bits[0].position,z=-60-4*bit;
  if(a.y<b.y){route(name+'_source',[[a.x,a.y,a.z],[a.x,a.y,z+2]]);part=name+'_lift';rep(P(a.x,a.y,z+1),'north');edge(P(a.x,a.y,z+2),P(a.x,a.y,z+1));edge(P(a.x,a.y,z+1),P(a.x,a.y,z));column(name+'_lift',a.x,z,a.y,b.y);route(name+'_arrive',[[a.x,b.y,z],[b.x,b.y,z],[b.x,b.y,b.z]]);
  }else route(name+'_arrive',[[a.x,a.y,a.z],[a.x,a.y,z],[a.x+(a.y-b.y),b.y,z],[b.x,b.y,z],[b.x,b.y,b.z]]);
  connections.push({name,source:a,destination:b});
 }
 for(let bit=0;bit<5;bit++){
  const a=fb.ports.state.bits[bit].position,b=micro.ports.state.bits[bit].position,base=-8-4*bit,input=P(170,a.y,-100-12*bit),name='current_to_decode_'+bit,desc=materializeInstance(makeSignalDescent({drop:a.y-base}),{id:name+'_descent',translation:input});insert(name+'_descent',desc);
  route(name+'_depart',[[a.x,a.y,a.z],[170,a.y,a.z],[170,a.y,input.z]]);
  const p=desc.ports.output.bits[0].position,dir=desc.ports.output.bits[0].travel,q=P(p.x+3*dir.x,p.y,p.z+3*dir.z),x=b.x+(b.x<0?-2:2),z=b.z;
  const corridor=q.z+(dir.x>0?3:0);route(name+'_return',[[p.x,p.y,p.z],[q.x,q.y,q.z],...(dir.x>0?[[q.x,q.y,corridor]]:[]),[x,base,corridor],[x,base,z-2]]);part=name+'_lift';rep(P(x,base,z-1),'south');edge(P(x,base,z-2),P(x,base,z-1));edge(P(x,base,z-1),P(x,base,z));column(name+'_lift',x,z,base,b.y);const toward=b.x<0?'east':'west';rep(P(x+(toward==='east'?1:-1),b.y,z),toward);edge(P(x,b.y,z),P((x+b.x)/2,b.y,z));edge(P((x+b.x)/2,b.y,z),b);connections.push({name,source:a,destination:b});
 }
 const consumed=new Set(branchNames.concat(Array.from({length:5},(_,b)=>'fixed_next_'+b))),ports=Object.fromEntries(Object.entries(fb.ports).filter(([n])=>!consumed.has(n)));for(const[n,p]of Object.entries(micro.ports))if(n!=='state'&&!consumed.has(n))ports[n]=p;
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_dispatch_microstate_feedback_loop_geometry',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,physical_control_loop_connections:connections.length,stored_state_bits:10,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Eight actual dispatch predicates and both counters/owner/core payload/reset/start/done state and routes.','Shared phase source, qualified bank OPEN, all32-state initialization/conditioning strategy and verified timing.','Qualified dispatch actions, comparison/final masks, core handshakes and all actual output-bank/control routes.','Physical native branch/retention/init tests. Geometry closure alone is not autonomous execution.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchSequencer();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
