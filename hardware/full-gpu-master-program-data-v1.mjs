// One shared sixteen-bit program DATA bus with two physical core branches in the provisional master frame.
// Delta-only composition: every obstacle cell remains source-bound, no native calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeSlice} from '../artifacts/full-gpu-layout-v1/floorplan-v3/obstacles.mjs';
import {makeFullHeightSignalDescent as makeSignalDescent} from './full-gpu-full-height-signal-descent.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function makeMasterProgramData({obstaclePath}={}){
 assert(obstaclePath,'Exact admitted parent obstacle slice required');
 const frame=JSON.parse(readFileSync(obstaclePath));
 const obstacles=[...decodeSlice(frame)];
 assert(Array.isArray(obstacles));
 const map=new Map(obstacles.map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 assert.equal(map.size,obstacles.length,'Parent collision');
 const added=[],routes=[],edges=[],columns=[],descents=[],connections=[],source_equivalence=[],branches=new Set();let part='';
 const sourceCore=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/control-rf-status-v1/design.json'))).ports.front.program_data;
 const targetProgram=JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/design.json'))).ports.program.read_data;
 const transforms={core0:P(-400,0,-1552),core1:P(-400,0,-3072),loader:P(0,0,0)};
 const translated=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){assert(p.y>=-64&&p.y<=319,'Height '+K(p));assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);const v={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),v);added.push(v);}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function line(name,waypoints){part=name;const ws=waypoints.filter((p,i)=>!i||p.some((v,k)=>v!==waypoints[i-1][k]));const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
 const eligible=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&!branches.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(path.length);
 const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.add(i);if((name.endsWith('_escape')||name.endsWith('_lower'))){assert(eligible.includes(1),'No immediate flat escape normalizer '+name);refresh.add(1);}
 for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p)+' with '+map.get(K(p)).part);assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire','Shared endpoint '+name);}else if(refresh.has(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:[...refresh].sort((a,b)=>a-b)});return path.at(-1);
 }
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const v of q.blocks)put(v.position,v.block.id.slice(10),v.block.properties);for(let i=1;i<d.path.length;i++)edge(P(d.path[i-1].x+p.x,d.path[i-1].y+p.y,d.path[i-1].z+p.z),P(d.path[i].x+p.x,d.path[i].y+p.y,d.path[i].z+p.z));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>P(v.x+p.x,v.y+p.y,v.z+p.z))});return q.ports.output.bits[0];}
 function fixedColumn(name,x,z,bottom,y,{reuseTop=false}={}){
  assert.equal((y-bottom)%4,1);part=name;
  for(let level=bottom;level<y;level++)if(reuseTop&&level===y-1){assert.equal(map.get(K(P(x,level,z)))?.block.id,'minecraft:light_gray_concrete');}else if((level-bottom)%2===0)solid(P(x,level,z));else put(P(x,level,z),'redstone_torch');
  if(reuseTop)assert.equal(map.get(K(P(x,y,z)))?.block.id,'minecraft:redstone_wire');else put(P(x,y,z),'redstone_wire');
  columns.push({name,x,z,bottom,output_y:y,reused_parent_top:reuseTop});return P(x,y,z);
 }
 function path3D(name,from,to,{initialDir=0}={}){
  const vectors=[P(1,0,0),P(0,0,-1),P(-1,0,0),P(0,0,1)],startKey=K(from),goalKey=K(to),cache=new Map();
  const free=(x,y,z)=>{const key=K(P(x,y,z));if(key===startKey||key===goalKey)return true;if(cache.has(key))return cache.get(key);let ok=x>=frame.bounds.x[0]+3&&x<=frame.bounds.x[1]-3&&z>=frame.bounds.z[0]+3&&z<=frame.bounds.z[1]-3;
   for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let dy=-1;dy<=1;dy++){const v=map.get(K(P(x+dx,y+dy,z+dz)));if(!v||K(v.position)===startKey||K(v.position)===goalKey)continue;if((!v.block.id.endsWith('_concrete')&&Math.abs(dx)+Math.abs(dz)<=1)||(dx===0&&dz===0&&dy<=0)){ok=false;break;}}
   if(map.get(K(P(x,y-2,z)))?.block.id.includes('torch'))ok=false;for(let dir=0;dir<4;dir++){const v=vectors[dir],b=map.get(K(P(x-v.x,y-1,z-v.z)))?.block;if(b&&['minecraft:repeater','minecraft:comparator'].includes(b.id)&&b.properties.facing===F[['east','north','west','south'][dir]])ok=false;}
   cache.set(key,ok);return ok;
  };
  const nodes=[{x:from.x,y:from.y,z:from.z,dir:initialDir,run:3,slope:0,parent:-1,steps:0}],seen=new Set();let found=null;const heap=[],cost=i=>nodes[i].steps+Math.abs(nodes[i].x-to.x)+Math.abs(nodes[i].z-to.z)+Math.abs(nodes[i].y-to.y),push=i=>{heap.push(i);let n=heap.length-1;while(n){const p=(n-1)>>1;if(cost(heap[p])<=cost(heap[n]))break;[heap[p],heap[n]]=[heap[n],heap[p]];n=p;}},pop=()=>{const result=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let n=0;while(true){let q=n;for(const k of[2*n+1,2*n+2])if(k<heap.length&&cost(heap[k])<cost(heap[q]))q=k;if(q===n)break;[heap[n],heap[q]]=[heap[q],heap[n]];n=q;}}return result;};push(0);
  for(let count=0;heap.length&&count<800000;count++){const n=pop(),q=nodes[n];if(q.x===to.x&&q.y===to.y&&q.z===to.z&&q.dir===0&&q.run>=2&&!q.slope){found=n;break;}if(q.steps>2000)continue;
   for(let dir=0;dir<4;dir++)for(const dy of[0,1,-1]){if(q.steps<3&&(dir!==initialDir||dy)||dir===(q.dir+2)%4||dir!==q.dir&&q.run<2||dy&&q.slope>=3)continue;const v=vectors[dir],x=q.x+v.x,z=q.z+v.z,y=q.y+dy,run=dir===q.dir&&!dy?Math.min(3,q.run+1):1,slope=dy?q.slope+1:0,key=x+','+y+','+z+','+dir+','+run+','+slope;
    if(y<Math.max(-63,from.y-3)||y>from.y+3||x<Math.min(from.x,to.x)-100||x>Math.max(from.x,to.x)+100||z<Math.min(from.z,to.z)-160||z>Math.max(from.z,to.z)+160||seen.has(key)||!free(x,y,z))continue;seen.add(key);nodes.push({x,y,z,dir,run,slope,parent:n,steps:q.steps+1});push(nodes.length-1);
   }
  }
  assert(found!==null,'No bounded 3D route '+name+' nodes='+nodes.length+' from='+K(from)+' to='+K(to));const pts=[];for(let n=found;n>=0;n=nodes[n].parent)pts.push(P(nodes[n].x,nodes[n].y,nodes[n].z));pts.reverse();const way=[pts[0]];for(let i=1;i<pts.length-1;i++)if(['x','y','z'].some(a=>pts[i][a]-pts[i-1][a]!==pts[i+1][a]-pts[i][a]))way.push(pts[i]);way.push(pts.at(-1));line(name,way.map(p=>[p.x,p.y,p.z]));
 }
 for(let bit=0;bit<16;bit++){
  const name='program_data_bit'+bit,old0=targetProgram.bits[bit].position,old1=targetProgram.bits[16+bit].position,s=P(old0.x-4,old0.y,old0.z);
  assert.equal(map.get(K(s))?.block.id,'minecraft:light_gray_concrete');assert.equal(map.get(K(P(s.x,s.y-1,s.z)))?.block.id,'minecraft:redstone_torch');
  assert.equal(map.get(K(P(s.x+1,s.y,s.z)))?.block.properties?.facing,'west');assert.deepEqual(old1,P(s.x+2,s.y,s.z-2));
  source_equivalence.push({bit,common_response_solid:s,old_consumer0:old0,old_consumer1:old1,driver:P(s.x,s.y-1,s.z),source_relation:'both inherited outputs branch from this actual retained-response positive column'});
  part=name+'_tap';rep(P(s.x-1,s.y,s.z),'west');wire(P(s.x-2,s.y,s.z));edge(s,P(s.x-1,s.y,s.z));edge(P(s.x-1,s.y,s.z),P(s.x-2,s.y,s.z));
  const cx=s.x-12,lo=s.y+2;line(name+'_source_escape',[[s.x-2,s.y,s.z],[s.x-5,s.y,s.z],[s.x-7,lo,s.z],[cx+2,lo,s.z]]);
  fixedColumn(name+'_source_lift',cx,s.z,lo,319);part=name+'_source_input';rep(P(cx+1,lo,s.z),'west');edge(P(cx+2,lo,s.z),P(cx+1,lo,s.z));edge(P(cx+1,lo,s.z),P(cx,lo,s.z));
  const x=-1024+24*bit,y=319,bridgeZ=-200,afterZ=-380;
  const bridge=descent(name+'_bridge_descent',P(x,y,bridgeZ),292),bp=bridge.position;
  assert.deepEqual(bridge.travel,P(1,0,0));line(name+'_source_trunk',[[cx,y,s.z],[x,y,s.z],[x,y,bridgeZ]]);
  fixedColumn(name+'_bridge_rise',x,afterZ,290,319);
  line(name+'_under_bridge',[[bp.x,bp.y,bp.z],[x+16,292,bp.z],[x+16,292,afterZ+12],[x+16,290,afterZ+10],[x,290,afterZ+10],[x,290,afterZ+2]]);part=name+'_bridge_input';rep(P(x,290,afterZ+1),'north');edge(P(x,290,afterZ+2),P(x,290,afterZ+1));edge(P(x,290,afterZ+1),P(x,290,afterZ));
  const targets=[];
  for(let core=0;core<2;core++){
   const t=translated(sourceCore.bits[bit].position,transforms['core'+core]),low=-60+4*(bit%8),shape=makeSignalDescent({drop:y-low});let z=null,branchX=null;
   for(const step of Array.from({length:161},(_,i)=>i===0?0:(i%2?1:-1)*Math.ceil(i/2)))for(const offset of[4,12]){const candidate=t.z+80+8*step;if(candidate < -3200 || candidate > -700 || z!==null)continue;let ok=true;for(const cell of shape.blocks){const p=cell.position;for(let dx=-1;dx<=1&&ok;dx++)for(let dz=-1;dz<=1&&ok;dz++)for(let dy=-1;dy<=1;dy++)if(map.has(K(P(p.x+x+offset+dx,p.y+y+dy,p.z+candidate+dz)))){ok=false;break;}if(!ok)break;}if(ok){z=candidate;branchX=x+offset;break;}}
   assert(z!==null,'No data branch descent '+name+' core'+core);const branch=P(x,y,z);branches.add(K(branch));const down=descent(name+'_core'+core+'_descent',P(branchX,y,z),low);targets.push({core,t,low,branch,down,branchX});
  }
  line(name+'_shared_north_trunk',[[x,y,afterZ],[x,y,Math.min(...targets.map(v=>v.branch.z))-8]]);
  for(const {core,t,low,branch,down,branchX}of targets){
   const n=name+'_core'+core;part=n+'_tap';rep(P(x+1,y,branch.z),'east');wire(P(x+2,y,branch.z));edge(branch,P(x+1,y,branch.z));edge(P(x+1,y,branch.z),P(x+2,y,branch.z));line(n+'_to_descent',[[x+2,y,branch.z],[branchX,y,branch.z]]);
   const o=down.position,v=down.travel,q=P(o.x+3*v.x,o.y,o.z+3*v.z);line(n+'_exit',[[o.x,o.y,o.z],[q.x,q.y,q.z]]);
   fixedColumn(n+'_recipient_injection',t.x,t.z,low,t.y,{reuseTop:true});part=n+'_arrival';const r=P(t.x-1,low,t.z);rep(r,'east');edge(P(t.x-2,low,t.z),r);edge(r,P(t.x,low,t.z));path3D(n+'_lower',q,P(t.x-2,low,t.z),{initialDir:v.x>0?0:v.z<0?1:v.x<0?2:3});
   connections.push({name:n,source_instance:'loader',source_port:'program.retained_response_common',source_bit:bit,source:s,destination_instance:'core'+core,destination_port:'front.program_data',destination_bit:bit,destination:t,normalizer:r,branch:branch,recipient_injection:{bottom:P(t.x,low,t.z),output:t,old_support:P(t.x,t.y-1,t.z)}});
  }
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=added.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=added.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_shared_sixteen_bit_program_data_route_delta',blocks:added,source_equivalence,box,routes,edges,columns,descents,connections,obstacle_path:obstaclePath,obstacle_sha256:sha(obstaclePath),source_bindings:frame.source_bindings??frame.source_sha256,transforms,metrics:{added_blocks:added.length,actual_external_connections:connections.length,retained_state_bits:0},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,limits:['Shared sixteen-bit retained program data, each bit physically branches to both core IRs. Per-core owned READY alone authorizes capture; complete setup/drain timing and other master joins remain missing.','Frozen parent byte binding and all-parent clearance require checks, not a layout-efficiency claim.','Nominal route delays do not prove pulse transport or inter-clock protocol timing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[obstaclePath,out]=process.argv.slice(2);assert(obstaclePath&&out);mkdirSync(out,{recursive:true});const d=makeMasterProgramData({obstaclePath});writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
