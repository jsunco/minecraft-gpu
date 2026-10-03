// Retained first reset-service stage: scratch requests before architectural operands clear.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';
import {definition} from './logic.mjs';
import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeScratchReset({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-quiet-v1/source-manifest.json',import.meta.url))).digest('hex'),'7097ef9fe7e6e2cdf59fa3f4a168d75596dbe51fc5c9c4d51fbe88aaa7a15eac');
 const pm=read('../control-reset-quiet-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-quiet-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-quiet-v1/design.json']);
 const base=read('../control-reset-quiet-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[...base.edges],routes=[],connections=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 // Deliberately disable warm fault recovery. This constant side input keeps
 // the old abort-safe receiver at zero even if the obsolete pad is driven.
 const disabledAbort=P(-363,77,-185),oldAbort=at(disabledAbort).block;
 assert.deepEqual(oldAbort,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
 const afterAbort={id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}};
 map.set(K(disabledAbort),{...at(disabledAbort),block:afterAbort,part:'abort_disabled'});
 part='abort_disabled';rep(P(-363,77,-184),'north');dev(P(-363,77,-183),'redstone_block');
 edge(P(-363,77,-183),P(-363,77,-184));edge(P(-363,77,-184),disabledAbort);
 assert.equal(at(P(-362,77,-185)).block.id,'minecraft:light_gray_concrete');assert.equal(at(P(-362,78,-185)).block.id,'minecraft:redstone_torch');
 edge(P(-364,77,-185),disabledAbort);edge(disabledAbort,P(-362,77,-185));edge(disabledAbort,P(-362,78,-185));
 const substitutions=[{position:disabledAbort,before:oldAbort,after:afterAbort,reason:'Permanent abort-safe clamp; warm reset does not recover faults.'}];
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 const logic=insert('logic',makeMatrix(definition()),P(-600,100,-180)),state=insert('active_state',makeStateBank({width:1,pair:true}),P(-570,80,-140));
 const pending=[],connect=(...a)=>pending.push(a);
 connect('active_feedback',pt(state,'state'),'east',pt(logic,'active'),'south');
 connect('active_next',pt(logic,'active_D'),'south',pt(state,'next_data'),'east');
 connect('raw_A_to_stage',P(-73,5,8),'east',pt(state,'next_open'),'east');
 connect('raw_B_to_stage',P(-52,2,17),'east',pt(state,'current_open'),'east');
 connect('initialize_to_stage',P(-67,21,-8),'south',pt(logic,'initialize'),'south');
 connect('service_ready_to_stage',base.ports.reset_barrier.service_ready.bits[0].position,'west',pt(logic,'service_ready'),'south');
 connect('release_complete_to_stage',base.ports.reset_barrier.release_complete.bits[0].position,'west',pt(logic,'release_complete'),'south');
 connect('scratch_reset_to_LSU',pt(state,'state'),'north',P(202,80,550),'east');
 connect('scratch_reset_to_ALU',pt(state,'state'),'south',P(1410,-37,14),'south');
 connect('all_LSU_reset_ack',base.ports.lsu_reset_ack.bits[0].position,'west',pt(logic,'lsu_ack'),'south');
 connect('ALU_RESET_WAIT',P(1415,-17,8),'east',pt(logic,'alu_reset_wait'),'south');
 connect('retained_core_fault',P(547,281,-720),'north',pt(logic,'core_fault'),'east');
 connect('all_ALU_status_low',P(2129,308,122),'north',pt(logic,'alu_status_low'),'south');
 for(let i=0;i<4;i++)connect('lane'+i+'_fault',P(1836+(i%2)*184,115+Math.floor(i/2)*124,-36),'north',pt(logic,'fault'+i),i<2?'south':'north');
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=name==='retained_core_fault'?0:name==='lane3_fault'?4:name==='all_ALU_status_low'||/^lane[12]_fault$/.test(name)?16:0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}let found;try{found=searchPath(map,start,approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,architectural_fault:base.ports.fault.fault_latched,reset_barrier:{...base.ports.reset_barrier,abort_safe:{...base.ports.reset_barrier.abort_safe,disabled:true,meaning:'Permanently clamped0; not a warm fault recovery or completion input.'}},reset_scratch:{...logic.ports,active:state.ports.state}};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_retained_scratch_reset_stage_candidate',blocks,parents,ports,edges,routes,connections,substitutions,box,columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1036,connections:connections.length},native_acceptance:false,complete_core_reset:false,missing:['Actual far ALU lock-closure and reset-transfer timing witness into closure input. RESET_WAIT plus status-low alone is insufficient.','Later architectural zeroing, final acknowledgment and release controller; release_complete is an externally unproduced guard, not a host phase.','Global program and memory ready/drained interconnect remain pending. Warm fault abort is deliberately disabled; destructive BOOT plus full image reload/readback is required.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeScratchReset({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
