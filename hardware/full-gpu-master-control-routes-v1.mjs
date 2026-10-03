// Seven concrete dispatcher/global joins in the admitted provisional whole-machine frame.
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
export function makeMasterControlRoutes({obstaclePath}={}){
 assert(obstaclePath,'Exact admitted parent obstacle slice required');
 const frame=JSON.parse(readFileSync(obstaclePath));
 const obstacles=[...decodeSlice(frame)];
 assert(Array.isArray(obstacles));
 const map=new Map(obstacles.map(v=>[K(v.position),{...v,part:'parent:'+v.instance}]));
 assert.equal(map.size,obstacles.length,'Parent collision');
 const added=[],routes=[],edges=[],columns=[],descents=[],connections=[];let part='';
 const designs={dispatch:JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/dispatch-input-sampling-v1/design.json'))),global:JSON.parse(readFileSync(resolve(root,'artifacts/full-gpu-layout-v1/global-command-assembly-v3/design.json')))};
 const transforms={dispatch:P(-1712,55,-600),global:P(-1000,-55,550)};
 const port=(id,n)=>{const b=designs[id].ports[n].bits[0],t=transforms[id],at=p=>P(p.x+t.x,p.y+t.y,p.z+t.z);return{...b,position:at(b.position),...(b.source?{source:at(b.source)}:{}),...(b.receiver?{receiver:at(b.receiver)}:{})};};
 function put(p,id,properties){assert(p.y>=-64&&p.y<=319,'Height '+K(p));assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' with '+map.get(K(p))?.part);const v={position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part};map.set(K(p),v);added.push(v);}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function line(name,waypoints){part=name;const ws=waypoints.filter((p,i)=>!i||p.some((v,k)=>v!==waypoints[i-1][k]));const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
 const eligible=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!map.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)eligible.push(i);}eligible.push(path.length);
 const costs=new Map([[-1,0]]),prev=new Map();for(let i=1;i<eligible.length;i++){const end=eligible[i];for(let j=i-1;j>=0;j--){const start=eligible[j];if(end-start>13)break;if(!costs.has(start))continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=new Set();for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.add(i);
 for(const[i,p]of path.entries()){if(map.has(K(p))){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(map.get(K(p)).block.id,'minecraft:redstone_wire','Shared endpoint '+name);}else if(refresh.has(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:[...refresh].sort((a,b)=>a-b)});return path.at(-1);
 }
 function lift(name,source,y,{x=source.x,z=source.z+12}={}){
  assert((y-(source.y-1))%4===1);part=name+'_tap';rep(P(source.x,source.y,source.z+1),'south');wire(P(source.x,source.y,source.z+2));edge(source,P(source.x,source.y,source.z+1));edge(P(source.x,source.y,source.z+1),P(source.x,source.y,source.z+2));
  const bottom=source.y-1;line(name+'_to_column',[[source.x,source.y,source.z+2],[source.x,bottom,source.z+3],[x,bottom,source.z+3],[x,bottom,z-2]]);part=name+'_column';rep(P(x,bottom,z-1),'south');edge(P(x,bottom,z-2),P(x,bottom,z-1));edge(P(x,bottom,z-1),P(x,bottom,z));for(let level=bottom;level<y;level++)if((level-bottom)%2===0)solid(P(x,level,z));else put(P(x,level,z),'redstone_torch');put(P(x,y,z),'redstone_wire');columns.push({name,x,z,bottom,output_y:y});return P(x,y,z);
 }
 function descent(name,p,endY){const d=makeSignalDescent({drop:p.y-endY}),q=materializeInstance(d,{id:name,translation:p});part=name;for(const v of q.blocks)put(v.position,v.block.id.slice(10),v.block.properties);for(let i=1;i<d.path.length;i++)edge(P(d.path[i-1].x+p.x,d.path[i-1].y+p.y,d.path[i-1].z+p.z),P(d.path[i].x+p.x,d.path[i].y+p.y,d.path[i].z+p.z));descents.push({name,origin:p,drop:p.y-endY,path:d.path.map(v=>P(v.x+p.x,v.y+p.y,v.z+p.z))});return q.ports.output.bits[0];}
 const planned=[['admission_done_visible','dispatch_done'],['admission_start0_visible','dispatch_start0'],['admission_reset0_visible','dispatch_reset0'],['admission_start1_visible','dispatch_start1'],['admission_reset1_visible','dispatch_reset1']];
 for(const[i,[outName,inName]]of planned.entries()){
  const s=port('dispatch',outName).position,t=port('global',inName).position,y=319-4*i,x=-450+12*i,z=400+20*i,name='dispatch_'+inName;
  const top=lift(name,s,y),down=descent(name+'_descent',P(x,y,z),t.y);
  line(name+'_upper',[[top.x,top.y,top.z],[x,y,top.z],[x,y,z]]);
  const o=down.position,travel=down.travel,q=P(o.x+3*travel.x,o.y,o.z+3*travel.z),approachZ=z+14;
  line(name+'_lower',[[o.x,o.y,o.z],[q.x,q.y,q.z],[q.x,t.y,approachZ],[t.x,t.y,approachZ],[t.x,t.y,t.z-2]]);part=name+'_arrival';rep(P(t.x,t.y,t.z-1),'south');edge(P(t.x,t.y,t.z-2),P(t.x,t.y,t.z-1));edge(P(t.x,t.y,t.z-1),t);
  connections.push({name,source_instance:'dispatch',source_port:outName,source:s,destination_instance:'global',destination_port:inName,destination:t,normalizer:P(t.x,t.y,t.z-1)});
 }
 // Admission ready follows a separate west corridor, avoiding the five command towers.
 {
  const name='dispatch_admitted',s=port('dispatch','admission_permit').position,t=port('global','dispatch_admitted').position,top=lift(name,s,299),down=descent(name+'_descent',P(-1180,299,580),t.y);
  line(name+'_upper',[[top.x,top.y,top.z],[-2070,299,top.z],[-2070,299,580],[-1180,299,580]]);
  const o=down.position,v=down.travel,q=P(o.x+3*v.x,o.y,o.z+3*v.z);line(name+'_lower',[[o.x,o.y,o.z],[q.x,q.y,q.z],[q.x,t.y,550],[t.x-2,t.y,550]]);part=name+'_arrival';rep(P(t.x-1,t.y,t.z),'east');edge(P(t.x-2,t.y,t.z),P(t.x-1,t.y,t.z));edge(P(t.x-1,t.y,t.z),t);connections.push({name,source_instance:'dispatch',source_port:'admission_permit',source:s,destination_instance:'global',destination_port:'dispatch_admitted',destination:t,normalizer:P(t.x-1,t.y,t.z)});
 }
 // Qualified START returns to the dispatcher's actual B-sampled input.
 {
  const name='global_dispatch_start',s=port('global','dispatch_start').position,t=port('dispatch','sequence_predicate_start').position;
  const top=lift(name,s,293),down=descent(name+'_descent',P(-1240,293,-700),t.y);
  line(name+'_upper',[[top.x,top.y,top.z],[-1240,293,top.z],[-1240,293,-700]]);
  const o=down.position,v=down.travel,q=P(o.x+3*v.x,o.y,o.z+3*v.z);line(name+'_lower',[[o.x,o.y,o.z],[q.x,q.y,q.z],[q.x,t.y,t.z],[t.x-2,t.y,t.z]]);part=name+'_arrival';rep(P(t.x-1,t.y,t.z),'east');edge(P(t.x-2,t.y,t.z),P(t.x-1,t.y,t.z));edge(P(t.x-1,t.y,t.z),t);connections.push({name,source_instance:'global',source_port:'dispatch_start',source:s,destination_instance:'dispatch',destination_port:'sequence_predicate_start',destination:t,normalizer:P(t.x-1,t.y,t.z)});
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=added.reduce((m,v)=>Math.min(m,v.position[a]),Infinity);box.to[a]=added.reduce((m,v)=>Math.max(m,v.position[a]),-Infinity);}
 return{status:'offline_provisional_master_control_route_delta',blocks:added,box,routes,edges,columns,descents,connections,obstacle_path:obstaclePath,obstacle_sha256:sha(obstaclePath),source_bindings:frame.source_bindings??frame.source_sha256,transforms,metrics:{added_blocks:added.length,actual_external_connections:connections.length,retained_state_bits:0},native_calls:0,world_mutations:0,native_acceptance:false,complete_gpu_layout:false,limits:['Only seven actual global/dispatcher joins; other master nets remain missing.','Frozen parent byte binding and all-parent clearance require checks, not a layout-efficiency claim.','Nominal route delays do not prove pulse transport or inter-clock protocol timing.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const[obstaclePath,out]=process.argv.slice(2);assert(obstaclePath&&out);mkdirSync(out,{recursive:true});const d=makeMasterControlRoutes({obstaclePath});writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
