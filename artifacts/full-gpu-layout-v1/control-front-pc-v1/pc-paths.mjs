// Actual retained-PC feedback routing. This is offline design, never a runtime oracle.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makePcStorage} from '../control-nextpc-v1/pc-storage.mjs';
import {makePcIncrementer} from '../../../hardware/full-gpu-pc-incrementer.mjs';
import {makeSignalDescent} from '../../../hardware/full-gpu-signal-descent.mjs';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
export function makePcPaths(){const map=new Map(),parents={},edges=[],routes=[],columns=[],connections=[];let part='';const at=p=>map.get(K(p));
 function put(p,id,properties){assert(!at(p),'Collision '+part+' '+K(p)+' '+at(p)?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function insert(name,d,translation,quarterTurns=0){const moved=materializeInstance(d,{id:name,translation,quarter_turns:quarterTurns});for(const v of moved.blocks){assert(!at(v.position),'Parent collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}parents[name]={blocks:d.blocks.length,translation,quarterTurns};return moved;}
 const pc0=makePcStorage(),inc0=makePcIncrementer();assert.deepEqual(pc0,JSON.parse(readFileSync(new URL('../control-nextpc-v1/pc-storage.json',import.meta.url))));assert.deepEqual(inc0,JSON.parse(readFileSync(new URL('../pc-incrementer/design.json',import.meta.url))));
 const pc=insert('pc',pc0,P(0,0,0)),inc=insert('incrementer',inc0,P(60,0,0));
 function route(name,ws,{branches=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid route '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const forbid=new Set(branches.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!at(p)&&!forbid.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const cost=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!cost.has(start)||end-start>12)continue;const value=cost.get(start)+(end===path.length?0:1);if(value<(cost.get(end)??Infinity)){cost.set(end,value);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let p=prev.get(path.length);p!==-1;p=prev.get(p))refresh.push(p);
  for(let i=0;i<path.length;i++){const p=path[i];if(at(p)){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(at(p).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function lift(name,x,z,bottom,top){part=name;assert.equal((top-bottom)%4,1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,top,wire_top:true});}
 function descentEscape(d,left,exitZ){const b=d.ports.output.bits[0],p=b.position,t=b.travel,q=P(p.x+2*t.x,p.y,p.z+2*t.z),ws=[[p.x,p.y,p.z],[q.x,q.y,q.z]],x=left?-24:144;if(!left){if(q.z!==exitZ)ws.push([q.x,q.y,exitZ]);}else if(t.x>0)ws.push([q.x,q.y,q.z-10]);const end=ws.at(-1);ws.push([x,q.y,end[2]]);return ws;}
 // Eight current bits branch into isolated program-address pads and the real
 // shared incrementer. Each underfloor route has its own four-Y-separated plane.
 const program=[];
 for(let bit=0;bit<8;bit++){
  const s=pc.ports.pc.bits[bit].position,row=s.z,y=-16-4*bit,desc=insert('pc_descent_'+bit,makeSignalDescent({drop:s.y-y}),P(-8,s.y,row),2);
  route('pc_to_descent_'+bit,[[s.x,s.y,row],[-8,s.y,row]],{branches:[P(27,s.y,row)]});part='program_address_'+bit;rep(P(27,s.y,row-1),'north');wire(P(27,s.y,row-2));edge(P(27,s.y,row),P(27,s.y,row-1));edge(P(27,s.y,row-1),P(27,s.y,row-2));program.push({bit,position:P(27,s.y,row-2),source:P(27,s.y,row-1),travel:'north',high_power:15});
  const target=inc.ports.pc.bits[bit].position,north=bit<4,colz=north?-8:40,top=5;
  lift('increment_input_lift_'+bit,target.x,colz,y,top);part='increment_input_lift_feed_'+bit;rep(P(target.x-1,y,colz),'east');edge(P(target.x-2,y,colz),P(target.x-1,y,colz));edge(P(target.x-1,y,colz),P(target.x,y,colz));
  const out=descentEscape(desc,true),q=out.at(-1),corridor=row-20;
  route('pc_feedback_underfloor_'+bit,[...out,[q[0],y,corridor],[target.x-2,y,corridor],[target.x-2,y,colz]]);
  const dz=north?1:-1;route('increment_input_arrive_'+bit,[[target.x,top,colz],[target.x,1,colz+4*dz],[target.x,1,target.z]]);
  connections.push({from:'pc.pc',from_bit:bit,to:'incrementer.pc',to_bit:bit,source:s,destination:target});
 }
 // Return the incremented word to the NEXT selector, not to CURRENT. There
 // is no PC+1 -> open CURRENT feedback path hidden in this geometry.
 for(let bit=0;bit<8;bit++){
  const s=inc.ports.incremented_pc.bits[bit].position,t=inc.ports.incremented_pc.bits[bit].travel,forward=bit<4,dx=t.x,dz=forward?-1:1,hookx=s.x+2*dx,hookz=forward?-20:52,y=-48-4*bit;
  part='increment_export_'+bit;rep(P(s.x+dx,s.y,s.z),dx>0?'east':'west');wire(P(hookx,s.y,s.z));edge(s,P(s.x+dx,s.y,s.z));edge(P(s.x+dx,s.y,s.z),P(hookx,s.y,s.z));
  const desc=insert('increment_descent_'+bit,makeSignalDescent({drop:9-y}),P(hookx,9,hookz),forward?0:2);
  route('increment_escape_'+bit,[[hookx,1,s.z],[hookx,9,s.z+8*dz],[hookx,9,hookz]]);
  const target=pc.ports.incremented_pc.bits[bit].position;lift('pc_increment_lift_'+bit,10,target.z,y,1);part='pc_increment_lift_feed_'+bit;rep(P(9,y,target.z),'east');edge(P(8,y,target.z),P(9,y,target.z));edge(P(9,y,target.z),P(10,y,target.z));
  const out=descentEscape(desc,false,forward?-6:36),q=out.at(-1),corridor=bit<4?target.z+4:68;
  route('increment_return_underfloor_'+bit,[...out,[q[0],y,corridor],[8,y,corridor],[8,y,target.z]]);
  part='pc_increment_output_'+bit;rep(P(11,1,target.z),'east');wire(P(12,1,target.z));edge(P(10,1,target.z),P(11,1,target.z));edge(P(11,1,target.z),P(12,1,target.z));
  route('pc_increment_arrive_'+bit,[[12,1,target.z],[18,1,target.z]]);part='pc_increment_arrive_'+bit;rep(P(19,1,target.z),'east');edge(P(18,1,target.z),P(19,1,target.z));edge(P(19,1,target.z),target);
  connections.push({from:'incrementer.incremented_pc',from_bit:bit,to:'pc.incremented_pc',to_bit:bit,source:s,destination:target});
 }
 const ports=structuredClone(pc.ports);delete ports.incremented_pc;ports.program_address={direction:'output',width:8,polarity:'active_high',bit_order:'lsb_first',bits:program,meaning:'Actual CURRENT PC, held for the entire owned program-memory request. A qualifier still must prevent CURRENT commit during fetch.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_physically_connected_pc_feedback_candidate',blocks,parents,ports,edges,routes,columns,connections,box,metrics:{blocks:blocks.length,stored_bits:16,connections:16,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['Held IR immediate, branch agreement and qualified initialization/NEXT/CURRENT/UPDATE handshake producers.','Native ripple/route/setup/hold/lock-closure and density comparison.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makePcPaths();if(process.argv.includes('--check'))assert.deepEqual(d,JSON.parse(readFileSync(new URL('pc-paths.json',import.meta.url))));else writeFileSync(new URL('pc-paths.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
