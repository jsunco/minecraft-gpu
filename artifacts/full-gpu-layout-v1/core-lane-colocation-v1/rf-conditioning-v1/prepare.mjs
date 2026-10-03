// Counted physical RF conditioning/admission over the preserved shared clock.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{P,K,V,F,searchPath,refreshIndices}from'../../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>P(p.x,p.y-1,p.z),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n),W='minecraft:redstone_wire',R='minecraft:repeater',S='minecraft:light_gray_concrete';
const parent=read('../shared-clock-v1/design.json'),body=read('body.json'),rows=[...parent.blocks,...body.blocks],map=new Map(rows.map(b=>[K(b.position),b]));assert.equal(map.size,rows.length);const edges=[],connections=[];let part='';
function put(p,id,pr){const block={id,...pr?{properties:pr}:{}},old=map.get(K(p));if(old){assert.equal(id,S,'Collision '+part+' '+K(p));assert.deepEqual(old.block,block);return;}const b={position:p,block,part};map.set(K(p),b);rows.push(b);}
const dev=(p,id,pr)=>{put(under(p),S);put(p,id,pr)},wire=p=>dev(p,W),rep=(p,d)=>dev(p,R,{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to,route:part});
// The original scalar clamp was an isolated OR of these two inverted levels.
// It is now local to the actual common initialize receiver, not a missing alias.
part='normal_zero_OR';const OR=P(476,-57,-220);for(let x=476;x<=478;x++)wire(P(x,-57,-220));rep(P(479,-57,-220),'east');for(let x=476;x<480;x++)edge(P(x,-57,-220),P(x+1,-57,-220));
part='window_phase_input';wire(P(-40,188,-246));edge(P(-40,188,-246),P(-40,188,-245));
function conn(name,source,destination,source_direction,arrival_direction,source_high=15){connections.push({name,source,destination,source_direction,arrival_direction,source_high,tap:step(source,source_direction),start:step(source,source_direction,2),arrival:step(destination,arrival_direction,-1),end:step(destination,arrival_direction,-2)});}
const pads=[[148,5,-340],[164,9,-340],[148,13,-328],[164,17,-328],[172,21,-340]];for(let b=0;b<5;b++)conn('scan_bit_'+b,P(638,41+8*b,-410),P(...pads[b]),'south',b===2||b===3?'east':'south',14);
const ready=P(600,38,-366),readyBus=P(138,1,-342),data=P(-74,186,-246),notReadyInput=P(-101,184,-248),notReady=P(-97,184,-248),notAdmitted=P(-53,186,-246),nextOpen=P(-74,185,-243),currentOpen=P(-62,185,-243);
conn('READY_to_decoder_masks',ready,readyBus,'east','south');
conn('READY_to_admission_D',readyBus,data,'west','east');
conn('READY_to_local_inverse',data,notReadyInput,'north','east');
conn('phase_A_to_admission_NEXT',parent.ports.rf_control.phase_a.bits[0].position,nextOpen,'south','north');
conn('phase_B_to_admission_CURRENT',parent.ports.rf_control.phase_b.bits[0].position,currentOpen,'south','north');
conn('phase_A_to_action_window',nextOpen,P(-40,188,-246),'west','south');
conn('NOT_ADMITTED_to_window',notAdmitted,P(-40,188,-244),'north','west');
conn('NOT_READY_to_window',notReady,P(-40,188,-240),'north','west');
conn('NOT_ADMITTED_to_normal_zero',notAdmitted,OR,'east','south');
conn('NOT_READY_to_normal_zero',notReady,OR,'south','east');
const reserve=c=>[...Array.from({length:14},(_,i)=>step(c.source,c.source_direction,i+2)),...Array.from({length:14},(_,i)=>step(c.destination,c.arrival_direction,-i-2))],reserved=connections.flatMap(reserve);
for(const c of connections){part=c.name;rep(c.tap,c.source_direction);wire(c.start);rep(c.arrival,c.arrival_direction);wire(c.end);edge(c.source,c.tap);edge(c.tap,c.start);edge(c.end,c.arrival);edge(c.arrival,c.destination);}
const cacheUrl=new URL('paths.json',H),cache=existsSync(cacheUrl)?read('paths.json'):{};for(const c of connections){part=c.name;let path=cache[c.name]?.path;if(path){assert.deepEqual(cache[c.name].source,c.source);assert.deepEqual(cache[c.name].destination,c.destination);}else{const r=searchPath(map,c.start,c.end,{ignore:[c.tap,c.start,c.arrival,c.end,...[c.tap,c.start,c.arrival,c.end].map(under),...reserve(c)],reserved,limit:1800000});path=r.path;cache[c.name]={source:c.source,destination:c.destination,path,expanded:r.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.log(c.name,path.length);}
const refresh=new Set(refreshIndices(path));for(let i=1;i<path.length-1;i++){const p=path[i];if(refresh.has(i))rep(p,Object.keys(V).find(d=>K(step(p,d))===K(path[i+1])));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);c.path=path;c.refresh_indices=[...refresh];}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const b of rows)for(const k of['x','y','z']){box.from[k]=Math.min(box.from[k],b.position[k]);box.to[k]=Math.max(box.to[k],b.position[k]);}
const out={status:'RF_conditioning_and_admission_connected_unchecked',blocks:rows,box,body_internal:body.internal,connections,edges,ports:{...parent.ports,rf_startup:{admitted:{direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(-57,186,-246),travel:{x:1,y:0,z:0}}]},action_window:parent.ports.rf_control.action_window,initialize_request:parent.ports.shared_clock.initialize_request}},metrics:{cells:rows.length,parent_cells:parent.blocks.length,conditioning_body_cells:body.blocks.length,new_cable_cells:rows.length-parent.blocks.length-body.blocks.length,physical_stores:1002,remaining_shared_stores:115},missing:['ALU/core cadence, all remaining shared control, far initialization/action closure and full core timing remain open.','External initialize must cover actual complete scanner NEXT/CURRENT transfers; READY is not alone proof of decoder closure.'],complete_core:false,native_acceptance:false};writeFileSync(new URL('design.json',H),JSON.stringify(out)+'\n');console.log(JSON.stringify({metrics:out.metrics,box}));
