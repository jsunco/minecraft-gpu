// Actual four retained lanes and status reduction routes. Offline, no native use.
import assert from 'node:assert/strict';
import {makeAluLaneConnectors} from './full-gpu-alu-lane-connectors.mjs';
import {makeLaneJoin} from '../artifacts/full-gpu-layout-v1/control-event-gates-v1/prepare.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
export function makeAluFourLaneStatus(){
 const lane=makeAluLaneConnectors(),join=makeLaneJoin(),map=new Map(),edges=[],routes=[],columns=[],connections=[],parents=[],ports={};let part='';
 const translations=[P(400,40,0),P(584,40,0),P(400,204,0),P(584,204,0)];
 function insert(id,d,t){const at=p=>add(p,t);for(const v of d.blocks){const p=at(v.position);assert(!map.has(K(p)),id+' collision '+K(p));map.set(K(p),{position:p,block:structuredClone(v.block),part:id});}parents.push({id,translation:t,blocks:d.blocks.length});return at;}
 function put(p,id,properties){assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);if(!steps){assert(!delta[1]);continue;}assert((!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  assert.equal(new Set(path.map(K)).size,path.length,'self-overlap '+name);const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'refresh '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY,injections=[bottom]){part=name;assert((outputY-bottom)%4===1);for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY,injection_y:injections});edge(P(x,outputY-1,z),P(x,outputY,z));return P(x,outputY,z);}
 const jt=P(736,280,160),ja=insert('join_parent',join,jt);
 for(const[name,p]of Object.entries(join.ports))ports[name]={...structuredClone(p),bits:p.bits.map(v=>({...v,position:ja(v.position)}))};
 positive('all_busy_ready_or',724,122,281,314,Array.from({length:8},(_,i)=>281+4*i));
 for(let i=0;i<4;i++){
  const at=insert('lane'+i+'_parent',lane,translations[i]),y=281+8*i;
  ports['lane'+i+'_commands']={direction:'input',width:41,bits:lane.ports.map((p,bit)=>({bit,name:p.name,position:at(p.position),destination:at(p.destination)}))};
  const outputs={};
  for(const[j,name]of['busy','ready','fault_div_zero'].entries()){
   const raw=lane.status_ports.find(p=>p.name===name),src=at(raw.position),x=src.x+(i>=2?8:0),z=134+8*j;
   // All status columns use their own physical source; upper-tier shafts are offset by8X.
   part=`lane${i}_${name}_source`;rep(P(src.x,src.y,125),'south');edge(src,P(src.x,src.y,125));edge(P(src.x,src.y,125),P(src.x,src.y,126));
   route(`lane${i}_${name}_column_feed`,[[src.x,src.y,126],[x,src.y,126],[x,src.y,z-5],[x,src.y+3,z-2]]);
   part=`lane${i}_${name}_column_input`;rep(P(x,src.y+3,z-1),'south');edge(P(x,src.y+3,z-2),P(x,src.y+3,z-1));edge(P(x,src.y+3,z-1),P(x,src.y+3,z));
   outputs[name]=positive(`lane${i}_${name}_column`,x,z,src.y+3,y);
   connections.push({name:`lane${i}_${name}`,retained_source:at(raw.source),tapped_source:at(raw.actual_tapped_source),exported_receiver:src,column_output:outputs[name]});
  }
  const busy=outputs.busy,ready=outputs.ready,fault=outputs.fault_div_zero;
  part=`lane${i}_busy_split`;rep(P(busy.x,y,133),'north');edge(busy,P(busy.x,y,133));edge(P(busy.x,y,133),P(busy.x,y,132));route(`lane${i}_busy_to_or`,[[busy.x,y,132],[busy.x,y,122],[722,y,122]]);part=`lane${i}_busy_or_injection`;rep(P(723,y,122),'east');edge(P(722,y,122),P(723,y,122));edge(P(723,y,122),P(724,y,122));
  // Ready has two isolated consumers: active-lane all-ready and unconditional reuse drain.
  part=`lane${i}_ready_to_join_source`;rep(P(ready.x,y,143),'south');edge(ready,P(ready.x,y,143));edge(P(ready.x,y,143),P(ready.x,y,144));route(`lane${i}_ready_to_join`,[[ready.x,y,144],[730,y,144],[730,y,156],[738,y,156]]);part=`lane${i}_ready_join_receiver`;rep(P(739,y,156),'east');edge(P(738,y,156),P(739,y,156));edge(P(739,y,156),P(740,y,156));
  part=`lane${i}_ready_to_drain_source`;rep(P(ready.x,y,141),'north');edge(ready,P(ready.x,y,141));edge(P(ready.x,y,141),P(ready.x,y,140));route(`lane${i}_ready_to_or`,[[ready.x,y,140],[ready.x,y+4,136],[718,y+4,136],[718,y+4,122],[722,y+4,122]]);part=`lane${i}_ready_or_injection`;rep(P(723,y+4,122),'east');edge(P(722,y+4,122),P(723,y+4,122));edge(P(723,y+4,122),P(724,y+4,122));
  part=`lane${i}_fault_to_join_source`;rep(P(fault.x,y,151),'south');edge(fault,P(fault.x,y,151));edge(P(fault.x,y,151),P(fault.x,y,152));route(`lane${i}_fault_to_join`,[[fault.x,y,152],[714,y,152],[714,y,184],[738,y,184]]);part=`lane${i}_fault_join_receiver`;rep(P(739,y,184),'east');edge(P(738,y,184),P(739,y,184));edge(P(739,y,184),P(740,y,184));
 }
 part='all_status_low_inverter';rep(P(725,314,122),'east');solid(P(726,314,122));solid(P(726,313,122));put(P(727,314,122),'redstone_wall_torch',{facing:'east'});rep(P(728,314,122),'east');wire(P(729,314,122));for(let x=724;x<729;x++)edge(P(x,314,122),P(x+1,314,122));
 ports.all_status_low={direction:'output',width:1,polarity:'active_high',bits:[{bit:0,position:P(729,314,122),source:P(728,314,122),travel:P(1,0,0)}],meaning:'NOT OR of every actual lane busy and ready, including inactive lanes. No acknowledgement alone clears it.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_four_lane_status_routes_command_fanout_pending',blocks,box,ports,parents,translations,edges,routes,columns,connections,metrics:{blocks:blocks.length,lane_instances:4,lane_blocks:lane.blocks.length,lane_storage_bits:228,inherited_join_blocks:join.blocks.length,status_wires:12,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,missing:['Actual shared41 command delivery and six data OPEN per-lane masks with reset override.','Four enable inputs and ready/fault/drain responses to the core, plus mode/request/operand/writeback routes.','Qualified_action_A and initialize/cold decoder conditioning remain external producers.','Native timing and complete whole-machine placement remain unverified.']};
}
