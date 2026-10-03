// Actual bit/round counter feedback over the retained ALU macro-state controller.
// Offline geometry only; external phase qualification and startup remain explicit.
import assert from 'node:assert/strict';
import {makeAluMacroFeedback} from './full-gpu-alu-macro-feedback.mjs';
import {makeAluLoopCounter} from './full-gpu-alu-loop-counter.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluLoopFeedback(){
 const parent=makeAluMacroFeedback(),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'macro_parent'}])),routes=[],edges=[],columns=[],connections=[],descents=[],banks=[],ports=structuredClone(parent.ports);let part='';
 function insert(id,blocks){for(const v of blocks){assert(!map.has(K(v.position)),'Parent collision '+id+' '+K(v.position));map.set(K(v.position),{...structuredClone(v),part:id});}}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(Number.isSafeInteger(steps)&&steps>0&&steps<2048&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function positive(name,x,z,bottom,outputY){assert((outputY-bottom)%4===1);part=name;for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');columns.push({name,x,z,bottom,top:outputY-1,output_y:outputY});edge(P(x,outputY-1,z),P(x,outputY,z));}

 const counter=makeAluLoopCounter({width:3});
 for(const[index,name]of ['bit','round'].entries()){
  const ox=86*index,translation=P(ox,296,-30),T=p=>P(p.x+ox,p.y+296,p.z-30),inst=materializeInstance(counter,{id:name+'_counter',translation});insert(inst.id,inst.blocks);banks.push({name,translation,ports:inst.ports,stored_bits:6});
  for(const[bank,x]of [['next',-4],['current',8]]){
   part=name+'_'+bank+'_fanout';for(let y=-2;y<=16;y++)put(T(P(x,y,3)),y%2===0?'light_gray_concrete':'redstone_torch');
   for(let bit=0;bit<3;bit++){
    const y=8*bit;put(T(P(x+1,y,3)),'redstone_wall_torch',{facing:'east'});wire(T(P(x+2,y,3)));rep(T(P(x+3,y,3)),'east');
    for(let dx=0;dx<4;dx++)edge(T(P(x+dx,y,3)),T(P(x+dx+1,y,3)));
    connections.push({kind:bank+'_open',bank:name,bit,source:parent.ports['macro_'+bank+'_open'].bits[0].position,destination:inst.ports[bank+'_open_'+bit].bits[0].position});
   }
   const px=bank==='next'?-10:4;route(part+'_entry',[[ox+px,294,-27],[ox+x-2,294,-27]]);part=name+'_'+bank+'_fanout';rep(P(ox+x-1,294,-27),'east');edge(P(ox+x-2,294,-27),P(ox+x-1,294,-27));edge(P(ox+x-1,294,-27),P(ox+x,294,-27));
  }
  for(const[k,control]of ['increment','clear'].entries()){
   const idx=5+2*index+k,src=parent.ports[name+'_'+(k?'clear':'increment')].bits[0].position,p=inst.ports[control].bits[0].position,tag=name+'_'+control;route(tag+'_lift_input',[[src.x,src.y,src.z],[228,256,src.z]]);part=tag;rep(P(229,256,src.z),'east');edge(P(228,256,src.z),P(229,256,src.z));edge(P(229,256,src.z),P(230,256,src.z));positive(tag+'_lift',230,src.z,256,289);part=tag;rep(P(229,289,src.z),'west');edge(P(230,289,src.z),P(229,289,src.z));edge(P(229,289,src.z),P(228,289,src.z));
   route(tag+'_arrival',[[228,289,src.z],[227,288,src.z],[p.x-2,288,src.z],[p.x-2,288,p.z-1]]);part=tag;rep(P(p.x-1,288,p.z-1),'east');edge(P(p.x-2,288,p.z-1),P(p.x-1,288,p.z-1));edge(P(p.x-1,288,p.z-1),P(p.x,288,p.z-1));positive(tag+'_short_lift',p.x,p.z-1,288,293);route(tag+'_receiver',[[p.x,293,p.z-1],[p.x,294,p.z]]);delete ports[name+'_'+(k?'clear':'increment')];connections.push({kind:control,bank:name,source:src,destination:p});
  }
  const src=inst.ports.terminal.bits[0].position,cx=src.x;part=name+'_terminal';rep(P(cx,313,-17),'south');edge(src,P(cx,313,-17));edge(P(cx,313,-17),P(cx,313,-16));positive(part+'_lift',cx,-16,313,322);part=name+'_terminal';rep(P(cx+1,322,-16),'east');edge(P(cx,322,-16),P(cx+1,322,-16));edge(P(cx+1,322,-16),P(cx+2,322,-16));
  const tx=index?194:180,tz=index?-44:-56,base=-24-4*index,local=makeSignalDescent({drop:322-base}),tr=P(tx,322,tz),at=p=>P(p.x+tr.x,p.y+tr.y,p.z+tr.z),desc=materializeInstance(local,{id:name+'_terminal_descent',translation:tr});insert(desc.id,desc.blocks);const path=local.path.map(at);for(let j=1;j<path.length;j++)edge(path[j-1],path[j]);routes.push({name:desc.id,path,refresh_indices:local.refresh.map(r=>r.index)});descents.push({name,translation:tr,drop:local.drop,input:desc.ports.input.bits[0],output:desc.ports.output.bits[0]});
  route(name+'_terminal_to_descent',[[cx+2,322,-16],[cx+2,322,tz],[tx,322,tz]]);
  const p=desc.ports.output.bits[0].position,dir=desc.ports.output.bits[0].travel,q=P(p.x+3*dir.x,p.y,p.z+3*dir.z),dest=parent.ports[name+'_last'].bits[0].position,x=dest.x,z=dest.z-2;
  route(name+'_terminal_return',[[p.x,p.y,p.z],[q.x,q.y,q.z],[q.x,base,-100-12*index],[x-2,base,-100-12*index],[x-2,base,z]]);part=name+'_terminal_return';rep(P(x-1,base,z),'east');edge(P(x-2,base,z),P(x-1,base,z));edge(P(x-1,base,z),P(x,base,z));positive(name+'_last_lift',x,z,base,-3);part=name+'_terminal_return';rep(P(x,-3,z+1),'south');edge(P(x,-3,z),P(x,-3,z+1));edge(P(x,-3,z+1),dest);delete ports[name+'_last'];ports[name+'_current']=inst.ports.address;connections.push({kind:'terminal',bank:name,source:src,destination:dest});
 }
 // Actual macro OPEN pads also drive both loop-bank fanouts; no second clock inputs.
 for(const[bank,x]of [['next',248],['current',260]]){
  part='shared_'+bank;const src=parent.ports['macro_'+bank+'_open'].bits[0].position;rep(P(x,268,124),'south');edge(src,P(x,268,124));edge(P(x,268,124),P(x,268,125));positive(part+'_lift',x,125,268,293);part='shared_'+bank;
  if(bank==='next'){
   rep(P(247,293,125),'west');edge(P(248,293,125),P(247,293,125));edge(P(247,293,125),P(246,293,125));route('shared_next_bus',[[246,293,125],[246,293,-48],[-10,293,-48]],{branchPoints:[P(76,293,-48),P(-10,293,-48)]});
   for(const x of[-10,76])route('shared_next_branch_'+x,[[x,293,-48],[x,293,-28],[x,294,-27]]);
  }else{
   rep(P(261,293,125),'east');edge(P(260,293,125),P(261,293,125));edge(P(261,293,125),P(262,293,125));route('shared_current_bus',[[262,293,125],[266,289,125],[266,289,-64],[4,289,-64]],{branchPoints:[P(90,289,-64),P(4,289,-64)]});
   for(const x of[4,90]){route('shared_current_branch_'+x,[[x,289,-64],[x,289,-31]]);part='shared_current_branch_'+x;rep(P(x,289,-30),'south');edge(P(x,289,-31),P(x,289,-30));edge(P(x,289,-30),P(x,289,-29));positive(part+'_lift',x,-29,289,294);part='shared_current_branch_'+x;rep(P(x,294,-28),'south');edge(P(x,294,-29),P(x,294,-28));edge(P(x,294,-28),P(x,294,-27));}
  }
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return {status:'offline_all_26_retained_controller_bits_data_feedback_routed',blocks,box,ports,routes,edges,columns,connections,descents,banks,parent_blocks:parent.blocks.length,metrics:{blocks:blocks.length,added_blocks:blocks.length-parent.blocks.length,retained_controller_bits:26,shared_commands:41,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_controller:false,missing:['ADVANCE A NEXT and held-NEXT-phase0 B CURRENT clock qualifiers feeding the actual common macro OPEN pads.','Common initialize distribution/override to phase, macro and both loop counters; source clock and startup/decoder conditioning/admission.','Four-lane command/fault/ready/request/ack routes; measured held-state and farthest-lock timing.']};
}
