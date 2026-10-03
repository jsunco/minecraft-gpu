// Refolded whole-lane derivative; offline geometry, no site/plans/services.
// Frozen v1/v2 remain unchanged. No native correctness or complete ALU claim.
import assert from 'node:assert/strict';
import {makeSerialBankCoupon} from './serial-bank-coupon.mjs';
import {makeCompactAdder} from './compact-adder.mjs';
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
  group(bank+'_folded_selector_and_local_outputs',before,links,'all_choice_gates_masks_and_output_columns_linked_by_later_groups');
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
 const arithmetic={};
 {
  const before=map.size,fa=makeCompactAdder({origin:P(32,16,-40),id:'gpu_compact_folded_fa'}),required=new Set(fa.blocks.filter(v=>v.position.y===17).map(v=>K({...v.position,y:16})));
  for(const k of required){const [x,y,z]=k.split(',').map(Number);put(P(x,y,z),'lime_concrete',null,'FA');}
  for(const v of fa.blocks){if(map.has(K(v.position))){assert.equal(v.position.y,16);map.set(K(v.position),structuredClone(v));}else put(v.position,v.block.id,v.block.properties,'FA');}
  for(const n of ['a','b']){const p=fa.ports[n].position;assert.equal(map.get(K(p)).block.id,'minecraft:lever');map.set(K(p),{position:p,block:{id:'minecraft:redstone_wire'}});}
  const cin=fa.ports.cin.position;map.set(K(cin),{position:cin,block:{id:'minecraft:light_gray_concrete'}});wire(P(cin.x,cin.y+1,cin.z),'FA');
  arithmetic.fa=fa.ports;arithmetic.fa.cin_above=P(cin.x,cin.y+1,cin.z);group('sparse_full_adder',before,[], 'all_eight_truth_combinations_inherited_layout_new_placement_unverified');
 }
 {
  const before=map.size,links=[];
  for(const [bank,name,x,top]of [['W','W0_to_FA',5,17],['M','M0_to_conditioner',85,25]]){
   const src=taps.find(t=>t.bank===bank&&t.bit===0).output;rep(P(src.x+1,0,src.z),'east',name);const out=positiveColumn(x,src.z,0,top,name);links.push({source:banks[bank].current[0],tap:src,output:out});
   if(bank==='W'){rep(P(x-1,top,src.z),'west',name);route([[x-2,top,src.z],[-6,top,src.z],[-6,top,-48],[30,top,-48],[30,top,-40]],name);rep(P(31,17,-40),'east',name);}
   else{rep(P(x,top,src.z-1),'north',name);route([[x,top,src.z-2],[x,top,-48],[0,top,-48],[0,17,-40]],name);}
  }
  const n='C_to_FA',src=taps.find(t=>t.bank==='W'&&t.bit==='aux').output;rep(P(src.x-1,0,src.z),'west',n);positiveColumn(17,src.z,0,21,n);rep(P(17,21,src.z-1),'north',n);route([[17,21,src.z-2],[17,21,-18],[44,21,-18],[44,21,-29],[44,18,-32]],n);links.push({source:P(18,1,0),tap:src,destination:arithmetic.fa.cin_above});
  group('real_W0_M0_C_to_arithmetic',before,links,'W0_C_to_FA_M0_to_conditioner_actual_retained_producers');
 }
 {
  const before=map.size,y=17,z=-40;
  // X=M0 - !enable. All binary inputs are normalized by the receiving diodes.
  rep(P(1,y,z),'east','M0_to_conditioner');wire(P(2,y,z),'M0_to_conditioner');comp(P(3,y,z),'comparator',{facing:'west',mode:'subtract'},'conditioned_X');rep(P(4,y,z),'east','conditioned_X');route([[5,y,z],[6,y,z]],'conditioned_X');rep(P(7,y,z),'east','conditioned_X');
  wire(P(3,y,z-5),'local_enable');rep(P(3,y,z-4),'south','local_enable');put(P(3,y,z-3),'light_gray_concrete',null,'local_enable');put(P(3,y,z-2),'redstone_wall_torch',{facing:'south'},'not_enable');rep(P(3,y,z-1),'south','not_enable');
  // Two isolated subtract branches compute X XOR subtract; no carry branch.
  const x=8,n='conditioned_XOR';
  for(const dz of [0,8]){route([[x,y,z+dz],[x+3,y,z+dz]],n);rep(P(x+4,y,z+dz),'east',n);comp(P(x+5,y,z+dz),'comparator',{facing:'west',mode:'subtract'},n);wire(P(x+6,y,z+dz),n);rep(P(x+7,y,z+dz),'east',n);route([[x+8,y,z+dz],[x+9,y,z+dz]],n);}
  // Source routes already own X input6 and M0 input0. The normalized X diode7
  // drives this inherited XOR input8; subtract is a real core receiver boundary.
  route([[x+1,y,z+7],[x+1,y,z+2],[x+5,y,z+2]],n);rep(P(x+5,y,z+1),'north',n);
  route([[x+1,y+1,z-1],[x+1,y+3,z-3],[x+5,y+3,z-3],[x+5,y+3,z+3],[x+5,y,z+6]],n);rep(P(x+5,y,z+7),'south',n);
  // The X wire at9,z0 powers the first stair9,z-1. Branch OR can only backfeed
  // within the output collector because each subtract branch ends in a diode.
  route([[x+9,y,z+1],[x+9,y,z+7]],n);wire(P(x+10,y,z+4),n);rep(P(x+11,y,z+4),'east',n);
  route([[20,y,z+4],[28,y,z+4],[28,y,z+8],[30,y,z+8]],n);rep(P(31,y,z+8),'east',n);
  ports.push({name:'subtract',position:P(8,y,z+8),receiver:P(12,y,z+8),width:1,direction:'input',local_normalization:true});arithmetic.conditioner={M0:P(0,y,z),enable:P(3,y,z-5),subtract:P(8,y,z+8),output:P(20,y,z+4),formula:'(M0 & enable) XOR subtract'};
  group('conditioned_M0_XOR_subtract_to_FA',before,[], 'real_M0_enable_subtract_to_FA_inputs_connected');
 }
 {
  const before=map.size,n='FA_sum_to_W_serial',src=arithmetic.fa.sum_output_wire,dst=ports.find(p=>p.name==='W_serial_in').position;rep(P(src.x+1,src.y,src.z),'east',n);
  const points=[[src.x+2,src.y,src.z],[src.x+2,src.y,110]];let x=src.x+2,y=src.y;while(y>dst.y){const step=Math.min(8,y-dst.y);x-=step;y-=step;points.push([x,y,110]);if(y>dst.y){x-=3;points.push([x,y,110]);}}points.push([x,dst.y,106],[14,dst.y,106],[14,dst.y,110],[dst.x,dst.y,dst.z]);route(points,n);group('FA_sum_to_W_serial',before,[{source:src,destination:dst}],'all_sum_path_supports_and_refreshes_connected');
 }
 const bitSelectors=[];
 function bitSelector(name,target,choices){const x=target.x,z=target.z,bottom=target.y-1-4*choices.length,top=target.y-1,stages=[];
  for(let y=bottom;y<top;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch',null,name+'_OR');
  for(let i=0;i<choices.length;i++){
   const y=target.y-5-4*i,choice=choices[i],n=name+'_'+choice;
   wire(P(x-5,y,z),n+'_data');rep(P(x-4,y,z),'east',n+'_data');wire(P(x-3,y,z),n+'_data');comp(P(x-2,y,z),'comparator',{facing:'west',mode:'subtract'},n+'_data');rep(P(x-1,y,z),'east',n+'_data');
   wire(P(x-2,y,z-6),n+'_mask');rep(P(x-2,y,z-5),'south',n+'_mask');put(P(x-2,y,z-4),'light_gray_concrete',null,n+'_mask');put(P(x-2,y,z-3),'redstone_wall_torch',{facing:'south'},n+'_mask');wire(P(x-2,y,z-2),n+'_mask');rep(P(x-2,y,z-1),'south',n+'_mask');
   ports.push({name:n,width:1,direction:'input',position:P(x-2,y,z-6),receiver:P(x-2,y,z-5)});stages.push({choice,input:P(x-5,y,z),mask_input:P(x-2,y,z-6),comparator:P(x-2,y,z),output_receiver:P(x-1,y,z),output_support:P(x,y,z)});
  }
  columns.push({kind:'positive_bit_selector',bottom:P(x,bottom,z),top:P(x,top,z),output:target,injection_y:stages.map(s=>s.input.y)});const obj={name,target,stages};bitSelectors.push(obj);return obj;
 }
 {
  const before=map.size,target=ports.find(p=>p.name==='W_carry_in').position,sel=bitSelector('carry_select',target,['zero','one','adder']);
  const one=sel.stages[1].input;comp(P(one.x-2,one.y,one.z),'light_gray_concrete',null,'carry_seed_one');put(P(one.x-1,one.y,one.z),'redstone_wall_torch',{facing:'east'},'carry_seed_one');
  const src=arithmetic.fa.carry_output_wire,dst=sel.stages[2].input,n='FA_carry_to_selector';rep(P(src.x,src.y,src.z+1),'south',n);
  const points=[[src.x,src.y,src.z+2],[10,src.y,src.z+2],[10,src.y,-28]];let x=10,y=src.y;while(y>dst.y){const step=Math.min(8,y-dst.y);x-=step;y-=step;points.push([x,y,-28]);if(y>dst.y){x-=3;points.push([x,y,-28]);}}
  points.push([x,y,-32],[dst.x,y,-32],[dst.x,dst.y,dst.z]);route(points,n);arithmetic.carry_select=sel;group('carry_seed_and_adder_selector',before,[{source:src,destination:dst,selected_output:target}],'zero_one_real_adder_carry_connected_to_Cnext');
 }
 {
  const before=map.size,n='NZ_update',target=ports.find(p=>p.name==='M_carry_in').position,y=-9,z=6;
  // The two independently normalized producers OR only at89,-9,6.
  wire(P(89,y,z),n);rep(P(90,y,z),'east',n);wire(P(91,y,z),n);comp(P(92,y,z),'comparator',{facing:'west',mode:'subtract'},n);rep(P(93,y,z),'east',n);
  for(let yy=-9;yy<-5;yy++)put(P(94,yy,z),(yy+9)%2===0?'light_gray_concrete':'redstone_torch',null,n);
  columns.push({kind:'positive_NZ_update',bottom:P(94,-9,z),top:P(94,-5,z),output:target,injection_y:[-9]});
  wire(P(92,y,0),'nonzero_clear');rep(P(92,y,1),'south','nonzero_clear');route([[92,y,2],[92,y,4]],'nonzero_clear');rep(P(92,y,5),'south','nonzero_clear');ports.push({name:'nonzero_clear',width:1,direction:'input',position:P(92,y,0),receiver:P(92,y,1)});
  const held=taps.find(t=>t.bank==='M'&&t.bit==='aux').output;rep(P(100,0,-3),'east','held_NZ_to_update');route([[101,0,-3],[109,-8,-3],[112,-8,-3],[113,-9,-3],[113,-9,10],[89,-9,10],[89,-9,8]],'held_NZ_to_update');rep(P(89,y,7),'north','held_NZ_to_update');
  const src=P(58,17,-16);assert.equal(map.get(K(src)).block.id,'minecraft:redstone_wire');rep(P(59,17,-16),'east','sum_to_NZ');route([[60,17,-16],[68,9,-16],[71,9,-16],[79,1,-16],[82,1,-16],[90,-7,-16],[93,-7,-16],[95,-9,-16],[95,-9,-4],[85,-9,-4],[85,-9,6],[87,-9,6]],'sum_to_NZ');rep(P(88,y,6),'east','sum_to_NZ');
  arithmetic.NZ_update={held_source:held,sum_source:src,or_pad:P(89,y,6),clear_input:P(92,y,0),destination:target,formula:'(held_NZ OR sum) AND NOT nonzero_clear'};group('real_NZ_sum_OR_and_clear',before,[arithmetic.NZ_update],'both_real_data_sources_and_clear_connected_to_NZnext');
 }
 {
  const before=map.size,target=ports.find(p=>p.name==='Q_carry_in').position,sel=bitSelector('q_aux_select',target,['zero','trial_high','take']);
  const source=selectors.find(s=>s.bank==='W'&&s.choice==='self').bits[7].input,dst=sel.stages[1].input,n='W7_to_T8next';
  rep(P(source.x-1,source.y,source.z),'west',n);route([[source.x-2,source.y,source.z],[-8,-13,source.z],[-16,-13,source.z],[-16,-13,-10],[dst.x,-13,-10],[dst.x,dst.y,dst.z]],n);
  const t=P(59,1,0);rep(P(59,0,-1),'north','T8_to_take');put(P(59,1,-1),'light_gray_concrete',null,'T8_to_take');rep(P(59,0,-2),'north','T8_to_take');wire(P(59,0,-3),'T8_to_take');taps.push({bank:'Q',bit:'aux',source:t,support:P(59,0,0),first:P(59,0,-1),cap:P(59,1,-1),second:P(59,0,-2),output:P(59,0,-3)});
  rep(P(60,0,-3),'east','T8_to_take');route([[61,0,-3],[61,0,-18],[69,-8,-18],[72,-8,-18],[80,-16,-18],[83,-16,-18],[88,-21,-18],[88,-21,-8],[56,-21,-8]],'T8_to_take');rep(P(55,-21,-8),'west','T8_to_take');
  rep(P(20,0,-3),'east','C_to_take');route([[21,0,-3],[21,0,-18],[29,-8,-18],[32,-8,-18],[40,-16,-18],[43,-16,-18],[48,-21,-18],[48,-21,-8],[52,-21,-8]],'C_to_take');rep(P(53,-21,-8),'east','C_to_take');wire(P(54,-21,-8),'computed_take');rep(P(54,-21,-7),'south','computed_take');
  const take=sel.stages[2].input;route([[54,-21,-6],[54,-22,-5],[54,-22,4],[49,-22,4]],'computed_take');rep(P(49,-22,5),'south','computed_take');for(let y=-22;y<-18;y++)put(P(49,y,6),(y+22)%2===0?'light_gray_concrete':'redstone_torch',null,'computed_take');columns.push({kind:'positive_computed_take',bottom:P(49,-22,6),top:P(49,-18,6),output:take,injection_y:[-22]});
  const qlsb=selectors.find(s=>s.bank==='Q'&&s.choice==='left_take').bits[0].input;rep(P(48,-17,6),'west','take_to_Q_lsb');route([[47,-17,6],[39,-17,6],[39,-16,7],[qlsb.x,qlsb.y,qlsb.z]],'take_to_Q_lsb');
  arithmetic.q_aux_select=sel;arithmetic.take={formula:'retained_T8 OR retained_C',C:P(18,1,0),T8:P(58,1,0),computed:P(54,-21,-8),selected_input:take,Q_left_LSB:qlsb,held_restore_source:P(58,1,6)};
  group('T8_take_and_Q_left_LSB',before,[{source:banks.W.current[7],destination:dst},arithmetic.take],'real_trial_high_T8_C_take_and_Q_left_LSB_connected');
 }
 {
  const before=map.size,sel=bitSelector('addend_mode',arithmetic.conditioner.enable,['zero','one','q0','not_take']);
  const one=sel.stages[1].input;comp(P(one.x-2,one.y,one.z),'light_gray_concrete',null,'enable_one');put(P(one.x-1,one.y,one.z),'redstone_wall_torch',{facing:'east'},'enable_one');
  // Q0 is lane-local, sampled from its existing normalized self wire. A capped
  // support tap preserves that route shape and feeds a positive lift.
  const q=P(35,-8,0);assert.equal(map.get(K(q)).block.id,'minecraft:redstone_wire');rep(P(34,-9,0),'west','Q0_to_enable');put(P(34,-8,0),'light_gray_concrete',null,'Q0_to_enable');rep(P(33,-9,0),'west','Q0_to_enable');positiveColumn(32,0,-9,4,'Q0_to_enable');taps.push({bank:'Q',bit:'buffered_Q0',source:q,support:P(35,-9,0),first:P(34,-9,0),cap:P(34,-8,0),second:P(33,-9,0),output:P(32,4,0)});
  rep(P(32,4,-1),'north','Q0_to_enable');route([[32,4,-2],[32,4,-30],[-2,4,-30],[-2,4,-45]],'Q0_to_enable');
  // RESTORE uses held Q-next auxiliary (take), not the live C|T8 computation.
  const held=P(59,1,6),cap=P(59,1,5);assert.equal(map.get(K(held)).block.id,'minecraft:redstone_wire');rep(P(59,0,5),'north','held_take_to_enable');assert(map.get(K(cap)).block.id.endsWith('_concrete'));rep(P(59,0,4),'north','held_take_to_enable');wire(P(59,0,3),'held_take_to_enable');rep(P(60,0,3),'east','held_take_to_enable');taps.push({bank:'Q',bit:'next_aux_take',source:held,support:P(59,0,6),first:P(59,0,5),cap,second:P(59,0,4),output:P(59,0,3)});
  route([[61,0,3],[69,0,3],[69,0,-28],[77,-8,-28],[80,-8,-28],[88,-16,-28],[91,-16,-28],[99,-24,-28],[99,-24,-32],[-8,-24,-32],[-8,-25,-33],[-8,-25,-45]],'held_take_to_enable');
  rep(P(-7,-25,-45),'east','held_take_to_enable');put(P(-6,-25,-45),'light_gray_concrete',null,'held_take_to_enable');put(P(-5,-25,-45),'redstone_wall_torch',{facing:'east'},'not_held_take');wire(P(-4,-25,-45),'not_held_take');rep(P(-3,-25,-45),'east','not_held_take');
  const dst=sel.stages[3].input;for(let y=-25;y<-1;y++)put(P(-2,y,-45),(y+25)%2===0?'light_gray_concrete':'redstone_torch',null,'not_held_take');columns.push({kind:'positive_not_held_take',bottom:P(-2,-25,-45),top:P(-2,-1,-45),output:dst,injection_y:[-25]});
  arithmetic.addend_mode=sel;arithmetic.held_restore_source=held;group('local_enable_zero_one_Q0_notHeldTake',before,[{Q0:q,held_take:held,destination:arithmetic.conditioner.enable}],'all_four_real_enable_sources_and_receivers_connected');
 }
 {
  const before=map.size,links=[];
  // The original W next-to-current return terminates at this current-driver
  // rear wire even while CURRENT is locked. Read its strong support through a
  // capped lower pair; never tap the LOAD rail beside the next store.
  for(let b=0;b<8;b++){
   const z=12*b,n='retained_result_'+b,source=P(0,1,z),cap=P(0,1,z-1);
   assert.equal(map.get(K(source)).block.id,'minecraft:redstone_wire');rep(P(0,0,z-1),'north',n);put(cap,'light_gray_concrete',null,n);rep(P(0,0,z-2),'north',n);
   route([[0,0,z-3],[0,0,z-5]],n);rep(P(0,0,z-6),'north',n);const out=positiveColumn(0,z-7,0,9,n);rep(P(-1,9,z-7),'west',n);wire(P(-2,9,z-7),n);
   taps.push({bank:'W',bit:'next_result_'+b,source,support:P(0,0,z),first:P(0,0,z-1),cap,second:P(0,0,z-2),output:out});
   const p={name:'result',bit:b,width:8,direction:'output',position:P(-2,9,z-7),driver:P(-1,9,z-7),source:banks.W.next[b],via:source,normalized_high:15};ports.push(p);links.push(p);
  }
  for(const p of links.slice(0,3))ports.push({...p,name:'cmp_nzp',width:3,alias:'result['+p.bit+']',validity:'compare AND ready only; architectural flags update at UPDATE'});
  group('retained_W_next_result_outputs',before,links,'all_eight_normalized_outputs_alias_CMP_bits_2_1_0_no_new_storage');
 }
 const front={};
 {
  const before=map.size,n='divisor_nonzero',links=[];
  for(let b=0;b<8;b++){
   const source=ports.find(p=>p.name==='operand_b'&&p.bit===b).position,z=source.z;
   rep(P(-21,-46,z),'west',n);put(P(-21,-45,z),'light_gray_concrete',null,n);rep(P(-22,-46,z),'west',n);route([[-23,-46,z],[-27,-50,z],[-30,-50,z]],n);rep(P(-31,-50,z),'west',n);
   taps.push({bank:'operand_b',bit:b,source,support:P(-20,-46,z),first:P(-21,-46,z),cap:P(-21,-45,z),second:P(-22,-46,z),output:P(-23,-46,z)});links.push({source,collector:P(-32,-50,z)});
  }
  route([[-32,-50,90],[-32,-50,-4]],n);rep(P(-32,-50,-5),'north',n);put(P(-32,-50,-6),'light_gray_concrete',null,n);put(P(-32,-50,-7),'redstone_wall_torch',{facing:'north'},'divisor_zero');wire(P(-32,-50,-8),'divisor_zero');rep(P(-32,-50,-9),'north','divisor_zero');wire(P(-32,-50,-10),'divisor_zero');
  front.divisor_zero={source_bits:links,nonzero_collector:P(-32,-50,-4),zero:P(-32,-50,-10),zero_driver:P(-32,-50,-9)};
  group('held_operand_B_zero_detector',before,links,'all_eight_real_B_bits_isolated_into_OR_then_inverted');
 }
 {
  const before=map.size,y=37,z=-36,links=[];front.status_cells=[];
  // Explicit core-controlled status capture. These three cells are the last
  // retained bits, not a second sequencer. Local request/fault/enable gates
  // still need to drive the named data/mask junctions before this front is live.
  wire(P(-12,y,z+4),'status_open');rep(P(-11,y,z+4),'east','status_open');put(P(-10,y,z+4),'light_gray_concrete',null,'status_open');put(P(-9,y,z+4),'redstone_wall_torch',{facing:'east'},'status_closed');route([[-8,y,z+4],[34,y,z+4]],'status_closed');
  wire(P(-8,y,z-4),'status_clear');rep(P(-7,y,z-4),'east','status_clear');route([[-6,y,z-4],[31,y,z-4]],'status_clear');
  ports.push({name:'status_open',width:1,direction:'input',position:P(-12,y,z+4),receiver:P(-11,y,z+4),refines:'new_core_status_command'});
  ports.push({name:'status_clear',width:1,direction:'input',position:P(-8,y,z-4),receiver:P(-7,y,z-4),refines:'new_core_status_command'});
  for(const[name,x,dataName]of [['busy',0,'status_busy_value'],['ready',16,'final_latched'],['fault_div_zero',32,null]]){
   const n='status_'+name;
   wire(P(x-4,y,z),n);rep(P(x-3,y,z),'east',n);wire(P(x-2,y,z),n);comp(P(x-1,y,z),'comparator',{facing:'west',mode:'subtract'},n);rep(P(x,y,z),'east',n);rep(P(x+1,y,z),'east',n);wire(P(x+2,y,z),n);rep(P(x+3,y,z),'east',n);wire(P(x+4,y,z),n);
   rep(P(x-1,y,z-3),'south','status_clear');wire(P(x-1,y,z-2),'status_clear');rep(P(x-1,y,z-1),'south','status_clear');
   rep(P(x+1,y,z+3),'north','status_closed');wire(P(x+1,y,z+2),'status_closed');rep(P(x+1,y,z+1),'north','status_closed');
   const cell={name,data:P(x-4,y,z),mask_junction:P(x-1,y,z-2),normalized_D:P(x,y,z),store:P(x+1,y,z),lock:P(x+1,y,z+1),output:P(x+4,y,z),output_driver:P(x+3,y,z)};front.status_cells.push(cell);links.push(cell);
   if(dataName)ports.push({name:dataName,width:1,direction:'input',position:cell.data,receiver:P(x-3,y,z),qualification:'clear implemented; lane-enable/fault qualification still missing',refines:dataName==='final_latched'?'existing_38_microcontrol':'new_core_status_command'});
   ports.push({name,width:1,direction:'output',position:cell.output,driver:cell.output_driver,normalized_high:15,validity:'status front qualification incomplete'});
  }
  const f=front.status_cells[2];rep(P(36,y,z+1),'south','status_fault_feedback');route([[36,y,z+2],[36,y+4,z+6],[26,y+4,z+6],[26,y+4,z+4],[26,y,z]],'status_fault_feedback');rep(P(27,y,z),'east','status_fault_feedback');
  front.status_refinement={original_microcontrols:38,additional:['status_busy_value','status_open','status_clear'],total:41,data_protocol:'Core holds prepared status data through close plus measured settle. final_latched is held ready data, not an edge.',fault_feedback:{source:f.output,destination:f.data},missing:['accepted_request AND lane DIV-mode AND actual B-zero to fault-set junction','busy/ready inhibit from lane_enable, held fault and raw local DIV0','root shared status event producer and input fanout']};
  group('three_retained_status_cells_clear_and_shared_lock',before,links,'three_real_cells_and_fault_feedback_mapped_local_qualification_pending');
 }
 const zeroPorts=[...selectors.filter(s=>s.choice==='zero').flatMap(s=>s.bits.map(b=>({bank:s.bank,choice:s.choice,bit:b.bit,position:b.input}))),...selectors.find(s=>s.bank==='W'&&s.choice==='cmp').bits.filter(b=>b.bit>=3).map(b=>({bank:'W',choice:'cmp',bit:b.bit,position:b.input})),{bank:'M',choice:'left',bit:0,position:selectors.find(s=>s.bank==='M'&&s.choice==='left').bits[0].input},...bitSelectors.map(s=>({bank:'single_bit',choice:s.name+'_zero',bit:0,position:s.stages[0].input}))];
 const beforeFixed=map.size,one=ports.find(p=>p.name==='M_rotate').position;
 comp(P(one.x-2,one.y,one.z),'light_gray_concrete',null,'M_rotate_one');put(P(one.x-1,one.y,one.z),'redstone_wall_torch',{facing:'east'},'M_rotate_one');
 const constants=[{name:'enable_one',value:1,position:arithmetic.addend_mode.stages[1].input},{name:'carry_seed_one',value:1,position:arithmetic.carry_select.stages[1].input},{name:'M_rotate',value:1,position:one},...['W_rotate','Q_rotate','Q_serial_in','M_serial_in'].map(name=>({name,value:0,position:ports.find(p=>p.name===name).position}))];group('fixed_shift_rotate_modes',beforeFixed,constants,'M_rotates_W_Q_shift_Q_serial_zero_no_host_mode_changes');
 const blocks=[...map.values()],axes=['x','y','z'],box={from:{},to:{}},histogram={};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'refolded_ALU_connections_in_progress_not_buildable',blocks,owner,box,metrics:{blocks:blocks.length,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),volume:axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1),histogram},bit_selectors:bitSelectors,arithmetic,front,banks,groups,routes,joins,zero_ports:zeroPorts,fixed_constants:constants,selectors,columns,taps,ports,logical_state_bits:57,physical_state_bits:57,original_physical_control_bits:38,physical_control_bits:41,remaining:['DIV0 accepted-request qualifier and busy/ready lane-enable/fault masks, including high-level mode/request input routes.','Shared core mode/step/phase/status producers and all external integration routes.','Native closure, settling, saved-state and full ISA/kernel tests.'],native_calls:0,build_plans_emitted:false};
}
