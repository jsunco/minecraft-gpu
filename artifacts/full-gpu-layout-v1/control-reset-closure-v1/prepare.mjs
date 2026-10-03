// Actual ALU lock-rail returns and a retained, phase-qualified closure candidate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
import {laneDefinition,joinDefinition,inventory,laneOffsets} from './logic.mjs';
import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeClosure({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-scratch-v1/source-manifest.json',import.meta.url))).digest('hex'),'8ca1f0720d39bcc5722cdfe147b4e6ee818a12031643d5030fa85caa4028a11a');
 const pm=read('../control-reset-scratch-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-scratch-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-scratch-v1/design.json']);
 const base=read('../control-reset-scratch-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[...base.edges],routes=[],connections=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 const laneLogic=laneOffsets.map((t,i)=>insert('lane'+i,makeMatrix(laneDefinition()),P(t.x,t.y-12,230)));
 const logic=insert('logic',makeMatrix(joinDefinition()),P(1650,280,250)),state=insert('closure_state',makeStateBank({width:2,pair:true}),P(1650,260,270));
 const pending=[],connect=(...a)=>pending.push(a),locks=inventory();
 for(const v of locks){assert.deepEqual(at(v.lock)?.block,{id:'minecraft:repeater',properties:{facing:'south',delay:'1'}},'Lock orientation '+K(v.lock));assert.equal(at(v.store)?.block.id,'minecraft:repeater');assert.equal(at(v.rear)?.block.id,W);if(v.observed)connect('lane'+v.lane+'_'+v.rail,v.rear,v.tap_direction,pt(laneLogic[v.lane],v.rail),'south');}
 for(let i=0;i<4;i++)connect('lane'+i+'_closed',pt(laneLogic[i],'rails_closed'),'south',pt(logic,'lane'+i),'south');
 for(const[i,n]of['armed','qualified'].entries()){connect(n+'_feedback',pt(state,'state',i),'east',pt(logic,n),'south');connect(n+'_next',pt(logic,n+'_D'),'south',pt(state,'next_data',i),'east');}
 connect('raw_A',P(1240,230,-165),'south',pt(state,'next_open'),'east');
 connect('raw_B',P(1244,226,-165),'south',pt(state,'current_open'),'east');
 connect('initialize',P(1180,247,-205),'south',pt(logic,'initialize'),'south');
 connect('scratch_active',P(-534,80,-142),'north',pt(logic,'active'),'south');
 connect('reset_wait',P(1417,-17,8),'south',pt(logic,'reset_wait'),'south');
 connect('release',P(-430,77,-185),'south',pt(logic,'release'),'south');
 connect('qualified_closure',pt(logic,'closure'),'south',base.ports.reset_scratch.closure.bits[0].position,'east');
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}let found;try{found=searchPath(map,start,approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,reset_closure:{...logic.ports,armed:{...state.ports.state,width:1,bits:[{...state.ports.state.bits[0],bit:0}]},qualified:{...state.ports.state,width:1,bits:[{...state.ports.state.bits[1],bit:0}]}}};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_actual_lock_rail_closure_candidate',blocks,parents,ports,edges,routes,connections,lock_inventory:locks,box,columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1040,connections:connections.length,observed_rails:60,physical_locks:228},native_acceptance:false,complete_core_reset:false,missing:['Each observed lock rail must settle all listed branches before the qualified closure interval; component counts are not a native timing proof.','Later architectural zeroing, final acknowledgment and release controller.','Global program and data-memory interconnects remain separate boundaries. Fault recovery requires destructive BOOT and full image reload/readback.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeClosure({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
