// Actual state-row driven conditional ALU next-state/control product network.
// Frozen command and phase-feedback parent unchanged. No host FSM execution.
import assert from 'node:assert/strict';
import{makeAluControlWord}from'./full-gpu-alu-control-word.mjs';
import{makeAluPhaseLoop}from'./full-gpu-alu-phase-loop.mjs';
import{transitionTerms,INPUTS,OUTPUTS}from'../artifacts/full-gpu-layout-v1/alu-control/conditional-v1/terms.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeAluConditional(){
 const parent=makeAluPhaseLoop(),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'phase_parent'}])),terms=transitionTerms().map(t=>({...t,outputs:t.outputs.filter(i=>i<5)})).filter(t=>t.outputs.length),routes=[],edges=[],columns=[],products=[],orColumns=[],ports=structuredClone(parent.ports);let part='';
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function route(name,ws,{branchPoints=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(Number.isSafeInteger(steps)&&steps>0&&steps<2048&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const noRep=new Set(branchPoints.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!noRep.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const c=costs.get(start)+(end===path.length?0:1);if(c<(costs.get(end)??Infinity)){costs.set(end,c);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.push(i);
  for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 const slots=Math.max(...terms.map(t=>t.slot))+1,inputUses=[],outputUses=[];
 for(let slot=0;slot<slots;slot++){
  const ts=terms.filter(t=>t.slot===slot),z=20+12*slot;
  for(const[j,name]of INPUTS.entries()){
   const used=ts.filter(t=>name in t.literals);if(!used.length)continue;const x=24+6*j,last=(slot===0&&['reset_request','any_fault'].includes(name))?257:Math.max(...used.map(t=>1+8*t.macro));part='literal_column_'+slot+'_'+name;
   for(let y=-3;y<=last;y++)put(P(x,y,z-5),(y+3)%2===0?'light_gray_concrete':'redstone_torch');inputUses.push({slot,name,x,z:z-5,last});columns.push({name:part,x,z:z-5,bottom:-3,top:last});
  }
  for(let bit=0;bit<5;bit++)if(ts.some(t=>t.outputs.includes(bit))){
   const x=90+4*bit;part='output_column_'+slot+'_'+bit;
   for(let y=1;y<=255;y++)put(P(x,y,z+3),y%2?'light_gray_concrete':'redstone_torch');solid(P(x,0,z+3));put(P(x,256,z+3),'redstone_torch');rep(P(x,256,z+4),'south');wire(P(x,256,z+5));rep(P(x+1,256,z+5),'east');for(const[a,b]of[[P(x,256,z+3),P(x,256,z+4)],[P(x,256,z+4),P(x,256,z+5)],[P(x,256,z+5),P(x+1,256,z+5)],[P(x+1,256,z+5),P(x+2,256,z+5)]])edge(a,b);
   const c={slot,bit,x,z:z+3,bottom:1,top:255,output:P(x,256,z+3),collector:P(x+2,256,z+5)};orColumns.push(c);
  }
 }
 // One physical input fanout per boolean; fields with a held owner are external
 // core ports. bit_last / round_last await actual local counter terminal routes.
 for(const[j,name]of INPUTS.entries()){
  const used=inputUses.filter(c=>c.name===name),x=24+6*j,maxZ=Math.max(...used.map(c=>c.z));
  route('literal_input_'+name,[[x-2,-3,13],[x-2,-3,maxZ]],{branchPoints:used.map(c=>P(x-2,-3,c.z))});part='literal_input_'+name;
  for(const c of used){rep(P(x-1,-3,c.z),'east');edge(P(x-2,-3,c.z),P(x-1,-3,c.z));edge(P(x-1,-3,c.z),P(x,-3,c.z));}
  ports[name]={direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:P(x-2,-3,13),travel:P(0,0,1)}],meaning:name.endsWith('_last')?'Actual held 3-bit counter all-ones terminal; producer route pending.':'Stable core-owned input, not generated here.'};
 }
 for(let macro=0;macro<32;macro++){
  const ts=terms.filter(t=>t.macro===macro);if(!ts.length)continue;const y=1+8*macro,maxZ=20+12*Math.max(...ts.map(t=>t.slot));part='macro_conditional_'+macro;
  rep(P(15,y,7),'south');edge(P(15,y,6),P(15,y,7));edge(P(15,y,7),P(15,y,8));
  route(part,[[15,y,8],[15,y,maxZ]],{branchPoints:ts.map(t=>P(15,y,20+12*t.slot))});
  for(const t of ts){const z=20+12*t.slot;part='product_'+macro+'_'+t.name;rep(P(16,y,z),'east');wire(P(17,y,z));edge(P(15,y,z),P(16,y,z));edge(P(16,y,z),P(17,y,z));
   const first=Math.min(...Object.keys(t.literals).map(n=>INPUTS.indexOf(n))),last=Math.max(...Object.keys(t.literals).map(n=>INPUTS.indexOf(n))),gates=[];
   // Empty-literal rows need no product gates, only the selected state source.
   const end=Object.keys(t.literals).length?24+6*last+5:17;
   if(end>17){for(let x=18;x<24;x++){if(x===21)rep(P(x,y,z),'east');else wire(P(x,y,z));edge(P(x-1,y,z),P(x,y,z));}
    for(let j=0;j<=last;j++){const name=INPUTS[j],x=24+6*j,wanted=t.literals[name];
     if(wanted!==undefined){rep(P(x,y,z),'east');dev(P(x+1,y,z),'comparator',{facing:'west',mode:'subtract'});wire(P(x+2,y,z));rep(P(x+3,y,z),'east');wire(P(x+4,y,z));wire(P(x+5,y,z));
      if(wanted){put(P(x,y,z-4),'redstone_wall_torch',{facing:'south'});wire(P(x,y,z-3));}else{wire(P(x,y,z-4));rep(P(x,y,z-3),'south');}
      wire(P(x,y,z-2));wire(P(x+1,y,z-2));rep(P(x+1,y,z-1),'south');for(const[a,b]of[[P(x,y,z-5),P(x,y,z-4)],[P(x,y,z-4),P(x,y,z-3)],[P(x,y,z-3),P(x,y,z-2)],[P(x,y,z-2),P(x+1,y,z-2)],[P(x+1,y,z-2),P(x+1,y,z-1)],[P(x+1,y,z-1),P(x+1,y,z)]])edge(a,b);
      gates.push({name,wanted,comparator:P(x+1,y,z),mask:P(x+1,y,z-1),column:P(x,y,z-5)});
     }else for(let q=0;q<6;q++){if(q===0)rep(P(x+q,y,z),'east');else wire(P(x+q,y,z));}
     for(let q=0;q<6;q++)edge(P(x+q-1,y,z),P(x+q,y,z));
    }
   }
   const maxX=90+4*Math.max(...t.outputs),taps=t.outputs.map(i=>P(90+4*i,y,z));route(part+'_result',[[end,y,z],[maxX,y,z]],{branchPoints:taps});part='product_'+macro+'_'+t.name;
   for(const bit of t.outputs){const x=90+4*bit;wire(P(x,y,z+1));rep(P(x,y,z+2),'south');edge(P(x,y,z),P(x,y,z+1));edge(P(x,y,z+1),P(x,y,z+2));edge(P(x,y,z+2),P(x,y,z+3));}
   products.push({...t,y,z,source:P(15,y,6),gates});
  }
 }
 for(const[bit,name]of OUTPUTS.slice(0,5).entries()){
  const cs=orColumns.filter(c=>c.bit===bit),x=92+4*bit,lo=Math.min(...cs.map(c=>c.collector.z)),hi=Math.max(...cs.map(c=>c.collector.z));
  route('collect_'+name,[[x,256,lo],[x,256,hi+3]],{branchPoints:cs.map(c=>c.collector)});part='collect_'+name;rep(P(x,256,hi+4),'south');wire(P(x,256,hi+5));edge(P(x,256,hi+3),P(x,256,hi+4));edge(P(x,256,hi+4),P(x,256,hi+5));
  ports[name]={direction:'output',width:1,polarity:'active_high',bits:[{bit:0,position:P(x,256,hi+5),source:P(x,256,hi+4),travel:P(0,0,1)}],meaning:'Physical stable conditional result, sampled only during ADVANCE. No implicit storage/return route.'};
 }

 // Fixed state classes reuse the existing command row buses. These replace
 // repeated per-branch zero/increment and reset/fault products.
 const classRows={bit_increment:[9,10,12,16,19],bit_clear:[0,3,4,5,6,7,8,11,15,18,28,29,30,31],round_increment:[13,20],round_clear:[0,3,4,5,6,7,8,28,29,30,31],reset_eligible:Array.from({length:29},(_,i)=>i+3),fault_eligible:Array.from({length:22},(_,i)=>i+5)},classes=[];
 for(const[j,[name,states]]of Object.entries(classRows).entries()){
  const x=172+4*j;part='class_'+name;for(let y=1;y<=251;y++)put(P(x,y,4),y%2?'light_gray_concrete':'redstone_torch');solid(P(x,0,4));put(P(x,252,4),'redstone_torch');rep(P(x,252,3),'north');wire(P(x,252,2));edge(P(x,252,4),P(x,252,3));edge(P(x,252,3),P(x,252,2));
  const c={name,x,states,source:P(x,252,2)};classes.push(c);
 }
 const oldWord=makeAluControlWord();
 for(let state=0;state<32;state++){
  const cs=classes.filter(c=>c.states.includes(state));if(!cs.length)continue;const y=1+8*state,prior=oldWord.routes.find(r=>r.name==='macro_word_'+state),start=prior?.path.at(-1)??P(15,y,6),last=Math.max(...cs.map(c=>c.x));
  route('macro_classes_'+state,[[start.x,y,6],[last,y,6]],{branchPoints:cs.map(c=>P(c.x,y,6))});part='macro_classes_'+state;
  for(const c of cs){rep(P(c.x,y,5),'north');edge(P(c.x,y,6),P(c.x,y,5));edge(P(c.x,y,5),P(c.x,y,4));}
 }
 const gateZ=bit=>182-8*bit;
 for(let j=0;j<classes.length;j++){
  const c=classes[j],x=c.x,z=j<4?gateZ(j+5):j===4?102:94;part='class_arrival_'+c.name;rep(P(x+1,252,2),'east');edge(P(x,252,2),P(x+1,252,2));edge(P(x+1,252,2),P(x+2,252,2));
  route(part,[[x+2,252,2],[x+6,256,2],[x+6,256,z],[208,256,z]]);c.arrival=P(208,256,z);
 }
 for(let bit=0;bit<5;bit++){
  const p=ports[OUTPUTS[bit]].bits[0].position;route('normal_next_arrival_'+bit,[[p.x,p.y,p.z],[p.x,p.y,gateZ(bit)],[208,256,gateZ(bit)]]);
 }
 // Each R/F class is qualified by the actual external raw input through one
 // normalized subtract gate. R overrides F at every final output.
 for(const [name,j,z,invertZ,sign]of[['reset_request',0,102,106,-1],['any_fault',1,94,90,1]]){
  const x=24+6*j;part='override_raw_'+name;put(P(x,258,15),'redstone_wire');edge(P(x,257,15),P(x,258,15));
  if(name==='reset_request'){rep(P(x,258,16),'south');edge(P(x,258,15),P(x,258,16));edge(P(x,258,16),P(x,258,17));route(part,[[x,258,17],[x,258,110],[210,258,110],[210,256,108]]);rep(P(210,256,107),'north');edge(P(210,256,108),P(210,256,107));edge(P(210,256,107),P(210,256,106));}
  else{rep(P(x,258,14),'north');edge(P(x,258,15),P(x,258,14));edge(P(x,258,14),P(x,258,13));route(part,[[x,258,13],[210,258,13],[210,258,86],[210,256,88]]);rep(P(210,256,89),'south');edge(P(210,256,88),P(210,256,89));edge(P(210,256,89),P(210,256,90));}
  solid(P(210,256,invertZ));put(P(210,256,invertZ+sign),'redstone_wall_torch',{facing:sign===1?'south':'north'});wire(P(210,256,invertZ+2*sign));rep(P(210,256,invertZ+3*sign),sign===1?'south':'north');
  for(let k=0;k<4;k++)edge(P(210,256,invertZ+k*sign),P(210,256,invertZ+(k+1)*sign));
  rep(P(209,256,z),'east');dev(P(210,256,z),'comparator',{facing:'west',mode:'subtract'});wire(P(211,256,z));rep(P(212,256,z),'east');wire(P(213,256,z));for(let xx=208;xx<213;xx++)edge(P(xx,256,z),P(xx+1,256,z));
 }
 route('fault_override_trunk',[[213,256,94],[217,260,94],[226,260,94],[226,260,176]],{branchPoints:OUTPUTS.map((_,i)=>P(226,260,gateZ(i)-6))});
 route('reset_override_trunk',[[213,256,102],[221,264,102],[238,264,102],[238,264,192]],{branchPoints:OUTPUTS.map((_,i)=>P(238,264,gateZ(i)+10))});
 const outputGates=[];
 for(const[bit,name]of OUTPUTS.entries()){
  const z=gateZ(bit);part='final_'+name;
  rep(P(209,256,z),'east');dev(P(210,256,z),'comparator',{facing:'west',mode:'subtract'});wire(P(211,256,z));rep(P(212,256,z),'east');for(let x=213;x<=215;x++)wire(P(x,256,z));rep(P(216,256,z),'east');wire(P(217,256,z));dev(P(218,256,z),'comparator',{facing:'west',mode:'subtract'});wire(P(219,256,z));rep(P(220,256,z),'east');wire(P(221,256,z));wire(P(222,256,z));rep(P(223,256,z),'east');wire(P(224,256,z));for(let x=208;x<224;x++)edge(P(x,256,z),P(x+1,256,z));
  route(part+'_fault_mask',[[226,260,z-6],[210,260,z-6],[210,256,z-2]],{branchPoints:[P(214,260,z-6)]});part='final_'+name;rep(P(210,256,z-1),'south');edge(P(210,256,z-2),P(210,256,z-1));edge(P(210,256,z-1),P(210,256,z));
  route(part+'_reset_mask',[[238,264,z+10],[218,264,z+10],[218,256,z+2]],{branchPoints:[P(222,264,z+10)]});part='final_'+name;rep(P(218,256,z+1),'north');edge(P(218,256,z+2),P(218,256,z+1));edge(P(218,256,z+1),P(218,256,z));
  if([0,1,3,4].includes(bit)){route(part+'_fault_27',[[214,260,z-6],[214,256,z-2]]);part='final_'+name;rep(P(214,256,z-1),'south');edge(P(214,256,z-2),P(214,256,z-1));edge(P(214,256,z-1),P(214,256,z));}
  if([6,8].includes(bit)){route(part+'_reset_clear',[[222,264,z+10],[222,256,z+2]]);part='final_'+name;rep(P(222,256,z+1),'north');edge(P(222,256,z+2),P(222,256,z+1));edge(P(222,256,z+1),P(222,256,z));}
  ports[name]={direction:'output',width:1,polarity:'active_high',bits:[{bit:0,position:P(224,256,z),source:P(223,256,z),travel:P(1,0,0)}]};outputGates.push({bit,name,normal:P(208,256,z),fault_mask:P(210,256,z-1),fault_set:[0,1,3,4].includes(bit)?P(214,256,z-1):null,reset_mask:P(218,256,z+1),reset_set:[6,8].includes(bit)?P(222,256,z+1):null,output:P(224,256,z)});
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_phase_loop_plus_actual_macro_conditional_producers',blocks,box,ports,parent_blocks:parent.blocks.length,products,columns,orColumns,classes,outputGates,routes,edges,metrics:{blocks:blocks.length,added_blocks:blocks.length-parent.blocks.length,conditional_products:products.length,literal_columns:columns.length,OR_columns:orColumns.length,conditional_outputs:9,retained_controller_bits:4,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_state_loop:false,missing:['Five retained macro bits/current-next bank and actual conditional output/current-state return routes.','Real paired bit/round counters and their terminal/inc/clear connections.','ADVANCE capture/commit qualification and initialize, core startup/decoder conditioning and four-lane fanout.']};
}
