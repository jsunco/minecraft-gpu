// Connected narrow control-epoch zero transfer after architectural reset. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync}from'node:fs';
import {createHash}from'node:crypto';
import {pathToFileURL}from'node:url';
import {makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';
import {materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix}from'../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices}from'../control-commit-v2/route.mjs';
import {definition,arrivalDefinition}from'./logic.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeResetEpoch({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-zero-v1/source-manifest.json',import.meta.url))).digest('hex'),'1d06f63875121be07f3ac1f5c645886caea085bf9e034116c720c51433927a65');const pm=read('../control-reset-zero-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-zero-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-zero-v1/design.json']);
 const base=read('../control-reset-zero-v1/design.json'),map=new Map(base.blocks.map(v=>[K(v.position),{...v,part:'base'}])),parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}},edges=[],routes=[],connections=[],removed=[],clear_columns=[],positive_columns=[];let part='';const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n),move=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,part+" support "+K(p)+" existing "+at(p).part);return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const v of r.blocks){assert(!at(v.position),'Component collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}for(const e of d.edges??[])edge(move(e.from,t),move(e.to,t));parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position,pending=[],connect=(...a)=>pending.push(a);

 const substitutions=[],states={},arrivals=[];
 const logic=insert('epoch_logic',makeMatrix(definition()),P(-420,200,440));
 const arrived=insert('actual_epoch_arrivals',makeMatrix(arrivalDefinition()),P(-280,274,450));
 for(const[i,name]of ['prepared','committed','settled'].entries())states[name]=insert('epoch_'+name,makeStateBank({width:1,pair:true}),P(-420+30*i,180,410));
 states.enable=insert('epoch_A_held_enable',makeStateBank({width:1,pair:false}),P(-310,180,410));
 const selectTap=(s,preferred)=>[preferred,...Object.keys(V).filter(d=>d!==preferred)].find(dir=>[1,2].every(n=>{const p=step(s,dir,n);return !at(p)&&at(P(p.x,p.y-2,p.z))?.block.id!==W&&(!at(P(p.x,p.y-1,p.z))||at(P(p.x,p.y-1,p.z)).block.id==='minecraft:light_gray_concrete');}));
 const auto=(n,s,sd,d,ad)=>{const chosen=selectTap(s,sd);assert(chosen,'No source escape '+n+' '+K(s));connect(n,s,chosen,d,ad);};
 for(const name of ['prepared','committed','settled','enable']){
  connect(name+'_D',pt(logic,name+'_D'),'south',pt(states[name],'next_data'),'east');
  connect(name+'_feedback',pt(states[name],'state'),'east',pt(logic,name),'south');
 }
 const phaseA=insert('epoch_A_fanout',makeMatrix({inputs:['phase'],outputs:['a0','a1','a2','a3'],products:[0,1,2,3].map(i=>({out:'a'+i,literals:{phase:true}}))}),P(-580,172,410));
 const phaseB=insert('epoch_B_fanout',makeMatrix({inputs:['phase'],outputs:['b0','b1','b2'],products:[0,1,2].map(i=>({out:'b'+i,literals:{phase:true}}))}),P(-580,188,410));
 const oldRoutes=read('../control-reset-zero-v1/routes.json');
 function pathSource(name,dir='east'){for(const p of [...oldRoutes[name].path].reverse()){if(at(p)?.block.id!==W)continue;const d=selectTap(p,dir);if(d)return[p,d];}throw Error('No source tap '+name);}
 const[a,ad]=pathSource('real_A_to_fanout'),[b,bd]=pathSource('real_B_to_fanout');connect('actual_A_to_epoch',a,ad,pt(phaseA,'phase'),'south');connect('actual_B_to_epoch',b,bd,pt(phaseB,'phase'),'south');
 for(const[i,name]of ['prepared','committed','settled','enable'].entries())connect(name+'_A',pt(phaseA,'a'+i),'south',pt(states[name],name==='enable'?'state_open':'next_open'),'east');
 for(const[i,name]of ['prepared','committed','settled'].entries())connect(name+'_B',pt(phaseB,'b'+i),'south',pt(states[name],'current_open'),'east');
 auto('architectural_transfer_stopped',base.ports.architectural_zero.states.stop.bits[0].position,'south',pt(logic,'active'),'south');
 const[cs,cd]=pathSource('quiescent_initialize_to_zero_pipeline');connect('cold_initialize_to_epoch',cs,cd,pt(logic,'initialize'),'south');
 const[fs,fd]=pathSource('fault_blocks_zero_actions');connect('fault_to_epoch',fs,fd,pt(logic,'fault'),'south');
 const[rs,rd]=pathSource('release_complete_to_zero_pipeline');connect('release_complete_to_epoch',rs,rd,pt(logic,'release'),'south');
 connect('all_delivered_epoch_masks',pt(arrived,'all_arrived'),'south',pt(logic,'arrived'),'south');
 const destinations=[['upper_core_commit_owner_zero',P(-104,64,-6),'north'],['retained_front_intent_clear',P(-44,-2,85),'south'],['advance_samples_and_DONE_clear',P(108,-3,-110),'south'],['local_architectural_reset_blank',P(-140,1,-2),'west']];
 // All four copies are real separate normalized matrix outputs. Warm clear
 // enters beyond the isolated global-init source: reset pipeline survives.
 for(const[i,[name,d,dir]]of destinations.entries())connect(name,pt(logic,'clear'+i),'south',d,dir);
 connect('A_held_epoch_bank_permit',pt(states.enable,'state'),'north',P(-90,1,0),'west');
 const returnPoints=[['core_zero',P(28,64,4)],['commit_zero',P(378,264,-396)],['owner_zero',P(628,264,-396)],['intent_zero',P(-44,5,88)],['sample_zero',P(113,197,-110)],['reset_blank',P(-140,1,-4)]];
 for(const[i,[name,s]]of returnPoints.entries()){auto(name+'_actual_return',s,'south',pt(arrived,'arrival'+i),'south');arrivals.push({name,source:s,destination:pt(arrived,'arrival'+i)});}
 for(const e of base.edges)edge(e.from,e.to);
 // The obsolete RF cable owned this shared stub; restore the two later
 // local-reset consumers deliberately. No new path to the RF receiver.
 for(const [z,f]of[[-3,'south'],[-1,'north']]){assert.deepEqual(at(P(-138,1,z)).block,{id:'minecraft:repeater',properties:{facing:f,delay:'1'}});edge(P(-138,1,-2),P(-138,1,z));}
 const prefixes={};
 const tails={};
 for(const[n,s,sd,d,ad]of pending)if(ad==='south'){const end=step(d,ad,-2);tails[n]=Array.from({length:17},(_,i)=>step(end,ad,i-16));}
 const halo=p=>{const out=[];for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)out.push(P(p.x+x,p.y+y,p.z+z));return out;};
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const path of Object.values(tails))reserved.push(...path,...halo(path[0]));for(const path of Object.values(prefixes))reserved.push(...path);
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){if(!at(tap))rep(tap,sd);else assert.deepEqual(at(tap).block,{id:'minecraft:repeater',properties:{facing:F[sd],delay:'1'}},'Tap '+name+' '+K(tap));wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=tails[name]??[end],approach=tail[0];ignore.push(...tail,...tail.map(p=>P(p.x,p.y-1,p.z)),...halo(approach).filter(p=>!at(p)));forbidden.push(...[-2,-1,1,2].map(y=>P(approach.x,approach.y+y,approach.z)));for(const p of tail.slice(1)){forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const prefix=prefixes[name]??[start];assert.deepEqual(prefix[0],start);ignore.push(...prefix,...prefix.map(p=>P(p.x,p.y-1,p.z)));for(const p of prefix.slice(0,-2))forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));let found;try{found=searchPath(map,prefix.at(-1),approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...prefix.slice(0,-1),...found.path,...tail.slice(1)];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 part='epoch_transfer_data_OPEN_cap';solid(P(-363,181,415));
 const ports={...base.ports,reset_epoch:{...logic.ports,states:Object.fromEntries(Object.entries(states).map(([n,s])=>[n,s.ports.state])),actual_arrivals:arrived.ports}};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_control_epoch_zero_pipeline_candidate',blocks,parents,ports,edges,routes,connections,substitutions,removed,arrivals,clear_columns,positive_columns,box,metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1109,new_pipeline_bits:7,connections:connections.length},native_acceptance:false,complete_core_reset:false,missing:['Final far closure, held reset ACK and reset-withdrawal/rearm controller remain unfinished.','Actual phase-to-farthest capture/closure timing is not established by this static map.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeResetEpoch({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
