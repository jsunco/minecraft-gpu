// Interpose B-held scalar guards before each LSU multi-bit NEXT matrix. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices} from '../control-commit-v2/route.mjs';

import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function makeGuardSampling({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-closure-v1/source-manifest.json',import.meta.url))).digest('hex'),'6c9b690bdd1ad6548163d875897c5d86c3518e76b26f25c5cb831625a587b6b2');
 const pm=read('../control-reset-closure-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-closure-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-closure-v1/design.json']);
 const base=read('../control-reset-closure-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[],routes=[],connections=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 const oldLsu=read('../control-lsu-v2/design.json'),fields=['start','invalid','matched_ready','safe','reset','update','request'],oldNames=fields.map(n=>['reset','update','request'].includes(n)?'external_next_'+n:'guard_to_next_'+n),oldSet=new Set(oldNames),removed=[],bindings=[],guardBanks=[];
 const offsets=[P(300,0,400),P(600,0,400),P(300,150,400),P(600,150,400)],move=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z),pending=[],tails={},connect=(...a)=>pending.push(a);
 for(const[lane,t]of offsets.entries()){
  for(const b of oldLsu.blocks.filter(v=>oldSet.has(v.part))){const p=move(b.position,t),actual=at(p);assert.deepEqual(actual?.block,b.block,'Removed LSU path mismatch '+lane+' '+K(p));removed.push({...b,position:p,lane,old_route:b.part});map.delete(K(p));}
 }
 const removedKeys=new Set(removed.map(v=>K(v.position)));for(const e of base.edges)if(!removedKeys.has(K(e.from))&&!removedKeys.has(K(e.to)))edge(e.from,e.to);
 for(const[lane,t]of offsets.entries()){
  const bank=insert('guard_bank_'+lane,makeStateBank({width:7,pair:false}),move(P(270,0,100),t));guardBanks.push(bank);
  part='guard_clear_'+lane;
  for(let y=-3;y<=25;y++)put(move(P(266,y,96),t),(y+3)%2===0?'light_gray_concrete':'redstone_torch');
  for(let z=93;z<=94;z++)wire(move(P(266,-3,z),t));rep(move(P(266,-3,95),t),'south');for(let z=93;z<96;z++)edge(move(P(266,-3,z),t),move(P(266,-3,z+1),t));
  for(const[bit,name]of fields.entries()){
   const y=1+4*bit,clamp=move(P(266,y,100),t);part='guard_clamp_'+lane+'_'+name;
   wire(move(P(262,y,100),t));rep(move(P(263,y,100),t),'east');wire(move(P(264,y,100),t));rep(move(P(265,y,100),t),'east');dev(clamp,'comparator',{facing:'west',mode:'subtract'});rep(move(P(267,y,100),t),'east');wire(move(P(268,y,100),t));rep(move(P(269,y,100),t),'east');
   wire(move(P(266,y,97),t));wire(move(P(266,y,98),t));rep(move(P(266,y,99),t),'south');for(let x=262;x<270;x++)edge(move(P(x,y,100),t),move(P(x+1,y,100),t));for(let z=96;z<100;z++)edge(move(P(266,y,z),t),move(P(266,y,z+1),t));edge(move(P(266,y-1,96),t),move(P(266,y,97),t));if(bit<6)edge(move(P(266,y,97),t),move(P(266,y+1,96),t));
   const prior=oldLsu.connections.find(c=>c.name===oldNames[bit]),source=move(prior.source,t),sd=Object.keys(V).find(k=>prior.source.x+V[k][0]===prior.tap.x&&prior.source.z+V[k][1]===prior.tap.z),destination=move(prior.destination,t);
   connect('lane'+lane+'_'+name+'_capture',source,sd,move(P(262,y,100),t),'east');connect('lane'+lane+'_'+name+'_held',pt(bank,'state',bit),'east',destination,'south');tails['lane'+lane+'_'+name+'_held']=oldLsu.routes.find(r=>r.name===prior.name).path.slice(-40).map(p=>move(p,t));bindings.push({lane,name,bit,removed_route:prior.name,raw_source:source,held_output:pt(bank,'state',bit),next_receiver:destination});
  }
  connect('lane'+lane+'_guard_B',move(P(242,45,80),t),'north',pt(bank,'state_open'),'east');
  connect('lane'+lane+'_guard_initialize',move(P(242,37,80),t),'south',move(P(266,-3,93),t),'south');
 }
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const path of Object.values(tails))reserved.push(...path);
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=tails[name]??[end],approach=tail[0];ignore.push(...tail,...tail.map(p=>P(p.x,p.y-1,p.z)));for(const p of tail.slice(1)){forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}let found;try{found=searchPath(map,start,approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...found.path,...tail.slice(1)];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,lsu_held_next_guards:guardBanks.map(v=>v.ports.state)};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_B_held_LSU_next_guards_candidate',blocks,parents,ports,edges,routes,connections,removed,bindings,guard_fields:fields,box,columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1068,connections:connections.length,held_guard_bits:28,removed_routes:28,removed_cells:removed.length},native_acceptance:false,complete_core_reset:false,missing:['Actual B-close to guard/logic settling before A-open must be bounded over each real receiver. Raw initialize is quiescent/pre-run only.','Other core/fetch/RF completion predicates still need source-by-source sampling and phase-bound review.','Architectural zero/reset release/ACK and global memory interconnects remain separate dependencies.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeGuardSampling({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
