// Physical shared command launches over frozen initialized controller. Offline only.
import assert from 'node:assert/strict';
import {makeAluInitializedFeedback} from './full-gpu-alu-initialized-feedback.mjs';
import {COMMANDS} from '../artifacts/full-gpu-layout-v1/alu-control/microprogram.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluCommandLaunch(){
 const parent=makeAluInitializedFeedback(),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'controller_parent'}])),edges=[],routes=[],columns=[],connections=[],ports={},groups=new Map();let part='';
 function put(p,id,properties){assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);if(!steps){assert(!delta[1]);continue;}assert((!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  assert.equal(new Set(path.map(K)).size,path.length,'self-overlap '+name);const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'refresh '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY,injections=[bottom]){part=name;assert((outputY-bottom)%4===1);for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY,injection_y:injections});edge(P(x,outputY-1,z),P(x,outputY,z));return P(x,outputY,z);}
 for(const name of COMMANDS){const p=parent.ports[name].bits[0].position,k=K(p);if(!groups.has(k))groups.set(k,{source:p,names:[]});groups.get(k).names.push(name);}
 for(const {source:p,names}of groups.values()){
  const name=names.join('+');part=name+'_launch';const rr=P(p.x,p.y,p.z-1),start=P(p.x,p.y,p.z-2);rep(rr,'north');edge(p,rr);edge(rr,start);
  route(name+'_north_escape',[[start.x,start.y,start.z],[start.x,start.y+8,start.z-8],[start.x,start.y+8,-128]]);
  const end=P(p.x,260,-128);connections.push({names,source:p,destination:end});for(const n of names)ports[n]={direction:'output',width:1,bits:[{bit:0,position:end,travel:P(0,0,-1)}],source:p};
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_shared_command_launches_pending_lane_buses',blocks,box,ports,edges,routes,columns,connections,metrics:{blocks:blocks.length,added_blocks:blocks.length-parent.blocks.length,parent_blocks:parent.blocks.length,distinct_physical_sources:groups.size,logical_commands:COMMANDS.length},native_calls:0};
}
