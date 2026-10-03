// Five held external dispatcher predicates. Pure offline derivative.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {makeStateBank} from './full-gpu-state-bank.mjs';
import {materializeInstance} from './gpu-layout-assembly.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../artifacts/full-gpu-layout-v1/control-commit-v2/route.mjs';
export const SAMPLE_INPUTS=['core_done0','core_done1','core_ack0','core_ack1','sequence_predicate_start'];
const HOME=new URL('../artifacts/full-gpu-layout-v1/dispatch-input-sampling-v1/',import.meta.url),BASE=new URL('../artifacts/full-gpu-layout-v1/dispatch-startup-v1/admission-destinations/design.json',import.meta.url);
export function makeDispatchInputSampling({plan=false}={}){
 const bytes=readFileSync(BASE),base=JSON.parse(bytes),bank=materializeInstance(makeStateBank({width:5,pair:false}),{id:'input_samples',translation:P(500,128,-64)});
 const map=new Map(base.blocks.map(v=>[K(v.position),{position:v.position,block:v.block,part:'dispatcher_parent'}])),routes=[],edges=[],connections=[],columns=[],samples=[];let part='';
 for(const v of bank.blocks){assert(!map.has(K(v.position)),'Bank overlap '+K(v.position));map.set(K(v.position),{...v,part:'input_samples'});}
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){assert(!at(p),'Collision '+part+' '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...properties?{properties}:{}},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 // Positive four-high parity lift from the actual continuously running B trunk.
 const phaseSource=P(581,-100,-420),bottom=-101,outputY=128,x=581,z=-415;
 assert.equal(at(phaseSource)?.block.id,'minecraft:redstone_wire');part='actual_B_isolation';
 const first=P(x,-100,-419),p0=P(x,-100,-418),p1=P(x,-101,-417),injector=P(x,-101,-416);
 rep(first,'south');wire(p0);wire(p1);rep(injector,'south');
 for(const[a,b]of[[phaseSource,first],[first,p0],[p0,p1],[p1,injector],[injector,P(x,bottom,z)]])edge(a,b);
 part='actual_B_positive_column';for(let y=bottom;y<outputY;y++)put(P(x,y,z),(y-bottom)%2===0?'light_gray_concrete':'redstone_torch');put(P(x,outputY,z),'redstone_wire');
 columns.push({name:'actual_B_positive_column',x,z,bottom,output_y:outputY,injector});
 const cacheURL=new URL('routes.json',HOME),cache=existsSync(cacheURL)?JSON.parse(readFileSync(cacheURL)):{},pending=[],reserved=[];
 const reserve=(s,sd,d,ad)=>[...Array.from({length:18},(_,i)=>step(s,sd,i+2)),...Array.from({length:18},(_,i)=>step(d,ad,-i-2))];
 function draw(name,source,sd,destination,ad,stubs=false){
  part=name;assert.equal(at(source)?.block.id,'minecraft:redstone_wire');assert.equal(at(destination)?.block.id,'minecraft:redstone_wire');
  const first=step(source,sd),start=step(source,sd,2),last=step(destination,ad,-1),end=step(destination,ad,-2);
  if(stubs){rep(first,sd);wire(start);rep(last,ad);wire(end);edge(source,first);edge(first,start);edge(end,last);edge(last,destination);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[...reserve(source,sd,destination,ad),source,destination,first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))],forbidden=[first,last].flatMap(p=>Object.values(V).map(([dx,dz])=>P(p.x+dx,p.y,p.z+dz))).filter(p=>![source,start,end,destination].some(q=>K(p)===K(q)));
   const r=searchPath(map,start,end,{ignore,reserved,forbidden});path=r.path;cache[name]={source,destination,...r};writeFileSync(cacheURL,JSON.stringify(cache)+'\n');console.error(name+': '+path.length+' / '+r.expanded);
  }
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);
  for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i)){const dir=Object.keys(V).find(d=>K(step(p,d))===K(q));rep(p,dir);}else wire(p);}
  for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source,tap:first,destination,arrival:last});
 }
 const ports=structuredClone(base.ports);
 for(const[i,name]of SAMPLE_INPUTS.entries()){
  const source=bank.ports.state.bits[i].position,destination=base.ports[name].bits[0].position;
  samples.push({name,bit:i,raw:bank.ports.next_data.bits[i].position,source,storage:P(source.x-3,source.y,source.z),lock:P(source.x-3,source.y,source.z+1),destination});
  ports[name]={...bank.ports.next_data,width:1,bits:[{...bank.ports.next_data.bits[i],bit:0}],meaning:'External held level, now sampled on physical dispatcher B before NEXT-A. Original predicate receiving pad is internal.'};
  pending.push(['sample_'+name,source,'east',destination,'south']);
 }
 pending.push(['actual_B_to_sample_open',P(x,outputY,z),'south',bank.ports.state_open.bits[0].position,'east']);
 for(const[,s,sd,d,ad]of pending)reserved.push(...reserve(s,sd,d,ad));for(const args of pending)draw(...args,true);for(const args of pending)draw(...args);
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_dispatch_external_predicate_samples_connected',blocks,box,ports,edges,routes,connections,columns,samples,phase:{source:phaseSource,first_isolator:first,bank_open:bank.ports.state_open.bits[0].position},parents:[{id:'dispatcher_parent',path:'artifacts/full-gpu-layout-v1/dispatch-startup-v1/admission-destinations/design.json',sha256:createHash('sha256').update(bytes).digest('hex'),blocks:base.blocks.length},{id:'input_samples',origin:P(500,128,-64),blocks:bank.blocks.length}],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,added_blocks:blocks.length-base.blocks.length,retained_bits:base.metrics.stored_state_bits+5,new_retained_bits:5,sampled_inputs:5,actual_connections:connections.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_calls:0,native_acceptance:false,missing:['External source producers must now connect the five relocated raw pads, not the occupied original predicate receivers.','Actual last B lock closure, sampled-output propagation through predicate/NEXT logic, and macro CURRENT decode settling must precede every NEXT/action A opening. Complete-route delay bound remains unmeasured.','A held asynchronous input may yield either old or new sampled value near B closure, but its resulting retained single bit must settle before A. This is phase separation, not a proof against arbitrary metastability or unlimited input chatter.','Cold initialize must remain held through decoder conditioning, a complete fresh sample B, subsequent predicate settling and normal admission. Sample cells have no assumed initial value.','Existing six retained command outputs remain unchanged. Their separate microprogram close states and far route closure still require timing validation.','No native execution, complete-machine routing or electrical timing acceptance.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeDispatchInputSampling({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',HOME))));else writeFileSync(new URL('design.json',HOME),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
