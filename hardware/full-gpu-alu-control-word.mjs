// Shared physical ALU word matrix and NEXT/CURRENT action qualification.
// Offline generator only: no software execution path is exported to Minecraft.
import assert from 'node:assert/strict';
import{makeStateDecoder}from'./full-gpu-state-decoder.mjs';
import{word,COMMANDS}from'../artifacts/full-gpu-layout-v1/alu-control/microprogram.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluControlWord(){
 const parent=makeStateDecoder(),map=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),edges=[],routes=[],columns=[],groups={},ports={macro:parent.ports.state},matrix=[];let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,dir)=>dev(p,'repeater',{facing:F[dir],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 const input=(name,p,receiver,travel)=>ports[name]={direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:p,receiver,travel}]};
 function route(name,points,{dust=[]}={}){part=name;const ps=[P(...points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dv=b.map((v,k)=>v-a[k]),n=Math.abs(dv[0])+Math.abs(dv[2]);assert(n&&(!dv[0]||!dv[2])&&(!dv[1]||Math.abs(dv[1])===n));for(let j=1;j<=n;j++)ps.push(P(...a.map((v,k)=>v+Math.sign(dv[k])*j)));}
  const forced=new Set(dust.map(K)),candidate=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(a.y===p.y&&p.y===b.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z&&!map.has(K(p))&&!forced.has(K(p)))candidate.push(i);}candidate.push(ps.length);const cost=new Map([[-1,0]]),prev=new Map();for(const b of candidate.slice(1))for(const a of candidate){if(a>=b)break;if(cost.has(a)&&b-a<=12&&(cost.get(b)??Infinity)>cost.get(a)+(b===ps.length?0:1)){cost.set(b,cost.get(a)+(b===ps.length?0:1));prev.set(b,a);}}assert(prev.has(ps.length),'Unrefreshable '+name);const refresh=[];for(let a=prev.get(ps.length);a!==-1;a=prev.get(a))refresh.push(a);
  for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(map.has(K(p))){assert(i===0||i===ps.length-1,'Route overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i))rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:refresh.sort((a,b)=>a-b)});return ps;
 }
 for(const name of COMMANDS){let phase=null;if(name.endsWith('_open_next')||name==='status_open')phase='next';else if(name.endsWith('_open_current'))phase='current';const states=Array.from({length:32},(_,i)=>i).filter(i=>{const w=word(i);if(name==='status_open')return w.status;if(phase)return w[phase].includes(name[0]);return w.data[name];});groups[name]={states,phase};}
 const unique=new Map();for(const[name,g]of Object.entries(groups)){const sig=g.states.join(',')+'|'+g.phase;if(!unique.has(sig))unique.set(sig,{...g,names:[]});unique.get(sig).names.push(name);}
 // All output words emerge at Y252; same truth and phase share one real source.
 for(const[j,g]of [...unique.values()].entries()){
  const x=24+4*j;part='word_column_'+j;
  for(let y=1;y<=251;y++){if(y%2)solid(P(x,y,4));else put(P(x,y,4),'redstone_torch');}solid(P(x,0,4));put(P(x,252,4),'redstone_torch');rep(P(x,252,3),'north');wire(P(x,252,2));edge(P(x,252,4),P(x,252,3));edge(P(x,252,3),P(x,252,2));
  let output=P(x,252,2),source=P(x,252,3);
  if(g.phase){rep(P(x,252,1),'north');dev(P(x,252,0),'comparator',{facing:'south',mode:'subtract'});wire(P(x,252,-1));rep(P(x,252,-2),'north');wire(P(x,252,-3));for(let z=2;z>-3;z--)edge(P(x,252,z),P(x,252,z-1));rep(P(x+1,252,0),'west');edge(P(x+2,252,0),P(x+1,252,0));edge(P(x+1,252,0),P(x,252,0));output=P(x,252,-3);source=P(x,252,-2);}
  const port={direction:'output',width:1,polarity:'active_high',bits:[{bit:0,position:output,source,travel:P(0,0,-1)}],phase:g.phase};for(const name of g.names)ports[name]=structuredClone(port);
  matrix.push({...g,x,output});columns.push({kind:'positive_OR_word',x,z:4,bottom:1,last:249,outputY:252,states:g.states});
 }
 for(let s=0;s<32;s++){
  const selected=matrix.filter(c=>c.states.includes(s));if(!selected.length)continue;const y=1+8*s,max=Math.max(...selected.map(c=>c.x)),tap=new Set(selected.map(c=>c.x));
  route('macro_word_'+s,[[15,y,6],[max,y,6]],{dust:[...tap].map(x=>P(x,y,6))});part='macro_word_'+s;for(const c of selected){rep(P(c.x,y,5),'north');edge(P(c.x,y,6),P(c.x,y,5));edge(P(c.x,y,5),P(c.x,y,4));}
 }
 const literals=[['phase0',-36],['phase1',-30],['qualified_action_A',-24]];
 for(const[name,x]of literals){part='phase_input_'+name;for(let y=252;y<=260;y++)put(P(x,y,-12),(y-252)%2===0?'light_gray_concrete':'redstone_torch');wire(P(x,252,-14));rep(P(x,252,-13),'south');edge(P(x,252,-14),P(x,252,-13));edge(P(x,252,-13),P(x,252,-12));input(name,P(x,252,-14),P(x,252,-13),P(0,0,1));columns.push({kind:'positive_phase_input',x,z:-12,bottom:252,top:260});}
 const qualifiers=[];
 for(const [phase,y,values]of[['next',252,[1,0,1]],['current',260,[0,1,1]]]){
  part='qualify_'+phase;dev(P(-39,y,-7),'redstone_block');rep(P(-38,y,-7),'east');wire(P(-37,y,-7));edge(P(-39,y,-7),P(-38,y,-7));edge(P(-38,y,-7),P(-37,y,-7));
  const gates=[];
  for(const[[name,x],wanted]of literals.map((v,i)=>[v,values[i]])){
   rep(P(x,y,-7),'east');dev(P(x+1,y,-7),'comparator',{facing:'west',mode:'subtract'});wire(P(x+2,y,-7));rep(P(x+3,y,-7),'east');wire(P(x+4,y,-7));wire(P(x+5,y,-7));for(let xx=x-1;xx<x+5;xx++)edge(P(xx,y,-7),P(xx+1,y,-7));
   if(wanted){put(P(x,y,-11),'redstone_wall_torch',{facing:'south'});wire(P(x,y,-10));}else{wire(P(x,y,-11));rep(P(x,y,-10),'south');}wire(P(x,y,-9));wire(P(x+1,y,-9));rep(P(x+1,y,-8),'south');for(const[a,b]of[[P(x,y,-12),P(x,y,-11)],[P(x,y,-11),P(x,y,-10)],[P(x,y,-10),P(x,y,-9)],[P(x,y,-9),P(x+1,y,-9)],[P(x+1,y,-9),P(x+1,y,-8)],[P(x+1,y,-8),P(x+1,y,-7)]])edge(a,b);gates.push({name,wanted,comparator:P(x+1,y,-7),mask:P(x+1,y,-8)});
  }
  rep(P(-18,y,-7),'east');solid(P(-17,y,-7));put(P(-16,y,-7),'redstone_wall_torch',{facing:'east'});rep(P(-15,y,-7),'east');wire(P(-14,y,-7));for(let x=-19;x<-14;x++)edge(P(x,y,-7),P(x+1,y,-7));qualifiers.push({phase,gates,mask:P(-14,y,-7)});
 }
 const next=matrix.filter(c=>c.phase==='next'),cur=matrix.filter(c=>c.phase==='current');
 route('next_mask_bus',[[-14,252,-7],[Math.max(...next.map(c=>c.x))+2,252,-7]],{dust:next.map(c=>P(c.x+2,252,-7))});
 route('current_mask_descent',[[-14,260,-7],[-14,256,-11],[-14,256,-13]]);
 route('current_mask_bus',[[-14,256,-13],[Math.max(...cur.map(c=>c.x))+2,256,-13]],{dust:cur.map(c=>P(c.x+2,256,-13))});
 for(const c of next){part='next_mask_branch_'+c.x;rep(P(c.x+2,252,-6),'south');edge(P(c.x+2,252,-7),P(c.x+2,252,-6));edge(P(c.x+2,252,-6),P(c.x+2,252,-5));route(part,[[c.x+2,252,-5],[c.x+2,252,0]]);}
 for(const c of cur){part='current_mask_branch_'+c.x;rep(P(c.x+2,256,-12),'south');edge(P(c.x+2,256,-13),P(c.x+2,256,-12));edge(P(c.x+2,256,-12),P(c.x+2,256,-11));route(part,[[c.x+2,256,-11],[c.x+2,256,-8],[c.x+2,252,-4],[c.x+2,252,0]]);}
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_connected_shared_ALU_word_and_phase_qualifiers',blocks,ports,groups,matrix,qualifiers,columns,routes,edges,box,parent_blocks:parent.blocks.length,metrics:{blocks:blocks.length,shared_command_bits:41,physical_shared_word_columns:matrix.length,macro_states:32,active_macro_states:28,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,missing:['13 current/next state bits and exact conditional next-state/bit/round physical feedback routes.','Initialize/reset/core-fault admission producing qualified_action_A; upstream shared cadence connection and actual all-lock timing.','Four-lane data OPEN enable/fault qualification, command fanout and core-ready/ack joins.'],complete_state_loop:false,native_acceptance:false};
}
