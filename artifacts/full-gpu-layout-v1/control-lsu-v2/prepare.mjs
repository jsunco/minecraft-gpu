// One complete local LSU control/data adapter. Offline geometry only.
import assert from'node:assert/strict';
import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{pathToFileURL}from'node:url';
import{makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';
import{materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';
import{P,K,V,F,searchPath,refreshIndices}from'../control-commit-v2/route.mjs';
import{makeMatrix}from'./matrix.mjs';
import{guardDefinition,nextDefinition,actionDefinition}from'./logic.mjs';
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete';
export function makeLsu({plan=false}={}){
 const map=new Map(),parents={},components={},edges=[],routes=[],connections=[],payload=[],ports={};let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to});
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.deepEqual(at(p).block,block,'collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,properties)=>{solid(P(p.x,p.y-1,p.z));put(p,id,properties);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}parents[name]={blocks:d.blocks.length,translation:t};components[name]={definition:d.definition,translation:t};return r;}
 const guard=insert('guard',makeMatrix(guardDefinition()),P(0,0,-60));
 const next=insert('next',makeMatrix(nextDefinition()),P(0,0,0));
 const action=insert('action',makeMatrix(actionDefinition()),P(130,0,0));
 const state=insert('state_bank',makeStateBank({width:4,pair:true}),P(110,0,40));
 const bank={};for(const[n,x,w]of[['address',0,8],['store_data',20,8],['type',40,1],['result',60,8],['valid',80,1],['done',100,1],['reset_ack',120,1],['fault',140,1]])bank[n]=insert('bank_'+n,makeStateBank({width:w,pair:false}),P(x,0,60));
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position;
 const ext=(name,direction,bits,meaning)=>ports[name]={direction,width:bits.length,polarity:'active_high',bit_order:'lsb_first',bits:bits.map((p,bit)=>({bit,position:p})),meaning,geometry_status:'drawn_local_native_unverified'};
 // Every payload bit receives a real subtract-comparator zero clamp. One
 // common clear spine/rail, one common address/data/type OPEN rail.
 for(const[n,x,w]of[['address',0,8],['store_data',20,8],['type',40,1],['result',60,8]]){
  part='clear_column_'+n;
  for(let y=-3;y<=1+4*(w-1);y++)put(P(x-4,y,56),(y+3)%2===0?'light_gray_concrete':'redstone_torch');
  for(let y=-3;y<1+4*(w-1);y+=2)edge(y===-3?P(x-4,-3,55):P(x-4,y-1,56),P(x-4,y+1,56));
  for(let z=53;z<=54;z++)wire(P(x-4,-3,z));rep(P(x-4,-3,55),'south');
  for(let z=52;z<56;z++)edge(P(x-4,-3,z),P(x-4,-3,z+1));
  const inputs=[];
  for(let b=0;b<w;b++){
   const y=1+4*b;part='clamp_'+n+'_'+b;
   wire(P(x-8,y,60));rep(P(x-7,y,60),'east');wire(P(x-6,y,60));rep(P(x-5,y,60),'east');dev(P(x-4,y,60),'comparator',{facing:'west',mode:'subtract'});rep(P(x-3,y,60),'east');wire(P(x-2,y,60));rep(P(x-1,y,60),'east');
   wire(P(x-4,y,57));wire(P(x-4,y,58));rep(P(x-4,y,59),'south');
   for(let q=x-8;q<x;q++)edge(P(q,y,60),P(q+1,y,60));for(let z=56;z<60;z++)edge(P(x-4,y,z),P(x-4,y,z+1));
   edge(P(x-4,y-1,56),P(x-4,y,57));if(b<w-1)edge(P(x-4,y,57),P(x-4,y+1,56));
   inputs.push(P(x-8,y,60));payload.push({name:n,bit:b,input:P(x-8,y,60),clamp:P(x-4,y,60),mask:P(x-4,y,59),column:P(x-4,y,56),bank_data:P(x,y,60)});
  }
  ext(n==='address'?'rs':n==='store_data'?'rt':n==='type'?'mem_write_capture':'read_data','input',inputs,'Held source through local payload/response closure; clear comparator overrides with zero.');
 }
 part='clear_bus';for(let x=-10;x<=56;x++){if(x===-9||x>-8&&(x+9)%10===0)rep(P(x,-3,52),'east');else wire(P(x,-3,52));if(x>-10)edge(P(x-1,-3,52),P(x,-3,52));}
 part='payload_open_bus';for(let x=-10;x<=40;x++){if(x===-9||x>-8&&(x+9)%10===0)rep(P(x,0,68),'east');else wire(P(x,0,68));if(x>-10)edge(P(x-1,0,68),P(x,0,68));}
 for(const x of[0,20,40]){part='payload_open_branch_'+x;for(let z=67;z>=65;z--)wire(P(x,0,z));rep(P(x,0,64),'north');for(let z=68;z>63;z--)edge(P(x,0,z),P(x,0,z-1));}
 const pending=[],reserved=[],cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?JSON.parse(readFileSync(cacheUrl)):{};
 const step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 const reserve=(s,sd,d,ad)=>[...Array.from({length:16},(_,i)=>step(s,sd,i+2)),...Array.from({length:16},(_,i)=>step(d,ad,-i-2))];
 const connect=(...v)=>pending.push(v);
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'source '+name);assert.equal(at(d)?.block.id,W,'destination '+name);const first=step(s,sd),start=step(s,sd,2),last=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(first,sd);wire(start);rep(last,ad);wire(end);edge(s,first);edge(first,start);edge(end,last);edge(last,d);return;}
  let path=cache[name]?.path;if(path&&(K(path[0])!==K(start)||K(path.at(-1))!==K(end)||path.slice(1,-1).some(p=>at(p)||at(P(p.x,p.y-1,p.z)))))path=undefined;if(!path){assert(plan,'Missing route '+name);const ignore=[...reserve(s,sd,d,ad),first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))];const forbidden=[first,last].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=d.y===-3&&ad==='south'?12:0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const r=searchPath(map,start,approach,{ignore,reserved,forbidden});path=[...r.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:r.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length+' cells');}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(n=>p.x+V[n][0]===q.x&&p.z+V[n][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap:first,destination:d,arrival:last});
 }
 // Input islands end in a normalized pad and offer isolated fanout sides.
 const inputs=['request','enable','mem_read','mem_write','reset','read_ready','write_ready','drained','update','initialize','phase_a','phase_b'];const sources={};
 for(const[i,n]of inputs.entries()){part='input_'+n;const y=1+4*i;wire(P(240,y,80));rep(P(241,y,80),'east');wire(P(242,y,80));edge(P(240,y,80),P(241,y,80));edge(P(241,y,80),P(242,y,80));sources[n]=P(242,y,80);ext(n,'input',[P(240,y,80)],'Held level; physical phase/cold-admission contract is stated in README.');}
 const useCount=new Map();function sourceConnect(name,s,d,ad,preferred=['east','north','south']){const k=K(s),i=useCount.get(k)??0;assert(i<preferred.length,'Too many source taps '+name);useCount.set(k,i+1);connect(name,s,preferred[i],d,ad);}
 for(const n of guardDefinition().inputs){if(n==='is_write')continue;sourceConnect('external_guard_'+n,sources[n],pt(guard,n),'south');}
 for(const n of['request','reset','update','initialize'])sourceConnect('external_next_'+n,sources[n],pt(next,n),'south');
 for(const n of['phase_a','initialize'])sourceConnect('external_action_'+n,sources[n],pt(action,n),'south');
 sourceConnect('type_capture',sources.mem_write,ports.mem_write_capture.bits[0].position,'east');
 for(const n of['safe','start','invalid','matched_ready'])sourceConnect('guard_to_next_'+n,pt(guard,n),pt(next,n),'south',['south','east','west']);
 for(let b=0;b<4;b++){sourceConnect('state_to_next_'+b,pt(state,'state',b),pt(next,'s'+b),'south');sourceConnect('state_to_action_'+b,pt(state,'state',b),pt(action,'s'+b),'south');sourceConnect('next_to_state_'+b,pt(next,'n'+b),pt(state,'next_data',b),'east',['south']);}
 sourceConnect('phase_next',sources.phase_a,pt(state,'next_open'),'east');sourceConnect('phase_current',sources.phase_b,pt(state,'current_open'),'east');sourceConnect('phase_valid',sources.phase_a,pt(bank.valid,'state_open'),'east');
 sourceConnect('type_guard',pt(bank.type,'state'),pt(guard,'is_write'),'south');sourceConnect('type_action',pt(bank.type,'state'),pt(action,'is_write'),'south');sourceConnect('valid_action',pt(bank.valid,'state'),pt(action,'valid'),'south');
 sourceConnect('action_payload_open',pt(action,'payload_open'),P(-10,0,68),'east',['south']);sourceConnect('action_result_open',pt(action,'result_open'),pt(bank.result,'state_open'),'east',['south']);sourceConnect('action_clear',pt(action,'clear'),P(-10,-3,52),'east',['south']);sourceConnect('action_valid_data',pt(action,'valid_data'),pt(bank.valid,'next_data'),'east',['south']);
 for(const n of['done','reset_ack','fault']){sourceConnect('status_data_'+n,pt(action,n),pt(bank[n],'next_data'),'east',['south']);}
 // A separate normalized rail distributes phase A to the three retained handshake cells.
 part='status_phase_bus';for(let x=98;x<=140;x++){if(x===99||x>100&&(x-99)%10===0)rep(P(x,0,76),'east');else wire(P(x,0,76));if(x>98)edge(P(x-1,0,76),P(x,0,76));}
 for(const x of[100,120,140]){for(let z=75;z>=65;z--){if(z===70)rep(P(x,0,z),'north');else wire(P(x,0,z));}rep(P(x,0,64),'north');for(let z=76;z>63;z--)edge(P(x,0,z),P(x,0,z-1));}
 // Fork after the existing valid OPEN normalizer; no fourth load at the external phase pad.
 sourceConnect('phase_status',P(78,0,63),P(98,0,76),'east',['south']);
 for(const[,s,sd,d,ad]of pending)reserved.push(...reserve(s,sd,d,ad));for(const c of pending)draw(...c,true);for(const c of pending)draw(...c);
 delete ports.mem_write_capture;
 for(const n of['read_valid','write_valid'])ports[n]=action.ports[n];for(const n of['done','reset_ack','fault'])ports[n]=bank[n].ports.state;
 ports.read_address=bank.address.ports.state;ports.write_address=bank.address.ports.state;ports.write_data=bank.store_data.ports.state;ports.result=bank.result.ports.state;ports.microstate=state.ports.state;
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'drawn_local_lsu_candidate',blocks,parents,components,ports,payload,edges,routes,connections,box,metrics:{blocks:blocks.length,retained_bits:37,connections:connections.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_local_geometry:true,complete_core_integration:false,limits:['No live settling/clock/closure proof. All bank phases require measured nonoverlap and worst-path margins.','Cold initialize only before memory admission with all ownership drained. Normal reset never drives cold initialize or memory-global reset.','Memory owner/backend drain, raw response and core/RF external producers still require inter-module routes.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeLsu({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
