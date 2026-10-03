// Connected architectural zero transfer after retained scratch reset. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync}from'node:fs';
import {createHash}from'node:crypto';
import {pathToFileURL}from'node:url';
import {makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';
import {materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix}from'../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices}from'../control-commit-v2/route.mjs';
import {definition,clampDefinition}from'./logic.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeArchitecturalZero({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-rf-status-v1/source-manifest.json',import.meta.url))).digest('hex'),'5eff30733b20398e3049cbe34886d97be44aaf431f7f401d0b00afc1a56951c6');const pm=read('../control-rf-status-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-rf-status-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-rf-status-v1/design.json']);
 const base=read('../control-rf-status-v1/design.json'),map=new Map(base.blocks.map(v=>[K(v.position),{...v,part:'base'}])),parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}},edges=[],routes=[],connections=[],removed=[],clear_columns=[],positive_columns=[];let part='';const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n),move=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,part+" support "+K(p)+" existing "+at(p).part);return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const v of r.blocks){assert(!at(v.position),'Component collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}for(const e of d.edges??[])edge(move(e.from,t),move(e.to,t));parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position,pending=[],connect=(...a)=>pending.push(a);

 const substitutions=[],clamps=[],states={};
 const logic=insert('architectural_zero_logic',makeMatrix(definition()),P(-240,160,340));
 const oldZero=read('../control-initialize-v1/design.json');
 const arrived=insert('actual_clamp_returns',makeMatrix(clampDefinition()),P(84,276,180));
 for(const [i,name]of ['active','prepared','transferred'].entries())states[name]=insert('zero_'+name,makeStateBank({width:1,pair:true}),P(-230+30*i,140,310));
 states.stop=insert('zero_stop_after_full_transfer',makeStateBank({width:1,pair:false}),P(-130,140,310));
 const selectTap=(s,preferred)=>[preferred,...Object.keys(V).filter(d=>d!==preferred)].find(dir=>[1,2].every(n=>{const p=step(s,dir,n);return !at(p)&&at(P(p.x,p.y-2,p.z))?.block.id!==W&&(!at(P(p.x,p.y-1,p.z))||at(P(p.x,p.y-1,p.z)).block.id==='minecraft:light_gray_concrete');}));
 const auto=(n,s,sd,d,ad)=>{const chosen=selectTap(s,sd);assert(chosen,'No source escape '+n+' '+K(s));connect(n,s,chosen,d,ad);};
 // The four retained scalar stages form a monotonic transfer pipeline. No raw
 // binary decode directly controls a reset OPEN or an external acknowledgment.
 for(const name of ['active','prepared','transferred','stop']){
  connect(name+'_D',pt(logic,name==='stop'?'stop_D':name+'_D'),'south',pt(states[name],'next_data'),'east');
  connect(name+'_feedback',pt(states[name],'state'),'east',pt(logic,name),'south');
 }
 auto('actual_A_held_NEXT_witness',P(-165,141,310),'north',pt(logic,'next_captured'),'south');
 // Distinct branch points on existing raw phase wires avoid sharing an input
 // diode with another route. Their same-net ancestry is checked explicitly.
 // Selected phase fanout will be physically built below, once per stage.
 const phaseA=insert('local_A_fanout',makeMatrix({inputs:['phase'],outputs:['a0','a1','a2','a3','a4'],products:[0,1,2,3,4].map(i=>({out:'a'+i,literals:{phase:true}}))}),P(-400,132,310));
 const phaseB=insert('local_B_fanout',makeMatrix({inputs:['phase'],outputs:['b0','b1','b2','b3'],products:[0,1,2,3].map(i=>({out:'b'+i,literals:{phase:true}}))}),P(-400,148,310));
 const phaseRoutes=read('../control-core-guards-v1/routes.json');const pickPathTap=name=>{for(const p of phaseRoutes[name].path){if(at(p)?.block.id!==W)continue;const dir=selectTap(p,'east');if(dir)return[p,dir];}throw Error('No actual phase route tap '+name);};const [aSource,aDir]=pickPathTap('actual_A_to_done_store'),[bSource,bDir]=pickPathTap('actual_B_to_sampler_column');connect('real_A_to_fanout',aSource,aDir,pt(phaseA,'phase'),'south');connect('real_B_to_fanout',bSource,bDir,pt(phaseB,'phase'),'south');
 for(const[i,name]of ['active','prepared','transferred','stop'].entries())connect(name+'_A',pt(phaseA,'a'+i),'south',pt(states[name],name==='stop'?'state_open':'next_open'),'east');
 for(const[i,name]of ['active','prepared','transferred'].entries())connect(name+'_B',pt(phaseB,'b'+i),'south',pt(states[name],'current_open'),'east');
 connect('A_action_window',pt(phaseA,'a4'),'south',pt(logic,'phase_a'),'south');connect('B_action_window',pt(phaseB,'b3'),'south',pt(logic,'phase_b'),'south');
 auto('scratch_complete_to_architectural_service',base.ports.reset_scratch.scratch_complete.bits[0].position,'south',pt(logic,'scratch_complete'),'south');
 auto('quiescent_initialize_to_zero_pipeline',P(-67,21,-6),'north',pt(logic,'initialize'),'south');const[faultSource,faultDir]=pickPathTap('done_fault');connect('fault_blocks_zero_actions',faultSource,faultDir,pt(logic,'fault'),'south');
 auto('release_complete_to_zero_pipeline',base.ports.reset_barrier.release_complete.bits[0].position,'south',pt(logic,'release'),'south');
 // Reuse the twenty existing PC/NZP subtractors and all six far OPEN routes.
 // Split only the two cold OPEN-enable branches before adding a warm-active
 // wired OR to their common data-mask rail.
 for(const x of[-30,-26])for(const q of[P(x,310,-89),P(x,309,-89)]){const v=at(q);assert(v,'Missing old init branch '+K(q));if(q.y===310)assert.deepEqual(v.block,{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});removed.push(v);map.delete(K(q));}
 for(const v of oldZero.blocks.filter(v=>['init_gate_0','init_gate_1'].includes(v.part))){assert.deepEqual(at(v.position)?.block,v.block,'Cold route drift '+K(v.position));removed.push(at(v.position));map.delete(K(v.position));}
 for(const c of oldZero.clamps){assert.deepEqual(at(c.comparator)?.block,{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});clamps.push({...c,bit:clamps.length});}
 auto('warm_active_to_existing_zero_masks',pt(states.active,'state'),'north',P(-114,310,-90),'south');
 const coldFanout=insert('preserved_cold_OPEN_enable',makeMatrix({inputs:['cold'],outputs:['coldA','coldB'],products:[{out:'coldA',literals:{cold:true}},{out:'coldB',literals:{cold:true}}]}),P(-200,300,-115));
 auto('original_cold_before_warm_OR',P(-116,310,-90),'north',pt(coldFanout,'cold'),'south');
 connect('preserved_cold_A_enable',pt(coldFanout,'coldA'),'south',P(-100,310,-122),'south');connect('preserved_cold_B_enable',pt(coldFanout,'coldB'),'south',P(-84,310,-122),'south');
 connect('all_actual_clamp_returns',pt(arrived,'all_clamps_high'),'south',pt(logic,'clamps_high'),'south');
 for(const c of clamps){c.return_source=/^flags_[123]_/.test(c.name)?P(c.input.x,c.input.y,c.input.z+2):c.input;c.return_suffix=/^flags_[123]_/.test(c.name)?[c.return_source,P(c.input.x,c.input.y,c.input.z+1),c.input,c.mask,c.comparator]:[c.input,c.mask,c.comparator];auto(c.name+'_arrival_return',c.return_source,'south',pt(arrived,'clamp'+c.bit),'south');}
 connect('qualified_zero_NEXT_into_existing_fanout',pt(logic,'next_open'),'south',P(-98,310,-116),'west');connect('qualified_zero_CURRENT_into_existing_route',pt(logic,'current_open'),'south',P(-82,310,-116),'west');
 // Replace the obsolete immediate local-reset cable: RF operand clearing now
 // follows actual scratch completion and can later withdraw independently.
 const assignment=read('../control-assignment-v1/design.json');
 for(const v of assignment.blocks.filter(v=>v.part==='reset_to_rf')){assert.deepEqual(at(v.position)?.block,v.block,'Old RF reset route drift '+K(v.position));removed.push(at(v.position));map.delete(K(v.position));}
 connect('post_scratch_RF_reset',pt(logic,'rf_reset'),'south',base.ports.rf.reset_request.bits[0].position,'south');
 const removedKeys=new Set(removed.map(v=>K(v.position)));for(const e of base.edges)if(!removedKeys.has(K(e.from))&&!removedKeys.has(K(e.to)))edge(e.from,e.to);
 const prefixes={};
 const tails={};
 for(const[n,s,sd,d,ad]of pending)if(ad==='south'&&n!=='post_scratch_RF_reset'){const end=step(d,ad,-2);tails[n]=Array.from({length:17},(_,i)=>step(end,ad,i-16));}
 const halo=p=>{const out=[];for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)out.push(P(p.x+x,p.y+y,p.z+z));return out;};
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const path of Object.values(tails))reserved.push(...path,...halo(path[0]));for(const path of Object.values(prefixes))reserved.push(...path);
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){if(!at(tap))rep(tap,sd);else assert.deepEqual(at(tap).block,{id:'minecraft:repeater',properties:{facing:F[sd],delay:'1'}},'Tap '+name+' '+K(tap));wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=tails[name]??[end],approach=tail[0];ignore.push(...tail,...tail.map(p=>P(p.x,p.y-1,p.z)),...halo(approach));forbidden.push(...[-2,-1,1,2].map(y=>P(approach.x,approach.y+y,approach.z)));for(const p of tail.slice(1)){forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const prefix=prefixes[name]??[start];assert.deepEqual(prefix[0],start);ignore.push(...prefix,...prefix.map(p=>P(p.x,p.y-1,p.z)));for(const p of prefix.slice(0,-2))forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));let found;try{found=searchPath(map,prefix.at(-1),approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...prefix.slice(0,-1),...found.path,...tail.slice(1)];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 part='transfer_data_OPEN_isolation_cap';solid(P(-173,141,315));
 const ports={...base.ports,architectural_zero:{...logic.ports,states:Object.fromEntries(Object.entries(states).map(([n,s])=>[n,s.ports.state])),actual_clamp_inputs:arrived.ports}};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_architectural_zero_transfer_pipeline_candidate',blocks,parents,ports,edges,routes,connections,substitutions,removed,clamps,clear_columns,positive_columns,box,metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1102,new_pipeline_bits:7,connections:connections.length,clamped_PC_bits:8,clamped_NZP_bits:12},native_acceptance:false,complete_core_reset:false,missing:['Final architectural closure/release controller and core epoch reset gates are unfinished; withdraw is not yet produced.','No final core reset acknowledgment. Real RF reset ACK is not substituted for PC/flags/epoch closure.','Full phase/route margins and vanilla dynamics remain unproved.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeArchitecturalZero({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
