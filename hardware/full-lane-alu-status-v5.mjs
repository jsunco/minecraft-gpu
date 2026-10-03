// Diode-driven status repair over frozen alu-v3; v4 preserved as rejected history; offline geometry only.
import assert from 'node:assert/strict';
import {makeFullLaneAluFoldedV3} from './full-lane-alu-folded-v3.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeFullLaneAluStatusV5(){
 const d=makeFullLaneAluFoldedV3(),parent=structuredClone(d),m=new Map(d.blocks.map(v=>[K(v.position),v]));
 function put(p,id,properties,n){assert(!m.has(K(p)),`Collision ${K(p)}: ${n}/${d.owner[K(p)]}`);m.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})}});d.owner[K(p)]=n;}
 function support(p,n){const q=P(p.x,p.y-1,p.z),a=m.get(K(q));if(a)assert(a.block.id.endsWith('_concrete'),'Support '+K(q));else put(q,'light_gray_concrete',null,n);}
 const dev=(p,id,props,n)=>{support(p,n);put(p,id,props,n);},wire=(p,n)=>dev(p,'redstone_wire',null,n),rep=(p,dir,n)=>dev(p,'repeater',{facing:F[dir],delay:'1'},n);
 function route(ws,n){const ps=[P(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],ds=b.map((v,k)=>v-a[k]),len=Math.abs(ds[0])+Math.abs(ds[2]);assert(len&&(!ds[0]||!ds[2])&&(!ds[1]||Math.abs(ds[1])===len));for(let j=1;j<=len;j++)ps.push(P(...a.map((v,k)=>v+Math.sign(ds[k])*j)));}
  const cand=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(a.y===p.y&&p.y===b.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z&&!m.has(K(p)))cand.push(i);}cand.push(ps.length);
  const cost=new Map([[-1,0]]),prev=new Map();for(const b of cand.slice(1))for(const a of cand){if(a>=b)break;if(cost.has(a)&&b-a<=13&&(cost.get(b)??Infinity)>cost.get(a)+(b===ps.length?0:1)){cost.set(b,cost.get(a)+(b===ps.length?0:1));prev.set(b,a);}}assert(prev.has(ps.length),'Unrefreshable '+n);const chosen=[];for(let a=prev.get(ps.length);a!==-1;a=prev.get(a))chosen.push(a);
  for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(m.has(K(p))){assert(i===0||i===ps.length-1,'Route overlap '+K(p)+' '+n);assert.equal(m.get(K(p)).block.id,'minecraft:redstone_wire');d.joins.push({from:ps[i===0?1:i-1],to:p});}else if(chosen.includes(i))rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north',n);else wire(p,n);}
  d.routes.push({net:n,positions:ps,refresh_indices:chosen.sort((a,b)=>a-b)});return ps;
 }
 function group(id,before,links,status){d.groups.push({id,added_blocks:m.size-before,links,status});}
 function column(x,z,bottom,topY,n){const top=topY-1;assert(top>=bottom&&(top-bottom)%4===0);for(let y=bottom;y<=top;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch',null,n);wire(P(x,topY,z),n);d.columns.push({kind:'positive_status_data_column',bottom:P(x,bottom,z),top:P(x,top,z),output:P(x,topY,z),injection_y:[bottom]});return P(x,topY,z);}
 const outputs={},panels=[];
 {
  const before=m.size,links=[];
  for(const c of d.front.status_cells){const p=c.output,n='front_'+c.name+'_tap';rep(P(p.x+1,p.y-1,p.z),'east',n);put(P(p.x+1,p.y,p.z),'light_gray_concrete',null,n);rep(P(p.x+2,p.y-1,p.z),'east',n);const out=column(p.x+3,p.z,p.y-1,61,n);outputs[c.name]=out;const t={bank:'status',bit:c.name,source:p,support:P(p.x,p.y-1,p.z),first:P(p.x+1,p.y-1,p.z),cap:P(p.x+1,p.y,p.z),second:P(p.x+2,p.y-1,p.z),output:out};d.taps.push(t);links.push(t);}
  const p=d.front.divisor_zero.zero,n='front_B_zero_tap';rep(P(p.x-1,p.y-1,p.z),'west',n);put(P(p.x-1,p.y,p.z),'light_gray_concrete',null,n);rep(P(p.x-2,p.y-1,p.z),'west',n);wire(P(p.x-3,p.y-1,p.z),n);rep(P(p.x-4,p.y-1,p.z),'west',n);outputs.B_zero=column(p.x-5,p.z,p.y-1,62,n);const t={bank:'operand_b',bit:'zero',source:p,support:P(p.x,p.y-1,p.z),first:P(p.x-1,p.y-1,p.z),cap:P(p.x-1,p.y,p.z),second:P(p.x-2,p.y-1,p.z),output:outputs.B_zero};d.taps.push(t);links.push(t);
  group('actual_B_zero_and_three_status_taps',before,links,'actual_retained_sources_normalized_into_front_logic');
 }
 // Product = NOT(OR mismatched literal). Every literal and collector is real;
 // the collector only moves south, with tap coordinates kept as dust.
 function product(name,x,y,z,terms){const stages=[];
  for(let i=0;i<terms.length;i++){const r=z+12*i,[term,wanted]=terms[i],n=name+'_'+term;wire(P(x,y,r),n);rep(P(x+1,y,r),'east',n);if(wanted){put(P(x+2,y,r),'light_gray_concrete',null,n);put(P(x+3,y,r),'redstone_wall_torch',{facing:'east'},n);}else{wire(P(x+2,y,r),n);wire(P(x+3,y,r),n);}rep(P(x+4,y,r),'east',n);stages.push({term,wanted,input:P(x,y,r),receiver:P(x+1,y,r),bad_driver:P(x+4,y,r),collector:P(x+5,y,r)});}
  for(let r=z;r<=z+12*(terms.length-1)+2;r++){if((r-z)%12===6)rep(P(x+5,y,r),'south',name+'_OR_bad');else wire(P(x+5,y,r),name+'_OR_bad');}
  const end=z+12*(terms.length-1)+2;rep(P(x+5,y,end+1),'south',name+'_OR_bad');put(P(x+5,y,end+2),'light_gray_concrete',null,name+'_OR_bad');put(P(x+5,y,end+3),'redstone_wall_torch',{facing:'south'},name);rep(P(x+5,y,end+4),'south',name);wire(P(x+5,y,end+5),name);const out=P(x+5,y,end+5);const obj={name,stages,output:out,output_driver:P(x+5,y,end+4),collector_start:P(x+5,y,z),collector_end:P(x+5,y,end)};panels.push(obj);return obj;
 }
 let raw,accepted;
 {
  const before=m.size;raw=product('raw_local_div0',0,61,0,[['mode0',1],['mode1',1],['compare',0],['B_zero',1]]);
  accepted=product('accepted_div0',60,61,-60,[['busy',0],['ready',0],['fault_div_zero',0],['lane_enable',1],['execute_request',1],['raw_div0',1]]);
  for(const[name,bit,stage]of [['arithmetic_mux',0,raw.stages[0]],['arithmetic_mux',1,raw.stages[1]],['compare',0,raw.stages[2]],['lane_enable',0,accepted.stages[3]],['execute_request',0,accepted.stages[4]]])d.ports.push({name,bit,width:name==='arithmetic_mux'?2:1,direction:'input',position:stage.input,receiver:stage.receiver,role:'original_high_level_ALU_input_not_a_new_microcommand'});
  const p=outputs.B_zero;rep(P(p.x,p.y,p.z+1),'south','B_zero_to_DIV');route([[p.x,p.y,p.z+2],[p.x,61,p.z+3],[-2,61,p.z+3],[-2,61,36],[0,61,36]],'B_zero_to_DIV');
  for(const[name,endZ]of [['busy',-60],['ready',-48]]){const p=outputs[name];rep(P(p.x,p.y,p.z-1),'north','status_'+name+'_to_accept');route([[p.x,61,p.z-2],[p.x,61,endZ],[60,61,endZ]],'status_'+name+'_to_accept');}
  const fp=outputs.fault_div_zero;rep(P(fp.x+1,61,fp.z),'east','status_fault_to_accept');route([[fp.x+2,61,fp.z],[60,61,-36]],'status_fault_to_accept');
  rep(P(6,61,43),'east','raw_DIV_to_accept');route([[7,61,43],[60,61,43],[60,61,0]],'raw_DIV_to_accept');
  group('DIV_mode_and_accepted_request_predicates',before,[raw,accepted],'raw_DIV0_and_enabled_idle_request_qualification_connected');
 }
 {
  const before=m.size,n='accepted_DIV0_to_fault_set';rep(P(66,61,7),'east',n);wire(P(67,61,7),n);rep(P(67,61,6),'north',n);
  route([[67,61,5],[67,61,-66],[30,61,-66],[30,53,-58],[30,53,-56],[30,45,-48],[30,45,-45],[30,38,-38]],n);rep(P(30,38,-37),'south',n);put(P(30,38,-36),'light_gray_concrete',null,n);put(P(31,38,-38),'light_gray_concrete',null,n); // cap preserves N/S clear path and blocks an upward dust join to the new rear wire
  d.intentional_support_power=[{source:P(30,38,-37),support:P(30,38,-36),destination:P(30,37,-36),meaning:'accepted DIV0 into fault pre-clear data wire'}];
  group('accepted_DIV0_set_into_retained_fault',before,[{source:accepted.output,destination:P(30,37,-36),receiver:P(30,38,-37)}],'normalized_set_combines_with_existing_held_fault_feedback_before_clear');
 }
 {
  const before=m.size,n='status_common_inhibit';
  // The earlier fault response buffer prevents OR feedback into the stored bit.
  rep(P(42,61,-35),'south',n);route([[42,61,-34],[42,61,-26]],n);route([[42,61,-26],[42,61,16]],n);rep(P(42,61,17),'south',n);wire(P(42,61,18),n);rep(P(42,61,19),'south',n);wire(P(42,61,20),n);
  // Add !lane_enable from the actual literal inverter, behind a fresh diode.
  rep(P(63,61,-25),'north',n);route([[63,61,-26],[44,61,-26]],n);rep(P(43,61,-26),'west',n);
  // Add acceptedDIV0 to suppress ready before the held fault has propagated.
  route([[67,61,7],[67,65,11],[48,65,11],[48,65,14],[44,61,14],[44,61,18]],n);rep(P(43,61,18),'west',n);
  rep(P(43,61,20),'east',n);route([[44,61,20],[48,57,20],[74,57,20],[74,57,-48],[66,49,-48],[63,49,-48],[57,43,-48],[42,43,-48],[42,43,-46],[22,43,-46],[22,43,-38],[17,38,-38]],n);rep(P(16,38,-38),'west',n);put(P(15,38,-38),'light_gray_concrete',null,n);wire(P(15,39,-38),n);route([[15,39,-38],[8,39,-38]],n);rep(P(7,39,-38),'west',n);route([[6,39,-38],[2,39,-38],[1,38,-38]],n);rep(P(0,38,-38),'west',n);put(P(-1,38,-38),'light_gray_concrete',null,n);
  // Explicit diodes strongly power junction solids; dust-only mediated power is NOT used.
  // no current is injected into the shared clear trunk or fault-clear branch.
  d.intentional_support_power.push({source:P(0,38,-38),also_source:P(-2,38,-38),support:P(-1,38,-38),destination:P(-1,37,-38)},{source:P(16,38,-38),support:P(15,38,-38),destination:P(15,37,-38),also_destination:P(15,39,-38)});
  const b='raw_DIV_busy_inhibit';rep(P(15,61,44),'south',b);route([[15,61,45],[7,53,45],[4,53,45],[-4,45,45],[-7,45,45],[-13,39,45],[-13,39,-37],[-13,38,-38],[-3,38,-38]],b);rep(P(-2,38,-38),'east',b);
  group('busy_ready_lane_and_fault_masks',before,[{common:'NOT lane_enable OR old_fault OR accepted_DIV0',busy_extra:'raw_local_DIV0',ready_mask:P(15,37,-38),busy_mask:P(-1,37,-38),busy_isolation:P(7,39,-38)}],'existing_clear_OR_new_local_inhibits_both_status_D_paths_connected');
 }
 d.front.intentional_torch_receivers=[{source:P(63,61,-24),receiver:P(63,61,-25)}];
 d.front.status_panels=panels;d.front.local_source_outputs=outputs;
 d.front.status_refinement.missing=['Shared core status event producer and qualified command/input fanout','Reset/result_ack protocol owner and complete external data/response connections'];
 d.front.status_refinement.implemented_equations={accepted_div0:'!compare AND mode0 AND mode1 AND actual_B_zero AND lane_enable AND execute_request AND !busy AND !ready AND !fault',fault_next:'(old_fault OR accepted_div0) AND !status_clear',busy_next:'status_busy_value AND lane_enable AND !old_fault AND !accepted_div0 AND !raw_div0 AND !status_clear',ready_next:'final_latched AND lane_enable AND !old_fault AND !accepted_div0 AND !status_clear'};
 for(const p of d.ports){if(['status_busy_value','final_latched'].includes(p.name))p.qualification='physical clear, lane-enable and local-fault masks connected';if(['busy','ready','fault_div_zero'].includes(p.name))p.validity='qualified status capture/close protocol; native timing unverified';}
 d.blocks=[...m.values()];for(const a of ['x','y','z']){d.box.from[a]=Math.min(...d.blocks.map(v=>v.position[a]));d.box.to[a]=Math.max(...d.blocks.map(v=>v.position[a]));}const histogram={};for(const v of d.blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 d.metrics={blocks:d.blocks.length,parent_blocks:parent.blocks.length,additions:d.blocks.length-parent.blocks.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,d.box.to[a]-d.box.from[a]+1])),volume:['x','y','z'].reduce((n,a)=>n*(d.box.to[a]-d.box.from[a]+1),1),histogram};
 d.status='diode_repaired_lane_status_geometry_shared_control_and_external_routes_pending';d.repaired_defect='v4 wire-to-solid-to-wire ignored RedstoneWireBlock.shouldSignal suppression. Three junctions now receive actual repeater outputs; v4 remains historical and not cleared.';d.remaining=['Shared per-core microprogram/mode/bit/round/status producers, phase-qualified command fanout and actual closure timing.','Root register A/B, result/writeback, CMP/PC, response and high-level request/mode/enable interconnect.','Reset/result_ack require core-owned ordered events; not raw asynchronous clamps or extra lane storage.','Independent contact/dynamic review, native retention/transient/phase/init/full-ISA tests.'];
 d.parent_preserved_blocks=parent.blocks.length;d.native_calls=0;return d;
}
