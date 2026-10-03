// Actual enabled fault join return to the shared ALU controller. Offline only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z);
export function makeAluFaultReturn(){
 const path='artifacts/full-gpu-layout-v1/alu-four-lane-fanout-v3/status-design.json',raw=readFileSync(new URL('../'+path,import.meta.url));
 assert.equal(createHash('sha256').update(raw).digest('hex'),'cbf837dacf261e2d19ac77aaf12f62a1e85dec87810b63c6535cf94328808515','Frozen fanout-v3');
 const parent=JSON.parse(raw),map=new Map(),edges=[],routes=[],columns=[],connections=[],descents=[],ports=structuredClone(parent.ports);let part='';
 function insert(id,d,t=P(0,0,0)){for(const v of d.blocks){const p=add(v.position,t);assert(!map.has(K(p)),id+' collision '+K(p));map.set(K(p),{position:p,block:structuredClone(v.block),part:id});}}
 insert('matched_parent',parent);
 function put(p,id,properties){assert(!map.has(K(p)),part+' collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);if(!steps){assert(!delta[1]);continue;}assert((!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  assert.equal(new Set(path.map(K)).size,path.length,'self-overlap '+name);const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}if(!prev.has(path.length))throw Error('refresh '+name+' '+JSON.stringify({ws,overlaps:path.filter(p=>map.has(K(p))).map(p=>({p,old:map.get(K(p)).part}))}));const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'internal overlap '+name+' '+K(p)+' '+map.get(K(p)).part);assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY,injections=[bottom]){part=name;assert((outputY-bottom)%4===1);for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY,injection_y:injections});edge(P(x,outputY-1,z),P(x,outputY,z));return P(x,outputY,z);}

 const source=P(744,336,176),target=P(28,-3,13),isolator=P(744,336,175);
 part='raw_enabled_fault_isolator';rep(isolator,'north');edge(source,isolator);edge(isolator,P(744,336,174));
 const local=makeSignalDescent({drop:343}),tr=P(300,340,-286),at=p=>add(p,tr);
 insert('raw_fault_descent',local,tr);const ps=local.path.map(at);for(let i=1;i<ps.length;i++)edge(ps[i-1],ps[i]);routes.push({name:'raw_fault_descent',path:ps,refresh_indices:local.refresh.map(v=>v.index)});descents.push({translation:tr,drop:343,blocks:local.blocks.length});
 route('raw_enabled_fault_upper_return',[[744,336,174],[750,336,174],[754,340,174],[754,340,-290],[300,340,-290],[300,340,-286]]);
 const out=at(local.ports.output.bits[0].position),v=local.ports.output.bits[0].travel,q=add(out,P(3*v.x,0,3*v.z));
 route('raw_enabled_fault_lower_return',[[out.x,out.y,out.z],[q.x,q.y,q.z],[q.x,-3,-270],[316,-3,-270],[316,-3,-130],[28,-3,-130],[28,-3,-36],[28,1,-32],[28,1,-20],[28,-3,-16],[28,-3,11]]);
 part='raw_enabled_fault_controller_receiver';rep(P(28,-3,12),'south');edge(P(28,-3,11),P(28,-3,12));edge(P(28,-3,12),target);
 connections.push({name:'raw_enabled_fault_to_ALU_controller',source,target,source_isolator:isolator,receiver:P(28,-3,12),meaning:'OR(enabled[i] AND actual fault[i]); not sticky core fault and not normal ACK drain.'});
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_35_commands_and_raw_fault_feedback_six_OPEN_paths_pending',blocks,box,ports,edges,routes,columns,connections,descents,metrics:{...parent.metrics,blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,new_shared_commands:0,new_physical_lane_receivers:0,enabled_fault_return_connected:true,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,missing:['Six data OPEN fanouts with local enable/fault and physical RESET-macro override.','Actual lane enable/mode/request/operand and response/ack/writeback interconnects.','Qualified_action_A, cadence, initialize/blanking and cold decoder conditioning producers.','Independent full electrical review and measured propagation/closure.']};
}
