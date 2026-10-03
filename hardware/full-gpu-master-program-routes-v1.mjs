// Sixteen actual program-address bit routes in the provisional master frame.
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
export function makeMasterProgramRoutes({obstaclePath}={}){
 assert(obstaclePath,'Exact admitted parent obstacle slice required');
 const frame=JSON.parse(readFileSync(obstaclePath));
 const obstacles=[...decodeSlice(frame)];
 assert(Array.isArray(obstacles));
 const map=new Map(obstacles.map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 assert.equal(map.size,obstacles.length,'Parent collision');
 const added=[],routes=[],edges=[],columns=[],descents=[],connections=[];let part='';
 const sourceCore=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/control-lsu-guards-v3/design.json'))).ports.front.program_address;
 const targetProgram=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/design.json'))).ports.program.read_address;
 const transforms={core0:P(-400,0,-1552),core1:P(-400,0,-3072),loader:P(0,0,0)};
 const translated=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){assert(p.y>=-64&&p.y<=319,'Height '+K(p));assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);const v={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),v);added.push(v);}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function line(name,waypoints){part=name;const ws=waypoints.filter((p,i)=>!i||p.some((v,k)=>v!==waypoints[i-1][k]));const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
 const eligible=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(path.length);
 const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.add(i);if(name.endsWith('_escape')){assert(eligible.includes(1),'No immediate flat escape normalizer '+name);refresh.add(1);}
 for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire','Shared endpoint '+name);}else if(refresh.has(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:[...refresh].sort((a,b)=>a-b)});return path.at(-1);
 }
 function liftAddress(name,source){
  const currentBit=Number(name.split('bit')[1]),bottom=source.y+2,y=319,start=P(source.x+6,bottom,source.z-2);assert((y-bottom)%4===1);
  part=name+'_tap';rep(P(source.x+1,source.y,source.z),'east');wire(P(source.x+2,source.y,source.z));edge(source,P(source.x+1,source.y,source.z));edge(P(source.x+1,source.y,source.z),P(source.x+2,source.y,source.z));
  line(name+'_rise',[[source.x+2,source.y,source.z],[start.x,source.y,source.z],[start.x,start.y,start.z]]);
  const vectors=[P(1,0,0),P(0,0,-1),P(-1,0,0),P(0,0,1)],names=['east','north','west','south'];
  const cache=new Map(),free=(x,z)=>{const coreOrigin=source.z-sourceCore.bits[Number(name.split('bit')[1])].position.z;for(let b=0;b<8;b++){const other=sourceCore.bits[b].position.z+coreOrigin-2;if(other!==start.z&&Math.abs(x-(source.x+6))<=3&&z>=other-3&&z<=other+4)return false;}const k=x+','+z;if(cache.has(k))return cache.get(k);let ok=true;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let dy=-1;dy<=1;dy++){const v=map.get(K(P(x+dx,bottom+dy,z+dz)));if(v&&!(v.part.startsWith(name+'_')&&K(v.position)===K(start))&&((!v.block.id.endsWith('_concrete')&&Math.abs(dx)+Math.abs(dz)<=1)||(dx===0&&dz===0&&dy<=0))){ok=false;break;}}cache.set(k,ok);return ok;};
  const columnCache=new Map(),columnFree=(x,z)=>{const k=x+','+z;if(columnCache.has(k))return columnCache.get(k);let ok=true;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let level=bottom-1;level<=y;level++)if(map.has(K(P(x+dx,level,z+dz)))){ok=false;break;}columnCache.set(k,ok);return ok;};
  const nodes=[{x:start.x,z:start.z,dir:1,run:3,parent:-1,steps:0}],seen=new Set();let found=null;
  for(let n=0;n<nodes.length&&n<100000;n++){
   const q=nodes[n],v=vectors[q.dir];if(q.run>=3&&q.x+2*v.x<-220&&Math.abs(q.z+2*v.z-start.z)<=2&&free(q.x+v.x,q.z+v.z)&&columnFree(q.x+2*v.x,q.z+2*v.z)){found={n,x:q.x+2*v.x,z:q.z+2*v.z,dir:q.dir};break;}
   if(q.steps>=160)continue;
   for(let dir=0;dir<4;dir++){if(dir===(q.dir+2)%4||dir!==q.dir&&q.run<1)continue;const dv=vectors[dir],x=q.x+dv.x,z=q.z+dv.z,run=dir===q.dir?Math.min(3,q.run+1):1,k=x+','+z+','+dir+','+run;if(Math.abs(x-start.x)>150||Math.abs(z-start.z)>100||seen.has(k)||!free(x,z)||map.has(K(P(x,bottom,z))))continue;seen.add(k);nodes.push({x,z,dir,run,parent:n,steps:q.steps+1});}
  }
  assert(found,'No bounded safe address escape '+name+' explored='+nodes.length+' free='+[[-1,0],[1,0],[0,-1],[0,1]].map(([x,z])=>free(start.x+x,start.z+z))); const pts=[];for(let n=found.n;n>=0;n=nodes[n].parent)pts.push(P(nodes[n].x,bottom,nodes[n].z));pts.reverse();const way=[pts[0]];for(let i=1;i<pts.length-1;i++)if(pts[i].x-pts[i-1].x!==pts[i+1].x-pts[i].x||pts[i].z-pts[i-1].z!==pts[i+1].z-pts[i].z)way.push(pts[i]);way.push(pts.at(-1));line(name+'_escape',way.map(p=>[p.x,p.y,p.z]));
  const{x,z,dir}=found,v=vectors[dir],input=P(x-v.x,bottom,z-v.z),rear=P(x-2*v.x,bottom,z-2*v.z);part=name+'_column';rep(input,names[dir]);edge(rear,input);edge(input,P(x,bottom,z));for(let level=bottom;level<y;level++)if((level-bottom)%2===0)solid(P(x,level,z));else put(P(x,level,z),'redstone_torch');put(P(x,y,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:y,escape_search_nodes:nodes.length});return P(x,y,z);
 }
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const v of q.blocks)put(v.position,v.block.id.slice(10),v.block.properties);for(let i=1;i<d.path.length;i++)edge(P(d.path[i-1].x+p.x,d.path[i-1].y+p.y,d.path[i-1].z+p.z),P(d.path[i].x+p.x,d.path[i].y+p.y,d.path[i].z+p.z));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>P(v.x+p.x,v.y+p.y,v.z+p.z))});return q.ports.output.bits[0];}
 for(let core=0;core<2;core++)for(const bit of[4,2,0,1,3,5,6,7]){
  const name='program_address_core'+core+'_bit'+bit,s=translated(sourceCore.bits[bit].position,transforms['core'+core]),t=targetProgram.bits[core*8+bit].position;
  const top=liftAddress(name,s),x=(core?40:-140)-8*bit,z=800+16*bit,y=319,down=descent(name+'_descent',P(x,y,z),t.y);
  line(name+'_upper',[[top.x,top.y,top.z],[x,y,top.z],[x,y,z]]);
  const o=down.position,v=down.travel,q=P(o.x+3*v.x,o.y,o.z+3*v.z),approachZ=core?960:z+14;
  const ws=[[o.x,o.y,o.z],[q.x,q.y,q.z]];if(v.x<0)ws.push([q.x,t.y,z-12],[x+16,t.y,z-12]);else ws.push([x+16,t.y,q.z]);const nearX=bit===6?(core?-490:-558):bit===7?(core?-532:-544):t.x+(core?8:-8);ws.push([x+16,t.y,approachZ]);if(bit===7)ws.push([-515,t.y,approachZ],[-518,t.y-3,approachZ],[-529,t.y-3,approachZ],[-532,t.y,approachZ]);ws.push([nearX,t.y,approachZ],[nearX,t.y,t.z-4],[t.x,t.y,t.z-4],[t.x,t.y,t.z-2]);line(name+'_lower',ws);part=name+'_arrival';rep(P(t.x,t.y,t.z-1),'south');edge(P(t.x,t.y,t.z-2),P(t.x,t.y,t.z-1));edge(P(t.x,t.y,t.z-1),t);
  connections.push({name,source_instance:'core'+core,source_port:'front.program_address',source_bit:bit,source:s,destination_instance:'loader',destination_port:'program.read_address',destination_bit:core*8+bit,destination:t,normalizer:P(t.x,t.y,t.z-1)});
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=added.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=added.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_sixteen_program_address_route_delta',blocks:added,box,routes,edges,columns,descents,connections,obstacle_path:obstaclePath,obstacle_sha256:sha(obstaclePath),source_bindings:frame.source_bindings??frame.source_sha256,transforms,metrics:{added_blocks:added.length,actual_external_connections:connections.length,retained_state_bits:0},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,limits:['Only sixteen actual program-address bits; VALID, READY, DATA, drain and other master joins remain missing.','Frozen parent byte binding and all-parent clearance require checks, not a layout-efficiency claim.','Nominal route delays do not prove pulse transport or inter-clock protocol timing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[obstaclePath,out]=process.argv.slice(2);assert(obstaclePath&&out);mkdirSync(out,{recursive:true});const d=makeMasterProgramRoutes({obstaclePath});writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
