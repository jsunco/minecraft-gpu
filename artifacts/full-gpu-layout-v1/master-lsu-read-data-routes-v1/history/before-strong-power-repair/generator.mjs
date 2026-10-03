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
export function makeMasterLsuReadDataRoutes({cacheSearch=false}={}){
 const file=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/obstacles.json'),obstacles=JSON.parse(readFileSync(file)),map=new Map([...decodeSlice(obstacles)].map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 const hints=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/path-hints.json'))).paths;
 const planned=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/parents.json'))).planning_keepouts;const reserved=p=>planned.some(b=>['x','y','z'].every(a=>p[a]>=b[a][0]&&p[a]<=b[a][1]));
 const blocks=[],routes=[],edges=[],columns=[],descents=[],connections=[],borrowed_supports=[];let part='';
 const edge=(a,b)=>edges.push({from:a,to:b}),put=(p,id,properties)=>{assert(p.y>=-64&&p.y<=319);assert(!reserved(p),'Unbuilt write-data reservation '+K(p));assert(!map.has(K(p)),`Collision ${part} ${K(p)} ${map.get(K(p))?.part}`);const row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),row);blocks.push(row);};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,v)=>dev(p,'repeater',{facing:F[V.findIndex(d=>d.x===v.x&&d.z===v.z)],delay:'1'});
 function path(name,ps){
  part=name;for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];if(b.y>a.y)assert(!map.has(K({...a,y:a.y+1})),'Blocked authored ascent '+name+' '+K(a));if(b.y<a.y)assert(!map.has(K({...b,y:a.y})),'Blocked authored descent '+name+' '+K(b));}const eligible=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===ps.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(ps.length),'Unrefreshable '+name+' '+JSON.stringify(eligible.slice(1).map((j,i)=>[eligible[i],j]).filter(([a,b])=>b-a>13).map(([a,b])=>ps.slice(Math.max(0,a),Math.min(ps.length,b+1)))));const refresh=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.add(i);const early=eligible.find(i=>i>0&&i<ps.length-1&&i<=4);if(early!==undefined)refresh.add(early);
  for(const[i,p]of ps.entries()){if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal path collision '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.has(i)){const n=ps[i+1];rep(p,P(Math.sign(n.x-p.x),0,Math.sign(n.z-p.z)));}else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:[...refresh].sort((a,b)=>a-b)});if(cacheSearch){hints[name]=ps;writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/search-progress.json'),JSON.stringify({status:'unaccepted_path_candidates_revalidated_on_use',paths:hints})+'\n');}return ps.at(-1);
 }
 function line(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));const ps=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],d=b.map((v,i)=>v-a[i]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let n=1;n<=steps;n++)ps.push(P(...a.map((v,i)=>v+Math.sign(d[i])*n)));}return path(name,ps);}
 function isolatedRear(p,skip=[]){const exempt=new Set(skip.map(K));if(map.has(K(p))||map.has(K(P(p.x,p.y-1,p.z))))return false;for(const v of V)for(const dy of[-1,0,1]){const q=A(p,P(v.x,dy,v.z)),o=map.get(K(q));if(o&&!exempt.has(K(q))&&!o.block.id.endsWith('_concrete')&&(dy===0||o.block.id==='minecraft:redstone_wire'))return false;}if(map.get(K(P(p.x,p.y-2,p.z)))?.block.id==='minecraft:redstone_wire')return false;for(const q of[...V.map(v=>A(P(p.x,p.y-1,p.z),v)),P(p.x,p.y-2,p.z)])if(map.get(K(q))?.block.id==='minecraft:redstone_torch')return false;return true;}
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
 const reservations=new Map(),receiving=new Map();
 function reserve(name,p,id,properties){const key=K(p);assert(!map.has(key),'Reserved endpoint conflict '+name+' '+key);map.set(key,{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part:'reserved:'+name});if(!reservations.has(name))reservations.set(name,[]);reservations.get(name).push(key);}
 function reserveDevice(name,p,id,properties){reserve(name,P(p.x,p.y-1,p.z),'light_gray_concrete');reserve(name,p,id,properties);}
 for(let consumer=0;consumer<8;consumer++)for(let bit=0;bit<8;bit++){
  const core=Math.floor(consumer/4),lane=consumer%4,name=`lsu_${consumer}_read_data_${bit}`,net=ledger.nets.find(n=>n.name===`gpu/data_memory.read_data->gpu/core${core}/lane${lane}/lsu.read_data`),s=ret.read_data.positions[consumer*8+bit],t=net.sink.positions[bit],bottom=s.y;
  reserveDevice(name,P(s.x+1,s.y,s.z),'repeater',{facing:'west',delay:'1'});reserveDevice(name,P(s.x+2,s.y,s.z),'redstone_wire');for(let i=1;i<=s.y-bottom;i++)reserveDevice(name,P(s.x+2+i,s.y-i,s.z),'redstone_wire');
  const injection=P(t.x,t.y+1,t.z);let spec=null;for(const v of [V[0],V[3],V[1]]){const normalizer=A(injection,P(-v.x,0,-v.z)),rear=A(injection,P(-2*v.x,0,-2*v.z)),input=P(rear.x,rear.y+1,rear.z),cells=[injection,normalizer,P(normalizer.x,normalizer.y-1,normalizer.z),rear,input];if(cells.some(p=>map.has(K(p))))continue;
   let safe=true;for(const side of V)for(const dy of[-1,0,1]){const o=map.get(K(A(input,P(side.x,dy,side.z))));if(o&&!o.block.id.endsWith('_concrete')&&(dy===0||o.block.id==='minecraft:redstone_wire'))safe=false;}for(const side of V.filter(w=>w.x*v.x+w.z*v.z===0)){const o=map.get(K(A(normalizer,side)));if(o&&!o.block.id.endsWith('_concrete'))safe=false;}if(!safe)continue;spec={injection,normalizer,rear,input,v};break;}
  assert(spec,'No isolated upper receiving adapter '+name);receiving.set(name,spec);reserve(name,spec.injection,'light_gray_concrete');reserveDevice(name,spec.normalizer,'repeater',{facing:F[V.indexOf(spec.v)],delay:'1'});reserveDevice(name,spec.input,'redstone_wire');
 }
 for(const consumer of[7,6,5,4,3,2,1,0])for(const bit of[7,6,5,4,3,2,1,0]){
  const core=Math.floor(consumer/4),lane=consumer%4,name=`lsu_${consumer}_read_data_${bit}`,net=ledger.nets.find(n=>n.name===`gpu/data_memory.read_data->gpu/core${core}/lane${lane}/lsu.read_data`),s=ret.read_data.positions[consumer*8+bit],t=net.sink.positions[bit],level=252+4*bit,bottom=s.y;
  assert(net);for(const key of reservations.get(name))map.delete(key);assert.equal(map.get(K(s))?.block.id,'minecraft:redstone_wire');assert.equal(map.get(K(t))?.block.id,'minecraft:redstone_wire');
  part=name+'_tap';const tap=P(s.x+1,s.y,s.z),out=P(s.x+2,s.y,s.z);rep(tap,V[0]);wire(out);edge(s,tap);edge(tap,out);const low=P(out.x+s.y-bottom,bottom,out.z);line(name+'_source_drop',[[out.x,out.y,out.z],[low.x,low.y,low.z]]);
  let cx=null,cz=null;
  outer:for(let radius=12;radius<=320;radius+=4)for(const[dx,dz]of[[radius,0],[radius,radius],[radius,-radius],[-radius,radius],[-radius,-radius]]){
   const x=s.x+dx,z=s.z+dz;if(x<bounds[0]+8||x>bounds[1]-8||z<bounds[2]+8||z>bounds[3]-8)continue;let ok=true;
   for(let y=bottom;y<=level;y++)for(let xx=-1;xx<=1;xx++)for(let zz=-1;zz<=1;zz++){const o=map.get(K(P(x+xx,y,z+zz)));if(o&&(!xx&&!zz||!o.block.id.endsWith('_concrete')))ok=false;}
   for(let x2=x-2;x2<x;x2++)if(map.has(K(P(x2,bottom,z)))||map.has(K(P(x2,bottom-1,z))))ok=false;
   if(ok&&!isolatedRear(P(x-2,bottom,z),[low]))ok=false;if(ok&&!isolatedRear(P(x-3,bottom,z),[low]))ok=false;
   if(ok){cx=x;cz=z;break outer;}
  }
  assert(cx!==null,'No source lift '+name);part=name+'_column_driver';const driver=P(cx-1,bottom,cz),rear=P(cx-2,bottom,cz);rep(driver,V[0]);edge(rear,driver);edge(driver,P(cx,bottom,cz));const top=column(name+'_column',cx,cz,bottom,level);planar(name+'_source_feed',low,rear,{allowed:[driver],bounds});
  part=name+'_arrival';const rcv=receiving.get(name),normalizer=rcv.normalizer,arrival=rcv.input,rearSolid=rcv.rear,injection=rcv.injection;rep(normalizer,rcv.v);solid(injection);wire(arrival);edge(arrival,rearSolid);edge(rearSolid,normalizer);edge(normalizer,injection);edge(injection,t);borrowed_supports.push({source:normalizer,position:injection,destination:t});
  let point=null;const shape=makeSignalDescent({drop:level-arrival.y});
  search:for(let radius=40;radius<=280;radius+=8)for(const x of[t.x-radius,t.x+radius])for(let z=t.z-40;z>=t.z-300;z-=8){if(x<bounds[0]+16||x>bounds[1]-20||z<bounds[2]+20)continue;let ok=true;for(const c of shape.blocks){const q=A(P(x,level,z),c.position);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)if(map.has(K(P(q.x+dx,q.y+dy,q.z+dz))))ok=false;if(!ok)break;}if(ok){point=P(x,level,z);break search;}}
  assert(point,'No descent '+name);const dd=descent(name+'_descent',point,arrival.y);planar(name+'_flight',top,point,{bounds});planar(name+'_return',dd.position,arrival,{allowed:[normalizer],bounds});
  connections.push({name,consumer,core,lane,bit,source_instance:'loader',source_port:'read_data',source_bit:consumer*8+bit,source:s,source_normalizer:tap,destination_instance:'core'+core,destination_port:`lane${lane}.lsu.read_data`,destination_bit:bit,destination:t,normalizer,arrival_kind:'upper_solid_adapter',input_wire:arrival,rear_solid:rearSolid,injection_support:injection,semantics:'Actual owner-qualified memory response bit, retained through matching READY/withdrawal; data-versus-READY and far capture/closure timing remains required'});console.error(name+' drawn');
 }
 connections.sort((a,b)=>a.name.localeCompare(b.name));
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=blocks.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_lsu_memory_read_data_route_delta',blocks,box,routes,edges,columns,descents,connections,borrowed_supports,obstacle_path:file,source_bindings:obstacles.source_sha256,metrics:{added_blocks:blocks.length,actual_connections:connections.length,retained_state_bits:0},complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const d=makeMasterLsuReadDataRoutes({cacheSearch:process.argv.includes('--cache-search')});writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
