// Offline, delta-only routes in the frozen master frame. No parent generation or writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSlice} from '../artifacts/full-gpu-layout-v1/floorplan-v3/obstacles.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),V=[P(1,0,0),P(0,0,1),P(-1,0,0),P(0,0,-1)],F=['west','north','east','south'];
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function makeMasterLsuControlRoutesV2({cacheSearch=false}={}){
 const file=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/obstacles.json'),obstacles=JSON.parse(readFileSync(file)),map=new Map([...decodeSlice(obstacles)].map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 const hints=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/path-hints.json'))).paths;
 const planned=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/parents.json'))).planning_keepouts;const reserved=p=>planned.some(b=>['x','y','z'].every(a=>p[a]>=b[a][0]&&p[a]<=b[a][1]));
 const blocks=[],routes=[],edges=[],columns=[],descents=[],connections=[],borrowed_supports=[];let part='';
 const edge=(a,b)=>edges.push({from:a,to:b}),put=(p,id,properties)=>{assert(p.y>=-64&&p.y<=319);assert(!reserved(p),'Unbuilt write-data reservation '+K(p));assert(!map.has(K(p)),`Collision ${part} ${K(p)} ${map.get(K(p))?.part}`);const row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),row);blocks.push(row);};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,v)=>dev(p,'repeater',{facing:F[V.findIndex(d=>d.x===v.x&&d.z===v.z)],delay:'1'});
 function path(name,ps){
  part=name;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];if(b.y>a.y)assert(!map.has(K({...a,y:a.y+1})),'Blocked authored ascent '+name+' '+K(a));if(b.y<a.y)assert(!map.has(K({...b,y:a.y})),'Blocked authored descent '+name+' '+K(b));}const eligible=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===ps.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(ps.length),'Unrefreshable '+name+' '+JSON.stringify(eligible.slice(1).map((j,i)=>[eligible[i],j]).filter(([a,b])=>b-a>13).map(([a,b])=>ps.slice(Math.max(0,a),Math.min(ps.length,b+1)))));const refresh=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.add(i);const early=eligible.find(i=>i>0&&i<ps.length-1&&i<=4);if(early!==undefined)refresh.add(early);
  for(const[i,p]of ps.entries()){if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal path collision '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.has(i)){const n=ps[i+1];rep(p,P(Math.sign(n.x-p.x),0,Math.sign(n.z-p.z)));}else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:[...refresh].sort((a,b)=>a-b)});if(cacheSearch){hints[name]=ps;writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/search-progress.json'),JSON.stringify({status:'unaccepted_path_candidates_revalidated_on_use',paths:hints})+'\n');}return ps.at(-1);
 }
 function line(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));const ps=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],d=b.map((v,i)=>v-a[i]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let n=1;n<=steps;n++)ps.push(P(...a.map((v,i)=>v+Math.sign(d[i])*n)));}return path(name,ps);}
 function column(name,x,z,bottom,top){part=name;assert(top>bottom&&(top-bottom)%4===1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:top});return P(x,top,z);}
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const b of q.blocks)put(b.position,b.block.id.slice(10),b.block.properties);for(let i=1;i<d.path.length;i++)edge(A(p,d.path[i-1]),A(p,d.path[i]));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>A(p,v))});return q.ports.output.bits[0];}
 // Fixed-height search with a bounded three-level supported crossing fallback. Every actual step is retained and independently screened.
 function planar(name,start,target,{allowed=[],bounds=[-1445,-365,-3425,785],vertical=false}={}){
  assert.equal(start.y,target.y);const y=start.y,sk=K(start),tk=K(target),exempt=new Set([sk,tk,...allowed.map(K)]),cache=new Map();
  function free(x,z,yy=y){const p=P(x,yy,z),k=K(p);if(k===sk||k===tk)return true;if(cache.has(k))return cache.get(k);let ok=!reserved(p)&&!reserved(P(x,yy-1,z))&&yy>=Math.max(-63,y-3)&&yy<=Math.min(319,y+3)&&!map.has(k)&&!map.has(K(P(x,yy-1,z)))&&x>=bounds[0]&&x<=bounds[1]&&z>=bounds[2]&&z<=bounds[3];
   if(ok)for(const v of V)for(const dy of[-1,0,1]){const q=P(x+v.x,yy+dy,z+v.z),other=map.get(K(q));if(!other||[sk,tk].includes(K(q))||k===tk&&exempt.has(K(q))||other.block.id.endsWith('_concrete'))continue;if(dy&&other.block.id!=='minecraft:redstone_wire')continue;ok=false;}
   if(ok&&map.get(K(P(x,yy-2,z)))?.block.id==='minecraft:redstone_wire')ok=false; // Never cap an older wire.
   if(ok)for(const v of V){const q=P(x+v.x,yy,z+v.z),b=map.get(K(q));if(!b?.block.id.endsWith('_concrete'))continue;
    if(map.get(K(P(q.x,q.y+1,q.z)))?.block.id==='minecraft:redstone_torch')ok=false;
    for(let i=0;i<V.length;i++){const o=map.get(K(A(q,V[i])));if(o&&(['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i]||o.block.id==='minecraft:redstone_wall_torch'&&o.block.properties.facing===F[(i+2)%4]))ok=false;}
   }
   if(ok)for(let i=0;i<V.length;i++){const o=map.get(K(P(x+V[i].x,yy-1,z+V[i].z)));if(o&&['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i])ok=false;}
   if(ok)for(const q of [...V.map(v=>A(P(x,yy-1,z),v)),P(x,yy-2,z)]){const b=map.get(K(q));if(b?.block.id==='minecraft:redstone_torch'&&!exempt.has(K(q)))ok=false;}
   cache.set(k,ok);return ok;
  }
  const hint=hints[name];if(hint&&K(hint[0])===sk&&K(hint.at(-1))===tk&&hint.every(p=>free(p.x,p.z,p.y)))return path(name,hint);
  const heap=[],g=new Map([[sk,0]]),prev=new Map(),points=new Map([[sk,start]]);let serial=0;
  const push=o=>{heap.push(o);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<o.f||heap[p].f===o.f&&heap[p].n<o.n)break;heap[i]=heap[p];i=p;}heap[i]=o;};
  const pop=()=>{const o=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&(heap[j+1].f<heap[j].f||heap[j+1].f===heap[j].f&&heap[j+1].n<heap[j].n))j++;if(heap[j].f>last.f||heap[j].f===last.f&&heap[j].n>last.n)break;heap[i]=heap[j];i=j;}heap[i]=last;}return o;};
  const h=p=>1.15*(Math.abs(p.x-target.x)+Math.abs(p.z-target.z))+4*Math.abs(p.y-target.y);push({p:start,k:sk,g:0,f:h(start),n:serial++});let visits=0;
  while(heap.length){const cur=pop();if(cur.g!==g.get(cur.k))continue;if(cur.k===tk){const ps=[];for(let k=tk;k;k=prev.get(k))ps.push(points.get(k));ps.reverse();return path(name,ps);}if(++visits>=750000){if(!vertical&&(name.includes('_flight')||name.includes('_source_feed')||name.includes('_return'))){heap.length=0;g.clear();prev.clear();points.clear();cache.clear();return planar(name,start,target,{allowed,bounds,vertical:true});}throw new Error('Planar search limit '+name+' '+JSON.stringify({start,target,closest:[...points.values()].reduce((best,p)=>h(p)<h(best)?p:best,start),ends:[start,target].map(p=>V.map(v=>{const q=A(p,v);return {p:q,free:free(q.x,q.z,q.y)}}))}));}for(const v of(vertical?V.flatMap(v=>[-1,0,1].map(dy=>P(v.x,dy,v.z))):V)){const q=A(cur.p,v),k=K(q);if(!free(q.x,q.z,q.y))continue;if(v.y>0&&map.has(K(P(cur.p.x,cur.p.y+1,cur.p.z))))continue;if(v.y<0&&map.has(K(P(q.x,cur.p.y,q.z))))continue;const previous=points.get(prev.get(cur.k)),turn=previous&&(cur.p.x-previous.x!==v.x||cur.p.z-previous.z!==v.z);const cost=cur.g+1+4*Math.abs(v.y)+(turn?0.15:0);if(cost>=(g.get(k)??Infinity))continue;g.set(k,cost);prev.set(k,cur.k);points.set(k,q);push({p:q,k,g:cost,f:cost+h(q),n:serial++});}}
  if(!vertical&&(name.includes('_flight')||name.includes('_source_feed')||name.includes('_return')))return planar(name,start,target,{allowed,bounds,vertical:true});
  throw new Error('No planar route '+name+' '+JSON.stringify({start,target,visits,visited_box:Object.fromEntries(['x','z'].map(a=>[a,[[...points.values()].reduce((m,p)=>Math.min(m,p[a]),Infinity),[...points.values()].reduce((m,p)=>Math.max(m,p[a]),-Infinity)]])),ends:[start,target].map(p=>V.map(v=>{const q=A(p,v);return {p:q,free:free(q.x,q.z)}}))}));
 }
 const ledger=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/floorplan-v3/connections.json')));
 const ret=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/memory/consumer-return-v1/ports.json'))).ports;
 const bounds=[-308,1168,-2968,678];
 const reservations=new Map();
 function reserve(name,p,id,properties){const key=K(p),row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part:'reserved:'+name};if(map.has(key)){assert.equal(map.get(key).part,row.part,'Reserved endpoint conflict '+name+' '+key);assert.deepEqual(map.get(key).block,row.block);return;}map.set(key,row);if(!reservations.has(name))reservations.set(name,[]);reservations.get(name).push(key);}
 function reserveDevice(name,p,id,properties){reserve(name,P(p.x,p.y-1,p.z),'light_gray_concrete');reserve(name,p,id,properties);}
 for(let consumer=0;consumer<8;consumer++)for(const type of['drained','write_ready','read_ready','write_valid','read_valid']){
  const core=Math.floor(consumer/4),lane=consumer%4,isValid=type.endsWith('valid'),prefix=`gpu/core${core}/lane${lane}/lsu`,net=ledger.nets.find(n=>isValid?n.name===`${prefix}.${type}->gpu/data_memory.${type}`:n.name===`gpu/data_memory.${type==='drained'?'consumer_drained':type}->${prefix}.${type}`),name=`lsu_${consumer}_${type}`,sp=type.endsWith('ready')?ret[type].positions[consumer]:net.driver.positions[0],tp=net.sink.positions[0],sd=isValid?(type==='read_valid'?V[2]:V[0]):type==='drained'?V[1]:V[0],bottom=Math.floor(sp.y/4)*4-1,ly=isValid?sp.y:bottom;
  const tap=A(sp,sd),out=A(tap,sd);reserveDevice(name,tap,'repeater',{facing:F[V.indexOf(sd)],delay:'1'});reserveDevice(name,out,'redstone_wire');for(let i=1;i<=sp.y-ly;i++)reserveDevice(name,P(out.x+sd.x*i,sp.y-i,out.z+sd.z*i),'redstone_wire');
  const ad=isValid?(type==='read_valid'?V[0]:V[2]):V[3];reserveDevice(name,A(tp,P(-ad.x,0,-ad.z)),'repeater',{facing:F[V.indexOf(ad)],delay:'1'});reserveDevice(name,A(tp,P(-2*ad.x,0,-2*ad.z)),'redstone_wire');
 }
 for(const consumer of[7,6,5,4,3,2,1,0])for(const type of['drained','write_ready','read_ready','write_valid','read_valid']){
  const core=Math.floor(consumer/4),lane=consumer%4,isValid=type.endsWith('valid'),prefix=`gpu/core${core}/lane${lane}/lsu`,net=ledger.nets.find(n=>isValid?n.name===`${prefix}.${type}->gpu/data_memory.${type}`:n.name===`gpu/data_memory.${type==='drained'?'consumer_drained':type}->${prefix}.${type}`);
  assert(net,'Exact interface '+consumer+'/'+type);for(const key of reservations.get(`lsu_${consumer}_${type}`)??[])map.delete(key);
  const name=`lsu_${consumer}_${type}`,s=type.endsWith('ready')?ret[type].positions[consumer]:net.driver.positions[0],t=net.sink.positions[0],level=(type==='drained'&&consumer===1?296:(type==='drained'?288:284)+4*consumer),bottom=Math.floor(s.y/4)*4-1;
  assert.equal(map.get(K(s))?.block.id,'minecraft:redstone_wire');assert.equal(map.get(K(t))?.block.id,'minecraft:redstone_wire');
  const sd=isValid?(type==='read_valid'?V[2]:V[0]):type==='drained'?V[1]:V[0];
  part=name+'_tap';const tap=A(s,sd),out=A(tap,sd);rep(tap,sd);wire(out);edge(s,tap);edge(tap,out);
  const lowY=isValid?s.y:bottom,low=P(out.x+sd.x*(s.y-lowY),lowY,out.z+sd.z*(s.y-lowY));line(name+'_source_drop',[[out.x,out.y,out.z],[low.x,low.y,low.z]]);
  let cx=null,cz=null;
  outer:for(let radius=12;radius<=280;radius+=4)for(const [dx,dz]of[[sd.x*radius,sd.z*radius],[radius,radius],[-radius,radius],[radius,-radius],[-radius,-radius]]){
   const x=s.x+dx,z=s.z+dz;if(x<bounds[0]+8||x>bounds[1]-8||z<bounds[2]+8||z>bounds[3]-8)continue;let ok=true;
   for(let y=bottom;y<=level;y++)for(let xx=-1;xx<=1;xx++)for(let zz=-1;zz<=1;zz++){const o=map.get(K(P(x+xx,y,z+zz)));if(o&&(!xx&&!zz||!o.block.id.endsWith('_concrete')))ok=false;}
   for(let x2=x-2;x2<x;x2++)if(map.has(K(P(x2,bottom,z)))||map.has(K(P(x2,bottom-1,z))))ok=false;
   if(ok){cx=x;cz=z;break outer;}
  }
  assert(cx!==null,'No source lift '+name);part=name+'_column_driver';const driver=P(cx-1,bottom,cz),rear=P(cx-2,bottom,cz);rep(driver,V[0]);edge(rear,driver);edge(driver,P(cx,bottom,cz));const top=column(name+'_column',cx,cz,bottom,level);
  if(low.y!==rear.y){const highRear=P(rear.x-(low.y-rear.y),low.y,rear.z);line(name+'_column_feed_drop',[[highRear.x,highRear.y,highRear.z],[rear.x,rear.y,rear.z]]);planar(name+'_source_feed',low,highRear,{allowed:[driver],bounds});}else planar(name+'_source_feed',low,rear,{allowed:[driver],bounds});
  part=name+'_arrival';const ad=isValid?(type==='read_valid'?V[0]:V[2]):V[3],normalizer=A(t,P(-ad.x,0,-ad.z)),arrival=A(t,P(-2*ad.x,0,-2*ad.z));rep(normalizer,ad);edge(arrival,normalizer);edge(normalizer,t);
  let point=null;const shape=makeSignalDescent({drop:level-arrival.y});
  search:for(let radius=40;radius<=360;radius+=8)for(const x of[t.x+radius,t.x-radius])for(let z=t.z+40;z<=t.z+240;z+=8){if(x<bounds[0]+16||x>bounds[1]-20||z>bounds[3]-20)continue;let ok=true;for(const c of shape.blocks){const q=A(P(x,level,z),c.position);if(reserved(q)){ok=false;break;}for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)if(map.has(K(P(q.x+dx,q.y+dy,q.z+dz))))ok=false;if(!ok)break;}if(ok){point=P(x,level,z);break search;}}
  assert(point,'No descent '+name);const dd=descent(name+'_descent',point,arrival.y);
  planar(name+'_flight',top,point,{bounds});planar(name+'_return',dd.position,arrival,{allowed:[normalizer],bounds});
  connections.push({name,consumer,core,lane,type,source_instance:isValid?'core'+core:'loader',source_port:net.driver.port,source_bit:isValid?0:consumer,source:s,source_normalizer:tap,destination_instance:isValid?'loader':'core'+core,destination_port:net.sink.port,destination_bit:isValid?consumer:0,destination:t,normalizer,semantics:isValid?'owned LSU VALID; retained source held through READY and actual drain, no admission cancellation':'owner-qualified memory response/drain; route latency must be included in held handshake closure'});console.error(name+' drawn');
 }
 connections.sort((a,b)=>a.name.localeCompare(b.name));
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=blocks.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_lsu_memory_handshake_route_delta',blocks,box,routes,edges,columns,descents,connections,borrowed_supports,obstacle_path:file,source_bindings:obstacles.source_sha256,metrics:{added_blocks:blocks.length,actual_connections:connections.length,retained_state_bits:0},complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const d=makeMasterLsuControlRoutesV2({cacheSearch:process.argv.includes('--cache-search')});writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
