// Offline, delta-only routes in the frozen master frame. No parent generation or writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSlice} from '../artifacts/full-gpu-layout-v1/floorplan-v3/obstacles.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),V=[P(1,0,0),P(0,0,1),P(-1,0,0),P(0,0,-1)],F=['west','north','east','south'];
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const isEntry=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
export function makeMasterLsuAddressRoutes(){
 const file=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-address-routes-v1/obstacles.json'),obstacles=JSON.parse(readFileSync(file)),map=new Map([...decodeSlice(obstacles)].map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 const cachePath=resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-address-routes-v1/authored-planar-paths.json');const savedCache=existsSync(cachePath)?JSON.parse(readFileSync(cachePath)):null;const savedPaths=savedCache&&JSON.stringify(savedCache.source_bindings)===JSON.stringify(obstacles.source_sha256)?savedCache.paths:{};const authoredPaths={};
 const blocks=[],routes=[],edges=[],columns=[],descents=[],connections=[],borrowed_supports=[];let part='',activeNet='';const futureArrivals=new Map();for(let c=0;c<8;c++)for(let b=0;b<8;b++)for(let x=613;x<=934;x++)for(let z=-8+8*b;z<=-4+8*b;z++)for(let y=2+4*c;y<=4+4*c;y++){const k=K(P(x,y,z));if(!futureArrivals.has(k))futureArrivals.set(k,new Set());futureArrivals.get(k).add('lsu_address_c'+c+'_b'+b);}
 const edge=(a,b)=>edges.push({from:a,to:b}),put=(p,id,properties)=>{assert(p.y>=-64&&p.y<=319);assert(!map.has(K(p)),`Collision ${part} ${K(p)} ${map.get(K(p))?.part}`);const row={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),row);blocks.push(row);};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,v)=>dev(p,'repeater',{facing:F[V.findIndex(d=>d.x===v.x&&d.z===v.z)],delay:'1'});
 function path(name,ps){
  part=name;const eligible=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],b=ps[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(ps.length);
  const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===ps.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}if(!prev.has(ps.length)){let gap=[0,ps.length-1];for(let j=1;j<eligible.length;j++)if(eligible[j]-eligible[j-1]>13){gap=[Math.max(0,eligible[j-1]),Math.min(ps.length-1,eligible[j])];break;}const e=Error('Unrefreshable '+name);e.retryCell=K(ps[Math.max(1,Math.min(ps.length-2,Math.floor((gap[0]+gap[1])/2)))]);throw e;}const refresh=new Set();for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.add(i);const early=eligible.find(i=>i>0&&i<ps.length-1&&i<=4);if(early!==undefined)refresh.add(early);
  for(const[i,p]of ps.entries()){if(map.has(K(p))){assert(i===0||i===ps.length-1,'Internal path collision '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire');}else if(refresh.has(i)){const n=ps[i+1];rep(p,P(Math.sign(n.x-p.x),0,Math.sign(n.z-p.z)));}else wire(p);if(i)edge(ps[i-1],p);}routes.push({name,path:ps,refresh_indices:[...refresh].sort((a,b)=>a-b)});return ps.at(-1);
 }
 function line(name,ws){ws=ws.filter((p,i)=>!i||p.some((v,k)=>v!==ws[i-1][k]));const ps=[P(...ws[0])];for(let j=1;j<ws.length;j++){const a=ws[j-1],b=ws[j],d=b.map((v,i)=>v-a[i]),steps=Math.abs(d[0])+Math.abs(d[2]);assert(steps&&(!d[0]||!d[2])&&(!d[1]||Math.abs(d[1])===steps));for(let n=1;n<=steps;n++)ps.push(P(...a.map((v,i)=>v+Math.sign(d[i])*n)));}return path(name,ps);}
 function column(name,x,z,bottom,top){part=name;assert(top>bottom&&(top-bottom)%4===1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:top});return P(x,top,z);}
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const b of q.blocks)put(b.position,b.block.id.slice(10),b.block.properties);for(let i=1;i<d.path.length;i++)edge(A(p,d.path[i-1]),A(p,d.path[i]));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>A(p,v))});return q.ports.output.bits[0];}
 // Bounded-height search; complete paths are retained and independently screened.
 function planarAttempt(name,start,target,{allowed=[],bounds=[-1445,-365,-3425,785],lift=0,banned=new Set()}={}){
  assert.equal(start.y,target.y);const y=start.y,sk=K(start),tk=K(target),exempt=new Set([sk,tk,...allowed.map(K)]),cache=new Map();
  function free(p){const{x,y,z}=p,k=K(p);if(y<-63||y>318||y<start.y-lift||y>start.y+lift)return false;if((x===start.x&&z===start.z&&y!==start.y)||(x===target.x&&z===target.z&&y!==target.y))return false;if(banned.has(k))return false;if(k===sk||k===tk)return true;if(cache.has(k))return cache.get(k);if(futureArrivals.has(k)&&[...futureArrivals.get(k)].some(n=>n!==activeNet))return false;let ok=!map.has(k)&&!map.has(K(P(x,y-1,z)))&&x>=bounds[0]&&x<=bounds[1]&&z>=bounds[2]&&z<=bounds[3];
   if(ok)for(const v of V)for(const dy of[-1,0,1]){const q=P(x+v.x,y+dy,z+v.z),other=map.get(K(q));if(!other||[sk,tk].includes(K(q))||k===tk&&exempt.has(K(q))||other.block.id.endsWith('_concrete'))continue;if(dy&&other.block.id!=='minecraft:redstone_wire')continue;ok=false;}
   if(ok&&map.get(K(P(x,y-2,z)))?.block.id==='minecraft:redstone_wire'){for(const v of V)if(map.get(K(P(x+v.x,y-1,z+v.z)))?.block.id==='minecraft:redstone_wire')ok=false;} // A flat-wire overpass is allowed only when no inherited rising step can be capped; full old-neighbor graph is rechecked independently.
   if(ok)for(const v of V){const q=P(x+v.x,y,z+v.z),b=map.get(K(q));if(!b?.block.id.endsWith('_concrete'))continue;
    if(map.get(K(P(q.x,q.y+1,q.z)))?.block.id==='minecraft:redstone_torch')ok=false;
    for(let i=0;i<V.length;i++){const o=map.get(K(A(q,V[i])));if(o&&(['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i]||o.block.id==='minecraft:redstone_wall_torch'&&o.block.properties.facing===F[(i+2)%4]))ok=false;}
   }
   if(ok)for(let i=0;i<V.length;i++){const o=map.get(K(P(x+V[i].x,y-1,z+V[i].z)));if(o&&['minecraft:repeater','minecraft:comparator'].includes(o.block.id)&&o.block.properties.facing===F[i])ok=false;}
   if(ok)for(const q of [...V.map(v=>A(P(x,y-1,z),v)),P(x,y-2,z)]){const b=map.get(K(q));if(b?.block.id==='minecraft:redstone_torch'&&!exempt.has(K(q)))ok=false;}
   cache.set(k,ok);return ok;
  }
  const saved=savedPaths[name];if(saved&&saved.length&&K(saved[0])===sk&&K(saved.at(-1))===tk&&saved.every((p,i)=>free(p)&&(!i||(Math.abs(p.x-saved[i-1].x)+Math.abs(p.z-saved[i-1].z)===1&&Math.abs(p.y-saved[i-1].y)<=1))))return path(name,saved);
  const heap=[],g=new Map([[sk,0]]),prev=new Map(),points=new Map([[sk,start]]);let serial=0;
  const push=o=>{heap.push(o);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<o.f||heap[p].f===o.f&&heap[p].n<o.n)break;heap[i]=heap[p];i=p;}heap[i]=o;};
  const pop=()=>{const o=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let j=2*i+1;if(j+1<heap.length&&(heap[j+1].f<heap[j].f||heap[j+1].f===heap[j].f&&heap[j+1].n<heap[j].n))j++;if(heap[j].f>last.f||heap[j].f===last.f&&heap[j].n>last.n)break;heap[i]=heap[j];i=j;}heap[i]=last;}return o;};
  const h=p=>1.6*(Math.abs(p.x-target.x)+Math.abs(p.z-target.z)+Math.abs(p.y-target.y));push({p:start,k:sk,g:0,f:h(start),n:serial++});let visits=0;
  while(heap.length){const cur=pop();if(cur.g!==g.get(cur.k))continue;if(cur.k===tk){const ps=[];for(let k=tk;k;k=prev.get(k))ps.push(points.get(k));ps.reverse();const positions=new Map(ps.map((p,i)=>[K(p),i]));for(let i=0;i<ps.length;i++){const p=ps[i],below=K(P(p.x,p.y-1,p.z));if(positions.has(below)){const e=Error('Self support overlap '+name);e.retryCell=[sk,tk].includes(K(p))?below:K(p);throw e;}}const planned=new Map();for(const p of ps){planned.set(K(p),p);planned.set(K(P(p.x,p.y-1,p.z)),p);}for(let i=1;i<ps.length;i++)if(ps[i].y!==ps[i-1].y){const low=ps[i].y<ps[i-1].y?ps[i]:ps[i-1],cap=planned.get(K(P(low.x,low.y+1,low.z)));if(cap){const e=Error('Self capped slope '+name);e.retryCell=K(cap);throw e;}}return path(name,ps);}if(++visits>=1250000){writeFileSync('/tmp/tinygpu-lsu-address-target.json',JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-target.x)<=5&&Math.abs(v.position.y-target.y)<=4&&Math.abs(v.position.z-target.z)<=5)));throw Error('Planar search limit '+name+' '+JSON.stringify({start,target,closest:[...points.values()].reduce((best,p)=>h(p)<h(best)?p:best,start),neighbors:V.flatMap(v=>[-1,0,1].map(dy=>{const q=P(target.x+v.x,target.y+dy,target.z+v.z);return{p:q,free:free(q)};}))}));}for(const v of V)for(const dy of(lift?[0,1,-1]:[0])){const q=P(cur.p.x+v.x,cur.p.y+dy,cur.p.z+v.z),k=K(q);if(dy>0&&map.has(K(P(cur.p.x,cur.p.y+1,cur.p.z)))||dy<0&&map.has(K(P(q.x,q.y+1,q.z))))continue;if(!free(q))continue;const cost=cur.g+1+(dy?0.75:0);if(cost>=(g.get(k)??Infinity))continue;g.set(k,cost);prev.set(k,cur.k);points.set(k,q);push({p:q,k,g:cost,f:cost+h(q),n:serial++});}}
  writeFileSync('/tmp/tinygpu-lsu-address-reachable.json',JSON.stringify({name,points:[...points.values()]}));writeFileSync('/tmp/tinygpu-lsu-address-target.json',JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-target.x)<=4&&Math.abs(v.position.y-target.y)<=3&&Math.abs(v.position.z-target.z)<=4))); console.log(JSON.stringify({failure:name,visits,start,target,start_neighbors:V.map(v=>({position:A(start,v),free:free(A(start,v))})),target_neighbors:V.map(v=>({position:A(target,v),free:free(A(target,v))}))})); throw new Error('No planar route '+name);
 }
 function planar(name,start,target,opts={}){const banned=new Set();for(let attempt=0;attempt<192;attempt++){try{const result=planarAttempt(name,start,target,{...opts,banned});authoredPaths[name]=routes.at(-1).path;if(isEntry)writeFileSync(cachePath,JSON.stringify({status:'authored_source_bound_planar_paths_not_acceptance',source_bindings:obstacles.source_sha256,paths:{...savedPaths,...authoredPaths}})+'\n');return result;}catch(e){if(!e.retryCell)throw e;assert(!banned.has(e.retryCell)&&![K(start),K(target)].includes(e.retryCell),'Nonprogress routing retry '+name+' '+e.message);banned.add(e.retryCell);}}throw Error('Self-clearance routing retry bound '+name);}
 const adapters=JSON.parse(readFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-memory-address-adapter-v1/design.json')));
 const targetXs=[];
 // Monotonically increasing output heights/X allow later return lines to pass
 // above earlier shorter columns; all64 exact columns are checked first.
 for(let consumer=0;consumer<8;consumer++){
  let found=null;const first=consumer?targetXs.at(-1)+12:642;
  search:for(let x=first;x<=920;x+=4){for(let bit=0;bit<8;bit++){
   const lo=-62+4*bit,hi=3+4*consumer,z=-6+8*bit;
   for(let y=lo-2;y<=hi+2;y++)for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(map.has(K(P(x+dx,y,z+dz))))continue search;
  }found=x;break;}
  assert(found!==null,'No common output column group '+consumer);targetXs.push(found);
 }
 // Draw furthest core first, within each lane ascending bit order. Each source
 // is the exact retained CURRENT address shared by read/write, not a software alias.
 for(const consumer of [4,5,6,7,0,1,2,3])for(let bit=0;bit<8;bit++){
  const binding=adapters.branches.find(a=>a.consumer===consumer&&a.bit===bit),core=Math.floor(consumer/4),lane=consumer%4,name='lsu_address_c'+consumer+'_b'+bit,s=binding.upstream_LSU_source,t=binding.source,level=-60+4*bit,cx=targetXs[consumer];
  activeNet=name;part=name+'_source_tap';const sd=[V[0],V[3],V[1]].find(v=>{const a=A(s,v),b=A(a,v);if(![a,b,{...a,y:a.y-1},{...b,y:b.y-1}].every(q=>!map.has(K(q))))return false;
   for(const w of V)for(const dy of[-1,0,1]){const q=P(b.x+w.x,b.y+dy,b.z+w.z),o=map.get(K(q));if(o&&!o.block.id.endsWith('_concrete')&&(!dy||o.block.id==='minecraft:redstone_wire'))return false;}
   for(const w of V.filter(w=>w.x*v.x+w.z*v.z===0)){const o=map.get(K(A(a,w)));if(o&&!o.block.id.endsWith('_concrete'))return false;}
   for(const p of[a,b])if(map.get(K(P(p.x,p.y-2,p.z)))?.block.id==='minecraft:redstone_wire')for(const w of V)if(map.get(K(P(p.x+w.x,p.y-1,p.z+w.z)))?.block.id==='minecraft:redstone_wire')return false;
   return true;});assert(sd,'No empty source tap '+name);const tap=A(s,sd),out=A(tap,sd);rep(tap,sd);wire(out);edge(s,tap);edge(tap,out);
  let point=null;const shape=makeSignalDescent({drop:s.y-level});
  search:for(const dz0 of [-40,-24,-8,-56,8,...Array.from({length:24},(_,i)=>16+i*16)])for(const offset of [-8,8,0,16,...Array.from({length:32},(_,i)=>24+i*8)]){const z=s.z+dz0,x=s.x+offset;if(x>900)continue;let ok=true;
   for(const c of shape.blocks){const q=A(P(x,s.y,z),c.position);for(let dx=-2;dx<=2&&ok;dx++)for(let dz=-2;dz<=2&&ok;dz++)for(let dy=-2;dy<=2;dy++)if(map.has(K(P(q.x+dx,q.y+dy,q.z+dz)))){ok=false;break;}if(!ok)break;}
   if(ok){point=P(x,s.y,z);break search;}
  }
  assert(point,'No source descent '+name);const dd=descent(name+'_descent',point,level);
  planar(name+'_source_feed',out,point,{lift:2,allowed:[tap],bounds:[-225,945,-2875,95]});
  part=name+'_column_driver';const bottom=level-2,driver=P(cx,bottom,t.z-1),rear=P(cx,bottom,t.z-2),feed=P(cx,level,t.z-4);rep(driver,V[1]);edge(rear,driver);edge(driver,P(cx,bottom,t.z));const top=column(name+'_column',cx,t.z,bottom,t.y+2);line(name+'_column_feed',[[feed.x,feed.y,feed.z],[rear.x,rear.y,rear.z]]);
  part=name+'_arrival';const normalizer=P(t.x+1,t.y+1,t.z),arrival=P(t.x+2,t.y+2,t.z),rear_solid=P(t.x+2,t.y+1,t.z),injection_support=P(t.x,t.y+1,t.z);solid(injection_support);rep(normalizer,V[2]);solid(rear_solid);put(arrival,'redstone_wire');edge(arrival,rear_solid);edge(rear_solid,normalizer);edge(normalizer,injection_support);edge(injection_support,t);borrowed_supports.push({source:normalizer,position:injection_support,destination:t});
  planar(name+'_flight',dd.position,feed,{lift:3,allowed:[driver],bounds:[-225,945,-2875,95]});
  planar(name+'_return',top,arrival,{allowed:[normalizer],bounds:[610,945,-30,95]});
  connections.push({name,source_instance:'core'+core,source_port:'lsus.'+lane+'.read_address/write_address',source_bit:bit,source:s,source_normalizer:tap,destination_instance:'loader',destination_port:'shared_address_adapter',destination_bit:consumer*8+bit,destination:t,normalizer,arrival_kind:'upper_solid_adapter',input_wire:arrival,rear_solid,injection_support,consumer,lane,bit,semantics:'Exact retained source identity shared by read/write. One physical trunk drives the frozen two-recipient adapter. No multiplexing or runtime host decisions.'});
  console.log(JSON.stringify({routed:name,blocks:blocks.length,descent:point,column:top}));
 }
 connections.sort((a,b)=>a.consumer-b.consumer||a.bit-b.bit);
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=blocks.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_64_shared_LSU_address_trunks',blocks,box,routes,edges,columns,descents,connections,borrowed_supports,obstacle_path:file,authored_path_file:cachePath,source_bindings:obstacles.source_sha256,metrics:{added_blocks:blocks.length,actual_connections:connections.length,retained_state_bits:0,shared_address_bits:64,final_old_address_recipients:128},complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const d=makeMasterLsuAddressRoutes();writeFileSync(resolve(ROOT,'artifacts/full-gpu-layout-v1/master-lsu-address-routes-v1/design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
