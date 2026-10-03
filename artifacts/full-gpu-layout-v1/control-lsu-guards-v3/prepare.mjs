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
function bankNorth(width){const d=makeStateBank({width,pair:false});for(const b of d.blocks){b.position.z=-b.position.z;if(b.block.properties?.facing==='north')b.block.properties.facing='south';else if(b.block.properties?.facing==='south')b.block.properties.facing='north';}for(const p of Object.values(d.ports))for(const b of p.bits)for(const v of Object.values(b))if(v&&typeof v==='object'&&Number.isInteger(v.z))v.z=-v.z;return d;}
export function makeGuardSampling({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-closure-v1/source-manifest.json',import.meta.url))).digest('hex'),'6c9b690bdd1ad6548163d875897c5d86c3518e76b26f25c5cb831625a587b6b2');
 const pm=read('../control-reset-closure-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-reset-closure-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-reset-closure-v1/design.json']);
 const base=read('../control-reset-closure-v1/design.json'),map=new Map(base.blocks.map(b=>[K(b.position),{...b,part:'base'}])),edges=[],routes=[],connections=[],parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block,'Support collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'Component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}for(const e of r.edges??[])edge(e.from,e.to);parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 const oldLsu=read('../control-lsu-v2/design.json'),fields=['request','enable','mem_read','mem_write','reset','read_ready','write_ready','drained','update'],oldNames=[...fields.slice(0,8).map(n=>'external_guard_'+n),...['request','reset','update'].map(n=>'external_next_'+n)],oldSet=new Set(oldNames),removed=[],bindings=[],guardBanks=[];
 const offsets=[P(300,0,400),P(600,0,400),P(300,150,400),P(600,150,400)],move=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z),pending=[],tails={},connect=(...a)=>pending.push(a);
 for(const[lane,t]of offsets.entries()){
  for(const b of oldLsu.blocks.filter(v=>oldSet.has(v.part))){const p=move(b.position,t),actual=at(p);assert.deepEqual(actual?.block,b.block,'Removed LSU path mismatch '+lane+' '+K(p));removed.push({...b,position:p,lane,old_route:b.part});map.delete(K(p));}
 }
 const removedKeys=new Set(removed.map(v=>K(v.position)));for(const e of base.edges)if(!removedKeys.has(K(e.from))&&!removedKeys.has(K(e.to)))edge(e.from,e.to);
 for(const[lane,t]of offsets.entries()){
  const banks=[insert('guard_bank_'+lane+'_low',bankNorth(8),move(P(250,0,80),t)),insert('guard_bank_'+lane+'_high',bankNorth(1),move(P(250,32,80),t))];guardBanks.push(...banks);
  part='guard_clear_'+lane;
  for(let y=-3;y<=33;y++)put(move(P(246,y,76),t),(y+3)%2===0?'light_gray_concrete':'redstone_torch');
  for(let y=-2;y<32;y+=2)edge(move(P(246,y,76),t),move(P(246,y+2,76),t));edge(move(P(246,-3,75),t),move(P(246,-2,76),t));
  for(let z=73;z<=74;z++)wire(move(P(246,-3,z),t));rep(move(P(246,-3,75),t),'south');for(let z=73;z<76;z++)edge(move(P(246,-3,z),t),move(P(246,-3,z+1),t));
  for(const[bit,name]of fields.entries()){
   const y=1+4*bit,clamp=move(P(246,y,80),t),bank=banks[bit<8?0:1],bb=bit%8;part='guard_clamp_'+lane+'_'+name;
   assert.equal(at(move(P(242,y,80),t))?.block.id,W);
   rep(move(P(243,y,80),t),'east');wire(move(P(244,y,80),t));rep(move(P(245,y,80),t),'east');dev(clamp,'comparator',{facing:'west',mode:'subtract'});rep(move(P(247,y,80),t),'east');wire(move(P(248,y,80),t));rep(move(P(249,y,80),t),'east');
   wire(move(P(246,y,77),t));wire(move(P(246,y,78),t));rep(move(P(246,y,79),t),'south');for(let x=242;x<250;x++)edge(move(P(x,y,80),t),move(P(x+1,y,80),t));for(let z=76;z<80;z++)edge(move(P(246,y,z),t),move(P(246,y,z+1),t));edge(move(P(246,y-1,76),t),move(P(246,y,77),t));if(bit<8)edge(move(P(246,y,77),t),move(P(246,y+1,76),t));
   const routesForName=oldLsu.connections.filter(c=>oldSet.has(c.name)&&c.name.endsWith('_'+name));
   for(const[fanout,prior]of routesForName.entries()){
    const destination=move(prior.destination,t),routeName='lane'+lane+'_'+prior.name+'_held';
    connect(routeName,pt(bank,'state',bb),fanout===0?'east':'north',destination,'south');
    tails[routeName]=oldLsu.routes.find(r=>r.name===prior.name).path.slice(prior.name==='external_next_update'?-60:-14).map(p=>move(p,t));
    bindings.push({lane,name,bit,removed_route:prior.name,raw_source:move(P(242,y,80),t),held_output:pt(bank,'state',bb),next_receiver:destination});
   }
  }
  connect('lane'+lane+'_guard_B_low',move(P(242,45,80),t),'north',pt(banks[0],'state_open'),'east');
  connect('lane'+lane+'_guard_B_high',move(P(242,45,80),t),'south',pt(banks[1],'state_open'),'east');
  connect('lane'+lane+'_guard_initialize',lane===2?P(555,187,483):move(P(242,37,80),t),'south',move(P(246,-3,73),t),'south');
 }
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const path of Object.values(tails))reserved.push(...path);
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(tap,sd);wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=tails[name]??[end],approach=tail[0];ignore.push(...tail,...tail.map(p=>P(p.x,p.y-1,p.z)));forbidden.push(...[-2,-1,1,2].map(y=>P(approach.x,approach.y+y,approach.z)));for(const p of tail.slice(1)){forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}let found;try{found=searchPath(map,start,approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...found.path,...tail.slice(1)];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 const priority=n=>n.includes('guard_initialize')?0:n.includes('external_next_update')?1:2;pending.sort((a,b)=>priority(a[0])-priority(b[0]));for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,lsu_held_next_guards:guardBanks.map(v=>v.ports.state)};const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_B_held_LSU_next_guards_candidate',blocks,parents,ports,edges,routes,connections,removed,bindings,guard_fields:fields,box,clear_columns:offsets.map(t=>({base:move(P(246,-3,76),t),outputs:fields.map((_,b)=>({solid:move(P(246,1+4*b,76),t),torch:move(P(246,4*b,76),t),wire:move(P(246,1+4*b,77),t)}))})),columns:[],metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1076,connections:connections.length,held_guard_bits:36,removed_routes:44,removed_cells:removed.length},native_acceptance:false,complete_core_reset:false,missing:['Actual B-close to guard/logic settling before A-open must be bounded over each real receiver. Raw initialize is quiescent/pre-run only.','Other core/fetch/RF completion predicates still need source-by-source sampling and phase-bound review.','Architectural zero/reset release/ACK and global memory interconnects remain separate dependencies.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeGuardSampling({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
