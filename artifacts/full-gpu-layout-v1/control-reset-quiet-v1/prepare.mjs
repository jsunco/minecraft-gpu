// Actual reset ownership-quiet guards. No reset acknowledgment is invented.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
import {laneDefinition,joinDefinition} from './logic.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeResetQuiet({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-retire-v1/source-manifest.json',import.meta.url))).digest('hex'),'65b66de84cb78e16c22f4911330b8635245034711316a75656f7491b27bfcc3a');
 const pm=read('../control-reset-retire-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-retire-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-retire-v1/design.json']);
 const base=read('../control-reset-retire-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[...base.edges],routes=[],connections=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position,lanes=[];
 for(let i=0;i<4;i++)lanes.push(insert('lane_quiet_'+i,makeMatrix(laneDefinition()),P(300+300*(i%2),20+150*Math.floor(i/2),620)));
 const join=insert('join',makeMatrix(joinDefinition()),P(-440,170,-260));
 const pending=[],connect=(...a)=>pending.push(a);
 for(let i=0;i<4;i++){
  const x=300+300*(i%2),y=150*Math.floor(i/2),z=400;
  for(const[n,yy]of [['read_ready',21],['write_ready',25],['drained',29]])connect('lane'+i+'_'+n,P(x+242,y+yy,z+80),'north',pt(lanes[i],n),'south');
  connect('lane'+i+'_read_valid',P(x+192,y+60,z+5),'south',pt(lanes[i],'read_valid'),'south');
  connect('lane'+i+'_write_valid',P(x+196,y+60,z+5),'south',pt(lanes[i],'write_valid'),'south');
  connect('lane'+i+'_quiet',pt(lanes[i],'quiet'),'south',pt(join,'quiet'+i),'south');
 }
 connect('owner_idle',P(603,192,-396),'north',pt(join,'owner_idle'),'south');
 connect('owner_complete',P(607,251,-399),'east',pt(join,'owner_complete'),'south');
 connect('held_rf_request',P(645,250,-320),'south',pt(join,'rf_request'),'south');
 connect('actual_rf_ack',P(980,305,2),'east',pt(join,'rf_ack'),'south');
 connect('joined_lsu_quiet',pt(join,'lsu_quiet'),'south',base.ports.reset_barrier.lsu_quiet.bits[0].position,'north');
 connect('joined_rf_quiet',pt(join,'rf_quiet'),'south',base.ports.reset_barrier.rf_quiet.bits[0].position,'north');
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=name==='actual_rf_ack'?16:0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const found=searchPath(map,start,approach,{ignore,reserved,forbidden});path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,reset_quiet:{lanes:lanes.map(d=>d.ports),join:join.ports}};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_reset_ownership_quiet_candidate',blocks,parents,ports,edges,routes,connections,box,columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1034,connections:connections.length},native_acceptance:false,complete_core_reset:false,missing:['Global memory READY/drained interconnect remains pending; the local guard observes the actual LSU receiving pads, not a substitute source.','Global program quiet interconnect and fault-abort-safe remain explicit inputs.','Subsequent staged local service, far closure and reset acknowledgment/release controller. Current quiet must not authorize immediate RF operand clearing before LSU reset completion.','Measured whole-path delays, control stability and bank closure bounds.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeResetQuiet({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
