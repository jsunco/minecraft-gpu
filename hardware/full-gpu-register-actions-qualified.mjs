// Connected offline register action eligibility and physical four-lane fanout.
import assert from 'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{resolve,join}from'node:path';import{fileURLToPath}from'node:url';
import{makeRegisterActions}from'./full-gpu-register-actions.mjs';import{makeRegisterActionEligibility}from'./full-gpu-register-action-eligibility.mjs';import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeQualifiedRegisterActions(){
 const actions=makeRegisterActions(),elig=makeRegisterActionEligibility(),origins={actions:P(0,0,0),eligibility:P(20,-32,0)},map=new Map(),parents=[],routes=[],edges=[],columns=[],connections=[];let part='';
 function insert(id,d){const m=materializeInstance(d,{id,translation:origins[id]});for(const v of m.blocks){assert(!map.has(K(v.position)));map.set(K(v.position),{...v,part:id});}parents.push({id,blocks:m.blocks.length,origin:origins[id]});return m;}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function column(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++){if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');}put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}

 const a=insert('actions',actions),e=insert('eligibility',elig),ports=structuredClone(a.ports);
 for(const name of ['gpr_normal','assign_normal','assign_reset'])delete ports[name];
 for(const [name,p]of Object.entries(e.ports))if(name!=='qualified')ports[name]=p;
 // Qualified normal GPR write: three physical Rd guards, reg_write and intent.
 route('gpr_eligibility_exit',[[64,-16,5],[64,-16,8],[60,-16,8],[60,-16,-16],[18,-16,-16]]);part='gpr_positive_lift';rep(P(17,-16,-16),'west');edge(P(18,-16,-16),P(17,-16,-16));edge(P(17,-16,-16),P(16,-16,-16));column(part,16,-16,-16,1,{wireTop:true});
 route('gpr_eligibility_arrive',[[16,1,-16],[16,1,-14],[15,0,-14],[0,0,-14],[0,0,-3]]);
 connections.push({name:'eligible_gpr_to_actions',source:e.ports.qualified.bits[0].position,destination:a.ports.gpr_normal.bits[0].position});
 // The reset assignment term actually contains both boot and ASSIGN_OPEN.
 route('boot_assignment_exit',[[68,-16,5],[68,-16,88],[24,-16,88]]);part='assignment_reset_lift';rep(P(23,-16,88),'west');edge(P(24,-16,88),P(23,-16,88));edge(P(23,-16,88),P(22,-16,88));column(part,22,88,-16,-3,{wireTop:true});
 route('boot_assignment_arrive',[[22,-3,88],[22,-3,86],[22,-2,85],[22,-2,72],[10,-2,72]]);
 connections.push({name:'boot_assignment_to_actions',source:e.ports.qualified.bits[1].position,destination:a.ports.assign_reset.bits[0].position});
 // Shared raw assignment intent really drives both eligibility and normal mask.
 route('assignment_intent_input',[[50,-19,-15],[50,-19,-7]],{branchPoints:[P(50,-19,-12)]});part='assignment_intent_branch';rep(P(51,-19,-12),'east');wire(P(52,-19,-12));edge(P(50,-19,-12),P(51,-19,-12));edge(P(51,-19,-12),P(52,-19,-12));
 route('assignment_intent_exit',[[52,-19,-12],[76,-19,-12],[76,-19,68]]);part='assignment_intent_lift';rep(P(75,-19,68),'west');edge(P(76,-19,68),P(75,-19,68));edge(P(75,-19,68),P(74,-19,68));column(part,74,68,-19,2,{wireTop:true});
 route('assignment_intent_arrive',[[74,2,68],[74,2,66],[72,0,66],[0,0,66],[0,0,69]]);
 ports.open_assign={...e.ports.open_assign,bits:[{bit:0,position:P(50,-19,-15),travel:P(0,0,1)}]};
 connections.push({name:'assignment_intent_to_eligibility',source:ports.open_assign.bits[0].position,destination:e.ports.open_assign.bits[0].position},{name:'assignment_intent_to_actions',source:ports.open_assign.bits[0].position,destination:a.ports.assign_normal.bits[0].position});
 const blocks=[...map.values()],box={from:{},to:{}};for(const k of ['x','y','z']){box.from[k]=Math.min(...blocks.map(v=>v.position[k]));box.to[k]=Math.max(...blocks.map(v=>v.position[k]));}
 return{status:'offline_connected_register_actions_and_actual_eligibility',blocks,ports,parents,routes,edges,columns,connections,box,metrics:{blocks:blocks.length,parent_blocks:actions.blocks.length+elig.blocks.length,route_blocks:blocks.length-actions.blocks.length-elig.blocks.length,stored_bits:0,action_outputs:16,physical_new_connections:4,dimensions:Object.fromEntries(['x','y','z'].map(k=>[k,box.to[k]-box.from[k]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Physical source connections for microstate intents, Rd, reg_write, boot and lane mask.','Actual admitted stable action-window generator and startup/reset/fault sequencing.','All16 architectural file destination routes, address/data/block selectors, measured far-lock close timing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeQualifiedRegisterActions();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
