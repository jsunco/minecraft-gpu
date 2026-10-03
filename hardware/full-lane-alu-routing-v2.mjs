// Versioned integration derivative. Frozen13,802-block baseline stays unchanged.
// Offline geometry only: no services, live computation, plans or site selection.
import assert from 'node:assert/strict';
import {makeFullLaneAluAdapters} from './full-lane-alu-adapters.mjs';
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
const F={east:'west',west:'east',north:'south',south:'north'};
export function makeFullLaneAluRoutingV2(){
 const base=makeFullLaneAluAdapters(),map=new Map(base.blocks.map(v=>[K(v.position),structuredClone(v)])),owner={...base.owner};
 const routes=[],adapters=[],taps=[],groups=[],interfacePorts=[];
 function put(p,id,properties,net){const k=K(p);assert(!map.has(k),`Collision ${k} ${net}/${owner[k]}`);map.set(k,{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})}});owner[k]=net;}
 function support(p,n){const q={...p,y:p.y-1},old=map.get(K(q));if(old){assert(old.block.id.endsWith('_concrete'),`Support ${K(q)} ${n}`);return;}put(q,'light_gray_concrete',null,n);}
 function component(p,id,props,n){support(p,n);put(p,id,props,n);}
 const rep=(p,travel,n)=>component(p,'repeater',{facing:F[travel],delay:'1'},n);
 function route(ws,n){const ps=[P(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],d=b.map((v,k)=>v-a[k]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let j=1;j<=steps;j++)ps.push(P(...a.map((v,k)=>v+Math.sign(d[k])*j)));}
  const candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1];if(a.y===b.y&&b.y===c.y&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z)candidates.push(i);}candidates.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(const b of candidates.slice(1))for(const a of candidates){if(a>=b)break;if(costs.has(a)&&b-a<=13&&(costs.get(b)??Infinity)>costs.get(a)+(b===ps.length?0:1)){costs.set(b,costs.get(a)+(b===ps.length?0:1));prev.set(b,a);}}
  assert(prev.has(ps.length),'Unrefreshable '+n);const chosen=[];for(let a=prev.get(ps.length);a!==-1;a=prev.get(a))chosen.push(a);
  for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(chosen.includes(i))rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north',n);else component(p,'redstone_wire',null,n);}
  routes.push({net:n,positions:ps,refresh_indices:chosen.sort((a,b)=>a-b)});return ps;
 }
 function receiveBelow(p,n,fromEast=false){assert.equal(map.get(K(p))?.block.id,'minecraft:redstone_wire');assert(map.get(K({...p,y:p.y-1}))?.block.id.endsWith('_concrete'));
  put({...p,y:p.y-2},'redstone_torch',null,n);put({...p,y:p.y-3},'light_gray_concrete',null,n);put({...p,y:p.y-4},'redstone_torch',null,n);put({...p,y:p.y-5},'light_gray_concrete',null,n);
  const dx=fromEast?1:-1;rep(P(p.x+dx,p.y-5,p.z),fromEast?'west':'east',n);const input=P(p.x+2*dx,p.y-5,p.z);
  adapters.push({net:n,input,receiver:P(p.x+dx,p.y-5,p.z),output:p,positive_inversions:2});return input;
 }
 function currentTap(offset,b,n){const x=offset+3,buffered=[0,48].includes(offset)&&b===0,z=buffered?-2:12*b,sgn=b===0?-1:1,q=P(x,1,z),supportBlock=P(x,0,z);
  assert.equal(map.get(K(q))?.block.id,'minecraft:redstone_wire');assert(map.get(K(supportBlock))?.block.id.endsWith('_concrete'));
  rep(P(x,0,z+sgn),sgn===1?'south':'north',n);const cap=P(x,1,z+sgn);if(map.has(K(cap)))assert(map.get(K(cap)).block.id.endsWith('_concrete'));else put(cap,'light_gray_concrete',null,n);
  // A second diode crosses the adjacent HOLD support without reading it as wire.
  rep(P(x,0,z+2*sgn),sgn===1?'south':'north',n);const out=P(x,0,z+3*sgn);
  taps.push({net:n,source:q,source_support:supportBlock,first_receiver:P(x,0,z+sgn),cap,second_receiver:P(x,0,z+2*sgn),output:out,existing_Q0_buffer:buffered});return out;
 }
 const before=map.size,links=[];
 const self=base.selectors.find(v=>v.select==='w_parallel_select_self');
 for(let b=0;b<8;b++){
  const n='W_current_'+b+'_to_W_self',src=currentTap(0,b,n),dst=receiveBelow(self.bits[b].input,n),z=src.z+(b?5:0);
  route([[src.x,src.y,src.z],...(b?[[src.x,src.y,z]]:[]),[-5,-8,z],[-8,-8,z],[-16,-16,z],[-19,-16,z],[-23,-20,z],[-51,-20,z],[-51,-20,dst.z],[dst.x,dst.y,dst.z]],n);
  links.push({bit:b,source:{instance:'W',port:`current[${b}]`,position:P(2,1,12*b)},source_tap:src,destination:{instance:'W_select',port:`self[${b}]`,position:self.bits[b].input},receiving_wire:dst,net:n});
 }
 groups.push({id:'W_current_to_W_self',status:'all_eight_real_producers_physically_connected_offline_unverified',width:8,links,added_blocks:map.size-before});
 const trial=base.selectors.find(v=>v.select==='w_parallel_select_trial'),trialBefore=map.size,trialLinks=[];
 for(let b=1;b<8;b++){
  const n='W_current_'+(b-1)+'_to_W_trial_'+b,source=adapters.find(a=>a.net===`W_current_${b-1}_to_W_self`).input,dst=receiveBelow(trial.bits[b].input,n);
  rep(P(source.x,source.y,source.z+1),'south',n);
  route([[source.x,source.y,source.z+2],[source.x,source.y,source.z+8],[dst.x,dst.y,source.z+8],[dst.x,dst.y,dst.z]],n);
  trialLinks.push({bit:b,source:{instance:'W',port:`current[${b-1}]`,position:P(2,1,12*(b-1))},buffered_source:source,destination:{instance:'W_select',port:`trial[${b}]`,position:trial.bits[b].input},receiving_wire:dst,net:n});
 }
 groups.push({id:'W_shift_left_to_trial_high7',status:'seven_real_producers_connected_trial_bit0_Q7_pending',width:7,links:trialLinks,added_blocks:map.size-trialBefore});
 const qsel=base.selectors.find(v=>v.select==='w_parallel_select_q'),qBefore=map.size,qLinks=[];
 for(let b=0;b<8;b++){
  const n='Q_current_'+b+'_to_W_q',src=currentTap(96,b,n),dst=receiveBelow(qsel.bits[b].input,n),z=src.z+(b?5:0);
  route([[src.x,src.y,src.z],...(b?[[src.x,src.y,z]]:[]),[91,-8,z],[88,-8,z],[80,-16,z],[77,-16,z],[69,-24,z],[66,-24,z],[62,-28,z],[-50,-28,z],[-50,-28,dst.z],[-42,-20,dst.z],[-39,-20,dst.z],[dst.x,dst.y,dst.z]],n);
  qLinks.push({bit:b,source:{instance:'Q',port:`current[${b}]`,position:P(98,1,12*b)},source_tap:src,destination:{instance:'W_select',port:`q[${b}]`,position:qsel.bits[b].input},receiving_wire:dst,net:n});
 }
 groups.push({id:'Q_current_to_W_q',status:'all_eight_real_producers_physically_connected_offline_unverified',width:8,links:qLinks,added_blocks:map.size-qBefore});
 const q7Before=map.size,q7=adapters.find(a=>a.net==='Q_current_7_to_W_q').input,trial0=receiveBelow(trial.bits[0].input,'Q7_to_W_trial0');
 rep(P(q7.x,q7.y,q7.z+1),'south','Q7_to_W_trial0');
 route([[q7.x,q7.y,q7.z+2],[q7.x,q7.y,q7.z+5],[-28,-25,q7.z+5],[-25,-25,q7.z+5],[-17,-33,q7.z+5],[-14,-33,q7.z+5],[-10,-37,q7.z+5],[-10,-37,-12],[-86,-37,-12],[-86,-37,trial0.z],[-78,-29,trial0.z],[-75,-29,trial0.z],[-67,-21,trial0.z],[-64,-21,trial0.z],[trial0.x,trial0.y,trial0.z]],'Q7_to_W_trial0');
 groups.push({id:'Q_msb_to_W_trial0',status:'real_Q7_connects_complete_trial_byte',width:1,links:[{bit:0,source:{instance:'Q',port:'current[7]',position:P(98,1,84)},buffered_source:q7,destination:{instance:'W_select',port:'trial[0]',position:trial.bits[0].input},receiving_wire:trial0,net:'Q7_to_W_trial0'}],added_blocks:map.size-q7Before});
 const aBefore=map.size,aSel=base.selectors.find(v=>v.select==='w_parallel_select_a'),aLinks=[];
 for(let b=0;b<8;b++){
  const n='operand_a_'+b+'_to_W_a',dst=receiveBelow(aSel.bits[b].input,n),p=P(-110,-17,dst.z);
  component(p,'redstone_wire',null,n);rep(P(-109,-17,dst.z),'east',n);route([[-108,-17,dst.z],[dst.x,dst.y,dst.z]],n);
  interfacePorts.push({name:'operand_a',bit:b,direction:'input',position:p,receiver:P(-109,-17,dst.z),polarity:'active_high',required_high_power:15,external_source:{instance:'register_file',port:`operand_a[${b}]`},external_route:'root register-to-ALU integration still required'});
  aLinks.push({bit:b,source:{instance:'$self',port:`operand_a[${b}]`,position:p},destination:{instance:'W_select',port:`a[${b}]`,position:aSel.bits[b].input},receiving_wire:dst,net:n});
 }
 groups.push({id:'operand_A_receivers_to_W_A',status:'eight_external_receivers_connected_external_register_link_separate',width:8,links:aLinks,added_blocks:map.size-aBefore});
 const controlsBefore=map.size,controlLinks=[];
 for(const s of base.selectors){const n=s.select,src=P(s.input.x,-8,-6);component(src,'redstone_wire',null,n);rep(P(src.x,src.y,-5),'south',n);route([[src.x,src.y,-4],[src.x,src.y,2]],n);
  interfacePorts.push({name:n,width:1,direction:'input',position:src,receiver:P(src.x,src.y,-5),polarity:'active_high',required_high_power:15,external_source:{instance:'core_microsequence',port:n},external_route:'shared core to lane qualification/fanout separate'});
  controlLinks.push({source:{instance:'$control',port:n,position:src},destination:{instance:'W_select',port:n,position:s.input},net:n});}
 groups.push({id:'W_one_hot_receivers_to_local_masks',status:'six_control_receivers_connected_external_core_link_separate',width:6,links:controlLinks,added_blocks:map.size-controlsBefore});
 const cmpBefore=map.size,cmpSignals={};
 function auxTap(x,z,n){const q=P(x,1,z),s=P(x,0,z);assert.equal(map.get(K(q))?.block.id,'minecraft:redstone_wire');assert(map.get(K(s))?.block.id.endsWith('_concrete'));
  rep(P(x,0,z-1),'north',n);const cap=P(x,1,z-1);if(map.has(K(cap)))assert(map.get(K(cap)).block.id.endsWith('_concrete'));else put(cap,'light_gray_concrete',null,n);
  rep(P(x,0,z-2),'north',n);const out=P(x,0,z-3);taps.push({net:n,source:q,source_support:s,first_receiver:P(x,0,z-1),cap,second_receiver:P(x,0,z-2),output:out});return out;}
 const cSource=auxTap(19,-2,'C_to_CMP'),nzSource=auxTap(67,0,'NZ_to_CMP');
 route([[19,0,-5],[11,-8,-5],[8,-8,-5],[0,-16,-5],[-3,-16,-5],[-4,-17,-5],[-4,-17,-10],[-16,-17,-10],[-16,-17,-24],[-12,-17,-24]],'C_to_CMP');
 route([[67,0,-3],[67,0,-12],[59,-8,-12],[56,-8,-12],[48,-16,-12],[45,-16,-12],[44,-17,-12],[44,-17,-30],[-3,-17,-30]],'NZ_to_CMP');
 rep(P(-11,-17,-24),'east','C_to_CMP');put(P(-10,-17,-24),'light_gray_concrete',null,'C_to_CMP');put(P(-9,-17,-24),'redstone_wall_torch',{facing:'east'},'CMP_N');component(P(-8,-17,-24),'redstone_wire',null,'CMP_N');cmpSignals.N=P(-8,-17,-24);
 rep(P(-12,-17,-23),'south','C_to_CMP');route([[-12,-17,-22],[-6,-17,-22]],'C_to_CMP');rep(P(-5,-17,-22),'east','C_to_CMP');component(P(-4,-17,-22),'redstone_wire',null,'C_to_CMP');
 rep(P(-3,-17,-29),'south','NZ_to_CMP');put(P(-3,-17,-28),'light_gray_concrete',null,'NZ_to_CMP');put(P(-3,-17,-27),'redstone_wall_torch',{facing:'south'},'CMP_Z');component(P(-3,-17,-26),'redstone_wire',null,'CMP_Z');cmpSignals.Z=P(-3,-17,-26);
 rep(P(-3,-17,-25),'south','CMP_Z');component(P(-3,-17,-24),'redstone_wire',null,'CMP_Z');rep(P(-3,-17,-23),'south','CMP_Z');
 component(P(-3,-17,-22),'comparator',{facing:'west',mode:'subtract'},'CMP_P');rep(P(-2,-17,-22),'east','CMP_P');component(P(-1,-17,-22),'redstone_wire',null,'CMP_P');cmpSignals.P=P(-1,-17,-22);
 const cmpSel=base.selectors.find(v=>v.select==='w_parallel_select_cmp'),cmpLinks=[];
 for(const [name,b]of [['N',2],['Z',1],['P',0]]){
  const n='CMP_'+name+'_to_W_cmp'+b,src=cmpSignals[name],dst=receiveBelow(cmpSel.bits[b].input,n,true);
  const x=src.x,y=src.y,z=src.z,direction=name==='Z'?-1:1;
  rep(P(x+direction,y,z),direction>0?'east':'west',n);
  const laneX={N:0,Z:8,P:16}[name],tier={N:-25,Z:-31,P:-35}[name];
  const points=[[x+2*direction,y,z]];let cx=x+2*direction,cy=y,left=y-tier;
  while(left){const step=Math.min(8,left);cx+=direction*step;cy-=step;points.push([cx,cy,z]);left-=step;if(left){cx+=3*direction;points.push([cx,cy,z]);}}
  points.push([cx,tier,z-4],[laneX,tier,z-4],[laneX,tier,dst.z]);
  // End climb approaches the receiver from its east side; rows are12 apart.
  let climb=tier,climbX=laneX;while(climb<dst.y){const step=Math.min(8,dst.y-climb);climbX-=step;climb+=step;points.push([climbX,climb,dst.z]);if(climb<dst.y){climbX-=3;points.push([climbX,climb,dst.z]);}}
  points.push([dst.x,dst.y,dst.z]);
  route(points,n);cmpLinks.push({bit:b,source:{instance:'cmp',port:name,position:src},destination:{instance:'W_select',port:`cmp[${b}]`,position:cmpSel.bits[b].input},receiving_wire:dst,net:n});
 }
 groups.push({id:'retained_C_NZ_to_CMP_flags',status:'actual_retained_C_NZ_produce_unsigned_NZP_to_W_choice',width:3,links:cmpLinks,inputs:{C:cSource,NZ:nzSource},equations:{N:'!C',Z:'!NZ',P:'C & NZ'},added_blocks:map.size-cmpBefore});
 const zeroPorts=[...base.selectors.find(v=>v.select==='w_parallel_select_zero').bits.map(b=>({bank:'W',choice:'zero',bit:b.bit,position:b.input})),...cmpSel.bits.filter(b=>b.bit>=3).map(b=>({bank:'W',choice:'cmp',bit:b.bit,position:b.input}))];
 // Next connection group: M and Q selector macro outputs route to the existing
 // positive source columns. Data/control pins are exported for actual producers.
 const newSelectors=[];
 for(const [bank,x0,y0,choices,offset]of [['M',140,-12,['zero','a','b','left','self'],48],['Q',224,-12,['zero','a','b','self','left_take'],96]]){
  const beforeBank=map.size,bankSelectors=[],links=[];
  for(let c=0;c<choices.length;c++){
   const x=x0+12*c,choice=choices[c],select=bank.toLowerCase()+'_parallel_select_'+choice,n=bank+'_select_mask_'+choice;
   component(P(x,y0+4,3),'redstone_wire',null,n);rep(P(x,y0+4,4),'south',n);put(P(x,y0+4,5),'light_gray_concrete',null,n);put(P(x,y0+4,6),'redstone_wall_torch',{facing:'south'},n);
   for(let z=7;z<=97;z++)if(z>=19&&(z-19)%12===0)rep(P(x,y0+4,z),'south',n);else component(P(x,y0+4,z),'redstone_wire',null,n);
   const bits=[];for(let b=0;b<8;b++){
    const z=14+12*b,cx=x+8,dn=bank+'_choice_'+choice+'_'+b;
    rep(P(x+1,y0+4,z-1),'east',n);route([[x+2,y0+4,z-1],[x+6,y0,z-1]],n);rep(P(x+7,y0,z-1),'east',n);
    component(P(cx,y0,z-4),'redstone_wire',null,dn);rep(P(cx,y0,z-3),'south',dn);component(P(cx,y0,z-2),'redstone_wire',null,dn);component(P(cx,y0,z-1),'comparator',{facing:'north',mode:'subtract'},dn);rep(P(cx,y0,z),'south',dn);
    bits.push({bit:b,input:P(cx,y0,z-4),comparator:P(cx,y0,z-1),mask_receiver:P(x+7,y0,z-1),isolated_output:P(cx,y0,z)});
   }
   bankSelectors.push({bank,choice,select,input:P(x,y0+4,3),bits});
   if(choice==='zero')zeroPorts.push(...bits.map(b=>({bank,choice,bit:b.bit,position:b.input})));
  }
  for(let b=0;b<8;b++){
   const z=14+12*b,n=bank+'_parallel_OR_'+b;
   for(let x=x0+56;x>=x0+4;x--){if(x===x0+5||(x<x0+56&&(x0+56-x)%12===6))rep(P(x,y0,z+1),'west',n);else component(P(x,y0,z+1),'redstone_wire',null,n);}
   // Separate per-bank lower tier then a west-side final approach to the
   // retained east-directed input receiver. Payload rows remain12blocks apart.
   const tier=bank==='M'?-44:-60,src=P(x0+4,y0,z+2),dst=P(offset+2,-4,z),points=[[src.x,src.y,src.z],[src.x,src.y,z+4]];
   let cx=src.x,cy=src.y,left=y0-tier;while(left){const s=Math.min(8,left);cx-=s;cy-=s;points.push([cx,cy,z+4]);left-=s;if(left){cx-=3;points.push([cx,cy,z+4]);}}
   const rise=-4-tier,landings=3*Math.floor((rise-1)/8),startX=dst.x-rise-landings;
   points.push([startX,tier,z+4],[startX,tier,z]);cx=startX;cy=tier;
   while(cy<dst.y){const s=Math.min(8,dst.y-cy);cx+=s;cy+=s;points.push([cx,cy,z]);if(cy<dst.y){cx+=3;points.push([cx,cy,z]);}}
   // Existing adapter input wire at dst must not be placed a second time.
   const last=points.at(-1);last[0]-=1;last[1]-=1;route(points,n);
   links.push({bit:b,source:{instance:bank+'_select',port:`out[${b}]`,position:P(x0+4,y0,z+1)},destination:{instance:bank,port:`parallel_data[${b}]`,position:P(offset+4,1,z)},receiving_wire:dst,route_end:P(...last),net:n});
  }
  newSelectors.push(...bankSelectors);groups.push({id:bank+'_selector_outputs_to_next_parallel',status:'five_choices_output_connected_data_control_sources_pending',width:8,links,added_blocks:map.size-beforeBank});
 }
 for(const [bank,offset]of [['M',48],['Q',96]]){
  const before=map.size,sel=newSelectors.find(s=>s.bank===bank&&s.choice==='self'),links=[];
  for(let b=0;b<8;b++){
   const n=bank+'_current_'+b+'_to_'+bank+'_self';let src;
   if(bank==='M')src=currentTap(offset,b,n);else{
    const t=taps.find(t=>t.net===`Q_current_${b}_to_W_q`),p=t.output;
    // Existing buffered Q route wire remains the source; east repeater isolates fanout.
    src=P(p.x+2,p.y,p.z);rep(P(p.x+1,p.y,p.z),'east',n);
   }
   const dst=receiveBelow(sel.bits[b].input,n),z=src.z+(b?(bank==='M'?1:5):0),points=[[src.x,src.y,src.z]];
   if(z!==src.z)points.push([src.x,src.y,z]);
   let x=src.x,y=src.y,down=bank==='M'?21:17;while(down){const step=Math.min(8,down);x+=step;y-=step;points.push([x,y,z]);down-=step;if(down){x+=3;points.push([x,y,z]);}}
   if(bank==='M')points.push([dst.x-7,-21,z],[dst.x-7,-21,dst.z],[dst.x-3,dst.y,dst.z],[dst.x,dst.y,dst.z]);else points.push([dst.x-3,dst.y,z],[dst.x-3,dst.y,dst.z],[dst.x,dst.y,dst.z]);route(points,n);
   links.push({bit:b,source:{instance:bank,port:`current[${b}]`,position:P(offset+2,1,12*b)},source_tap:src,destination:{instance:bank+'_select',port:`self[${b}]`,position:sel.bits[b].input},receiving_wire:dst,net:n});
  }
  groups.push({id:bank+'_current_to_'+bank+'_self',status:'all_eight_real_producers_physically_connected_offline_unverified',width:8,links,added_blocks:map.size-before});
 }
 for(const [bank,choice]of [['M','left'],['Q','left_take']]){
  const before=map.size,sel=newSelectors.find(s=>s.bank===bank&&s.choice===choice),links=[];
  for(let b=1;b<8;b++){
   const n=bank+'_current_'+(b-1)+'_to_'+choice+'_'+b,src=adapters.find(a=>a.net===`${bank}_current_${b-1}_to_${bank}_self`).input,dst=receiveBelow(sel.bits[b].input,n);
   rep(P(src.x,src.y,src.z+1),'south',n);
   if(bank==='M')route([[src.x,src.y,src.z+2],[src.x+8,-25,src.z+2],[src.x+8,-25,src.z+6],[dst.x-8,-25,src.z+6],[dst.x-8,-25,dst.z],[dst.x,dst.y,dst.z]],n);
   else route([[src.x,src.y,src.z+2],[src.x,src.y,src.z+8],[dst.x,dst.y,src.z+8],[dst.x,dst.y,dst.z]],n);
   links.push({bit:b,source:{instance:bank,port:`current[${b-1}]`,position:P((bank==='M'?48:96)+2,1,12*(b-1))},buffered_source:src,destination:{instance:bank+'_select',port:`${choice}[${b}]`,position:sel.bits[b].input},receiving_wire:dst,net:n});
  }
  if(bank==='M')zeroPorts.push({bank,choice,bit:0,position:sel.bits[0].input});
  groups.push({id:bank+'_current_shift_left',status:bank==='M'?'all_byte_inputs_connected_including_isolated_zero_lsb':'seven_upper_bits_connected_take_lsb_pending',width:bank==='M'?8:7,links,added_blocks:map.size-before});
 }
 const columns=[];
 function receiveColumn(p,bottom,n){const top=p.y-1;assert.equal((top-bottom)%4,0);assert(bottom<top);assert(map.get(K({...p,y:top})).block.id.endsWith('_concrete'));
  for(let y=bottom;y<top;y++)put(P(p.x,y,p.z),y%2===bottom%2?'light_gray_concrete':'redstone_torch',null,n);
  const receiver=P(p.x-1,bottom,p.z),input=P(p.x-2,bottom,p.z);rep(receiver,'east',n);columns.push({net:n,input,receiver,output:p,bottom:P(p.x,bottom,p.z),inversions:(top-bottom)/2});return input;
 }
 for(const choice of ['a','b']){
  const before=map.size,links=[],bottom=choice==='a'?-69:-77;
  for(let b=0;b<8;b++){
   const z=10+12*b,n='operand_'+choice+'_'+b+'_distribution',targets=['M','Q'].map(bank=>({bank,sel:newSelectors.find(s=>s.bank===bank&&s.choice===choice)}));
   const dests=targets.map(({bank,sel})=>({bank,p:sel.bits[b].input,wire:receiveColumn(sel.bits[b].input,bottom,n)}));
   if(choice==='a'){
    const q=P(-108,-17,z),supp=P(-108,-18,z);assert.equal(map.get(K(q)).block.id,'minecraft:redstone_wire');assert(map.get(K(supp)).block.id.endsWith('_concrete'));
    rep(P(-108,-18,z+1),'south',n);put(P(-108,-17,z+1),'light_gray_concrete',null,n);rep(P(-108,-18,z+2),'south',n);
    const points=[[-108,-18,z+3]];let x=-108,y=-18;while(y>bottom){const s=Math.min(8,y-bottom);x-=s;y-=s;points.push([x,y,z+3]);if(y>bottom){x-=3;points.push([x,y,z+3]);}}
    points.push([x,bottom,z-4],[dests[1].wire.x,bottom,z-4]);route(points,n);
   }else{
    const src=P(300,bottom,z-4);component(src,'redstone_wire',null,n);rep(P(299,bottom,z-4),'west',n);route([[298,bottom,z-4],[dests[0].wire.x,bottom,z-4]],n);
    interfacePorts.push({name:'operand_b',bit:b,direction:'input',position:src,receiver:P(299,bottom,z-4),polarity:'active_high',required_high_power:15,external_source:{instance:'register_file',port:`operand_b[${b}]`},external_route:'root register-to-ALU integration still required'});
   }
   for(const dst of dests){rep(P(dst.wire.x,bottom,z-3),'south',n);route([[dst.wire.x,bottom,z-2],[dst.wire.x,bottom,z]],n);links.push({bit:b,source:{instance:'$self',port:`operand_${choice}[${b}]`,position:interfacePorts.find(p=>p.name==='operand_'+choice&&p.bit===b).position},destination:{instance:dst.bank+'_select',port:`${choice}[${b}]`,position:dst.p},receiving_wire:dst.wire,net:n});}
  }
  groups.push({id:'operand_'+choice.toUpperCase()+'_to_M_Q',status:'all_sixteen_selector_inputs_connected_to_same_eight_bit_external_operand',width:8,links,added_blocks:map.size-before});
 }
 const moreControlBefore=map.size,moreControlLinks=[];
 for(const s of newSelectors){const n=s.select,src=P(s.input.x,s.input.y,-6);component(src,'redstone_wire',null,n);rep(P(src.x,src.y,-5),'south',n);route([[src.x,src.y,-4],[src.x,src.y,2]],n);interfacePorts.push({name:n,width:1,direction:'input',position:src,receiver:P(src.x,src.y,-5),polarity:'active_high',required_high_power:15,external_source:{instance:'core_microsequence',port:n},external_route:'shared core to lane qualification/fanout separate'});moreControlLinks.push({source:{instance:'$control',port:n,position:src},destination:{instance:s.bank+'_select',port:n,position:s.input},net:n});}
 groups.push({id:'M_Q_one_hot_receivers_to_local_masks',status:'ten_control_receivers_connected_external_core_link_separate',width:10,links:moreControlLinks,added_blocks:map.size-moreControlBefore});
 for(const [bank,offset]of [['w',0],['m',48],['q',96]])for(const [name,p]of [['open_current',P(offset-8,1,-6)],['open_next',P(offset+26,4,-6)],['load_parallel',P(offset+16,1,8)]]){
  const a=base.adapters.find(v=>K(v.output)===K(p));assert(a);interfacePorts.push({name:bank+'_'+name,width:1,direction:'input',position:a.input,receiver:a.receiver,polarity:'active_high',required_high_power:15,external_source:{instance:'core_microsequence',port:bank+'_'+name},external_route:'lane enable/fault/phase-qualified source required; adapter preserves bank wiring'});
 }
 const constantsBefore=map.size,one=P(70,-4,114);assert.equal(map.get(K(one)).block.id,'minecraft:redstone_wire');
 component(P(68,-4,114),'light_gray_concrete',null,'fixed_one_rotate_M');put(P(69,-4,114),'redstone_wall_torch',{facing:'east'},'fixed_one_rotate_M');
 const fixedConstants=[{name:'M_rotate_one',value:1,position:one,source:P(69,-4,114)},...[[22,-4,114],[118,-4,114],[114,-4,110],[66,-4,110]].map((p,i)=>({name:['W_rotate_zero','Q_rotate_zero','Q_serial_zero','M_unused_serial_zero'][i],value:0,position:P(...p)}))];
 groups.push({id:'fixed_shift_rotate_modes',status:'physical_one_and_isolated_zero_receivers_no_runtime_host_mode',width:5,links:[],constants:fixedConstants,added_blocks:map.size-constantsBefore});
 const blocks=[...map.values()],axes=['x','y','z'],box={from:{},to:{}},histogram={};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'rejected_density_partial_ALU_checkpoint_not_buildable',blocks,owner,box,metrics:{blocks:blocks.length,parent_blocks:base.metrics.blocks,added_blocks:blocks.length-base.metrics.blocks,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),histogram},connection_groups:groups,routes,taps,adapters,columns,interface_ports:interfacePorts,zero_ports:zeroPorts,fixed_constants:fixedConstants,new_selectors:newSelectors,parent:'artifacts/full-gpu-layout-v1/alu/layout-adapters.json',logical_state_bits:57,physical_state_bits:54,physical_control_bits:38,remaining:['External register A/B buses and core controls connect only at exact receiver ports; root intermodule wiring remains separate.','Q left_take bit0 remains unconnected. Replace ADD-only M0 bypass with local enable/XOR conditioning and FA carry feedback with carry seed0/seed1/adder selection.','NZ OR/clear, T8/take OR and qaux selection, local enable4-way selection, divisor-zero detection, busy/ready/fault3 retained bits, and reset/handshake/final-result qualification are missing.','Only25 of38 microcontrol receiver bits are exposed;13 remaining controls and external result/writeback/PC routes are missing.','Full whole-map electrical/transient/native checks.'],native_calls:0,build_plans_emitted:false};
}
