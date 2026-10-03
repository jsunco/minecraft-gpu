// Refolded whole-lane derivative; offline geometry, no site/plans/services.
// Frozen v1/v2 remain unchanged. No native correctness or complete ALU claim.
import assert from 'node:assert/strict';
import {makeSerialBankCoupon} from './serial-bank-coupon.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeFullLaneAluFoldedV3(){
 const map=new Map(),owner={},joins=[],routes=[],selectors=[],columns=[],groups=[],taps=[],ports=[],banks={},choices={W:['self','trial','q','a','cmp','zero'],Q:['self','left_take','a','b','zero'],M:['self','left','a','b','zero']};
 function put(p,id,properties,n){const k=K(p);assert(!map.has(k),`Collision ${k}: ${n}/${owner[k]}`);map.set(k,{position:p,block:{id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})}});owner[k]=n;}
 function support(p,n){const q={...p,y:p.y-1},old=map.get(K(q));if(old)assert(old.block.id.endsWith('_concrete'),`Non-solid support ${K(q)} ${n}`);else put(q,'light_gray_concrete',null,n);}
 const comp=(p,id,props,n)=>{support(p,n);put(p,id,props,n);},wire=(p,n)=>comp(p,'redstone_wire',null,n),rep=(p,d,n)=>comp(p,'repeater',{facing:F[d],delay:'1'},n);
 function route(ws,n){const ps=[P(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],d=b.map((v,k)=>v-a[k]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps),'route '+n);for(let j=1;j<=steps;j++)ps.push(P(...a.map((v,k)=>v+Math.sign(d[k])*j)));}
  const candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1];if(a.y===b.y&&b.y===c.y&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z)candidates.push(i);}candidates.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(const b of candidates.slice(1))for(const a of candidates){if(a>=b)break;if(costs.has(a)&&b-a<=13&&(costs.get(b)??Infinity)>costs.get(a)+(b===ps.length?0:1)){costs.set(b,costs.get(a)+(b===ps.length?0:1));prev.set(b,a);}}
  assert(prev.has(ps.length),'Unrefreshable '+n);const chosen=[];for(let a=prev.get(ps.length);a!==-1;a=prev.get(a))chosen.push(a);
  for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(chosen.includes(i))rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north',n);else if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal route overlap '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');joins.push({from:ps[i===0?1:i-1],to:p});}else wire(p,n);}routes.push({net:n,positions:ps,refresh_indices:chosen.sort((a,b)=>a-b)});return ps;
 }
 function group(id,before,links,status){groups.push({id,added_blocks:map.size-before,links,status});}
 for(const [bank,x]of [['W',0],['Q',40],['M',80]]){
  const before=map.size,d=makeSerialBankCoupon({bits:8,id:'folded_'+bank.toLowerCase()});banks[bank]={x,inputs:d.inputs.map(v=>({...v,position:{...v.position,x:v.position.x+x}})),current:Array.from({length:8},(_,b)=>P(x+2,1,12*b)),next:Array.from({length:8},(_,b)=>P(x+12,1,12*(b+1)))};
  for(const v of d.blocks)put({...v.position,x:v.position.x+x},v.block.id,v.block.properties,bank);
  group(bank+'_bank',before,[], 'complete_inherited_current_next_aux_geometry');
 }
 // Replace all manual source roles. P-bit selectors feed their existing support
 // directly; other source stubs retain the reviewed two-inversion adapter.
 for(const bank of ['W','Q','M']){
  const before=map.size,links=[];
  for(const input of banks[bank].inputs){const p=input.position,n=bank+'_input_'+input.name;assert.equal(map.get(K(p)).block.id,'minecraft:lever');map.set(K(p),{position:p,block:{id:'minecraft:redstone_wire'}});owner[K(p)]=n;
   if(input.name.startsWith('p'))continue;
   for(let y=p.y-5;y<p.y-1;y++)put(P(p.x,y,p.z),(y-(p.y-5))%2===0?'light_gray_concrete':'redstone_torch',null,n);
   rep(P(p.x-1,p.y-5,p.z),'east',n);wire(P(p.x-2,p.y-5,p.z),n);
   const name={open_current:'open_current',open_next:'open_next',load:'load_parallel'}[input.name];
   const port={bank,name:name?bank.toLowerCase()+'_'+name:bank+'_'+input.name,position:P(p.x-2,p.y-5,p.z),receiver:P(p.x-1,p.y-5,p.z),destination:p};ports.push(port);links.push(port);
  }group(bank+'_source_receivers',before,links,'control_and_aux_boundaries_only');
 }
 // One local positive OR column for each selected byte bit. At every eighth
 // level a diode injects a choice; the four inversions to the next level preserve
 // OR polarity. A chosen byte now rises directly into its own original P pad.
 for(const bank of ['W','Q','M']){
  const before=map.size,x=banks[bank].x,layers=choices[bank],links=[];
  for(let b=0;b<8;b++){
   const z=14+12*b,low=-8*layers.length,top=P(x+4,0,z);
   for(let y=low;y<0;y++)put(P(x+4,y,z),(y-low)%2===0?'light_gray_concrete':'redstone_torch',null,bank+'_P_OR_'+b);
   columns.push({bank,bit:b,bottom:P(x+4,low,z),top,output:P(x+4,1,z),injection_y:layers.map((_,i)=>-8*(i+1)),kind:'positive_OR_four_inversions_per_choice'});
  }
  for(let c=0;c<layers.length;c++){
   const choice=layers[c],y=-8*(c+1),n=bank+'_mask_'+choice,select=bank.toLowerCase()+'_parallel_select_'+choice;
   wire(P(x-12,y,-4),n);rep(P(x-12,y,-3),'south',n);put(P(x-12,y,-2),'light_gray_concrete',null,n);put(P(x-12,y,-1),'redstone_wall_torch',{facing:'south'},n);
   for(let z=0;z<=100;z++)if(z%12===7)rep(P(x-12,y,z),'south',n);else wire(P(x-12,y,z),n);
   const bits=[];
   for(let b=0;b<8;b++){
    const z=14+12*b,dn=bank+'_choice_'+choice+'_'+b;
    wire(P(x-1,y,z),dn);rep(P(x,y,z),'east',dn);wire(P(x+1,y,z),dn);comp(P(x+2,y,z),'comparator',{facing:'west',mode:'subtract'},dn);rep(P(x+3,y,z),'east',dn);
    rep(P(x-11,y,z+2),'east',n);route([[x-10,y,z+2],[x+2,y,z+2]],n);rep(P(x+2,y,z+1),'north',n);
    bits.push({bit:b,input:P(x-1,y,z),data_receiver:P(x,y,z),comparator:P(x+2,y,z),mask_receiver:P(x+2,y,z+1),output_receiver:P(x+3,y,z),output_support:P(x+4,y,z),destination:P(x+4,1,z)});
    links.push({bit:b,choice,source:P(x-1,y,z),destination:P(x+4,1,z)});
   }
   selectors.push({bank,choice,select,input:P(x-12,y,-4),receiver:P(x-12,y,-3),inverter:P(x-12,y,-1),bits});ports.push({name:select,position:P(x-12,y,-4),receiver:P(x-12,y,-3),width:1,direction:'input'});
  }
  group(bank+'_folded_selector_and_local_outputs',before,links,'all_choice_gates_masks_and_output_columns_data_producers_pending');
 }
 function currentTap(bank,b,n){const x=banks[bank].x+3,z=12*b,s=b===0?-1:1,src=P(x,1,z);rep(P(x,0,z+s),s===1?'south':'north',n);put(P(x,1,z+s),'light_gray_concrete',null,n);rep(P(x,0,z+2*s),s===1?'south':'north',n);const out=P(x,0,z+3*s);taps.push({bank,bit:b,source:src,support:P(x,0,z),first:P(x,0,z+s),cap:P(x,1,z+s),second:P(x,0,z+2*s),output:out});return out;}
 for(const bank of ['W','Q','M']){
  const before=map.size,x=banks[bank].x,sel=selectors.find(s=>s.bank===bank&&s.choice==='self'),links=[];
  for(let b=0;b<8;b++){
   const n=bank+'_current_'+b+'_to_self',src=currentTap(bank,b,n),dst=sel.bits[b].input,z=12*b;
   const points=b?[[src.x,0,src.z],[src.x,0,z+7],[x-5,-8,z+7],[x-5,-8,z+10],[x-1,-8,z+10],[dst.x,dst.y,dst.z]]:[[src.x,0,src.z],[src.x,0,-10],[x-5,-8,-10],[x-5,-8,7],[x-1,-8,7],[dst.x,dst.y,dst.z]];
   route(points,n);links.push({bit:b,source:banks[bank].current[b],tap:src,destination:dst});
  }group(bank+'_current_to_self',before,links,'all_eight_real_current_stores_connected');
 }
 for(const [bank,choice]of [['W','trial'],['Q','left_take'],['M','left']]){
  const before=map.size,x=banks[bank].x,self=selectors.find(s=>s.bank===bank&&s.choice==='self'),sel=selectors.find(s=>s.bank===bank&&s.choice===choice),links=[];
  for(let b=1;b<8;b++){
   const n=bank+'_current_'+(b-1)+'_to_left_'+b,src=self.bits[b-1].input,dst=sel.bits[b].input;
   rep(P(src.x-1,src.y,src.z),'west',n);
   route([[src.x-2,src.y,src.z],[src.x-6,-12,src.z],[src.x-6,-12,dst.z-4],[dst.x,-12,dst.z-4],[dst.x,dst.y,dst.z]],n);
   links.push({bit:b,source_bit:b-1,source:src,destination:dst});
  }group(bank+'_current_to_left_upper7',before,links,'seven_upper_bits_connected_LSB_separate');
 }
 {
  const before=map.size,sel=selectors.find(s=>s.bank==='W'&&s.choice==='q'),links=[];
  for(let b=0;b<8;b++){
   const n='Q_current_'+b+'_to_W_q',tap=taps.find(t=>t.bank==='Q'&&t.bit===b).output,dst=sel.bits[b].input,z=b?12*b+9:-14;
   rep(P(tap.x+1,tap.y,tap.z),'east',n);
   route([[tap.x+2,0,tap.z],[tap.x+2,0,z],[41,-4,z],[36,-4,z],[28,-12,z],[25,-12,z],[17,-20,z],[-1,-20,z],[-1,-20,dst.z-4],[dst.x,dst.y,dst.z]],n);
   links.push({bit:b,source:banks.Q.current[b],tap,destination:dst});
  }group('Q_current_to_W_q',before,links,'eight_real_Q_bits_connected');
 }
 function positiveColumn(x,z,bottom,outputY,n){const top=outputY-1;assert(bottom<=top&&(top-bottom)%4===0);for(let y=bottom;y<=top;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch',null,n);wire(P(x,outputY,z),n);columns.push({kind:'positive_data_column',bottom:P(x,bottom,z),top:P(x,top,z),output:P(x,outputY,z),injection_y:[bottom]});return P(x,outputY,z);}
 for(const choice of ['a','b']){
  const before=map.size,links=[],bottom=choice==='a'?-37:-45,bankNames=choice==='a'?['W','Q','M']:['Q','M'];
  for(let b=0;b<8;b++){
   const z=14+12*b,busZ=z+(choice==='a'?6:-8),n='operand_'+choice+'_'+b,src=P(-20,bottom,busZ);
   wire(src,n);rep(P(-19,bottom,busZ),'east',n);route([[-18,bottom,busZ],[75,bottom,busZ]],n);ports.push({name:'operand_'+choice,bit:b,width:8,direction:'input',position:src,receiver:P(-19,bottom,busZ),external_route:'register file to lane boundary remains separate'});
   for(const bank of bankNames){const x=banks[bank].x,sel=selectors.find(v=>v.bank===bank&&v.choice===choice),dst=sel.bits[b].input,cz=z+(choice==='a'?0:-4),out=positiveColumn(x-5,cz,bottom,dst.y,n);
    if(choice==='a'){rep(P(x-5,bottom,busZ-1),'north',n);route([[x-5,bottom,busZ-2],[x-5,bottom,cz+2]],n);rep(P(x-5,bottom,cz+1),'north',n);}
    else{rep(P(x-5,bottom,busZ+1),'south',n);wire(P(x-5,bottom,cz-2),n);rep(P(x-5,bottom,cz-1),'south',n);}
    rep(P(x-4,dst.y,cz),'east',n);route([[x-3,dst.y,cz],[dst.x,dst.y,cz],...(cz===z?[]:[[dst.x,dst.y,z]])],n);
    links.push({bank,bit:b,source:src,column_output:out,destination:dst});
   }
  }group('operand_'+choice.toUpperCase()+'_shared_distribution',before,links,'same_eight_external_bits_physically_feed_all_named_choices');
 }
 {
  const before=map.size,src=selectors.find(s=>s.bank==='W'&&s.choice==='q').bits[7].input,dst=selectors.find(s=>s.bank==='W'&&s.choice==='trial').bits[0].input,n='Q7_to_W_trial0';
  rep(P(src.x-1,src.y,src.z),'west',n);route([[src.x-2,src.y,src.z],[-7,-28,src.z],[-7,-28,10]],n);rep(P(-6,-28,10),'east',n);positiveColumn(-5,10,-28,-15,n);rep(P(-4,-15,10),'east',n);route([[-3,-15,10],[-1,-15,10],[-1,-15,13],[dst.x,dst.y,dst.z]],n);
  group('Q7_to_W_trial0',before,[{source:banks.Q.current[7],buffered_source:src,destination:dst}],'W_trial_all_eight_bits_connected');
 }
 {
  const before=map.size,links=[];
  function auxTap(bank,n){const x=banks[bank].x+19,p=P(x,1,0);assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');rep(P(x,0,-1),'north',n);put(P(x,1,-1),'light_gray_concrete',null,n);rep(P(x,0,-2),'north',n);const out=P(x,0,-3);taps.push({bank,bit:'aux',source:p,support:P(x,0,0),first:P(x,0,-1),cap:P(x,1,-1),second:P(x,0,-2),output:out});return out;}
  function drop(src,targetY,z,n){const points=[[src.x,src.y,src.z],[src.x,src.y,z]];let x=src.x,y=src.y;while(y>targetY){const step=Math.min(8,y-targetY);x-=step;y-=step;points.push([x,y,z]);if(y>targetY){x-=3;points.push([x,y,z]);}}return{points,x,y,z};}
  const c=auxTap('W','C_to_CMP'),nz=auxTap('M','NZ_to_CMP'),cd=drop(c,-45,-16,'C_to_CMP'),nd=drop(nz,-54,-24,'NZ_to_CMP');
  route([...cd.points,[cd.x,-45,-20],[-28,-45,-20],[-28,-45,38]],'C_to_CMP');
  route([...nd.points,[-24,-54,-24],[-24,-54,26]],'NZ_to_CMP');
  // P=C & NZ. Both comparator inputs normalized; !NZ drives its side.
  rep(P(-27,-45,14),'east','C_to_CMP');route([[-26,-45,14],[-9,-45,14]],'C_to_CMP');rep(P(-8,-45,14),'east','C_to_CMP');wire(P(-7,-45,14),'C_to_CMP');
  rep(P(-23,-54,8),'east','NZ_to_CMP');route([[-22,-54,8],[-8,-54,8]],'NZ_to_CMP');rep(P(-7,-54,8),'east','NZ_to_CMP');positiveColumn(-6,8,-54,-45,'NZ_to_CMP');
  rep(P(-6,-45,9),'south','NZ_to_CMP');put(P(-6,-45,10),'light_gray_concrete',null,'NZ_to_CMP');put(P(-6,-45,11),'redstone_wall_torch',{facing:'south'},'CMP_notNZ');wire(P(-6,-45,12),'CMP_notNZ');rep(P(-6,-45,13),'south','CMP_notNZ');comp(P(-6,-45,14),'comparator',{facing:'west',mode:'subtract'},'CMP_P');rep(P(-5,-45,14),'east','CMP_P');
  route([[-4,-45,14],[-3,-45,14]],'CMP_P');rep(P(-2,-45,14),'east','CMP_P');
  // Z=!NZ from the same retained NZ rail.
  rep(P(-23,-54,26),'east','NZ_to_CMP');route([[-22,-54,26],[-12,-54,26]],'NZ_to_CMP');rep(P(-11,-54,26),'east','NZ_to_CMP');positiveColumn(-10,26,-54,-45,'NZ_to_CMP');rep(P(-9,-45,26),'east','NZ_to_CMP');put(P(-8,-45,26),'light_gray_concrete',null,'NZ_to_CMP');put(P(-7,-45,26),'redstone_wall_torch',{facing:'east'},'CMP_Z');route([[-6,-45,26],[-3,-45,26]],'CMP_Z');rep(P(-2,-45,26),'east','CMP_Z');
  // N=!C from the same retained carry rail.
  rep(P(-27,-45,38),'east','C_to_CMP');route([[-26,-45,38],[-9,-45,38]],'C_to_CMP');rep(P(-8,-45,38),'east','C_to_CMP');put(P(-7,-45,38),'light_gray_concrete',null,'C_to_CMP');put(P(-6,-45,38),'redstone_wall_torch',{facing:'east'},'CMP_N');route([[-5,-45,38],[-3,-45,38]],'CMP_N');rep(P(-2,-45,38),'east','CMP_N');
  for(const [name,b]of [['P',0],['Z',1],['N',2]]){
   const z=14+12*b,n='CMP_'+name,dst=selectors.find(s=>s.bank==='W'&&s.choice==='cmp').bits[b].input;
   // Existing selector input wire is the top of this short positive column.
   for(let y=-45;y<-41;y++)put(P(-1,y,z),(y+45)%2===0?'light_gray_concrete':'redstone_torch',null,n);
   columns.push({kind:'positive_data_column',bottom:P(-1,-45,z),top:P(-1,-41,z),output:dst,injection_y:[-45]});links.push({bit:b,flag:name,destination:dst});
  }
  group('retained_C_NZ_to_W_CMP',before,links,'N=!C_Z=!NZ_P=C_and_NZ_connected');
 }
 const zeroPorts=[...selectors.filter(s=>s.choice==='zero').flatMap(s=>s.bits.map(b=>({bank:s.bank,choice:s.choice,bit:b.bit,position:b.input}))),...selectors.find(s=>s.bank==='W'&&s.choice==='cmp').bits.filter(b=>b.bit>=3).map(b=>({bank:'W',choice:'cmp',bit:b.bit,position:b.input})),{bank:'M',choice:'left',bit:0,position:selectors.find(s=>s.bank==='M'&&s.choice==='left').bits[0].input}];
 const beforeFixed=map.size,one=ports.find(p=>p.name==='M_rotate').position;
 comp(P(one.x-2,one.y,one.z),'light_gray_concrete',null,'M_rotate_one');put(P(one.x-1,one.y,one.z),'redstone_wall_torch',{facing:'east'},'M_rotate_one');
 const constants=[{name:'M_rotate',value:1,position:one},...['W_rotate','Q_rotate','Q_serial_in','M_serial_in'].map(name=>({name,value:0,position:ports.find(p=>p.name===name).position}))];group('fixed_shift_rotate_modes',beforeFixed,constants,'M_rotates_W_Q_shift_Q_serial_zero_no_host_mode_changes');
 const blocks=[...map.values()],axes=['x','y','z'],box={from:{},to:{}},histogram={};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'refolded_ALU_connections_in_progress_not_buildable',blocks,owner,box,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),volume:axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),histogram},banks,groups,routes,joins,zero_ports:zeroPorts,fixed_constants:constants,selectors,columns,taps,ports,logical_state_bits:57,physical_state_bits:54,physical_control_bits:38,remaining:['Q left_take bit0 is the only remaining choice-data producer; all W choices and M choices are physically connected.','Serial full-adder with enable/XOR conditioner, carry/NZ/T8/take selections.','DIV0, busy/ready/fault storage and qualification.','All external integration routes and native timing.'],native_calls:0,build_plans_emitted:false};
}
