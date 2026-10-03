// Physical shared phase masking and initialization distribution; no host phases.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{makeRegisterController}from'./full-gpu-register-controller-v2.mjs';
import{makeRegisterCounterPhases}from'./full-gpu-register-counter-phases.mjs';
import{makeCounterGuards}from'./full-gpu-counter-guards.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterSharedControl(){
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

 function normalize(name,a,d){part=name;const q=P(a.x+d.x,a.y,a.z+d.z),b=P(a.x+2*d.x,a.y,a.z+2*d.z);rep(q,d.x>0?'east':d.x<0?'west':d.z>0?'south':'north');wire(b);edge(a,q);edge(q,b);routes.push({name,path:[a,q,b],refresh_indices:[1]});return b;}
 const controller=makeRegisterController();insert('controller',controller.blocks);const connections=[];
 // A running register reset must not be disabled by its own reset request.
 // The external held permit belongs to the still-missing startup/fault admission.
 // Both phases are normalized, then individually masked by one real !permit.
 const controlY=-82;
 part='permit_inverter';wire(P(-64,controlY,148));rep(P(-63,controlY,148),'east');solid(P(-62,controlY,148));put(P(-61,controlY,148),'redstone_wall_torch',{facing:'east'});wire(P(-60,controlY,148));
 for(let x=-64;x<-60;x++)edge(P(x,controlY,148),P(x+1,controlY,148));
 route('negative_permit',[[-60,controlY,148],[-40,controlY,148]],{branchPoints:[P(-44,controlY,148)]});
 for(const [name,z,maskX]of[['next',140,-44],['current',160,-40]]){
  route(name+'_phase_input',[[-54,controlY,z],[-46,controlY,z]]);
  part=name+'_phase_mask';rep(P(-45,controlY,z),'east');cmp(P(-44,controlY,z));wire(P(-43,controlY,z));rep(P(-42,controlY,z),'east');wire(P(-41,controlY,z));
  for(let x=-46;x<-41;x++)edge(P(x,controlY,z),P(x+1,controlY,z));
  if(name==='next')route(name+'_mask_feed',[[maskX,controlY,148],[maskX,controlY,z+2]]);
  else route(name+'_mask_feed',[[maskX,controlY,148],[maskX,controlY,156],[-44,controlY,156],[-44,controlY,z-2]]);
  part=name+'_mask_feed';const dz=name==='next'?-1:1,sideZ=z-dz;rep(P(-44,controlY,sideZ),dz<0?'north':'south');edge(P(-44,controlY,z-2*dz),P(-44,controlY,sideZ));edge(P(-44,controlY,sideZ),P(-44,controlY,z));
 }
 route('next_output',[[-41,-82,140],[-34,-82,140]],{branchPoints:[P(-34,-82,140)]});
 route('next_counter',[[-34,-82,140],[-30,-82,140],[-30,-82,112],[-10,-82,112],[-10,-82,3]]);
 route('next_state_lift_feed',[[-34,-82,140],[-34,-86,144],[150,-86,144],[150,-85,143],[150,-85,9]]);
 part='next_state_lift';rep(P(150,-85,8),'north');edge(P(150,-85,9),P(150,-85,8));edge(P(150,-85,8),P(150,-85,7));column(part,150,7,-85,0,{wireTop:true});
 route('next_state_arrive',[[150,0,7],[150,0,3]]);
 route('current_output',[[-41,-82,160],[-26,-82,160]],{branchPoints:[P(-26,-82,160)]});
 normalize('current_counter_normalize',P(-26,-82,160),P(0,0,-1));
 route('current_counter',[[-26,-82,158],[-26,-82,116],[4,-82,116],[4,-82,3]]);
 normalize('current_lift_normalize',P(-26,-82,160),P(0,0,1));
 route('current_state_lift_feed',[[-26,-82,162],[-26,-90,170],[162,-90,170],[162,-89,169],[162,-89,9]]);
 part='current_state_lift';rep(P(162,-89,8),'north');edge(P(162,-89,9),P(162,-89,8));edge(P(162,-89,8),P(162,-89,7));column(part,162,7,-89,0,{wireTop:true});
 route('current_state_arrive',[[162,0,7],[162,0,3]]);
 for(const [source, names]of[[P(-41,-82,140),['next_open','counter_qualified_next']],[P(-41,-82,160),['current_open','counter_qualified_current']]])for(const name of names)connections.push({name,source,destination:controller.ports[name].bits[0].position});
 // One physical initialization clamp reaches all three old destinations.
 // It is level data, not an implicit reset or a guaranteed initialization pulse.
 route('initialize_bus',[[330,-110,110],[350,-110,110]],{branchPoints:[P(340,-110,110),P(345,-110,110)]});
 const initTargets=[
  {name:'initialize',source:P(340,-110,110),x:140,z:-20,base:-111,top:-2,ws:[[340,-110,110],[340,-110,114],[339,-111,114],[140,-111,114],[140,-111,-18]],rep:P(140,-111,-19),dir:'north',out:[[140,-2,-20],[140,-2,-3],[145,-2,-3]]},
  {name:'counter_initialize',source:P(345,-110,110),x:84,z:-22,base:-111,top:-82,ws:[[345,-110,110],[345,-110,118],[344,-111,118],[84,-111,118],[84,-111,-20]],rep:P(84,-111,-21),dir:'north',out:[[84,-82,-22],[84,-82,-10],[79,-82,-10]]},
  {name:'counter_boot_initialize',source:P(350,-110,110),x:153,z:72,base:-116,top:-79,ws:[[350,-110,110],[350,-110,122],[350,-116,128],[153,-116,128],[153,-116,74]],rep:P(153,-116,73),dir:'north',out:[[153,-79,72],[153,-79,74]]},
 ];
 for(const c of initTargets){if(c.name==='counter_boot_initialize'){normalize(c.name+'_normalize',c.source,P(0,0,1));c.ws[0]=[350,-110,112];}route(c.name+'_clamp_feed',c.ws);part=c.name+'_clamp_lift';rep(c.rep,c.dir);edge(P(c.rep.x,c.rep.y,c.rep.z+1),c.rep);edge(c.rep,P(c.x,c.base,c.z));column(part,c.x,c.z,c.base,c.top,{wireTop:true});route(c.name+'_clamp_arrive',c.out);connections.push({name:c.name,source:P(330,-110,110),destination:controller.ports[c.name].bits[0].position});}
 const consumed=new Set(connections.map(c=>c.name)),ports=Object.fromEntries(Object.entries(controller.ports).filter(([n])=>!consumed.has(n)));
 const input=(p,receiver,travel,meaning)=>({direction:'input',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:p,receiver,travel}],meaning});
 ports.phase_a=input(P(-54,-82,140),P(-45,-82,140),P(1,0,0),'Shared source phase A. Complete routes must be settled and CURRENT closed before NEXT opens.');
 ports.phase_b=input(P(-54,-82,160),P(-45,-82,160),P(1,0,0),'Shared source phase B. NEXT must close before CURRENT opens.');
 ports.bank_permit=input(P(-64,-82,148),P(-63,-82,148),P(1,0,0),'Held admission permit. It must stay high while controller services reset; raw reset/fault must not deadlock its acknowledgement. Physical admission circuit is still missing.');
 ports.initialize=input(P(330,-110,110),P(331,-110,110),P(1,0,0),'Common data clamp only. Hold through full NEXT and CURRENT captures, then close both before release. Does not clear stores asynchronously or condition the decoder by itself.');
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_register_common_phase_and_init_distribution',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:20,shared_control_connections:connections.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Source phase connection, retained startup/admission/all32-state decoder conditioning; no guarantee of arbitrary-phase fault/reset safety.','Qualified lane/regwrite/file action routes and all original event producers.','Native timing, far-lock closure/retention, complete density comparison and whole-machine placement.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterSharedControl();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
