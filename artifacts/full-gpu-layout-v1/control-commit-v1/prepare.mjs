// Connected commit/RF owner work in progress. No native runtime or host GPU actions.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import{pathToFileURL}from'node:url';
import{makeCommitState}from'./state.mjs';import{makeStateBank}from'../../../hardware/full-gpu-state-bank.mjs';import{makeSignalDescent}from'../../../hardware/full-gpu-signal-descent.mjs';import{materializeInstance}from'../../../hardware/gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export function makeCommitIntegration(){
 const map=new Map(),parents={},routes=[],edges=[],columns=[],connections=[];let part='';const at=p=>map.get(K(p));
 function put(p,id,properties){assert(!at(p),'Collision '+part+' '+K(p)+' '+at(p)?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'}),edge=(a,b)=>edges.push({from:a,to:b});
 function insert(name,d,translation){const moved=materializeInstance(d,{id:name,translation});for(const v of moved.blocks){assert(!at(v.position),'Parent collision '+name+' '+K(v.position));map.set(K(v.position),{...v,part:name});}parents[name]={blocks:d.blocks.length,translation};return moved;}
 function route(name,ws,{branches=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid route '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
  const forbid=new Set(branches.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!at(p)&&!forbid.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const cost=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!cost.has(start)||end-start>12)continue;const value=cost.get(start)+(end===path.length?0:1);if(value<(cost.get(end)??Infinity)){cost.set(end,value);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name);const refresh=[];for(let p=prev.get(path.length);p!==-1;p=prev.get(p))refresh.push(p);
  for(let i=0;i<path.length;i++){const p=path[i];if(at(p)){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(at(p).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;
 }
 function lift(name,x,z,bottom,top,entry){part=name;assert.equal((top-bottom)%4,1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),'redstone_wire');columns.push({name,x,z,bottom,top,wire_top:true,entry});}

 function saved(rel,sha){const raw=readFileSync(new URL(rel,import.meta.url));if(sha)assert.equal(createHash('sha256').update(raw).digest('hex'),sha);return JSON.parse(raw);}
 const front=insert('front',saved('../control-front-pc-v2/design.json'),P(0,0,0));
 const rf=insert('rf',saved('../register-sequencer-v1/controller-addresses/design.json','34ad9b5c22782084e2ff5ac40ead94bd3c9d35a8a4b11b9e79386b96531cfb8a'),P(900,53,0));
 const commit=insert('commit',makeCommitState(),P(350,200,-400)),owner=insert('owner',makeCommitState(),P(600,200,-400));
 const updateIntent=insert('update_intent',makeStateBank({width:1,pair:false}),P(300,48,-60));
 const operandIntent=insert('operand_intent',makeStateBank({width:1,pair:false}),P(300,28,-52));
 const ownerKind=insert('owner_kind',makeStateBank({width:2,pair:false}),P(620,253,-320));
 const rfIntent=insert('rf_intent',makeStateBank({width:1,pair:false}),P(640,249,-320));
 // Two real settled architectural-state taps enter physical retained intents.
 for(const [name,y,z,target]of[['update',53,-60,updateIntent.ports.next_data.bits[0].position],['operand',29,-52,operandIntent.ports.next_data.bits[0].position]]){
  const src=P(60,y,0);part=name+'_intent_branch';rep(P(60,y,-1),'north');wire(P(60,y,-2));edge(src,P(60,y,-1));edge(P(60,y,-1),P(60,y,-2));
  if(name==='update')route(name+'_intent_data',[[60,y,-2],[60,y,z],[292,y,z],[296,49,z],[target.x,49,z]]);
  else route(name+'_intent_data',[[60,y,-2],[60,y,z],[target.x,y,z]]);
  connections.push({name:name+'_state_to_intent',source:src,destination:target});
 }
 // Held owner kind and request feed the exact frozen RF receiver coordinates.
 const eventMap=[['kind0',ownerKind.ports.state.bits[0].position,rf.ports.event_kind_0.bits[0].position,-304],['kind1',ownerKind.ports.state.bits[1].position,rf.ports.event_kind_1.bits[0].position,-312],['request',rfIntent.ports.state.bits[0].position,rf.ports.event_request.bits[0].position,-296]];
 for(const[name,s,p,z]of eventMap){part='event_'+name+'_source';rep(P(s.x+1,s.y,s.z),'east');wire(P(s.x+2,s.y,s.z));edge(s,P(s.x+1,s.y,s.z));edge(P(s.x+1,s.y,s.z),P(s.x+2,s.y,s.z));
  const x=s.x+10,ws=[[s.x+2,s.y,s.z],[x,s.y,s.z]];if(s.y!==p.y)ws.push([x+Math.abs(s.y-p.y),p.y,s.z]);ws.push([ws.at(-1)[0],p.y,z],[p.x,p.y,z],[p.x,p.y,p.z-2]);route('event_'+name+'_route',ws);part='event_'+name+'_arrival';rep(P(p.x,p.y,p.z-1),'south');edge(P(p.x,p.y,p.z-2),P(p.x,p.y,p.z-1));edge(P(p.x,p.y,p.z-1),p);connections.push({name:'held_owner_'+name+'_to_rf',source:s,destination:p});
 }
 // Actual RF ACK returns to its owner's WAIT_ACK condition, independent of PC.
 const ack=rf.ports.event_ack.bits[0].position;part='ack_branch';rep(P(ack.x-1,ack.y,ack.z),'west');wire(P(ack.x-2,ack.y,ack.z));edge(ack,P(ack.x-1,ack.y,ack.z));edge(P(ack.x-1,ack.y,ack.z),P(ack.x-2,ack.y,ack.z));
 const ackDescent=insert('ack_descent',makeSignalDescent({drop:76}),P(860,309,-340));
 route('rf_ack_depart',[[ack.x-2,305,2],[ack.x-6,309,2],[860,309,2],[860,309,-340]]);
 const a=ackDescent.ports.output.bits[0],q=P(a.position.x+2*a.travel.x,a.position.y,a.position.z+2*a.travel.z),p=owner.ports.advance_conditions.bits[4].position;
 route('rf_ack_to_owner',[[a.position.x,a.position.y,a.position.z],[q.x,q.y,q.z],[840,233,q.z],[840,233,-416],[p.x,233,-416],[p.x,233,p.z-2]]);part='ack_arrival';rep(P(p.x,p.y,p.z-1),'south');edge(P(p.x,p.y,p.z-2),P(p.x,p.y,p.z-1));edge(P(p.x,p.y,p.z-1),p);connections.push({name:'rf_ack_to_owner_wait',source:ack,destination:p});

 // Actual qualified core phases and initializer are distributed to both local
 // state loops; shared oscillator/input producers remain the frozen front's ports.
 for(const [name,x,z,bottom,top,src,travel]of[['phase_a',-70,18,5,202,P(-70,5,16),'south'],['phase_b',-42,12,5,206,P(-42,5,14),'north'],['initialize',-104,-8,64,265,P(-104,64,-6),'north']]){
  part=name+'_branch';const e=P(x,bottom,(z+src.z)/2);rep(e,travel);edge(src,e);edge(e,P(x,bottom,z));lift(name+'_column',x,z,bottom,top,e);
 }
 route('phase_a_bus',[[-70,202,18],[-70,202,-500],[580,202,-500]],{branches:[P(320,202,-500),P(570,202,-500)]});
 route('phase_b_bus',[[-42,206,12],[-42,206,-508],[580,206,-508]],{branches:[P(316,206,-508),P(566,206,-508)]});
 for(const[name,parent,x]of[['commit',commit,320],['owner',owner,570]]){
  const n=parent.ports.next_open.bits[0].position,c=parent.ports.current_open.bits[0].position;
  part=name+'_next_phase_branch';rep(P(x,202,-499),'south');wire(P(x,202,-498));edge(P(x,202,-500),P(x,202,-499));edge(P(x,202,-499),P(x,202,-498));
  route(name+'_next_phase',[[x,202,-498],[x,200,-496],[x,200,n.z],[n.x-2,200,n.z]]);part=name+'_next_phase_arrive';rep(P(n.x-1,n.y,n.z),'east');edge(P(n.x-2,n.y,n.z),P(n.x-1,n.y,n.z));edge(P(n.x-1,n.y,n.z),n);
  const bx=x-4;part=name+'_current_phase_branch';rep(P(bx,206,-507),'south');wire(P(bx,206,-506));edge(P(bx,206,-508),P(bx,206,-507));edge(P(bx,206,-507),P(bx,206,-506));
  route(name+'_current_phase',[[bx,206,-506],[bx,206,-498],[bx,200,-492],[bx,200,-392],[c.x,200,-392],[c.x,200,c.z+2]]);part=name+'_current_phase_arrive';rep(P(c.x,c.y,c.z+1),'north');edge(P(c.x,c.y,c.z+2),P(c.x,c.y,c.z+1));edge(P(c.x,c.y,c.z+1),c);
  connections.push({name:name+'_next_phase',source:P(-70,5,16),destination:n},{name:name+'_current_phase',source:P(-42,5,14),destination:c});
 }
 route('initialize_bus',[[-104,265,-8],[-104,265,-460],[630,265,-460]],{branches:[P(378,265,-460),P(628,265,-460)]});
 for(const[name,parent]of[['commit',commit],['owner',owner]]){const p=parent.ports.initialize.bits[0].position;part=name+'_initialize_branch';rep(P(p.x,265,-459),'south');wire(P(p.x,265,-458));edge(P(p.x,265,-460),P(p.x,265,-459));edge(P(p.x,265,-459),P(p.x,265,-458));route(name+'_initialize',[[p.x,265,-458],[p.x,264,-457],[p.x,264,p.z-2]]);part=name+'_initialize_arrive';rep(P(p.x,p.y,p.z-1),'south');edge(P(p.x,p.y,p.z-2),P(p.x,p.y,p.z-1));edge(P(p.x,p.y,p.z-1),p);connections.push({name:name+'_initializer',source:P(-104,64,-6),destination:p});}
 for(const[name,bank]of[['update',updateIntent],['operand',operandIntent]]){const p=bank.ports.state_open.bits[0].position,y=p.y,sz=name==='update'?-68:-60,finish=name==='update'?-52:-44;part=name+'_intent_phase_branch';rep(P(-69,y,18),'east');wire(P(-68,y,18));edge(P(-70,y,18),P(-69,y,18));edge(P(-69,y,18),P(-68,y,18));route(name+'_intent_phase',[[-68,y,18],[-68,y,sz],[310,y,sz],[310,y,finish],[p.x,y,finish],[p.x,y,p.z+2]]);part=name+'_intent_phase_arrive';rep(P(p.x,y,p.z+1),'north');edge(P(p.x,y,p.z+2),P(p.x,y,p.z+1));edge(P(p.x,y,p.z+1),p);connections.push({name:name+'_intent_phase',source:P(-70,y,18),destination:p});}

 // Real retained kind bits: a captured operand/update claim supplies 01/10;
 // neither bit set encodes the separate OTHER owner. Exact-one admission remains
 // a required upstream producer, so the raw data is never an owner grant itself.
 for(const[name,bank,bit,x,z,top]of[['operand',operandIntent,0,316,-84,254],['update',updateIntent,1,324,-92,258]]){
  const s=bank.ports.state.bits[0].position,p=ownerKind.ports.next_data.bits[bit].position;part=name+'_kind_source';rep(P(s.x+1,s.y,s.z),'east');wire(P(s.x+2,s.y,s.z));edge(s,P(s.x+1,s.y,s.z));edge(P(s.x+1,s.y,s.z),P(s.x+2,s.y,s.z));
  const low=s.y+4;route(name+'_kind_low',[[s.x+2,s.y,s.z],[s.x+6,low,s.z],[x-2,low,s.z],[x-2,low,z]]);part=name+'_kind_feed';rep(P(x-1,low,z),'east');edge(P(x-2,low,z),P(x-1,low,z));edge(P(x-1,low,z),P(x,low,z));lift(name+'_kind_column',x,z,low,top,P(x-1,low,z));
  const corridor=bit?-348:-352;route(name+'_kind_high',[[x,top,z],[x,top,corridor],[p.x,top,corridor],[p.x,top,p.z-2]]);part=name+'_kind_arrival';rep(P(p.x,p.y,p.z-1),'south');edge(P(p.x,p.y,p.z-2),P(p.x,p.y,p.z-1));edge(P(p.x,p.y,p.z-1),p);connections.push({name:name+'_intent_to_owner_kind',source:s,destination:p});
 }
 // RF request is stored from the two actual owner request states. The positive
 // OR column accepts diode injection at equal-polarity levels 225 and233.
 for(const row of[3,4]){const s=owner.ports.state_onehot.bits[row].position;part='owner_request_'+row+'_source';rep(P(s.x,s.y,s.z-1),'north');wire(P(s.x,s.y,s.z-2));edge(s,P(s.x,s.y,s.z-1));edge(P(s.x,s.y,s.z-1),P(s.x,s.y,s.z-2));route('owner_request_'+row+'_to_or',[[s.x,s.y,s.z-2],[s.x,s.y,-420],[666,s.y,-420]]);part='owner_request_'+row+'_inject';rep(P(667,s.y,-420),'east');edge(P(666,s.y,-420),P(667,s.y,-420));edge(P(667,s.y,-420),P(668,s.y,-420));}
 lift('owner_request_or',668,-420,225,250,P(667,225,-420));columns.at(-1).extra_entries=[P(667,233,-420)];
 const rq=rfIntent.ports.next_data.bits[0].position;route('owner_request_or_to_data',[[668,250,-420],[700,250,-420],[700,250,-330],[rq.x,250,-330],[rq.x,250,rq.z-2]]);part='owner_request_data_arrive';rep(P(rq.x,rq.y,rq.z-1),'south');edge(P(rq.x,rq.y,rq.z-2),P(rq.x,rq.y,rq.z-1));edge(P(rq.x,rq.y,rq.z-1),rq);for(const row of[3,4])connections.push({name:'owner_state'+row+'_to_request_data',source:owner.ports.state_onehot.bits[row].position,destination:rq});
 // One real qualified phaseA branch reaches both event stores. OWNER kind OPEN
 // additionally subtracts !OWNER_CAPTURE. RF request captures every phaseA so
 // REQUEST_DROP eventually stores0 before WAIT_ACK_LOW may complete.
 part='event_phase_branch';rep(P(-69,200,18),'east');wire(P(-68,200,18));edge(P(-70,200,18),P(-69,200,18));edge(P(-69,200,18),P(-68,200,18));route('event_phase_low',[[-68,200,18],[-66,200,18]]);part='event_phase_feed';rep(P(-65,200,18),'east');edge(P(-66,200,18),P(-65,200,18));edge(P(-65,200,18),P(-64,200,18));lift('event_phase_column',-64,18,200,253,P(-65,200,18));
 route('event_phase_bus',[[-64,253,18],[-64,253,-360],[650,253,-360],[650,253,-352],[658,253,-352]],{branches:[P(650,253,-356)]});
 const oc=owner.ports.state_onehot.bits[1].position;part='owner_capture_source';rep(P(oc.x,oc.y,oc.z-1),'north');wire(P(oc.x,oc.y,oc.z-2));edge(oc,P(oc.x,oc.y,oc.z-1));edge(P(oc.x,oc.y,oc.z-1),P(oc.x,oc.y,oc.z-2));route('owner_capture_to_column',[[oc.x,oc.y,oc.z-2],[oc.x,209,-438],[oc.x+1,208,-438],[678,208,-438],[678,208,-440]]);part='owner_capture_feed';rep(P(679,208,-440),'east');edge(P(678,208,-440),P(679,208,-440));edge(P(679,208,-440),P(680,208,-440));lift('owner_capture_column',680,-440,208,253,P(679,208,-440));
 part='owner_capture_invert';rep(P(681,253,-440),'east');solid(P(682,253,-440));solid(P(682,252,-440));put(P(683,253,-440),'redstone_wall_torch',{facing:'east'});rep(P(684,253,-440),'east');wire(P(685,253,-440));edge(P(680,253,-440),P(681,253,-440));edge(P(681,253,-440),P(682,253,-440));edge(P(683,253,-440),P(684,253,-440));edge(P(684,253,-440),P(685,253,-440));route('not_owner_capture_mask',[[685,253,-440],[692,253,-440],[692,253,-364],[660,253,-364],[660,253,-354]]);
 part='owner_capture_phase_gate';rep(P(659,253,-352),'east');dev(P(660,253,-352),'comparator',{facing:'west',mode:'subtract'});rep(P(661,253,-352),'east');wire(P(662,253,-352));rep(P(660,253,-353),'south');for(let x=658;x<662;x++)edge(P(x,253,-352),P(x+1,253,-352));edge(P(660,253,-354),P(660,253,-353));edge(P(660,253,-353),P(660,253,-352));
 const ko=ownerKind.ports.state_open.bits[0].position;route('owner_capture_to_open',[[662,253,-352],[670,261,-352],[670,261,-368],[606,261,-368],[606,261,ko.z],[614,253,ko.z],[ko.x-2,253,ko.z]]);part='owner_capture_open_arrive';rep(P(ko.x-1,ko.y,ko.z),'east');edge(P(ko.x-2,ko.y,ko.z),P(ko.x-1,ko.y,ko.z));edge(P(ko.x-1,ko.y,ko.z),ko);
 const ro=rfIntent.ports.state_open.bits[0].position;part='rf_intent_phase_branch';rep(P(651,253,-356),'east');wire(P(652,253,-356));edge(P(650,253,-356),P(651,253,-356));edge(P(651,253,-356),P(652,253,-356));route('rf_intent_phase_to_open',[[652,253,-356],[660,245,-356],[714,245,-356],[714,245,-310],[648,245,-310],[644,249,-310],[ro.x,249,-310],[ro.x,249,ro.z+2]]);part='rf_intent_open_arrive';rep(P(ro.x,ro.y,ro.z+1),'north');edge(P(ro.x,ro.y,ro.z+2),P(ro.x,ro.y,ro.z+1));edge(P(ro.x,ro.y,ro.z+1),ro);
 connections.push({name:'qualified_phase_to_owner_kind_open',source:P(-70,200,18),destination:ko},{name:'qualified_phase_to_rf_request_open',source:P(-70,200,18),destination:ro},{name:'owner_capture_to_kind_phase_mask',source:oc,destination:P(660,253,-354)});

 // Physical constant advances still consume a complete state/phase cycle; they
 // do not bypass the shared NEXT-close-CURRENT-close sequencing.
 for(const[name,parent,rows]of[['commit',commit,[1,2,3,4]],['owner',owner,[2,3,5]]])for(const row of rows){const p=parent.ports.advance_conditions.bits[row].position,source=P(p.x,p.y,p.z-3);part=name+'_advance_constant_'+row;dev(source,'redstone_block');rep(P(p.x,p.y,p.z-2),'south');wire(P(p.x,p.y,p.z-1));edge(source,P(p.x,p.y,p.z-2));edge(P(p.x,p.y,p.z-2),P(p.x,p.y,p.z-1));edge(P(p.x,p.y,p.z-1),p);connections.push({name:name+'_full_cycle_advance_'+row,source,destination:p});}

 // ACK-low uses the same real returned ACK, freshly isolated before inversion.
 // Completion cannot advance from WAIT_ACK_LOW merely because request fell.
 const ackTap=P(820,233,-416);part='ack_low_inverter';rep(P(820,233,-415),'south');solid(P(820,233,-414));solid(P(820,232,-414));put(P(820,233,-413),'redstone_wall_torch',{facing:'south'});rep(P(820,233,-412),'south');wire(P(820,233,-411));edge(ackTap,P(820,233,-415));edge(P(820,233,-415),P(820,233,-414));edge(P(820,233,-413),P(820,233,-412));edge(P(820,233,-412),P(820,233,-411));
 route('ack_low_to_lift',[[820,233,-411],[810,233,-411],[810,233,-406]]);part='ack_low_feed';rep(P(810,233,-405),'south');edge(P(810,233,-406),P(810,233,-405));edge(P(810,233,-405),P(810,233,-404));lift('ack_low_column',810,-404,233,250,P(810,233,-405));
 const low=owner.ports.advance_conditions.bits[6].position;route('ack_low_to_owner',[[810,250,-404],[810,250,-432],[708,250,-432],[700,258,-432],[650,258,-432],[650,250,-424],[650,250,-406],[624,250,-406],[623,249,-406],[low.x,249,-406]]);part='ack_low_owner_arrive';rep(P(low.x,low.y,low.z-1),'south');edge(P(low.x,low.y,low.z-2),P(low.x,low.y,low.z-1));edge(P(low.x,low.y,low.z-1),low);connections.push({name:'rf_ack_low_to_owner_release',source:ackTap,destination:low});
 const ports={front:front.ports,rf:rf.ports,commit:commit.ports,owner:owner.ports,update_intent:updateIntent.ports,operand_intent:operandIntent.ports,owner_kind:ownerKind.ports,rf_intent:rfIntent.ports};
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'unfinished_connected_commit_owner_route_draft',blocks,box,parents,ports,routes,edges,columns,connections,metrics:{blocks:blocks.length,stored_bits:53+20+12+5,new_connections:connections.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_controller:false,missing:['Exact-one owner admission and held-request withdrawal guards; OTHER startup producer and request/kind initialization admission.','Owner complete/selected-request-low and per-owner completion decode; exact-one-claim admission remains unrouted.','Commit source guards/flags and PC OPEN routes, accepted fault handling, actual ALU join/status drain.','Root-owned RF file fanout and cold/reset admission; global placement remains unselected.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeCommitIntegration();if(process.argv.includes('--check'))assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
