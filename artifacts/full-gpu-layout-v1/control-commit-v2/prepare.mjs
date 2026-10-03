// Real owner/commit Boolean guards and connection overlay. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makeControlMatrix} from './matrix.mjs';
import {makeStickyFault} from '../control-event-gates-v1/prepare.mjs';
import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
import {P,K,V,F,searchPath,refreshIndices} from './route.mjs';
const json=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),W='minecraft:redstone_wire',S='minecraft:light_gray_concrete';
export function makeCommitV2({plan=false}={}){
 const map=new Map(),parents={},connections=[],routes=[],edges=[];let part='';
 const at=p=>map.get(K(p));
 const put=(p,id,properties)=>{const old=at(p),block={id:'minecraft:'+id,...properties?{properties}:{}};if(old){assert.equal(id,'light_gray_concrete','Collision '+part+' '+K(p)+' '+old.part);assert.deepEqual(old.block,block);return;}map.set(K(p),{position:p,block,part});};
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,prop)=>{solid(P(p.x,p.y-1,p.z));put(p,id,prop);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 const insert=(name,d,translation)=>{const nested=Object.values(d.ports).some(p=>!Array.isArray(p.bits));const t=nested?{...d,blocks:materializeInstance({...d,ports:{}},{id:name,translation}).blocks}:materializeInstance(d,{id:name,translation});if(nested)assert.deepEqual(translation,P(0,0,0));for(const v of t.blocks){assert(!at(v.position),'Parent collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}parents[name]={blocks:d.blocks.length,translation};return t;};
 const old=insert('commit_v1',json('../control-commit-v1/design.json'),P(0,0,0));
 const matrix=insert('guard_matrix',makeControlMatrix(),P(300,180,-740));
 const release=insert('release_intent',makeStateBank({width:1,pair:false}),P(490,290,-710));
 const alu=insert('alu_fanout22',json('../alu-four-lane-fanout-v2/qaux-design.json'),P(1400,-34,0));
 const fault=insert('sticky_fault',makeStickyFault(),P(530,280,-720));
 part='branch_fault_gate';for(const x of[568,572])wire(P(x,281,-740));rep(P(569,281,-740),'east');dev(P(570,281,-740),'comparator',{facing:'west',mode:'subtract'});rep(P(571,281,-740),'east');
 for(const z of[-744,-742])wire(P(570,281,z));for(const z of[-743,-741])rep(P(570,281,z),'south');for(let x=568;x<572;x++)edge(P(x,281,-740),P(x+1,281,-740));for(let z=-744;z<-740;z++)edge(P(570,281,z),P(570,281,z+1));
 part='branch_fault_admission';
 for(const x of[584,598]){for(let q=x-10;q<=x-2;q++){if(q%6===0)rep(P(q,281,-740),'east');else wire(P(q,281,-740));}rep(P(x-1,281,-740),'east');dev(P(x,281,-740),'comparator',{facing:'west',mode:'subtract'});rep(P(x+1,281,-740),'east');wire(P(x+2,281,-740));for(let q=x-11;q<x+2;q++)edge(P(q,281,-740),P(q+1,281,-740));wire(P(x,281,-746));rep(P(x,281,-745),'south');solid(P(x,281,-744));solid(P(x,280,-744));put(P(x,281,-743),'redstone_wall_torch',{facing:'south'});wire(P(x,281,-742));rep(P(x,281,-741),'south');for(let z=-746;z<-744;z++)edge(P(x,281,z),P(x,281,z+1));for(let z=-743;z<-740;z++)edge(P(x,281,z),P(x,281,z+1));edge(P(x,281,-745),P(x,281,-743));}
 wire(P(573,281,-740));edge(P(572,281,-740),P(573,281,-740));wire(P(587,281,-740));edge(P(586,281,-740),P(587,281,-740));
 const cachePath=new URL('routes.json',import.meta.url),cached=existsSync(cachePath)?JSON.parse(readFileSync(cachePath)):{};
 const step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
 const pending=[],reserved=[];const reserveFor=(source,sd,destination,ad)=>[...Array.from({length:18},(_,i)=>step(source,sd,i+2)),...Array.from({length:destination.y===177&&destination.z===-745?100:18},(_,i)=>step(destination,ad,-i-2))];
 function connect(...args){pending.push(args);}
 function actualConnect(name,source,sourceDirection,destination,arrivalDirection,stubs=false){
  part=name;assert.equal(at(source)?.block.id,W,'source '+name);assert.equal(at(destination)?.block.id,W,'destination '+name);
  const first=step(source,sourceDirection),start=step(source,sourceDirection,2),last=step(destination,arrivalDirection,-1),end=step(destination,arrivalDirection,-2);
  if(stubs){rep(first,sourceDirection);wire(start);rep(last,arrivalDirection);wire(end);edge(source,first);edge(first,start);edge(end,last);edge(last,destination);return;}
  let path=cached[name]?.path;
  if(!path){assert(plan,'Missing routed path '+name);const ignore=[...reserveFor(source,sourceDirection,destination,arrivalDirection),first,start,last,end,...[first,start,last,end].map(p=>P(p.x,p.y-1,p.z))];const tail=destination.y===177&&destination.z===-745?16:0,approach=step(end,arrivalDirection,-tail);const forbidden=Array.from({length:tail},(_,i)=>step(approach,arrivalDirection,i+1)).flatMap(p=>[...[-2,-1,0,1,2].map(y=>P(p.x,p.y+y,p.z)),...Object.values(V).flatMap(([x,z])=>[-1,0,1].map(y=>P(p.x+x,p.y+y,p.z+z)))]);const found=searchPath(map,start,approach,{ignore,reserved,forbidden});path=[...found.path,...Array.from({length:tail},(_,i)=>step(approach,arrivalDirection,i+1))];cached[name]={source,destination,path,expanded:found.expanded};writeFileSync(cachePath,JSON.stringify(cached)+'\n');console.error(name+': '+path.length+' cells / '+found.expanded+' search nodes');}
  assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);const refresh=refreshIndices(path);
  for(let i=1;i<path.length-1;i++){const p=path[i],q=path[i+1];if(refresh.includes(i)){const d=Object.keys(V).find(d=>p.x+V[d][0]===q.x&&p.z+V[d][1]===q.z);rep(p,d);}else wire(p);}
  for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);routes.push({name,path,refresh_indices:refresh});connections.push({name,source,tap:first,destination,arrival:last});
 }
 const mp=n=>matrix.ports[n].bits[0].position;
 const state=(bank,i)=>old.ports[bank].state_onehot.bits[i].position;
 const go=(bank,i)=>old.ports[bank].advance_conditions.bits[i].position;
 const bp=(bank,name,bit=0)=>old.ports[bank][name].bits[bit].position;
 const external={other:mp('other')};
 // Captured intents and owner bits are different physical wires. A request
 // level alone never drives RF EVENT without the retained owner protocol.
 const inputBindings=[
  ['operand',P(620,254,-320),'west'],['update_intent',P(620,258,-320),'west'],
  ['kind0',bp('owner_kind','state',0),'north'],['kind1',bp('owner_kind','state',1),'north'],
  ['owner_idle',state('owner',0),'north'],['owner_complete',state('owner',7),'north'],
  ['rf_ack',P(820,233,-416),'north'],['agreement',bp('front','branch_agreement'),'south'],
  ...[1,2,3,4,5,6,7].map(i=>['commit'+i,state('commit',i),'north']),
  ['window',bp('front','action_window'),'north'],['nzp_write',old.ports.front.controls.bits.find(b=>b.name==='nzp_write').position,'north'],
  ...[0,1,2,3].map(i=>['enable'+i,bp('front','lane_enable',i),'west']),
  ['release_latched',release.ports.state.bits[0].position,'east'],['arch_execute',P(60,45,0),'north']
 ];
 for(const[n,s,dir]of inputBindings)connect('input_'+n,s,dir,mp(n),'south');
 connect('owned_update_feedback',mp('update_claim'),'south',mp('owned_update'),'south');
 const outBindings=[
  ['owner_go0',go('owner',0),'south'],['exact_one',go('owner',1),'south'],['owner_go7',go('owner',7),'south'],
  ['commit_go0',go('commit',0),'south'],['done_update',go('commit',5),'south'],['commit_go7',go('commit',7),'south'],
  ['done_operand',old.ports.front.advance_external.bits.find(b=>b.original_state===3||b.state===3)?.position??P(22,25,-4),'south'],
  ['pc_next',bp('front','pc_next_open'),'east'],['pc_current',bp('front','pc_current_open'),'east'],
  ...[0,1,2,3].map(i=>['flags'+i,bp('front','flags_open',i),'south']),
  ['release_D',release.ports.next_data.bits[0].position,'east']
 ];
 for(const[n,p,dir]of outBindings)connect('output_'+n,mp(n),'south',p,dir);
 // This retained bit changes only in a settled compute phase. A combinational
 // 3->4 binary-state transient cannot withdraw an ALU request or assert ACK.
 connect('release_phase',P(-64,253,18),'east',release.ports.state_open.bits[0].position,'east');
 connect('commit_complete_to_front',P(364,257,-396),'west',P(22,49,-4),'south');
 connect('actual_all_status_low',alu.ports.all_status_low.bits[0].position,'east',go('commit',6),'south');
 connect('actual_all_ready',alu.ports.all_ready.bits[0].position,'east',P(22,41,-4),'south');
 connect('held_alu_request',mp('alu_execute'),'south',P(1434,-37,13),'south');
 connect('held_alu_ack',release.ports.state.bits[0].position,'north',P(1440,-37,13),'south');
 // The ordinary core RESET request is a held request to the ALU controller;
 // it never masks/stops the cadence on which reset itself depends.
 connect('alu_reset_request',bp('front','reset_request'),'west',P(1422,-37,13),'south');

 // Disagreement faults are qualified by held UPDATE, commit IDLE and raw phaseA. This excludes target changes after PC commit and state-decoder hazards during CURRENT phaseB. The retained
 // fault pair uses un-stalled raw phases so a fault cannot prevent its own
 // capture or explicit initialize transfer. Its raw OR also blanks actions.
 connect('branch_fault_update',P(620,258,-320),'south',P(568,281,-740),'east');
 connect('branch_fault_agreement',bp('front','branch_agreement'),'east',P(570,281,-744),'south');
 connect('branch_fault_to_sticky',P(600,281,-740),'east',fault.ports.raw_fault.bits[0].position,'east');
 connect('branch_fault_idle',state('commit',0),'north',P(584,281,-746),'south');
 connect('branch_fault_phase',bp('front','phase_a'),'north',P(598,281,-746),'south');
 connect('alu_fault_to_sticky',alu.ports.any_fault.bits[0].position,'east',fault.ports.raw_fault.bits[0].position,'south');
 connect('sticky_fault_next',bp('front','phase_a'),'west',fault.ports.next_open.bits[0].position,'east');
 connect('sticky_fault_current',bp('front','phase_b'),'west',fault.ports.current_open.bits[0].position,'east');
 connect('sticky_fault_clear',bp('front','initialize'),'west',fault.ports.initialize_clear.bits[0].position,'south');
 connect('immediate_or_retained_fault',P(551,281,-720),'south',bp('front','fault_any'),'south');
 // P/Z/N occupy the low3 retained result bits and are consumed only by the
 // actual CMP-qualified OPEN gates. This does not add a reset-zero selector.
 for(let lane=0;lane<4;lane++)for(let bit=0;bit<3;bit++){
  const x=1400+(lane%2?584:400)-2,y=-34+(lane<2?112:236)+9,z=-7+12*bit;
  connect('cmp_lane_'+lane+'_bit_'+bit,P(x,y,z),'west',bp('front','cmp_nzp',lane*3+bit),'east');
 }
 for(const[,s,sd,d,ad]of pending)reserved.push(...reserveFor(s,sd,d,ad));
 for(const args of pending)actualConnect(...args,true);
 for(const args of pending)actualConnect(...args);
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'connected_owner_commit_guard_draft',blocks,parents,ports:{...old.ports,guard:matrix.ports,release:release.ports,alu:alu.ports,fault:fault.ports,external},routes,edges,connections,box,metrics:{blocks:blocks.length,added_blocks:blocks.length-Object.values(parents).reduce((n,p)=>n+p.blocks,0),connections:connections.length,controller_retained_bits:93,alu_parent_retained_bits:254,union_retained_bits:347},native_acceptance:false,complete_controller:false,missing:['Reset-zero PC/NZP data selection and initializer OPEN sequencing remain to be routed; normal CMP12 and fault paths are present.','OTHER claim, lane mask, LSU WAIT, dispatch and cold/reset admission still require their source controllers.','ALU parent has explicit missing internal command/execute delivery; connecting its boundary is not proof of lane execution.','Unmeasured complete route settling, phase widths, local closure and initialization conditioning.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeCommitV2({plan:process.argv.includes('--plan')});if(process.argv.includes('--check'))assert.deepEqual(d,json('design.json'));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
