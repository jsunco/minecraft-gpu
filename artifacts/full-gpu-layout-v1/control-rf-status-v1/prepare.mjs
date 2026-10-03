// RF-clock-local held acknowledgment exports. Offline geometry only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync}from'node:fs';
import {createHash}from'node:crypto';
import {pathToFileURL}from'node:url';
import {makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';
import {materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';
import {makeMatrix}from'../control-lsu-v2/matrix.mjs';
import {P,K,V,F,searchPath,refreshIndices}from'../control-commit-v2/route.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export const maskDefinition=()=>({inputs:['not_ready','not_admitted'],outputs:['mask'],products:[{out:'mask',literals:{not_ready:true}},{out:'mask',literals:{not_admitted:true}}]});
export function makeRfStatus({plan=false}={}){
 assert.equal(createHash('sha256').update(readFileSync(new URL('../control-core-guards-v1/source-manifest.json',import.meta.url))).digest('hex'),'88fd3401e0e8273d51e57bc3429769a19338a14c58cbdd30c6dd6116230b2d89');const pm=read('../control-core-guards-v1/source-manifest.json');assert.equal(createHash('sha256').update(readFileSync(new URL('../control-core-guards-v1/design.json',import.meta.url))).digest('hex'),pm.source_sha256['artifacts/full-gpu-layout-v1/control-core-guards-v1/design.json']);
 const base=read('../control-core-guards-v1/design.json'),map=new Map(base.blocks.map(v=>[K(v.position),{...v,part:'base'}])),parents={base:{blocks:base.blocks.length,translation:P(0,0,0)}},edges=[],routes=[],connections=[],removed=[],bindings=[],clear_columns=[],positive_columns=[];let part='';const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to}),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n),move=(p,t)=>P(p.x+t.x,p.y+t.y,p.z+t.z);
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p));assert.deepEqual(at(p).block,block);return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const v of r.blocks){assert(!at(v.position),'Component collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}for(const e of d.edges??[])edge(move(e.from,t),move(e.to,t));parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position,pending=[],connect=(...a)=>pending.push(a);
 // Remove exactly the two outward branch diodes/supports, never the RF's
 // internal North branch alias. Their old receiving wires are reused.
 for(const [x,facing]of [[979,'east'],[981,'west']]){const p=P(x,305,2);assert.deepEqual(at(p)?.block,{id:'minecraft:repeater',properties:{facing,delay:'1'}});for(const q of[p,P(x,304,2)]){removed.push(at(q));map.delete(K(q));}}
 const removedKeys=new Set(removed.map(v=>K(v.position)));for(const e of base.edges)if(!removedKeys.has(K(e.from))&&!removedKeys.has(K(e.to)))edge(e.from,e.to);
 const mask=insert('RF_cold_export_mask',makeMatrix(maskDefinition()),P(1000,168,-112));
 connect('actual_RF_not_ready',P(653,184,82),'south',pt(mask,'not_ready'),'south');
 connect('actual_RF_not_admitted',P(697,186,84),'east',pt(mask,'not_admitted'),'south');
 // This A route is tapped from the actual RF NEXT bank receiver; its producer
 // is the RF oscillator/distribution, not an unrelated core phase input.
 const localA=P(1050,53,3),samples=[];
 for(const[name,y,raw,tap]of [['reset_ack',208,P(976,209,-2),'west'],['event_ack',304,P(980,305,-2),'west']]){
  const t=P(1008,y,-72),bank=insert('RF_held_'+name,makeStateBank({width:1,pair:false}),t),dy=y+1;
  part='RF_'+name+'_input_mask';
  for(const x of[1000,1002,1006])wire(P(x,dy,-72));for(const x of[1001,1003,1005,1007])rep(P(x,dy,-72),'east');dev(P(1004,dy,-72),'comparator',{facing:'west',mode:'subtract'});for(let x=1000;x<1008;x++)edge(P(x,dy,-72),P(x+1,dy,-72));
  wire(P(1004,dy,-75));wire(P(1004,dy,-74));rep(P(1004,dy,-73),'south');for(let z=-75;z< -72;z++)edge(P(1004,dy,z),P(1004,dy,z+1));
  part='RF_'+name+'_output_mask';rep(P(1014,dy,-72),'east');dev(P(1015,dy,-72),'comparator',{facing:'west',mode:'subtract'});rep(P(1016,dy,-72),'east');wire(P(1017,dy,-72));for(let x=1013;x<1017;x++)edge(P(x,dy,-72),P(x+1,dy,-72));wire(P(1015,dy,-75));wire(P(1015,dy,-74));rep(P(1015,dy,-73),'south');for(let z=-75;z< -72;z++)edge(P(1015,dy,z),P(1015,dy,z+1));
  const output={direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(1017,dy,-72),source:P(1016,dy,-72),travel:P(1,0,0)}],meaning:'RF-local A-held status; READY/ADMITTED cold masks both stored D and exported Q. RF phase/decoder/output closure margins remain required.'};
  connect(name+'_raw_to_D',raw,tap,P(1000,dy,-72),'east');connect(name+'_RF_local_A',name==='event_ack'?P(1050,53,6):localA,'west',pt(bank,'state_open'),'east');connect(name+'_cold_mask_D',pt(mask,'mask'),name==='reset_ack'?'east':'south',P(1004,dy,-75),'south');connect(name+'_cold_mask_Q',name==='event_ack'?step(pt(mask,'mask'),'east',2):pt(mask,'mask'),name==='reset_ack'?'west':'north',P(1015,dy,-75),'south');
  bindings.push({name,translation:t,raw,local_A:name==='event_ack'?P(1050,53,6):localA,sample_data:pt(bank,'next_data'),sample_open:pt(bank,'state_open'),held:pt(bank,'state'),output:output.bits[0].position,input_mask:P(1004,dy,-72),output_mask:P(1015,dy,-72)});samples.push({name,bank,output});
 }
 const event=samples.find(v=>v.name==='event_ack').output.bits[0].position;
 connect('held_event_ACK_to_owner_return',event,'east',P(978,305,2),'north');connect('held_event_ACK_to_reset_quiet',event,'south',P(982,305,2),'north');
 const tails={};
 const cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{},reserved=[];
 for(const path of Object.values(tails))reserved.push(...path);
 for(const[n,s,sd,d,ad]of pending)reserved.push(...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2)));
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'Source '+name+' '+K(s));assert.equal(at(d)?.block.id,W,'Destination '+name);const tap=step(s,sd),start=step(s,sd,2),arrival=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){if(!at(tap))rep(tap,sd);else assert.deepEqual(at(tap).block,{id:'minecraft:repeater',properties:{facing:F[sd],delay:'1'}},'Tap '+name+' '+K(tap));wire(start);rep(arrival,ad);wire(end);edge(s,tap);edge(tap,start);edge(end,arrival);edge(arrival,d);return;}
  let path=cache[name]?.path;if(!path){assert(plan,'Missing route '+name);const ignore=[tap,start,arrival,end,...[tap,start,arrival,end].map(p=>P(p.x,p.y-1,p.z)),...Array.from({length:12},(_,i)=>step(s,sd,i+2)),...Array.from({length:12},(_,i)=>step(d,ad,-i-2))],forbidden=[tap,arrival].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=tails[name]??[end],approach=tail[0];ignore.push(...tail,...tail.map(p=>P(p.x,p.y-1,p.z)));forbidden.push(...[-2,-1,1,2].map(y=>P(approach.x,approach.y+y,approach.z)));for(const p of tail.slice(1)){forbidden.push(...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}let found;try{found=searchPath(map,start,approach,{ignore,reserved,forbidden});}catch(error){console.error(JSON.stringify([...map.values()].filter(v=>Math.abs(v.position.x-approach.x)<=2&&Math.abs(v.position.y-approach.y)<=2&&Math.abs(v.position.z-approach.z)<=3)));throw error;}path=[...found.path,...tail.slice(1)];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length);}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap,destination:d,arrival});
 }
 for(const v of Object.values(cache))reserved.push(...v.path);
 for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,rf:{...base.ports.rf,raw_event_ack:base.ports.rf.event_ack,raw_reset_ack:base.ports.rf.reset_ack,event_ack:samples.find(v=>v.name==='event_ack').output,reset_ack:samples.find(v=>v.name==='reset_ack').output}};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of ['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_RF_local_A_held_acknowledgment_exports_candidate',blocks,parents,ports,edges,routes,connections,removed,bindings,clear_columns,positive_columns,box,metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,retained_bits:1095,connections:connections.length,held_RF_status_bits:2,removed_cells:removed.length},native_acceptance:false,complete_core_reset:false,missing:['RF delivered NEXT phase A now physically captures RF decoded status before external consumers. Its full closure/decoder-settle/hold margin must be established against actual CURRENT/B route.','Cold READY/ADMITTED masks do not replace a complete cold scrub or far-mask settling requirement.','Architectural reset zero capture, final ACK and rearm remain unfinished.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeRfStatus({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
