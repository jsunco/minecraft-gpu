// Two actual program-VALID routes in the provisional master frame.
// Delta-only composition: every obstacle cell remains source-bound, no native calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSlice} from '../artifacts/full-gpu-layout-v1/floorplan-v2/obstacles.mjs';
import {makeSignalDescent} from './full-gpu-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function makeMasterProgramRequests({obstaclePath}={}){
 assert(obstaclePath,'Exact admitted parent obstacle slice required');
 const frame=JSON.parse(readFileSync(obstaclePath));
 const obstacles=[...decodeSlice(frame)];
 assert(Array.isArray(obstacles));
 const map=new Map(obstacles.map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 assert.equal(map.size,obstacles.length,'Parent collision');
 const added=[],routes=[],edges=[],columns=[],descents=[],connections=[];let part='';
 const sourceCore=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/control-lsu-guards-v3/design.json'))).ports.front.program_valid;
 const targetProgram=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/design.json'))).ports.program.read_valid;
 const transforms={core0:P(-400,0,-1552),core1:P(-400,0,-3072),loader:P(0,0,0)};
 const translated=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){assert(p.y>=-64&&p.y<=319,'Height '+K(p));assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);const v={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),v);added.push(v);}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function line(name,waypoints){part=name;const ws=waypoints.filter((p,i)=>!i||p.some((v,k)=>v!==waypoints[i-1][k]));const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
 const eligible=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(path.length);
 const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.add(i);if(name.endsWith('_escape')){assert(eligible.includes(1),'No immediate flat escape normalizer '+name);refresh.add(1);}
 for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p)+' with '+map.get(K(p)).part);assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire','Shared endpoint '+name);}else if(refresh.has(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:[...refresh].sort((a,b)=>a-b)});return path.at(-1);
 }
 function liftValid(name,source){
  const bottom=source.y+1,y=319,start=P(source.x,bottom,source.z-3);assert((y-bottom)%4===1);
  part=name+'_tap';rep(P(source.x,source.y,source.z-1),'north');wire(P(source.x,source.y,source.z-2));edge(source,P(source.x,source.y,source.z-1));edge(P(source.x,source.y,source.z-1),P(source.x,source.y,source.z-2));
  line(name+'_rise',[[source.x,source.y,source.z-2],[start.x,start.y,start.z]]);
  const vectors=[P(1,0,0),P(0,0,-1),P(-1,0,0),P(0,0,1)],names=['east','north','west','south'];
  const cache=new Map(),free=(x,z)=>{const k=x+','+z;if(cache.has(k))return cache.get(k);let ok=true;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let dy=-1;dy<=1;dy++){const v=map.get(K(P(x+dx,bottom+dy,z+dz)));if(v&&!(v.part.startsWith(name+'_')&&K(v.position)===K(start))&&((!v.block.id.endsWith('_concrete')&&Math.abs(dx)+Math.abs(dz)<=1)||(dx===0&&dz===0&&dy<=0))){ok=false;break;}}cache.set(k,ok);return ok;};
  const columnCache=new Map(),columnFree=(x,z)=>{const k=x+','+z;if(columnCache.has(k))return columnCache.get(k);let ok=true;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let level=bottom-1;level<=y;level++)if(map.has(K(P(x+dx,level,z+dz)))){ok=false;break;}columnCache.set(k,ok);return ok;};
  const nodes=[{x:start.x,z:start.z,dir:1,run:3,parent:-1,steps:0}],seen=new Set();let found=null;
  for(let n=0;n<nodes.length&&n<100000;n++){
   const q=nodes[n],v=vectors[q.dir];if(q.run>=3&&q.x+2*v.x<-220&&Math.abs(q.z+2*v.z-start.z)<=100&&free(q.x+v.x,q.z+v.z)&&columnFree(q.x+2*v.x,q.z+2*v.z)){found={n,x:q.x+2*v.x,z:q.z+2*v.z,dir:q.dir};break;}
   if(q.steps>=160)continue;
   for(let dir=0;dir<4;dir++){if(dir===(q.dir+2)%4||dir!==q.dir&&q.run<1)continue;const dv=vectors[dir],x=q.x+dv.x,z=q.z+dv.z,run=dir===q.dir?Math.min(3,q.run+1):1,k=x+','+z+','+dir+','+run;if(Math.abs(x-start.x)>150||Math.abs(z-start.z)>100||seen.has(k)||!free(x,z)||map.has(K(P(x,bottom,z))))continue;seen.add(k);nodes.push({x,z,dir,run,parent:n,steps:q.steps+1});}
  }
  assert(found,'No bounded safe address escape '+name+' explored='+nodes.length+' free='+[[-1,0],[1,0],[0,-1],[0,1]].map(([x,z])=>free(start.x+x,start.z+z))); const pts=[];for(let n=found.n;n>=0;n=nodes[n].parent)pts.push(P(nodes[n].x,bottom,nodes[n].z));pts.reverse();const way=[pts[0]];for(let i=1;i<pts.length-1;i++)if(pts[i].x-pts[i-1].x!==pts[i+1].x-pts[i].x||pts[i].z-pts[i-1].z!==pts[i+1].z-pts[i].z)way.push(pts[i]);way.push(pts.at(-1));line(name+'_escape',way.map(p=>[p.x,p.y,p.z]));
  const{x,z,dir}=found,v=vectors[dir],input=P(x-v.x,bottom,z-v.z),rear=P(x-2*v.x,bottom,z-2*v.z);part=name+'_column';rep(input,names[dir]);edge(rear,input);edge(input,P(x,bottom,z));for(let level=bottom;level<y;level++)if((level-bottom)%2===0)solid(P(x,level,z));else put(P(x,level,z),'redstone_torch');put(P(x,y,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:y,escape_search_nodes:nodes.length});return P(x,y,z);
 }
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const v of q.blocks)put(v.position,v.block.id.slice(10),v.block.properties);for(let i=1;i<d.path.length;i++)edge(P(d.path[i-1].x+p.x,d.path[i-1].y+p.y,d.path[i-1].z+p.z),P(d.path[i].x+p.x,d.path[i].y+p.y,d.path[i].z+p.z));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>P(v.x+p.x,v.y+p.y,v.z+p.z))});return q.ports.output.bits[0];}
 function fixedColumn(name,x,z,bottom,y,{reuseTop=false}={}){
  assert.equal((y-bottom)%4,1);part=name;
  for(let level=bottom;level<y;level++)if(reuseTop&&level===y-1){assert.equal(map.get(K(P(x,level,z)))?.block.id,'minecraft:light_gray_concrete');}else if((level-bottom)%2===0)solid(P(x,level,z));else put(P(x,level,z),'redstone_torch');
  if(reuseTop)assert.equal(map.get(K(P(x,y,z)))?.block.id,'minecraft:redstone_wire');else put(P(x,y,z),'redstone_wire');
  columns.push({name,x,z,bottom,output_y:y,reused_parent_top:reuseTop});return P(x,y,z);
 }
 for(let core=0;core<2;core++){
  const name='program_valid_core'+core,s=translated(sourceCore.bits[0].position,transforms['core'+core]),t=targetProgram.bits[core].position;
  const top=liftValid(name,s),x=-580-20*core,y=319;
  const dip=descent(name+'_bridge_underpass',P(x,y,-360),292),dp=dip.position,dv=dip.travel,dq=P(dp.x+3*dv.x,dp.y,dp.z+3*dv.z);
  line(name+'_north_upper',[[top.x,top.y,top.z],[x,y,top.z],[x,y,-360]]);
  const riseZ=-250;fixedColumn(name+'_bridge_rise',x,riseZ,290,319);
  const mid=[[dp.x,dp.y,dp.z],[dq.x,dq.y,dq.z]];if(dv.x<0)mid.push([dq.x,292,-380],[x+16,292,-380]);else mid.push([x+16,292,dq.z]);
  mid.push([x+16,292,riseZ-12],[x+16,290,riseZ-10],[x,290,riseZ-10],[x,290,riseZ-2]);line(name+'_under_bridge',mid);
  part=name+'_bridge_input';rep(P(x,290,riseZ-1),'south');edge(P(x,290,riseZ-2),P(x,290,riseZ-1));edge(P(x,290,riseZ-1),P(x,290,riseZ));
  let z=null;const shape=makeSignalDescent({drop:350});for(let candidate=950+20*core;candidate>0;candidate-=16){let ok=true;for(const cell of shape.blocks){const p=cell.position;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let dy=-1;dy<=1;dy++)if(map.has(K(P(p.x+x+dx,p.y+y+dy,p.z+candidate+dz)))){ok=false;break;}if(!ok)break;}if(ok){for(let xx=0;xx<=20;xx++)for(let zz=-2;zz<=2;zz++)for(let yy=-32;yy<=-30;yy++)if(map.has(K(P(x+xx,yy,candidate+zz))))ok=false;}if(ok){z=candidate;break;}}assert(z!==null,'No safe full-height descent '+name);const down=descent(name+'_descent',P(x,y,z),-31);
  line(name+'_south_upper',[[x,y,riseZ],[x,y,z]]);
  const o=down.position,v=down.travel,q=P(o.x+3*v.x,o.y,o.z+3*v.z),ws=[[o.x,o.y,o.z],[q.x,q.y,q.z]];
  if(v.x<0)ws.push([q.x,-31,z-12],[x+16,-31,z-12]);else ws.push([x+16,-31,q.z]);
  ws.push([x+16,-31,995+core*5],[t.x,-31,995+core*5],[t.x,-31,t.z-2]);line(name+'_lower',ws);
  fixedColumn(name+'_recipient_injection',t.x,t.z,-31,t.y,{reuseTop:true});
  part=name+'_arrival';const r=P(t.x,-31,t.z-1);rep(r,'south');edge(P(t.x,-31,t.z-2),r);edge(r,P(t.x,-31,t.z));
  connections.push({name,source_instance:'core'+core,source_port:'front.program_valid',source_bit:0,source:s,destination_instance:'loader',destination_port:'program.read_valid',destination_bit:core,destination:t,normalizer:r,recipient_injection:{bottom:P(t.x,-31,t.z),output:t,old_support:P(t.x,t.y-1,t.z)}});
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=added.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=added.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_two_program_valid_route_delta',blocks:added,box,routes,edges,columns,descents,connections,obstacle_path:obstaclePath,obstacle_sha256:sha(obstaclePath),source_bindings:frame.source_bindings??frame.source_sha256,transforms,metrics:{added_blocks:added.length,actual_external_connections:connections.length,retained_state_bits:0},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,limits:['Only two actual program VALID request wires join the sixteen already frozen address bits; READY, DATA, drain and other master joins remain missing.','Frozen parent byte binding and all-parent clearance require checks, not a layout-efficiency claim.','Nominal route delays do not prove pulse transport or inter-clock protocol timing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[obstaclePath,out]=process.argv.slice(2);assert(obstaclePath&&out);mkdirSync(out,{recursive:true});const d=makeMasterProgramRequests({obstaclePath});writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
