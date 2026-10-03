// Actual microstate intents and held boot joined to the register action plane.
import assert from 'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{makeRegisterSharedControl}from'./full-gpu-register-shared-control.mjs';import{makeQualifiedRegisterActions}from'./full-gpu-register-actions-qualified.mjs';import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterControllerActions(){
 const map=new Map(),parents=[],routes=[],edges=[],columns=[],connections=[];let part='';
 function insert(id,d,origin=P(0,0,0),parameters={}){const m=materializeInstance(d,{id,translation:origin});for(const v of m.blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:m.blocks.length,origin,parameters});return m;}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}

 function escaped(out,input){const p=out.position,d=out.travel,q=P(p.x+2*d.x,p.y,p.z+2*d.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]],right=input.x+8;if(d.x<0){const zz=input.z-8;ws.push([q.x,q.y,zz],[right,q.y,zz]);}else if(d.z!==0){ws.push([right,q.y,q.z]);}return ws;}
 const c=insert('controller',makeRegisterSharedControl()),a=insert('actions',makeQualifiedRegisterActions(),P(-176,140,100));
 const up=[
  {from:'open_gpr_reset',to:'gpr_reset',x:-72,z:100,top:137},
  {from:'open_a_reset',to:'a_reset',x:-76,z:124,top:137},
  {from:'open_assign',to:'open_assign',x:-80,z:85,top:121}
 ];
 for(const v of up){const p=c.ports[v.from].bits[0].position,b=a.ports[v.to].bits[0].position;route(v.from+'_depart',[[p.x,p.y,p.z],[p.x,p.y,-64],[v.x+2,p.y,-64],[v.x+2,p.y,v.z]]);part=v.from+'_lift';rep(P(v.x+1,p.y,v.z),'west');edge(P(v.x+2,p.y,v.z),P(v.x+1,p.y,v.z));edge(P(v.x+1,p.y,v.z),P(v.x,p.y,v.z));column(part,v.x,v.z,p.y,v.top,{wireTop:true});
  if(b.y===v.top)route(v.from+'_arrive',[[v.x,v.top,v.z],[v.x-2,v.top,v.z],[b.x,b.y,b.z]]);
  else route(v.from+'_arrive',[[v.x,v.top,v.z],[v.x-2,v.top,v.z],[v.x-3,b.y,v.z],[b.x,b.y,b.z]]);
  connections.push({name:v.from,source:p,destination:b});
 }
 const down=[
  {from:'open_gpr_normal',to:'open_gpr',x:-90,z:-48,approach:-131,corridor:91},
  {from:'open_a_normal',to:'a_normal',x:-130,z:-32,approach:-176,corridor:114},
  {from:'open_b_normal',to:'b_normal',x:-110,z:-16,approach:-176,corridor:136},
  {from:'open_b_reset',to:'b_reset',x:-150,z:0,approach:-160,corridor:157},
 ];
 for(const v of down){const p=c.ports[v.from].bits[0].position,b=a.ports[v.to].bits[0].position,drop=p.y-b.y+(v.to==='b_reset'?4:0);const targetY=p.y-drop;const desc=insert(v.from+'_descent',makeSignalDescent({drop}),P(v.x,p.y,v.z),{drop});route(v.from+'_depart',[[p.x,p.y,p.z],[p.x,p.y,-64],[v.x,p.y,-64],[v.x,p.y,v.z]]);const ws=escaped(desc.ports.output.bits[0],P(v.x,p.y,v.z)),q=ws.at(-1);
  if(v.to==='b_reset'){route(v.from+'_arrive',[...ws,[q[0],targetY,v.corridor],[-158,targetY,v.corridor],[-158,targetY,b.z]]);part='b_reset_final_lift';rep(P(-159,targetY,b.z),'west');edge(P(-158,targetY,b.z),P(-159,targetY,b.z));edge(P(-159,targetY,b.z),P(-160,targetY,b.z));column(part,-160,b.z,targetY,targetY+5,{wireTop:true});route('b_reset_final_arrive',[[-160,targetY+5,b.z],[-162,targetY+5,b.z],[-163,b.y,b.z],[b.x,b.y,b.z]]);}else route(v.from+'_arrive',[...ws,[q[0],b.y,v.corridor],[v.approach,b.y,v.corridor],[v.approach,b.y,b.z],...(v.approach!==b.x?[[b.x,b.y,b.z]]:[])]);connections.push({name:v.from,source:p,destination:b});
 }
 // Boot is the physically retained boot return, already used by the microstate
 // circuit. Normalize its positive column top before this new long branch.
 const boot=P(248,221,-48),b=a.ports.boot.bits[0].position;part='boot_branch';rep(P(248,221,-49),'north');wire(P(248,221,-50));edge(boot,P(248,221,-49));edge(P(248,221,-49),P(248,221,-50));
 const desc=insert('boot_descent',makeSignalDescent({drop:105}),P(-170,221,-80),{drop:105});route('boot_depart',[[248,221,-50],[248,221,-84],[-170,221,-84],[-170,221,-80]]);const ws=escaped(desc.ports.output.bits[0],P(-170,221,-80)),q=ws.at(-1);route('boot_arrive',[...ws,[q[0],116,77],[-112,116,77],[-112,116,93]]);part='boot_final_lift';rep(P(-113,116,93),'west');edge(P(-112,116,93),P(-113,116,93));edge(P(-113,116,93),P(-114,116,93));column(part,-114,93,116,121,{wireTop:true});route('boot_final_arrive',[[-114,121,93],[b.x,b.y,b.z]]);connections.push({name:'held_boot',source:boot,destination:b});
 const ports=structuredClone(c.ports);for(const v of [...up,...down])delete ports[v.from];const consumed=new Set([...up,...down].map(v=>v.to));consumed.add('boot');for(const[n,p]of Object.entries(a.ports))if(!consumed.has(n))ports[n]=p;
 const blocks=[...map.values()],box={from:{},to:{}};for(const k of ['x','y','z']){box.from[k]=Math.min(...blocks.map(v=>v.position[k]));box.to[k]=Math.max(...blocks.map(v=>v.position[k]));}
 return{status:'offline_register_controller_and_actual_action_distribution',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,controller_parent_blocks:c.blocks.length,action_parent_blocks:a.blocks.length,new_control_route_blocks:blocks.length-c.blocks.length-a.blocks.length,stored_bits:20,action_outputs:16,physical_new_connections:8,dimensions:Object.fromEntries(['x','y','z'].map(k=>[k,box.to[k]-box.from[k]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Stable phase-window source and safe startup/admission/all32-state decoder conditioning.','Core reset/event producers, Rd/reg_write/lane input paths and all16actual file destinations.','Actual address/data/block selectors and their control/data routes, completion timing and native acceptance.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterControllerActions();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
