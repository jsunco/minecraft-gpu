// Connected retained phase feedback over the immutable shared ALU command plane.
// Offline only. Qualified source cadence is external; no host phase stepping.
import assert from 'node:assert/strict';
import{makeAluControlWord}from'./full-gpu-alu-control-word.mjs';
import{makeAluLoopCounter}from'./full-gpu-alu-loop-counter.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
import{materializeInstance}from'./gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluPhaseLoop(){
 const word=makeAluControlWord(),counter=makeAluLoopCounter({width:2}),map=new Map(),parents=[],routes=[],edges=[],connections=[],columns=[];let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+K(v.position));map.set(K(v.position),{...structuredClone(v),part:id});}parents.push({id,blocks:blocks.length});}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 insert('word',word.blocks);edges.push(...word.edges);
 const translation=P(0,270,-30),T=p=>P(p.x,p.y+270,p.z-30),phase=materializeInstance(counter,{id:'phase',translation});insert('phase',phase.blocks);
 edges.push(...counter.edges.map(e=>({from:T(e.from),to:T(e.to)})));
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }

 // Always increment modulo4, with physical initialization CLEAR overriding data.
 part='phase_constant_increment';dev(T(P(50,-2,-5)),'redstone_block');rep(T(P(50,-2,-4)),'south');edge(T(P(50,-2,-5)),T(P(50,-2,-4)));edge(T(P(50,-2,-4)),T(P(50,-2,-3)));
 // Real fanout to every retained NEXT/CURRENT side-lock receiver.
 for(const[bank,x]of[['next',-4],['current',8]]){
  part='phase_'+bank+'_clock';for(let y=-2;y<=8;y++)put(T(P(x,y,3)),y%2===0?'light_gray_concrete':'redstone_torch');columns.push({name:part,x,z:3,bottom:-2,top:8,translation});
  for(let bit=0;bit<2;bit++){const y=8*bit;put(T(P(x+1,y,3)),'redstone_wall_torch',{facing:'east'});wire(T(P(x+2,y,3)));rep(T(P(x+3,y,3)),'east');for(let q=0;q<4;q++)edge(T(P(x+q,y,3)),T(P(x+q+1,y,3)));connections.push({name:bank+'_clock_'+bit,source:T(P(x+1,y,3)),destination:T(P(x+4,y,3))});}
 }
 route('phase_next_entry',[[-10,268,-27],[-6,268,-27]]);part='phase_next_entry';rep(T(P(-5,-2,3)),'east');edge(T(P(-6,-2,3)),T(P(-5,-2,3)));edge(T(P(-5,-2,3)),T(P(-4,-2,3)));
 route('phase_current_entry',[[4,268,-27],[6,268,-27]]);part='phase_current_entry';rep(T(P(7,-2,3)),'east');edge(T(P(6,-2,3)),T(P(7,-2,3)));edge(T(P(7,-2,3)),T(P(8,-2,3)));
 const descents=[];
 for(const bit of[0,1]){
  const y=271+8*bit,n='phase'+bit+'_feedback';part=n;rep(P(20,y,-39),'north');wire(P(20,y,-40));edge(P(20,y,-38),P(20,y,-39));edge(P(20,y,-39),P(20,y,-40));
  const local=makeSignalDescent({drop:bit?31:19}),tr=bit?P(0,y,-46):P(16,y,-42),at=p=>P(p.x+tr.x,p.y+tr.y,p.z+tr.z),inst=materializeInstance(local,{id:n+'_descent',translation:tr});insert(inst.id,inst.blocks);
  const path=local.path.map(at);for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name:inst.id,path,refresh_indices:local.refresh.map(r=>r.index)});descents.push({name:inst.id,translation:tr,drop:local.drop,input:inst.ports.input.bits[0],output:inst.ports.output.bits[0]});
  if(bit===0){route(n+'_arrival',[[20,y,-40],[16,y,-40],[16,y,-42]]);route(n+'_return',[[15,252,-36],[-36,252,-36],[-36,252,-14]]);}
  else{route(n+'_arrival',[[20,y,-40],[0,y,-40],[0,y,-46]]);route(n+'_return',[[-1,248,-40],[-30,248,-40],[-30,248,-18],[-30,252,-14]]);}
  connections.push({name:n,source:phase.ports.address.bits[bit].position,tap:P(20,y,-38),isolation:P(20,y,-39),destination:word.ports['phase'+bit].bits[0].position});
 }
 const ports=structuredClone(word.ports);delete ports.phase0;delete ports.phase1;
 ports.phase_current={...phase.ports.address,meaning:'Actual retained modulo4 phase bank; no external phase setter.'};ports.phase_initialize=phase.ports.clear;
 for(const[bank,x]of[['next',-10],['current',4]])ports['state_'+bank+'_phase']={direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:P(x,268,-27),receiver:P(bank==='next'?-5:7,268,-27),travel:P(1,0,0)}],meaning:'Physical core-qualified cadence. Continue during initialization while lane actions remain blanked. No overlapping local OPEN arrivals.'};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_command_plane_with_real_retained_phase_feedback',blocks,box,ports,parents,connections,columns,descents,routes,edges,phase_counter:{translation,source_bits:phase.ports.address.bits,constant_increment:true,clear_overrides:true,width:2,retained_bits:4},metrics:{blocks:blocks.length,command_plane_blocks:word.blocks.length,counter_blocks:counter.blocks.length,connecting_blocks:blocks.length-word.blocks.length-counter.blocks.length,retained_controller_bits:4,shared_commands:41,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_state_loop:false,missing:['Macro5 current/next state with conditional feedback and real bit/round3 paired counters.','Startup/decoder conditioning, actual qualified source cadence and macro-aware action admission.','Four-lane command routes and qualified lane-enable/fault OPEN joins; physical timing remains unmeasured.']};
}
