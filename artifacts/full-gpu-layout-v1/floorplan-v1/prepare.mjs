// Component placement and explicit unrouted-interface accounting. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const prefix='artifacts/full-gpu-layout-v1/';
const files={loader:'initial-loader-warm-drain-v3/design.json',core:'control-reset-scratch-v1/design.json',dispatch:'dispatch-startup-v1/admission-destinations/design.json',global:'global-command-assembly-v2/design.json'};
const axes=['x','y','z'],P=(x,y,z)=>({x,y,z}),add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),K=p=>axes.map(a=>p[a]).join(',');
const read=p=>readFileSync(resolve(root,p));
const sha=p=>createHash('sha256').update(read(p)).digest('hex');
const pos=p=>p.bits?.map(b=>b.position)??p.positions;
const rotate=(p,q)=>{let{x,y,z}=p;while(q--)[x,z]=[-z,x];return P(x||0,y,z||0);};
function boxAt(box,t){let cs=[];for(const x of[box.from.x,box.to.x])for(const z of[box.from.z,box.to.z])for(const y of[box.from.y,box.to.y])cs.push(add(rotate(P(x,y,z),t.q),t.t));return{from:Object.fromEntries(axes.map(a=>[a,Math.min(...cs.map(p=>p[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...cs.map(p=>p[a]))]))};}
function apart(a,b,margin=3){return axes.some(k=>a.to[k]+margin<b.from[k]||b.to[k]+margin<a.from[k]);}
function union(boxes){return{from:Object.fromEntries(axes.map(a=>[a,Math.min(...boxes.map(b=>b.from[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...boxes.map(b=>b.to[a]))]))};}
export function prepare(){
 const components={};
 for(const[id,f]of Object.entries(files)){
  const d=JSON.parse(read(prefix+f));assert(d.blocks.length===d.metrics.blocks);
  const box={from:{},to:{}};for(const a of axes){let low=Infinity,high=-Infinity;for(const v of d.blocks){assert(Number.isSafeInteger(v.position[a]));low=Math.min(low,v.position[a]);high=Math.max(high,v.position[a]);}box.from[a]=low;box.to[a]=high;}assert.deepEqual(box,d.box);
  components[id]={path:prefix+f,sha256:sha(prefix+f),blocks:d.blocks.length,box,metrics:d.metrics,ports:d.ports};
 }
 const C=components,nets=[];
 const endpoint=(instance,port,positions,extra={})=>({instance,port,positions,...extra});
 const net=(name,from,to,width,scope)=>{assert(from.positions===null||from.positions.length===width,name+' source width');assert(to.positions===null||to.positions.length===width,name+' sink width');nets.push({name,driver:from,sink:to,width,scope,route:null,added_route_blocks:null,geometry_status:from.positions&&to.positions?'both_endpoints_drawn_route_missing':'physical_endpoint_missing'});};
 const ep=(i,path,indices)=>{let v=C[i.startsWith('core')?'core':i].ports;for(const k of path.split('.'))v=v[k];assert(v,path);let ps=pos(v);assert(ps,path);if(indices)ps=indices.map(n=>ps[n]);return endpoint(i,path,ps);};
 net('dcr_thread_count',ep('loader','config.thread_count'),ep('dispatch','thread_count'),8,'configuration');
 const bindings=JSON.parse(read(prefix+'control-lsu-core-v1/memory-bindings.json'));
 for(const n of bindings.nets){
  const coreId=[n.driver.instance,...n.sinks.map(s=>s.instance)].find(s=>s.includes('/core'));assert(coreId);const ci=coreId.includes('/core0/')?0:1;
  const fromCore=n.driver_frame==='core_template',toCore=n.sink_frame==='core_template';
  net(n.driver.instance+'.'+n.driver.port+'->'+n.sinks[0].instance+'.'+n.sinks[0].port,
   endpoint(fromCore?'core'+ci:'loader',n.driver.port,n.driver_positions??null,{source_interface:n.driver}),
   endpoint(toCore?'core'+ci:'loader',n.sinks[0].port,n.sink_positions??null,{source_interface:n.sinks[0]}),n.width,'data_memory');
 }
 for(let ci=0;ci<2;ci++){
  const c='core'+ci;
  for(const[name,width,forward]of[['read_valid',1,true],['read_address',8,true],['read_ready',1,false],['read_data',16,false]]){
   const cp={read_valid:'program_valid',read_address:'program_address',read_ready:'program_ready',read_data:'program_data'}[name];
   const a=ep(c,'front.'+cp),b=ep('loader','program.'+name,Array.from({length:width},(_,b)=>ci*width+b));net('program_'+ci+'_'+name,forward?a:b,forward?b:a,width,'program_memory');
  }
  net('program_quiet_'+ci,ep('loader','program.core'+ci+'_drained'),ep(c,'reset_barrier.program_quiet'),1,'reset');
  net('dispatch_start_to_gate_'+ci,ep('dispatch','admission_start'+ci+'_visible'),ep('global','dispatch_start'+ci),1,'dispatch');
  net('dispatch_reset_to_gate_'+ci,ep('dispatch','admission_reset'+ci+'_visible'),ep('global','dispatch_reset'+ci),1,'dispatch');
  net('qualified_start_'+ci,ep('global','core'+ci+'_start'),ep(c,'start_request'),1,'dispatch');
  net('qualified_warm_reset_'+ci,ep('global','core'+ci+'_reset'),ep(c,'reset_request'),1,'dispatch');
  net('dispatch_done_'+ci,ep(c,'front.state_onehot',[7]),ep('dispatch','core_done'+ci),1,'dispatch');
  net('dispatch_reset_ack_'+ci,endpoint(c,'reset_ack',null),ep('dispatch','core_ack'+ci),1,'reset');
  net('dispatch_mask_'+ci,ep('dispatch','core'+ci+'_payload_lane_mask'),ep(c,'front.lane_enable'),4,'dispatch');
  // The RF exposes the actual retained assignment source boundary.
  const blockPort=['block_id','block_id_input','assignment_block_id'].find(n=>C.core.ports.rf[n]);
  net('dispatch_block_'+ci,ep('dispatch','core'+ci+'_payload_block_id'),blockPort?ep(c,'rf.'+blockPort):endpoint(c,'retained_assignment_block_id',null),8,'dispatch');
 }
 // Global completion joins are intentionally not guessed from READY-low or state bits.
 for(const[name,src]of[['boot',ep('loader','loader.cold_initialize_request')],['raw_reset',ep('loader','config.global_reset')],['program_quiet',ep('loader','program.channel_quiet')]])net('global_'+name,src,ep('global',name),1,'global_control');
 for(let ci=0;ci<2;ci++){
  net('global_core_ack'+ci,endpoint('core'+ci,'reset_ack',null),ep('global','core_ack'+ci),1,'global_control');
  net('global_rf_admitted'+ci,ep('core'+ci,'rf.startup_admitted'),ep('global','rf_admitted'+ci),1,'global_control');
  net('global_alu_admitted'+ci,ep('core'+ci,'alu_startup.admission.state'),ep('global','alu_admitted'+ci),1,'global_control');
 }
 net('global_dispatch_admitted',ep('dispatch','admission_permit'),ep('global','dispatch_admitted'),1,'global_control');
 for(let b=0;b<4;b++)net('global_bank_quiet'+b,endpoint('loader','bank'+b+'_quiet_inversion_pending',null),ep('global','bank'+b+'_quiet'),1,'global_control');
 net('global_channel_quiet',endpoint('loader','global_channels_drained_producer_pending',null),ep('global','global_channels_quiet'),1,'global_control');
 net('raw_load_to_global',endpoint('loader','loader.load_request_fresh_isolated_tap',pos(C.loader.ports.loader.load_request),{fresh_output_tap_required:true}),ep('global','raw_load'),1,'global_control');
 net('global_memory_admission_block_to_loader',ep('global','memory_admission_block'),ep('loader','loader.memory_admission_block'),1,'global_control');
 net('global_initialized_to_loader',ep('global','cold_initialized'),ep('loader','loader.cold_initialized'),1,'global_control');
 net('global_cores_reset_to_loader',endpoint('global','both_core_reset_ack_join_pending',null),ep('loader','loader.cores_held_reset'),1,'global_control');
 net('global_drained_to_loader',endpoint('global','all_channels_drained_join_pending',null),ep('loader','loader.global_channels_drained'),1,'global_control');
 net('loader_start_to_gate',ep('loader','loader.start_admitted'),ep('global','loader_start'),1,'global_control');
 net('loader_reset_to_gate',ep('loader','loader.core_reset_request'),ep('global','loader_reset'),1,'global_control');
 net('qualified_dispatch_start',ep('global','dispatch_start'),ep('dispatch','sequence_predicate_start'),1,'global_control');
 net('dispatch_done_to_visible_gate',ep('dispatch','admission_done_visible'),ep('global','dispatch_done'),1,'global_control');
 for(let ci=0;ci<2;ci++)net('core_normal_permit_'+ci,ep('global','normal_permit'),ep('core'+ci,'front.normal_permit'),1,'global_control');
 const controls_pending=['global cold initialize distribution to dispatch/program/data/core cold paths','qualified global NEXT/CURRENT cadence source and far closure','core reset completion and rearm returns','global channel admission-pipeline quiet and bank quiet polarity joins'];
 const normalize={loader:0,core:0,dispatch:55,global:-63};
 const fixed={loader:{t:P(0,0,0),q:0},global:{t:P(-1000,-63,550),q:0}};
 const candidates=[
  {name:'north_serial_west_dispatch',core0:{t:P(-400,0,-1040),q:0},core1:{t:P(-400,0,-2560),q:0},dispatch:{t:P(-1712,55,-600),q:0}},
  {name:'north_parallel_west_dispatch',core0:{t:P(-400,0,-1040),q:0},core1:{t:P(2500,0,-1040),q:0},dispatch:{t:P(-1712,55,-600),q:0}},
  {name:'north_rotated_pair_west_dispatch',core0:{t:P(-378,0,-2720),q:1},core1:{t:P(1287,0,-978),q:3},dispatch:{t:P(-1712,55,-600),q:0}},
  {name:'north_serial_south_dispatch',core0:{t:P(-400,0,-1040),q:0},core1:{t:P(-400,0,-2560),q:0},dispatch:{t:P(0,55,2580),q:0}},
 ];
 function report(c){
  const transforms={...fixed,...Object.fromEntries(['core0','core1','dispatch'].map(n=>[n,c[n]]))};const boxes=Object.fromEntries(Object.entries(transforms).map(([n,t])=>[n,boxAt(C[n.startsWith('core')?'core':n].box,t)]));
  for(const[n,b]of Object.entries(boxes))assert(b.from.y>=-64&&b.to.y<=319,n+' height');
  let conflicts=[];const names=Object.keys(boxes);for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){let a=names[i],b=names[j];if(!apart(boxes[a],boxes[b])){if([a,b].includes('global')&&[a,b].includes('loader'))continue;conflicts.push([a,b]);}}
  const at=(i,p)=>add(rotate(p,transforms[i].q),transforms[i].t),groups={};let total=0,known=0,missing=0;
  const external=nets.map(n=>{const from=n.driver.positions?.map(p=>at(n.driver.instance,p))??null,to=n.sink.positions?.map(p=>at(n.sink.instance,p))??null;let distances=from&&to?from.map((p,i)=>axes.reduce((sum,a)=>sum+Math.abs(p[a]-to[i][a]),0)):null;
   if(distances){known+=n.width;let sum=distances.reduce((a,b)=>a+b,0);total+=sum;groups[n.scope]=(groups[n.scope]??0)+sum;}else missing+=n.width;
   return{...n,driver:{...n.driver,positions:from},sink:{...n.sink,positions:to},manhattan_endpoint_distance:distances};});
  const box=union(Object.values(boxes)),dx=box.to.x-box.from.x+1,dz=box.to.z-box.from.z+1;
  return{name:c.name,transforms,boxes,box,dimensions:P(dx,box.to.y-box.from.y+1,dz),envelope_area:dx*dz,component_box_conflicts:conflicts,mapped_component_blocks:C.loader.blocks+2*C.core.blocks+C.dispatch.blocks+C.global.blocks,external_bit_routes_known:known,external_bits_missing_endpoint:missing,endpoint_manhattan_sum:total,endpoint_manhattan_by_scope:groups,route_cost_status:'Not a routed block count. Endpoint Manhattan lengths are lower bounds; no layout is selected for density from them.',external};
 }
 const reports=candidates.map(report);for(const r of reports)assert.equal(r.component_box_conflicts.length,0,r.name);
 return{status:'provisional_component_frames_with_explicit_unrouted_interface_ledger',source_sha256:Object.fromEntries([...Object.values(files),'control-lsu-core-v1/memory-bindings.json'].map(f=>[prefix+f,sha(prefix+f)])),components,normalization:normalize,candidates:reports,selected_frame:'north_serial_west_dispatch',selection_scope:'Provisional routing work frame only; no complete-machine routing or efficiency selection.',shared_panel_copies:1,core_copies:2,controls_pending,complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=prepare();writeFileSync(new URL('placement.json',import.meta.url),JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify(d.candidates.map(({external,...r})=>r),null,2));}
