// Offline, delta-only routes in the frozen master frame. No parent generation or writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSlice} from '../artifacts/full-gpu-layout-v1/floorplan-v2/obstacles.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),V=[P(1,0,0),P(0,0,1),P(-1,0,0),P(0,0,-1)],F=['west','north','east','south'];
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function makeMasterLoaderControlRoutes(){
 const file=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-loader-control-routes-v1/obstacles.json'),obstacles=JSON.parse(readFileSync(file)),map=new Map([...decodeSlice(obstacles)].map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 const blocks=[],routes=[],edges=[],columns=[],descents=[],connections=[],borrowed_supports=[];let part='';
 const edge=(a,b)=>edges.push({from:a,to:b}),put=(p,id,properties)=>{assert(p.y>=-64&&p.y<=319);assert(!map.has(K(p)),`Collision ${part} ${K(p)} ${map.get(K(p))?.part}`);const row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),row);blocks.push(row);};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,v)=>dev(p,'repeater',{facing:F[V.findIndex(d=>d.x===v.x&&d.z===v.z)],delay:'1'});
 function path(name,ps){
  part=name;const eligible=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===ps.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(ps.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.add(i);
  for(const[i,p]of ps.entries()){if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal path collision '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.has(i)){const n=ps[i+1];rep(p,P(Math.sign(n.x-p.x),0,Math.sign(n.z-p.z)));}else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:[...refresh].sort((a,b)=>a-b)});return ps.at(-1);
 }
 function line(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));const ps=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],d=b.map((v,i)=>v-a[i]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let n=1;n<=steps;n++)ps.push(P(...a.map((v,i)=>v+Math.sign(d[i])*n)));}return path(name,ps);}
 function column(name,x,z,bottom,top){part=name;assert(top>bottom&&(top-bottom)%4===1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:top});return P(x,top,z);}
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const b of q.blocks)put(b.position,b.block.id.slice(10),b.block.properties);for(let i=1;i<d.path.length;i++)edge(A(p,d.path[i-1]),A(p,d.path[i]));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>A(p,v))});return q.ports.output.bits[0];}
 // Fixed-height search only; its complete actual path is retained and independently screened.
 function planar(name,start,target,{allowed=[],bounds=[-2520,1080,-1160,1060]}={}){
  assert.equal(start.y,target.y);const y=start.y,sk=K(start),tk=K(target),exempt=new Set([sk,tk,...allowed.map(K)]),cache=new Map();
  function free(x,z){const p=P(x,y,z),k=K(p);if(k===sk||k===tk)return true;if(cache.has(k))return cache.get(k);let ok=!map.has(k)&&!map.has(K(P(x,y-1,z)))&&x>=bounds[0]&&x<=bounds[1]&&z>=bounds[2]&&z<=bounds[3];
   if(ok)for(const v of V)for(const dy of[-1,0,1]){const q=P(x+v.x,y+dy,z+v.z),other=map.get(K(q));if(!other||[sk,tk].includes(K(q))||k===tk&&exempt.has(K(q))||other.block.id.endsWith('_concrete'))continue;if(dy&&other.block.id!=='minecraft:redstone_wire')continue;ok=false;}
   if(ok&&map.get(K(P(x,y-2,z)))?.block.id==='minecraft:redstone_wire')ok=false; // Never cap an older wire.
   if(ok)for(const v of V){const q=P(x+v.x,y,z+v.z),b=map.get(K(q));if(!b?.block.id.endsWith('_concrete'))continue;
    if(map.get(K(P(q.x,q.y+1,q.z)))?.block.id==='minecraft:redstone_torch')ok=false;
    for(let i=0;i<V.length;i++){const o=map.get(K(A(q,V[i])));if(o&&(['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i]||o.block.id==='minecraft:redstone_wall_torch'&&o.block.properties.facing===F[(i+2)%4]))ok=false;}
   }
   if(ok)for(let i=0;i<V.length;i++){const o=map.get(K(P(x+V[i].x,y-1,z+V[i].z)));if(o&&['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i])ok=false;}
   if(ok)for(const q of [...V.map(v=>A(P(x,y-1,z),v)),P(x,y-2,z)]){const b=map.get(K(q));if(b?.block.id==='minecraft:redstone_torch'&&!exempt.has(K(q)))ok=false;}
   cache.set(k,ok);return ok;
  }
  const heap=[],g=new Map([[sk,0]]),prev=new Map(),points=new Map([[sk,start]]);let serial=0;
  const push=o=>{heap.push(o);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<o.f||heap[p].f===o.f&&heap[p].n<o.n)break;heap[i]=heap[p];i=p;}heap[i]=o;};
  const pop=()=>{const o=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&(heap[j+1].f<heap[j].f||heap[j+1].f===heap[j].f&&heap[j+1].n<heap[j].n))j++;if(heap[j].f>last.f||heap[j].f===last.f&&heap[j].n>last.n)break;heap[i]=heap[j];i=j;}heap[i]=last;}return o;};
  const h=p=>1.15*(Math.abs(p.x-target.x)+Math.abs(p.z-target.z));push({p:start,k:sk,g:0,f:h(start),n:serial++});let visits=0;
  while(heap.length){const cur=pop();if(cur.g!==g.get(cur.k))continue;if(cur.k===tk){const ps=[];for(let k=tk;k;k=prev.get(k))ps.push(points.get(k));ps.reverse();return path(name,ps);}assert(++visits<750000,'Planar search limit '+name);for(const v of V){const q=A(cur.p,v),k=K(q);if(!free(q.x,q.z))continue;const cost=cur.g+1;if(cost>=(g.get(k)??Infinity))continue;g.set(k,cost);prev.set(k,cur.k);points.set(k,q);push({p:q,k,g:cost,f:cost+h(q),n:serial++});}}
  throw new Error('No planar route '+name);
 }
 const placement=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/floorplan-v2/placement.json'))),dcr=placement.candidates[0].external.find(n=>n.name==='dcr_thread_count');
 for(let bit=0;bit<8;bit++){
  const name='dcr_thread_count_'+bit,s=dcr.driver.positions[bit],t=dcr.sink.positions[bit],v=bit<2?V[1]:dcr.sink.declared_bits[bit].travel,level=248+4*bit;
  const cx=Array.from({length:50},(_,i)=>-380+4*i).find(x=>{for(let y=3;y<=level;y++)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const o=map.get(K(P(x+dx,y,s.z+dz)));if(o&&(!dx&&!dz||!o.block.id.endsWith('_concrete')))return false;}return true;});assert(cx!==undefined,'No clear source column '+name);
  part=name+'_tap';const tap=P(s.x+1,s.y,s.z),start=P(s.x+2,s.y,s.z);rep(tap,V[0]);wire(start);edge(s,tap);edge(tap,start);
  line(name+'_source',[[start.x,start.y,start.z],[start.x+1,3,start.z],[cx-2,3,start.z]]);part=name+'_column_driver';const driver=P(cx-1,3,s.z);rep(driver,V[0]);edge(P(cx-2,3,s.z),driver);edge(driver,P(cx,3,s.z));const top=column(name+'_column',cx,s.z,3,level);
  const dd=descent(name+'_descent',P(-2490,level,-360-16*bit),t.y);line(name+'_flight',[[top.x,top.y,top.z],[-2490,level,top.z],[-2490,level,-360-16*bit]]);
  const normalizer=P(t.x-v.x,t.y,t.z-v.z),arrival=P(t.x-2*v.x,t.y,t.z-2*v.z);part=name+'_arrival';rep(normalizer,v);edge(arrival,normalizer);edge(normalizer,t);
  planar(name+'_return',dd.position,arrival,{allowed:[normalizer],bounds:[-2520,-1700,-500,-170]});
  connections.push({name,source_instance:'loader',source_port:'config.thread_count',source_bit:bit,source:s,destination_instance:'dispatch',destination_port:'thread_count',destination_bit:bit,destination:t,normalizer});
 }
 const liftCache=new Map();
 function liftControl(name,s,travel,topY){
  if(liftCache.has(K(s)))return liftCache.get(K(s));
  part=name+'_tap';const tap=A(s,travel),out=A(tap,travel);rep(tap,travel);edge(s,tap);edge(tap,out);
  if(s.y===88&&[-306,-308,-314].includes(s.x)){const top=column(name+'_direct_column',out.x,out.z,s.y,topY+1);liftCache.set(K(s),top);return top;}
  wire(out);
  let bottom=s.y;do{bottom--;}while(((bottom%4)+4)%4!==3);const low=P(out.x+travel.x*(s.y-bottom),bottom,out.z+travel.z*(s.y-bottom));line(name+'_source_drop',[[out.x,out.y,out.z],[low.x,low.y,low.z]]);
  const candidates=[];for(let ring=12;ring<=120;ring+=4)for(const [dx,dz]of[[travel.x*ring,travel.z*ring],[ring,0],[ring,12],[ring,-12],[0,ring],[0,-ring],[-ring,0]])candidates.push(P(s.x+dx,bottom,s.z+dz));
  const c=candidates.find(c=>{for(let y=bottom;y<=topY;y++)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const o=map.get(K(P(c.x+dx,y,c.z+dz)));if(o&&(!dx&&!dz||!o.block.id.endsWith('_concrete')))return false;}for(let x=c.x-2;x<c.x;x++)if(map.has(K(P(x,bottom,c.z)))||map.has(K(P(x,bottom-1,c.z))))return false;return true;});assert(c,'No control column '+name);
  part=name+'_column_driver';const driver=P(c.x-1,bottom,c.z),rear=P(c.x-2,bottom,c.z);rep(driver,V[0]);edge(rear,driver);edge(driver,c);const top=column(name+'_column',c.x,c.z,bottom,topY);
  planar(name+'_source_feed',low,rear,{allowed:[driver]});liftCache.set(K(s),top);return top;
 }
 const controls=['global_boot','global_raw_reset','global_program_quiet','raw_load_to_global','loader_start_to_gate','loader_reset_to_gate','global_memory_admission_block_to_loader','global_initialized_to_loader','global_channel_quiet','global_drained_to_loader'].map(n=>placement.candidates[0].external.find(r=>r.name===n));
 const dispatchCold=placement.components.dispatch.ports.startup_initialize_request.bits[0],gCold=placement.components.global.ports.cold_initialize.bits[0];
 controls.push({name:'global_cold_initialize_dispatch',driver:{instance:'global',port:'cold_initialize',positions:[A(gCold.position,P(-1000,-55,550))],declared_bits:[gCold]},sink:{instance:'dispatch',port:'startup_initialize_request',positions:[A(dispatchCold.position,P(-1712,55,-600))],declared_bits:[dispatchCold]}});
 const tops=controls.map((n,i)=>{const name=n.name,s=n.driver.positions[0],sourceTravel=name==='global_raw_reset'?V[2]:name==='global_program_quiet'?V[0]:n.driver.declared_bits?.[0]?.travel??(name==='raw_load_to_global'?V[3]:V[1]);return liftControl(name,s,sourceTravel,200+4*i);});
 assert.deepEqual(tops[8],tops[9]);
 for(const[i,n]of controls.entries()){
  const name=n.name,s=n.driver.positions[0],t=n.sink.positions[0],under=n.sink.instance==='loader'&&t.x===-372;let top=tops[i];
  if(name==='global_drained_to_loader'){
   const prior=routes.find(r=>r.name==='global_channel_quiet_flight').path;
   const choices=prior.filter((p,j)=>j>0&&j<prior.length-1&&map.get(K(p)).block.id==='minecraft:redstone_wire'&&prior[j-1].z===p.z&&prior[j+1].z===p.z&&[1,2].every(d=>!map.has(K(P(p.x,p.y,p.z+d)))&&!map.has(K(P(p.x,p.y-1,p.z+d))))).sort((a,b)=>(Math.abs(a.x+240)+Math.abs(a.z-868))-(Math.abs(b.x+240)+Math.abs(b.z-868)));
   assert(choices.length,'No isolated quiet cable branch');const branch=choices[0],diode=A(branch,V[1]),out=A(diode,V[1]);part=name+'_branch';rep(diode,V[1]);wire(out);edge(branch,diode);edge(diode,out);top=out;
  }
  let normalizer,arrival,endY,arrivalTravel;
  if(under){
   endY=t.y-5;part=name+'_underpad';for(let y=endY;y<t.y-1;y++)if((y-endY)%2===0)solid(P(t.x,y,t.z));else put(P(t.x,y,t.z),'redstone_torch');
   assert.equal(map.get(K(P(t.x,t.y-1,t.z)))?.block.id,'minecraft:light_gray_concrete');assert.equal(map.get(K(t))?.block.id,'minecraft:redstone_wire');borrowed_supports.push({name,position:P(t.x,t.y-1,t.z),source:P(t.x,t.y-2,t.z),destination:t});columns.push({name:name+'_underpad',x:t.x,z:t.z,bottom:endY,output_y:t.y,borrowed_top:true});
   arrivalTravel=V[0];normalizer=P(t.x-1,endY,t.z);arrival=P(t.x-2,endY,t.z);part=name+'_arrival';rep(normalizer,arrivalTravel);edge(arrival,normalizer);edge(normalizer,P(t.x,endY,t.z));
  }else{
   endY=t.y;arrivalTravel=n.sink.declared_bits?.[0]?.travel??V[0];normalizer=P(t.x-arrivalTravel.x,t.y,t.z-arrivalTravel.z);arrival=P(t.x-2*arrivalTravel.x,t.y,t.z-2*arrivalTravel.z);part=name+'_arrival';rep(normalizer,arrivalTravel);edge(arrival,normalizer);edge(normalizer,t);
  }
  if(n.sink.instance==='loader'&&!under){const low=arrival;endY=t.y+3;arrival=P(low.x,endY,low.z+3);line(name+'_arrival_stair',[[arrival.x,arrival.y,arrival.z],[low.x,low.y,low.z]]);if(t.x===-288){part=name+'_arrival_cap';solid({...arrival,y:arrival.y+1});}}
  const candidate=name==='global_cold_initialize_dispatch'?P(-2420,top.y,-900):name==='global_boot'?P(-850,top.y,500):name==='loader_start_to_gate'?P(-600,top.y,470):name==='loader_reset_to_gate'?P(-580,top.y,480):n.sink.instance==='loader'?P(-240,top.y,760+12*i):P(-1220,top.y,180-16*i);
  assert(top.y>endY,'Control source lift must exceed destination');const dd=descent(name+'_descent',candidate,endY);
  planar(name+'_flight',top,candidate);
  planar(name+'_return',dd.position,arrival,{allowed:[normalizer]});
  connections.push({name,source_instance:n.driver.instance,source_port:n.driver.port,source:s,destination_instance:n.sink.instance,destination_port:n.sink.port,destination:t,normalizer,...(under?{arrival_kind:'positive_torch_underpad',injection_support:P(t.x,t.y-1,t.z)}:{})});
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=blocks.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'draft_master_loader_control_routes',blocks,box,routes,edges,columns,descents,connections,borrowed_supports,obstacle_path:file,source_bindings:obstacles.source_sha256,metrics:{added_blocks:blocks.length,actual_connections:connections.length,retained_state_bits:0},complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const d=makeMasterLoaderControlRoutes();writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-loader-control-routes-v1/design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
