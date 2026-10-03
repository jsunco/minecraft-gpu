// Connected reset-entry barrier; later reset-service producer stays explicit.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
import {definition} from './logic.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeRetireBarrier({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-alu-lsu-union-v1/source-manifest.json',import.meta.url))).digest('hex'),'5fc4f695daf54795f53f27536f81335e54c7bcece710126fc1e774d12ef5bc6a');
 const parentManifest=read('../control-alu-lsu-union-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-alu-lsu-union-v1/design.json',import.meta.url))).digest('hex'),parentManifest.source_sha256['artifacts/full-gpu-layout-v1/control-alu-lsu-union-v1/design.json']);
 const base=read('../control-alu-lsu-union-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[...base.edges],routes=[],connections=[],substitutions=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const logic=insert('logic',makeMatrix(definition()),P(-440,80,-180)),state=insert('state',makeStateBank({width:3,pair:true}),P(-420,60,-140)),pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 for(const y of [1,49]){
  // This receiver already has a normalized rear: the old final route repeater
  // at z-5 drives the z-4 input wire. Preserve its possibly turning approach.
  const p=P(22,y,-3),old=at(p);assert.equal(old?.block.id,'minecraft:repeater');assert.equal(old.block.properties.facing,'north');
  const after={id:'minecraft:comparator',properties:{facing:'north',mode:'subtract'}};
  assert.equal(at(P(22,y,-4))?.block.id,W);assert.equal(at(P(22,y,-2))?.block.id,W);edge(P(22,y,-4),p);edge(p,P(22,y,-2));substitutions.push({position:p,before:old.block,after});map.set(K(p),{...old,block:after,part:'advance_mask'});
  part='advance_mask';rep(P(23,y,-3),'west');wire(P(24,y,-3));edge(P(24,y,-3),P(23,y,-3));edge(P(23,y,-3),P(22,y,-3));
 }
 const pending=[],connect=(...a)=>pending.push(a);
 for(const[b,n]of ['pending','candidate','parked'].entries()){
  connect(n+'_feedback',pt(state,'state',b),'east',pt(logic,n),'south');
  connect(n+'_next',pt(logic,n+'_D'),'south',pt(state,'next_data',b),'east');
 }
 // Exact fresh existing source pads, with new isolated branch receivers.
 connect('raw_A_to_barrier',P(-75,5,8),'east',pt(state,'next_open'),'east');
 connect('raw_B_to_barrier',P(-52,2,15),'south',pt(state,'current_open'),'east');
 connect('initialize_to_barrier',P(-67,21,-10),'south',pt(logic,'initialize'),'south');
 connect('IDLE_to_barrier',P(8,7,2),'east',pt(logic,'idle'),'south');
 connect('DONE_to_barrier',P(14,57,6),'north',pt(logic,'done'),'south');
 connect('UPDATE_to_barrier',P(23,54,5),'south',pt(logic,'update'),'south');
 connect('commit_complete_to_barrier',P(351,242,-391),'north',pt(logic,'commit_complete'),'south');
 connect('mask_IDLE',pt(logic,'entry_mask'),'east',P(24,1,-3),'west');
 connect('mask_UPDATE',pt(logic,'entry_mask'),'south',P(24,49,-3),'west');
 connect('mask_START',pt(logic,'entry_mask'),'west',P(-258,57,-125),'east');
 connect('mask_IDLE_return',P(24,1,-3),'south',pt(logic,'idle_mask_arrived'),'south');
 connect('mask_UPDATE_return',P(24,49,-3),'north',pt(logic,'update_mask_arrived'),'south');
 connect('program_ready_to_barrier',P(120,1,136),'north',pt(logic,'program_ready'),'south');
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=name==='program_ready_to_barrier'?12:0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const found=searchPath(map,start,approach,{ignore,reserved,forbidden});path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,reset_request:{...logic.ports.reset_request,meaning:'Dispatch warm reset request; held until full reset acknowledgment. Does not directly clear owned payloads.'},local_reset_service:{...base.ports.front.reset_request,meaning:'Existing immediate-reset fanout. A later staged reset producer must drive this only after ownership guards, never raw dispatch reset.'},reset_barrier:{...logic.ports,state:state.ports.state}};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_retained_reset_entry_barrier_candidate',blocks,parents,ports,edges,routes,connections,substitutions,box,columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1034,connections:connections.length},native_acceptance:false,complete_core_reset:false,missing:['Physical program_quiet/RF-closure/LSU-ownership quiet and fault-abort-safe producers into the named guard pads.','Subsequent local reset, PC/flags/RF zero, far closure, reset_ack/release controller. service_ready is not reset_ack.','Measured source-mask round-trip and A-close-B-close margins; two retained boundary observations are not a measured delay guarantee.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeRetireBarrier({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
