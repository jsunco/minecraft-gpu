// Shared physical per-lane data-OPEN inhibits from real RESET, enable and fault signals.
// Offline continuation only; the six masked pulse deliveries are a separate unfinished group.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeAluFaultReturn} from './full-gpu-alu-fault-return.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
export function makeAluOpenInhibits(){
 const parent=makeAluFaultReturn(),map=new Map(),edges=[],routes=[],columns=[],connections=[],descents=[],gates=[],ports=structuredClone(parent.ports);let part='';
 const word=JSON.parse(readFileSync(new URL('../artifacts/full-gpu-layout-v1/alu-control/control-word.json',import.meta.url)));
 assert.deepEqual(word.groups.m_parallel_select_zero.states,[0]);assert.equal(word.groups.m_parallel_select_zero.phase,null);
 assert.deepEqual(word.matrix.find(c=>c.names.includes('m_parallel_select_zero')).output,P(92,252,2));
 function insert(id,d,t=P(0,0,0)){for(const v of d.blocks){const p=add(v.position,t);assert(!map.has(K(p)),id+' collision '+K(p));map.set(K(p),{position:p,block:structuredClone(v.block),part:id});}}
 insert('matched_parent',parent);
 function put(p,id,properties){assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);if(!steps){assert(!delta[1]);continue;}assert((!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  assert.equal(new Set(path.map(K)).size,path.length,'self-overlap '+name);const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}if(!prev.has(path.length))throw Error('refresh '+name+' '+JSON.stringify({ws,overlaps:path.filter(p=>map.has(K(p))).map(p=>({p,old:map.get(K(p)).part}))}));const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'internal overlap '+name+' '+K(p)+' '+map.get(K(p)).part);assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY,injections=[bottom]){part=name;assert((outputY-bottom)%4===1);for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY,injection_y:injections});edge(P(x,outputY-1,z),P(x,outputY,z));return P(x,outputY,z);}


 // This physical column is already driven only by decoded macro RESET. Reuse its actual bus.
 const resetSource=P(672,264,-216);part='actual_RESET_row_source_isolator';rep(P(673,264,-216),'east');edge(resetSource,P(673,264,-216));edge(P(673,264,-216),P(674,264,-216));
 route('actual_RESET_to_four_lane_mask_column',[[674,264,-216],[684,264,-216],[684,265,-217],[684,265,-312]]);
 part='actual_RESET_mask_column_input';rep(P(684,265,-313),'north');edge(P(684,265,-312),P(684,265,-313));edge(P(684,265,-313),P(684,265,-314));positive('actual_RESET_mask_positive_column',684,-314,265,334);
 const outs=[];
 for(let i=0;i<4;i++){
  const y=309+8*i;part='lane'+i+'_enable_isolator';rep(P(738,y,159),'north');edge(P(738,y,160),P(738,y,159));edge(P(738,y,159),P(738,y,158));
  route('lane'+i+'_actual_enable_to_allow',[[738,y,158],[734,y+4,158],[734,y+4,154],[762,y+4,154],[762,y+4,156],[762,y,160]]);
  part='lane'+i+'_fault_isolator';rep(P(741,y,184),'east');edge(P(740,y,184),P(741,y,184));edge(P(741,y,184),P(742,y,184));
  route('lane'+i+'_actual_fault_to_allow',[[742,y,184],[754,y,184],[754,y,158],[764,y,158]]);
  part='lane'+i+'_allow_gate';rep(P(763,y,160),'east');dev(P(764,y,160),'comparator',{facing:'west',mode:'subtract'});wire(P(765,y,160));rep(P(766,y,160),'east');solid(P(767,y,160));put(P(768,y,160),'redstone_wall_torch',{facing:'east'});rep(P(769,y,160),'east');wire(P(770,y,160));rep(P(771,y,160),'east');dev(P(772,y,160),'comparator',{facing:'west',mode:'subtract'});wire(P(773,y,160));rep(P(774,y,160),'east');wire(P(775,y,160));
  for(let x=762;x<775;x++)edge(P(x,y,160),P(x+1,y,160));rep(P(764,y,159),'south');edge(P(764,y,158),P(764,y,159));edge(P(764,y,159),P(764,y,160));
  part='lane'+i+'_RESET_column_isolator';rep(P(685,y,-314),'east');edge(P(684,y-1,-314),P(684,y,-314));edge(P(684,y,-314),P(685,y,-314));edge(P(685,y,-314),P(686,y,-314));
  route('lane'+i+'_actual_RESET_to_inhibit_gate',[[686,y,-314],[780,y,-314],[780,y,162],[772,y,162]]);
  part='lane'+i+'_RESET_receiver';rep(P(772,y,161),'north');edge(P(772,y,162),P(772,y,161));edge(P(772,y,161),P(772,y,160));
  gates.push({lane:i,enable_source:P(738,y,160),fault_source:P(740,y,184),reset_source:resetSource,allow_comparator:P(764,y,160),allow_rear:P(763,y,160),fault_side:P(764,y,159),inverter_support:P(767,y,160),inverter_torch:P(768,y,160),inhibit_comparator:P(772,y,160),inhibit_rear:P(771,y,160),reset_side:P(772,y,161),output:P(775,y,160),formula:'NOT RESET_macro AND (NOT enable OR fault)',reset_positive_support:P(684,y,-314)});
  outs.push({bit:i,position:P(775,y,160),source:P(774,y,160),travel:P(1,0,0)});
 }
 ports.lane_data_open_inhibit={direction:'output',width:4,polarity:'active_high',bits:outs,meaning:'Physical per-lane inhibition: !RESET_macro && (!enable || actual_fault). Must reach all six local data OPEN masks before action; those six deliveries remain missing.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_35_commands_fault_feedback_and_four_real_OPEN_inhibits_six_pulse_deliveries_pending',blocks,box,ports,edges,routes,columns,connections,descents,gates,reset_decoder_alias:{source_command:'m_parallel_select_zero',exact_macro_states:[0],shared_word_output:P(92,252,2),actual_shared_bus_tap:resetSource},metrics:{...parent.metrics,blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,physical_lane_OPEN_inhibits:4,complete_data_OPEN_delivery:false,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,missing:['The six data OPEN pulse fanouts and all24 actual comparator mask arrivals are still absent.','Actual lane enable/mode/request/operand and response/ack/writeback interconnects.','Qualified_action_A, cadence, initialize/blanking and cold decoder conditioning producers.','Independent full electrical review and measured propagation/closure.']};
}
