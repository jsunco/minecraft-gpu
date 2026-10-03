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
export function makeMasterCoreCommandRoutes(){
 const file=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-core-command-routes-v1/obstacles.json'),obstacles=JSON.parse(readFileSync(file)),map=new Map([...decodeSlice(obstacles)].map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 const blocks=[],routes=[],edges=[],columns=[],descents=[],connections=[],borrowed_supports=[];let part='';
 const edge=(a,b)=>edges.push({from:a,to:b}),put=(p,id,properties)=>{assert(p.y>=-64&&p.y<=319);assert(!map.has(K(p)),`Collision ${part} ${K(p)} ${map.get(K(p))?.part}`);const row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),row);blocks.push(row);};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,v)=>dev(p,'repeater',{facing:F[V.findIndex(d=>d.x===v.x&&d.z===v.z)],delay:'1'});
 function path(name,ps){
  part=name;const eligible=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===ps.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(ps.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.add(i);const early=eligible.find(i=>i>0&&i<ps.length-1&&i<=4);if(early!==undefined)refresh.add(early);
  for(const[i,p]of ps.entries()){if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal path collision '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.has(i)){const n=ps[i+1];rep(p,P(Math.sign(n.x-p.x),0,Math.sign(n.z-p.z)));}else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:[...refresh].sort((a,b)=>a-b)});return ps.at(-1);
 }
 function line(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));const ps=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],d=b.map((v,i)=>v-a[i]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let n=1;n<=steps;n++)ps.push(P(...a.map((v,i)=>v+Math.sign(d[i])*n)));}return path(name,ps);}
 function column(name,x,z,bottom,top){part=name;assert(top>bottom&&(top-bottom)%4===1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:top});return P(x,top,z);}
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const b of q.blocks)put(b.position,b.block.id.slice(10),b.block.properties);for(let i=1;i<d.path.length;i++)edge(A(p,d.path[i-1]),A(p,d.path[i]));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>A(p,v))});return q.ports.output.bits[0];}
 // Fixed-height search only; its complete actual path is retained and independently screened.
 function planar(name,start,target,{allowed=[],bounds=[-1445,-365,-3425,785]}={}){
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
 const ledger=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/floorplan-v3/connections.json')));
 for(const index of [3,2,1,0]){
  const core=index>>1,kind=index%2?'qualified_warm_reset_':'qualified_start_',net=ledger.nets.find(n=>n.name===kind+core),name=net.name,s=net.driver.positions[0],t=net.sink.positions[0],level=300,bottom=103;
  part=name+'_tap';const tap=A(s,V[1]),out=A(tap,V[1]);rep(tap,V[1]);wire(out);edge(s,tap);edge(tap,out);
  const low=P(out.x,bottom,out.z+(s.y-bottom));line(name+'_source_drop',[[out.x,out.y,out.z],[low.x,low.y,low.z]]);
  let cx=null,cz=null;
  outer:for(let radius=12;radius<=240;radius+=4)for(const [dx,dz]of[[0,radius],[radius,0],[-radius,0],[radius,radius],[-radius,radius]]){
   const x=s.x+dx,z=s.z+dz;if(x<-1440||x>-370||z>780)continue;let ok=true;for(let y=bottom;y<=level;y++)for(let xx=-1;xx<=1;xx++)for(let zz=-1;zz<=1;zz++){const o=map.get(K(P(x+xx,y,z+zz)));if(o&&(!xx&&!zz||!o.block.id.endsWith('_concrete')))ok=false;}
   for(let x2=x-2;x2<x;x2++)if(map.has(K(P(x2,bottom,z)))||map.has(K(P(x2,bottom-1,z))))ok=false;
   if(ok){cx=x;cz=z;break outer;}
  }
  assert(cx!==null,'No source lift '+name);part=name+'_column_driver';const driver=P(cx-1,bottom,cz),rear=P(cx-2,bottom,cz);rep(driver,V[0]);edge(rear,driver);edge(driver,P(cx,bottom,cz));const top=column(name+'_column',cx,cz,bottom,level);
  planar(name+'_source_feed',low,rear,{allowed:[driver]});
  part=name+'_arrival';const normalizer=P(t.x,t.y,t.z-1),arrival=P(t.x,t.y,t.z-2);rep(normalizer,V[1]);edge(arrival,normalizer);edge(normalizer,t);
  let point=null;const shape=makeSignalDescent({drop:level-t.y});
  search:for(let x=-1100-24*index;x>=-1400;x-=8)for(let z=t.z-40;z>=t.z-160;z-=8){let ok=true;for(const c of shape.blocks){const q=A(P(x,level,z),c.position);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)if(map.has(K(P(q.x+dx,q.y+dy,q.z+dz))))ok=false;if(!ok)break;}if(ok){point=P(x,level,z);break search;}}
  assert(point,'No descent '+name);const dd=descent(name+'_descent',point,t.y);
  planar(name+'_flight',top,point);
  planar(name+'_return',dd.position,arrival,{allowed:[normalizer]});
  connections.push({name,source_instance:'global',source_port:net.driver.port,source_bit:0,source:s,source_normalizer:tap,destination_instance:net.sink.instance,destination_port:net.sink.port,destination_bit:0,destination:t,normalizer,semantics:index%2?'staged warm reset request; never raw local initialize':'qualified held launch request; payload setup remains separate'});
 }
 connections.sort((a,b)=>a.source.x-b.source.x);
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=blocks.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_four_core_start_reset_command_route_delta',blocks,box,routes,edges,columns,descents,connections,borrowed_supports,obstacle_path:file,source_bindings:obstacles.source_sha256,metrics:{added_blocks:blocks.length,actual_connections:connections.length,retained_state_bits:0},complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const d=makeMasterCoreCommandRoutes();writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-core-command-routes-v1/design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
