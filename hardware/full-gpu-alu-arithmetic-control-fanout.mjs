// Deliver subtract and held final-result data to all four lanes. Offline only.
import assert from 'node:assert/strict';
import {readAluCommandLaunch} from './full-gpu-alu-load-fanout.mjs';
import {makeAluAddendFanout} from './full-gpu-alu-addend-fanout.mjs';

import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
export function makeAluArithmeticControlFanout(){
 const lanes=makeAluAddendFanout(),controller=readAluCommandLaunch(),map=new Map(),edges=[],routes=[],columns=[],connections=[],descents=[],ports=structuredClone(lanes.ports);let part='';
 function insert(id,d,t=P(0,0,0)){for(const v of d.blocks){const p=add(v.position,t);assert(!map.has(K(p)),id+' collision '+K(p));map.set(K(p),{position:p,block:structuredClone(v.block),part:id});}}
 insert('matched_parent',lanes);
 function put(p,id,properties){assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);if(!steps){assert(!delta[1]);continue;}assert((!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  assert.equal(new Set(path.map(K)).size,path.length,'self-overlap '+name);const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'refresh '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY,injections=[bottom]){part=name;assert((outputY-bottom)%4===1);for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY,injection_y:injections});edge(P(x,outputY-1,z),P(x,outputY,z));return P(x,outputY,z);}
 const commands=['subtract','final_latched'];
 for(const[j,name]of commands.entries()){
  const src=controller.ports[name].bits[0].position,z=[-204,-180][j],branches=[];
  for(let i=0;i<4;i++){
   const target=lanes.ports['lane'+i+'_commands'].bits.find(p=>p.name===name).position,x=target.x+(i<2?-70:-78),tr=P(x,288,z+4),local=makeSignalDescent({drop:288-target.y}),at=p=>add(p,tr),desc={blocks:local.blocks};
   insert(`descent_${j}_${i}_parent`,desc,tr);const path=local.path.map(at);for(let k=1;k<path.length;k++)edge(path[k-1],path[k]);routes.push({name:`${name}_lane${i}_descent`,path,refresh_indices:local.refresh.map(v=>v.index)});
   const output=at(local.ports.output.bits[0].position),travel=local.ports.output.bits[0].travel,q=add(output,P(3*travel.x,0,3*travel.z));
   let ws=[[output.x,output.y,output.z],[q.x,q.y,q.z]];const safeX=x-(i<2?6:10);
   if(travel.z<0)ws.push([safeX,q.y,q.z],[safeX,q.y,z+20]);else ws.push([q.x,q.y,z+20],[safeX,q.y,z+20]);
   ws.push([safeX,target.y,-134],[target.x,target.y,-134],[target.x,target.y,-86]);route(`${name}_lane${i}_arrival`,ws);part=`${name}_lane${i}_receiver`;rep(P(target.x,target.y,-85),'south');edge(P(target.x,target.y,-86),P(target.x,target.y,-85));edge(P(target.x,target.y,-85),target);
   branches.push(P(x,288,z));descents.push({name,lane:i,translation:tr,drop:local.drop,blocks:local.blocks.length});connections.push({name,lane:i,source:src,target});
  }
  part=name+'_source_isolator';rep(P(src.x,260,-129),'north');edge(src,P(src.x,260,-129));edge(P(src.x,260,-129),P(src.x,260,-130));route(name+'_shared_bus',[[src.x,260,-130],[src.x,266,-136],[src.x,266,-139],[src.x,272,-145],[src.x,272,-148],[src.x,278,-154],[src.x,278,-157],[src.x,284,-163],[src.x,284,-166],[src.x,288,-170],[src.x,288,z],[Math.max(...branches.map(p=>p.x)),288,z]],{branchPoints:branches});
  for(let i=0;i<4;i++){const b=branches[i];part=`${name}_lane${i}_bus_branch`;rep(P(b.x,288,z+1),'south');edge(b,P(b.x,288,z+1));edge(P(b.x,288,z+1),P(b.x,288,z+2));route(`${name}_lane${i}_bus_arrival`,[[b.x,288,z+2],[b.x,288,z+4]]);}
 }

 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_four_lane_selectors_loads_arithmetic_remaining_commands_pending',blocks,box,ports,edges,routes,columns,connections,descents,metrics:{blocks:blocks.length,parent_blocks:lanes.blocks.length,added_blocks:blocks.length-lanes.blocks.length,connected_shared_commands:32,physical_lane_receivers:128,new_shared_commands:2,new_physical_lane_receivers:8,lane_retained_bits:228,controller_retained_bits:26,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,missing:['Remaining9 logical command fanout including six data-OPEN enable/fault/reset masks.','Four actual enable/mode/request/operand and response/ack/writeback interconnects.','Qualified_action_A, cadence, initialize/blanking and cold decoder conditioning producers.','Independent full electrical review and measured farthest-lock propagation; this is not selected final-density geometry.']};
}
