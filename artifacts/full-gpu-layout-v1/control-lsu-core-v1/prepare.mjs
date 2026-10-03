// Four real LSU adapters attached to the frozen single-copy core/RF parent.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
import{materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';import{P,K,V,F,searchPath,refreshIndices}from'../control-commit-v2/route.mjs';
import{makeMatrix}from'../control-lsu-v2/matrix.mjs';import{makeLaneJoin}from'../control-event-gates-v1/prepare.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire';
export function joinDefinition(){return{inputs:['wait','permit','valid','fault','initialize','reset','mem_read','mem_write','all_ready','ack0','ack1','ack2','ack3'],outputs:['request','wait_complete','reset_ack'],products:[{out:'request',literals:{wait:true,permit:true,valid:true,fault:false,initialize:false,reset:false}},{out:'wait_complete',literals:{mem_read:false,mem_write:false}},{out:'wait_complete',literals:{all_ready:true}},{out:'reset_ack',literals:{ack0:true,ack1:true,ack2:true,ack3:true}}]};}
export function makeCoreLsus({plan=false}={}){
 for(const[n,h]of[['control-start-other-v1','71db6605a08aeb8e9d66fa4f7bf9c18c952b656baee2d01fd9fc2b0ea86d0323'],['control-lsu-v2','0cdb9087dac5225691c01e493b575fd9e4705f6a74010560fea463e8611d0c32']])assert.equal(createHash('sha256').update(readFileSync(new URL('../'+n+'/source-manifest.json',import.meta.url))).digest('hex'),h);
 const base=read('../control-start-other-v1/design.json'),local=read('../control-lsu-v2/design.json'),map=new Map(base.blocks.map(v=>[K(v.position),{...v,part:'core_parent'}])),parents={core_parent:{blocks:base.blocks.length,translation:P(0,0,0)}},edges=[],routes=[],connections=[],columns=[];let part='';
 const at=p=>map.get(K(p)),edge=(from,to)=>edges.push({from,to});
 function put(p,id,properties){const block={id:'minecraft:'+id,...properties?{properties}:{}};if(at(p)){assert.deepEqual(at(p).block,block,'collision '+part+' '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 function insert(name,d,t){const r=materializeInstance(d,{id:name,translation:t});for(const b of r.blocks){assert(!at(b.position),'component collision '+name+' '+K(b.position));map.set(K(b.position),{...b,part:name});}parents[name]={blocks:d.blocks.length,translation:t};return r;}
 const lanes=Array.from({length:4},(_,i)=>insert('lsu'+i,local,P(300+300*(i%2),150*Math.floor(i/2),400)));
 const joined=insert('lane_join',makeLaneJoin(),P(100,80,350));const protocol=insert('core_protocol',makeMatrix(joinDefinition()),P(0,50,300));
 const pt=(d,n,b=0)=>d.ports[n].bits[b].position,step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 const pending=[],reserved=[],reservedKeys=new Set(),cacheUrl=new URL('routes.json',import.meta.url),cache=existsSync(cacheUrl)?read('routes.json'):{};
 const reserve=(s,sd,d,ad)=>[...Array.from({length:18},(_,i)=>step(s,sd,i+2)),...Array.from({length:18},(_,i)=>step(d,ad,-i-2))];
 const longTail=n=>n.includes('_reset_ack')||/^lane2_result[567]$/.test(n)||/^lane3_result[3-7]$/.test(n);const extraReserve=(n,d,ad)=>longTail(n)?Array.from({length:/^lane3_result[67]$/.test(n)?20:8},(_,i)=>step(d,ad,-i-20)):[];const connect=(...v)=>pending.push(v);
 function draw(name,s,sd,d,ad,stubs=false){part=name;assert.equal(at(s)?.block.id,W,'source '+name);assert.equal(at(d)?.block.id,W,'destination '+name);const first=step(s,sd),start=step(s,sd,2),last=step(d,ad,-1),end=step(d,ad,-2);
  if(stubs){rep(first,sd);wire(start);rep(last,ad);wire(end);edge(s,first);edge(first,start);edge(end,last);edge(last,d);return;}
  const ownReserve=new Set([...reserve(s,sd,d,ad),...extraReserve(name,d,ad),first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))].map(K));
  const clearCached=p=>{if(K(p)===K(start)||K(p)===K(end))return true;if(at(p)||at(P(p.x,p.y-1,p.z))||reservedKeys.has(K(p))&&!ownReserve.has(K(p)))return false;for(const[x,z]of Object.values(V))for(const dy of[-1,0,1]){const q=P(p.x+x,p.y+dy,p.z+z),v=at(q);if(v&&!ownReserve.has(K(q))&&!v.block.id.endsWith('_concrete')&&(!dy||v.block.id===W))return false;}for(const dy of[-2,2]){const q=P(p.x,p.y+dy,p.z);if(at(q)?.block.id===W&&!ownReserve.has(K(q)))return false;}return true;};
  let path=cache[name]?.path;if(plan&&path&&(K(path[0])!==K(start)||K(path.at(-1))!==K(end)||path.some(p=>!clearCached(p))||path.slice(1).some((p,i)=>p.y>path[i].y&&at(P(path[i].x,path[i].y+1,path[i].z))||p.y<path[i].y&&at(P(p.x,p.y+1,p.z)))))path=undefined;if(!path){assert(plan,'Missing route '+name);const ignore=[...reserve(s,sd,d,ad),...extraReserve(name,d,ad),first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))],forbidden=[first,last].flatMap(p=>Object.values(V).map(([x,z])=>P(p.x+x,p.y,p.z+z))).filter(p=>![s,start,end,d].some(q=>K(p)===K(q)));const tail=name==='lane3_reset_ack'?12:/^lane3_result[67]$/.test(name)?36:longTail(name)?24:ad==='south'&&d.z===295||ad==='east'&&d.y===-15?12:0,approach=step(end,ad,-tail);for(let i=1;i<=tail;i++){const p=step(approach,ad,i);forbidden.push(...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z))));}const found=searchPath(map,start,approach,{ignore,reserved,forbidden});path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,ad,i+1))];cache[name]={source:s,destination:d,path,expanded:found.expanded};writeFileSync(cacheUrl,JSON.stringify(cache)+'\n');console.error(name+': '+path.length+' cells');}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i))rep(p,Object.keys(V).find(n=>p.x+V[n][0]===q.x&&p.z+V[n][1]===q.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source:s,tap:first,destination:d,arrival:last});
 }
 // Four normalized, physically isolated destinations per shared level.
 const shared=['request','mem_read','mem_write','reset','update','initialize','phase_a','phase_b'],fan={};
 for(const[i,n]of shared.entries()){
  const x=180+8*i,z=550,bottom=80,top=100;part='shared_'+n;
  for(let y=bottom;y<=top;y++)put(P(x,y,z),y%2===0?'light_gray_concrete':'redstone_torch');wire(P(x-2,bottom,z));rep(P(x-1,bottom,z),'east');edge(P(x-2,bottom,z),P(x-1,bottom,z));edge(P(x-1,bottom,z),P(x,bottom,z));
  for(let y=bottom;y<top;y+=2)edge(y>bottom?P(x,y-1,z):P(x-1,bottom,z),P(x,y+1,z));
  const outputs=[];for(let j=0;j<5;j++){const y=bottom+4+4*j;wire(P(x+1,y,z));rep(P(x+2,y,z),'east');wire(P(x+3,y,z));edge(P(x,y,z),P(x+1,y,z));edge(P(x,y-1,z),P(x+1,y,z));if(y<top)edge(P(x+1,y,z),P(x,y+1,z));edge(P(x+1,y,z),P(x+2,y,z));edge(P(x+2,y,z),P(x+3,y,z));outputs.push(P(x+3,y,z));}
  fan[n]={input:P(x-2,bottom,z),outputs};columns.push({name:n,x,z,bottom,top});
 }
 const controls=Object.fromEntries(base.ports.front.controls.bits.map(b=>[b.name,b.position]));
 connect('core_wait_request',P(14,33,4),'east',pt(protocol,'wait'),'south');
 connect('core_permit_request',P(-142,1,0),'south',pt(protocol,'permit'),'south');
 connect('core_valid_request',pt(base.ports.front?{ports:base.ports.front}:base,'decode_valid'),'north',pt(protocol,'valid'),'south');
 connect('core_fault_request',P(551,281,-720),'north',pt(protocol,'fault'),'south');
 const sources={request:[pt(protocol,'request'),'south'],mem_read:[controls.mem_read,'north'],mem_write:[controls.mem_write,'north'],reset:[P(-138,1,-2),'south'],update:[P(14,49,4),'east'],initialize:[P(-100,-4,-10),'east'],phase_a:[P(-82,-4,14),'east'],phase_b:[P(-62,-4,14),'east']};
 for(const[n,[p,dir]]of Object.entries(sources))connect('source_shared_'+n,p,dir,fan[n].input,'north');
 for(const n of['initialize','reset','mem_read','mem_write'])connect('shared_protocol_'+n,fan[n].outputs[4],'east',pt(protocol,n),'south');
 for(let lane=0;lane<4;lane++){
  const l=lanes[lane];for(const n of shared)connect('shared_'+n+'_lane'+lane,fan[n].outputs[lane],'east',pt(l,n),'east');
  // Existing assignment fanout has normalized RF-facing lane bits.
  const enable=P(718,194+4*lane,92);connect('lane'+lane+'_enable',enable,'west',pt(l,'enable'),'east');
  const t=parents['lsu'+lane].translation,enableAfter=P(242+t.x,5+t.y,80+t.z);connect('lane'+lane+'_enable_join',enableAfter,'north',pt(joined,'enable',lane),'east');
  connect('lane'+lane+'_done_join',pt(l,'done'),'east',pt(joined,'ready',lane),'south');connect('lane'+lane+'_fault_join',pt(l,'fault'),'south',pt(joined,'fault',lane),'north');connect('lane'+lane+'_reset_ack',pt(l,'reset_ack'),'east',pt(protocol,'ack'+lane),'south');
  for(let bit=0;bit<8;bit++){
   const a=base.ports.rf['lane'+lane+'_operand_a'].bits[bit],b=base.ports.rf['lane'+lane+'_operand_b'].bits[bit];
   connect('lane'+lane+'_rs'+bit,a.position,bit<4?'west':'east',pt(l,'rs',bit),'east');connect('lane'+lane+'_rt'+bit,b.position,bit<4?'west':'east',pt(l,'rt',bit),'east');connect('lane'+lane+'_result'+bit,pt(l,'result',bit),'south',base.ports.rf['lane'+lane+'_writeback_lsu'].bits[bit].position,'east');
  }
 }
 connect('joined_done',pt(joined,'all_ready'),'east',pt(protocol,'all_ready'),'south');connect('wait_complete_to_core',pt(protocol,'wait_complete'),'south',P(22,33,-4),'south');
 // Fault propagation joins the existing retained core-fault source. The
 // independent memory-global reset never appears among these connections.
 connect('lsu_fault_to_core',pt(joined,'any_fault'),'east',P(549,281,-724),'west');
 for(const[n,s,sd,d,ad]of pending)reserved.push(...reserve(s,sd,d,ad),...extraReserve(n,d,ad));for(const p of reserved)reservedKeys.add(K(p));for(const a of pending)draw(...a,true);for(const a of pending)draw(...a);
 const ports={...base.ports,lsus:lanes.map(l=>l.ports),lsu_reset_ack:protocol.ports.reset_ack,lsu_fault:joined.ports.any_fault};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}
 return{status:'connected_four_lane_lsu_core_candidate',blocks,parents,columns,ports,edges,routes,connections,box,metrics:{blocks:blocks.length,parent_blocks:base.blocks.length,added_blocks:blocks.length-base.blocks.length,retained_bits:876+4*37,connections:connections.length,lsu_count:4},native_acceptance:false,complete_gpu:false,missing:['Memory input/output master-placement routes. The frozen memory-side ownership-drained producer exists but is not connected here.','Full core reset-ack AND of RF/PC/flags/ALU/LSU/drain plus dispatch rearm.','Cold initialize admission and actual far source/lock/phase timing.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeCoreLsus({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,read('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
