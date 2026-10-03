// Connected raw eight-LSU request frontend for the frozen owned-bank datapath.
// Includes a physical ACTIVE/reset/phase controller and held-owner return paths.
// This bank-fixed refinement remains unselected; no native or host runtime.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeOwnedDataBank} from './memory-layout-data-owned-bank.mjs';
import {makeDataSequencer} from './memory-layout-data-sequencer.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},AX=['x','y','z'];
export function makeDataChannel({bankIndex=0}={}){
 assert(Number.isInteger(bankIndex)&&bankIndex>=0&&bankIndex<4);const source='77151c7fec5b62daddbac0c8d68e41eed402882d447d694e3a6fbc7fe6997fcf';assert.equal(createHash('sha256').update(readFileSync(new URL('./memory-layout-data-owned-bank.mjs',import.meta.url))).digest('hex'),source);
 const parent=makeOwnedDataBank(),m=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),nets={...parent.nets},groups={...parent.groups},routes=[],frontends=[],bindings=[];let net='',group='';
 const put=(p,block)=>{const k=K(p),old=m.get(k);if(old){assert.deepEqual(old.block,block,'collision '+k+' '+groups[k]+'/'+group);assert(block.id===S||nets[k]===net,'netcollision '+k+' '+nets[k]+'/'+net);return;}m.set(k,{position:p,block});nets[k]=net;groups[k]=group;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,t)=>dev(x,y,z,'repeater',{facing:F[t],delay:'1'}),c=(x,y,z,t)=>dev(x,y,z,'comparator',{facing:F[t],mode:'subtract'}),wall=(x,y,z,facing)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing}});
 function route(name,points,{wireOnly=[],force=[]}={}){const path=[P(...points[0])];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n&&(!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let j=1;j<=n;j++)path.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}let run=0,max=0;const refresh=[];for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1],old=m.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire',name+' occupied '+K(p));assert.equal(nets[K(p)],net,name+' net '+K(p));run=0;continue;}const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');refresh.push(p);run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);assert(run<=14,name+' attenuation '+K(p));}}routes.push({name,net,path,refresh,max_dust_run:max});return path;}
 const rv=[],wv=[],ra=[],wa=[],wd=[];
 for(let i=0;i<8;i++){
  const Y=-52+4*i,y=Y-2,read=[],write=[],data=[],products=[];group='raw_request_frontend';
  net='rv'+i;w(78,y,-308);r(78,y,-307,'south');rv.push(P(78,y,-308));const taps=Array.from({length:8},(_,b)=>-244+8*b).flatMap(z=>[K(P(78,y,z-3)),K(P(78,y,z+3))]);taps.push(K(P(78,y,-118)));route('rv_'+i,[[78,y,-306],[78,y,-113]],{wireOnly:taps});
  net='wv'+i;w(86,y,-308);r(86,y,-307,'south');wv.push(P(86,y,-308));route('wv_'+i,[[86,y,-306],[86,y,-116]]);
  // Actual bank-local address selection. Read-valid globally chooses read
  // address and suppresses this consumer's write, even across bank identities.
  for(let b=0;b<8;b++){
   const field=b-2,z=-244+8*b;net='rv'+i;r(77,y,z-3,'west');solid(76,y,z-3);net='not_rv'+i;wall(75,y,z-3,'west');for(let x=74;x>=70;x--)w(x,y,z-3);r(70,y,z-2,'south');
   net='rv'+i;r(77,y,z+3,'west');for(let x=76;x>=70;x--)w(x,y,z+3);r(70,y,z+2,'north');
   net='read_address'+i+'_'+b;w(72,y,z-1);r(71,y,z-1,'west');read.push(P(72,y,z-1));net='write_address'+i+'_'+b;w(72,y,z+1);r(71,y,z+1,'west');write.push(P(72,y,z+1));net='candidate'+i+'_'+field;for(const dz of[-1,1]){c(70,y,z+dz,'west');r(69,y,z+dz,'west');w(68,y,z+dz);}w(68,y,z);r(67,y,z,'west');w(66,y,z);r(65,y,z,'west');products.push({bit:b,read_gate:P(70,y,z-1),write_gate:P(70,y,z+1),result:P(65,y,z),read_mask:P(70,y,z-2),write_mask:P(70,y,z+2)});
  }
  // Every candidate crosses the existing mask rail through a directed
  // underpass diode. The old rail's powered floor cannot enter its rear.
  for(let field=0;field<15;field++){
   const z=-228+8*field;net='candidate'+i+'_'+field;
   if(field>=6&&field<14){const b=field-6;net='write_data'+i+'_'+b;w(70,y,z);r(69,y,z,'west');data.push(P(70,y,z));net='candidate'+i+'_'+field;w(68,y,z);r(67,y,z,'west');w(66,y,z);r(65,y,z,'west');}
   if(field===14){net='wv'+i;r(85,y,z,'west');w(84,y,z);w(83,y,z);w(82,y-1,z);w(81,y-2,z);w(80,y-2,z);r(79,y-2,z,'west');r(78,y-2,z,'west');w(77,y-2,z);w(76,y-1,z);w(75,y,z);w(74,y,z);w(73,y,z);w(72,y,z);r(71,y,z,'west');net='rv'+i;r(77,y,z-2,'west');for(let x=76;x>=70;x--)w(x,y,z-2);r(70,y,z-1,'south');net='candidate'+i+'_'+field;c(70,y,z,'west');r(69,y,z,'west');w(68,y,z);r(67,y,z,'west');w(66,y,z);r(65,y,z,'west');}
   r(64,y,z,'west');w(63,y,z);w(62,y+1,z);w(61,Y,z);w(61,Y,z-1);w(62,Y,z-1);w(62,Y,z-2);r(62,Y,z-3,'north');const dst=parent.ports.candidate_payload.positions[i*15+field];assert.deepEqual(dst,P(62,Y,z-4));bindings.push({consumer:i,field,driver:P(62,Y,z-3),destination:dst,underpass:P(64,y,z)});
  }
  // Both raw valids physically OR; the already selected low address then
  // masks this source. At most one bank is eligible for a single consumer.
  for(const[x,n]of[[78,'rv'],[86,'wv']]){net=n+i;r(x,y,-309,'north');w(x,y,-310);r(x,y,-311,'north');}
  net='any_valid'+i;route('any_valid_or_'+i,[[78,y,-312],[86,y,-312]]);r(77,y,-312,'west');w(76,y,-312);r(76,y,-313,'north');route('any_valid_to_bank_'+i,[[76,y,-314],[76,y,-326],[64,y,-326]]);r(63,y,-326,'west');
  for(let b=0;b<2;b++){
   const srcZ=-244+8*b,x=b?57:65,g=x-3;net='candidate'+i+'_'+(b-2);if(b){r(64,y,srcZ,'west');route('selected_low_bit1_'+i,[[63,y,srcZ],[57,y,srcZ],[57,y,-324]],{force:[K(P(62,y,srcZ))]});}else{w(64,y,srcZ);r(64,y,srcZ-1,'north');route('selected_low_bit0_'+i,[[64,y,srcZ-2],[65,y,srcZ-2],[65,y,-324]]);}
   if(!b){r(64,y,-324,'west');}else r(56,y,-324,'west');
   if((bankIndex>>b)&1){solid(x-2,y,-324);net='not_low'+i+'_'+b;wall(g,y,-324,'west');}else{w(x-2,y,-324);w(g,y,-324);}r(g,y,-325,'north');net='eligible'+i;c(g,y,-326,'west');r(g-1,y,-326,'west');if(!b){for(let xx=60;xx>=56;xx--)w(xx,y,-326);r(55,y,-326,'west');}
  }
  net='eligible'+i;const x=5*i,targetY=-52;route('eligible_to_lane_'+i,[[52,y,-326],[x,y,-326]],{force:[K(P(x+1,y,-326))]});let yy=y,z=-326,points=[[x,yy,z]],force=[];while(yy!==targetY){const n=Math.min(7,Math.abs(yy-targetY));yy+=Math.sign(targetY-yy)*n;z+=n;points.push([x,yy,z]);if(yy!==targetY){z+=3;points.push([x,yy,z]);force.push(K(P(x,yy,z-1)));}}assert(z<-249);points.push([x,targetY,-249]);route('eligible_to_parent_'+i,points,{force});r(x,targetY,-248,'south');bindings.push({consumer:i,field:'eligibility',driver:P(x,targetY,-248),destination:parent.ports.eligible.positions[i]});
  ra.push(...read);wa.push(...write);wd.push(...data);frontends.push({consumer:i,row_y:Y,logic_y:y,address_muxes:products,bank_compare:[P(62,y,-326),P(54,y,-326)],raw_valid:[rv[i],wv[i]]});
 }
 // Retained-owner acknowledgement qualification. Each consumer has two real
 // valid gates; the separately held type chooses which withdrawal ends ACTIVE.
 group='owner_valid';
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let yy=lo;yy<=hi;yy++)if((yy-lo)%2)put(P(x,yy,z),{id:'minecraft:redstone_torch'});else solid(x,yy,z);};
 for(const z of[-125,-105]){net=z===-125?'selected_read_valid':'selected_write_valid';tower(96,z,-54,-18);}
 const validGates=[];
 for(let i=0;i<8;i++){
  const Y=-52+4*i,y=Y-2;
  net='rv'+i;assert.equal(m.get(K(P(78,y,-125))).block.id,'minecraft:redstone_wire');r(79,y,-125,'east');w(80,y,-125);w(81,y,-125);w(82,y-1,-125);w(83,y-2,-125);w(84,y-2,-125);r(85,y-2,-125,'east');r(86,y-2,-125,'east');w(87,y-2,-125);w(88,y-1,-125);w(89,y,-125);w(90,y,-125);w(91,y,-125);w(92,y,-125);r(93,y,-125,'east');
  net='wv'+i;r(87,y,-116,'east');route('wv_to_ack_'+i,[[88,y,-116],[88,y,-105],[92,y,-105]],{force:[K(P(88,y,-107))]});r(93,y,-105,'east');
  net='not_owner'+i;const src=P(64,Y,-118);r(65,Y,-118,'east');route('owner_ack_mask_out_'+i,[[66,Y,-118],[100,Y,-118]],{force:[K(P(99,Y,-118))]});w(101,Y-1,-118);w(102,y,-118);r(102,y,-119,'north');route('owner_ack_read_mask_'+i,[[102,y,-120],[102,y,-128],[94,y,-128]]);r(94,y,-127,'south');r(94,y,-126,'south');r(102,y,-117,'south');route('owner_ack_write_mask_'+i,[[102,y,-116],[102,y,-108],[94,y,-108]]);r(94,y,-107,'south');r(94,y,-106,'south');
  for(const[z,n]of[[-125,'selected_read_valid'],[-105,'selected_write_valid']]){net=n;c(94,y,z,'east');r(95,y,z,'east');validGates.push({consumer:i,gate:P(94,y,z),rear:P(93,y,z),owner_mask:P(94,y,z-1),collector:P(96,y,z)});}
 }
 // The retained type is read from its actual held-output pad, not recomputed
 // from possibly withdrawn/changed raw valids after ownership has closed.
 net='held_is_write';r(49,-18,-121,'south');r(49,-18,-120,'south');route('held_type_to_ack',[[49,-18,-119],[80,-18,-119],[80,-18,-135],[114,-18,-135],[114,-18,-119]],{wireOnly:[K(P(114,-18,-119)),K(P(114,-18,-128))]});r(113,-18,-128,'west');route('held_type_read_mask',[[112,-18,-128],[108,-18,-128]]);r(108,-18,-127,'south');r(108,-18,-126,'south');r(115,-18,-119,'east');solid(116,-18,-119);
 net='held_is_read';wall(117,-18,-119,'east');route('held_read_write_mask',[[118,-18,-119],[118,-18,-102],[108,-18,-102]],{force:[K(P(118,-18,-104))]});r(108,-18,-103,'north');r(108,-18,-104,'north');
 for(const[z,n]of[[-125,'selected_read_valid'],[-105,'selected_write_valid']]){net=n;r(97,-18,z,'east');route('selected_valid_rear_'+z,[[98,-18,z],[106,-18,z]]);r(107,-18,z,'east');net='selected_valid';c(108,-18,z,'east');r(109,-18,z,'east');}
 net='selected_valid';route('selected_valid_or',[[110,-18,-125],[110,-18,-105]],{wireOnly:[K(P(110,-18,-115))]});solid(111,-18,-115);r(111,-19,-115,'east');w(112,-19,-115);w(113,-20,-115);w(114,-21,-115);w(115,-21,-115);w(116,-21,-115);r(117,-21,-115,'east');r(118,-21,-115,'east');w(119,-21,-115);r(120,-21,-115,'east');
 // One autonomous state/sequencer is physically embedded in this bank map.
 const seq=makeDataSequencer(),offset=P(0,-50,-450),shift=p=>P(p.x,p.y+offset.y,p.z+offset.z);group='sequencer';
 for(const v of seq.blocks){net='sequence_'+seq.nets[K(v.position)];put(shift(v.position),v.block);}
 const sequencePorts=Object.fromEntries(Object.entries(seq.ports).map(([n,p])=>[n,shift(p)]));
 group='phase_routes';
 function stair(name,x,fromY,fromZ,toY,dz=1){let y=fromY,z=fromZ,points=[[x,y,z]],force=[];while(y!==toY){const n=Math.min(7,Math.abs(y-toY));y+=Math.sign(toY-y)*n;z+=dz*n;points.push([x,y,z]);if(y!==toY){z+=dz*3;points.push([x,y,z]);force.push(K(P(x,y,z-dz)));}}route(name,points,{force});return P(x,y,z);}
 // Eligibility merges only after each low-bank comparison and global read-first
 // exclusion, so this channel never claims a consumer addressing another bank.
 net='any_eligible';for(let i=0;i<8;i++){r(5*i,-24,-246,'north');r(5*i,-24,-247,'north');}
 route('any_eligible_or',[[0,-24,-248],[40,-24,-248]],{wireOnly:Array.from({length:8},(_,i)=>K(P(5*i,-24,-248)))});r(40,-24,-249,'north');route('any_eligible_north',[[40,-24,-250],[40,-24,-350]]);const anyEnd=stair('any_eligible_descent',40,-24,-350,-49,-1);route('any_eligible_to_request',[[40,-49,anyEnd.z],[40,-49,-396],[112,-49,-396],[112,-49,-448]]);r(112,-49,-449,'north');
 net='selected_valid';route('held_valid_north',[[121,-21,-115],[124,-21,-115],[124,-21,-340]]);const ackEnd=stair('held_valid_descent',124,-21,-340,-45,-1);route('held_valid_to_clear',[[124,-45,ackEnd.z],[124,-45,-402],[8,-45,-402],[8,-45,-434]]);r(8,-45,-435,'north');
 // Low-level OPEN ingress uses capped, directed support drive at two pads;
 // this avoids crossing the crowded priority/mask planes at their signal Y.
 net='sequence_open_owner';route('owner_phase_out',[[31,-37,-464],[31,-37,-476],[148,-37,-476],[148,-37,-370]]);const ownerEnd=stair('owner_phase_descent',148,-37,-370,-57,1);route('owner_phase_underpass',[[148,-57,ownerEnd.z],[148,-57,-230],[58,-57,-230]]);r(57,-57,-230,'west');tower(56,-230,-57,-53);r(55,-53,-230,'west');w(54,-53,-230);r(53,-53,-230,'west');solid(53,-52,-230);
 net='sequence_open_address';route('payload_phase_out',[[63,-37,-464],[63,-37,-472],[144,-37,-472],[144,-37,-374]]);const payloadEnd=stair('payload_phase_descent',144,-37,-374,-58,1);route('payload_phase_underpass',[[144,-58,payloadEnd.z],[144,-58,-252],[48,-58,-252],[48,-58,-249]]);r(48,-58,-248,'south');tower(48,-247,-58,-22);r(48,-22,-246,'south');r(48,-22,-245,'south');solid(48,-21,-245);
 net='sequence_write_phase';route('write_phase_out',[[111,-37,-464],[111,-37,-468],[140,-37,-468],[140,-37,-378]]);const writeEnd=stair('write_phase_descent',140,-37,-378,-61,1);route('write_phase_bank',[[140,-61,writeEnd.z],[140,-61,-280],[156,-61,-280],[156,-61,-70],[156,-59,-68],[156,-59,-60],[92,-59,-60]]);r(91,-59,-60,'west');
 net='sequence_open_response';route('response_phase_rise',[[79,-37,-428],[79,-37,-414],[136,-37,-414],[136,-37,-396]]);r(136,-37,-395,'south');tower(136,-394,-37,279);r(135,279,-394,'west');route('response_phase_bank',[[134,279,-394],[-24,279,-394],[-24,279,-68]]);r(-24,279,-67,'south');
 // READY rises only after the final normal tail and is demultiplexed by both
 // retained owner and retained access type. Stores cannot acknowledge early.
 group='ready_routes';net='sequence_ready';r(18,-41,-455,'north');w(18,-41,-456);r(18,-41,-457,'north');tower(18,-458,-41,-37);r(18,-37,-459,'north');route('ready_departure',[[18,-37,-460],[18,-37,-484],[152,-37,-484],[152,-37,-374]]);const readyEnd=stair('ready_descent',152,-37,-374,-56,1);route('ready_lower_return',[[152,-56,readyEnd.z],[152,-56,-110],[112,-56,-110],[112,-56,-98]]);r(112,-56,-97,'south');tower(112,-96,-56,-24);
 net='held_is_write';r(115,-18,-135,'east');route('type_to_ready_descent',[[116,-18,-135],[140,-18,-135]]);const typeEnd=stair('type_ready_descent',140,-18,-135,-52,-1);route('type_ready_bottom',[[140,-52,typeEnd.z],[136,-52,typeEnd.z],[136,-52,-100],[134,-52,-100]]);r(133,-52,-100,'west');tower(132,-100,-52,-24);
 net='held_is_read';r(119,-18,-102,'east');route('read_type_to_ready_descent',[[120,-18,-102],[144,-18,-102]]);const notTypeEnd=stair('read_type_ready_descent',144,-18,-102,-52,1);route('read_type_ready_bottom',[[144,-52,notTypeEnd.z],[148,-52,notTypeEnd.z],[148,-52,-92],[134,-52,-92]]);r(133,-52,-92,'west');tower(132,-92,-52,-24);
 const readReady=[],writeReady=[],readyGates=[];
 for(let i=0;i<8;i++){
  const y=-52+4*i;net='not_owner'+i;r(100,y,-117,'south');route('owner_to_ready_masks_'+i,[[100,y,-116],[100,y,-100],[116,y,-100]]);r(116,y,-99,'south');w(116,y,-98);r(116,y,-97,'south');
  net='sequence_ready';r(113,y,-96,'east');w(114,y,-96);r(115,y,-96,'east');net='owner_ready'+i;c(116,y,-96,'east');r(117,y,-96,'east');w(118,y,-96);r(119,y,-96,'east');w(120,y,-96);r(120,y,-97,'north');route('owner_ready_read_'+i,[[120,y,-98],[126,y,-98]]);r(127,y,-98,'east');r(120,y,-95,'south');route('owner_ready_write_'+i,[[120,y,-94],[126,y,-94]]);r(127,y,-94,'east');
  net='held_is_write';r(131,y,-100,'west');for(let x=130;x>=128;x--)w(x,y,-100);r(128,y,-99,'south');net='held_is_read';r(131,y,-92,'west');for(let x=130;x>=128;x--)w(x,y,-92);r(128,y,-93,'north');
  for(const[z,n,out]of[[-98,'read_ready',readReady],[-94,'write_ready',writeReady]]){net=n+i;c(128,y,z,'east');r(129,y,z,'east');w(130,y,z);out.push(P(130,y,z));}
  readyGates.push({consumer:i,owner_gate:P(116,y,-96),read_gate:P(128,y,-98),write_gate:P(128,y,-94)});
 }
 // Eight physical response fanouts, each with eight consumer terminals.
 // All replicas are driven by the retained response bank; only READY qualifies.
 group='response_fanout';const responseData=Array.from({length:8},()=>[]);
 for(let b=0;b<8;b++){
  const x=parent.ports.response.positions[b].x;net='response_bit'+b;r(x,275,-62,'north');tower(x,-63,275,283);r(x,283,-64,'north');const taps=Array.from({length:8},(_,i)=>K(P(x,283,-72-8*i)));route('response_bus_'+b,[[x,283,-65],[x,283,-128]],{wireOnly:taps});
  for(let i=0;i<8;i++){const z=-72-8*i;r(x+1,283,z,'east');w(x+2,283,z);responseData[i].push(P(x+2,283,z));}
 }
 const port=(direction,positions)=>({direction,width:positions.length,positions,bit_order:'consumer_major_lsb_first',polarity:'active_high'}),ports={reset:port('input',[sequencePorts.reset]),read_valid:port('input',rv),write_valid:port('input',wv),read_address:port('input',ra),write_address:port('input',wa),write_data:port('input',wd),read_ready:port('output',readReady),write_ready:port('output',writeReady),read_data:port('output',responseData.flat())};
 const blocks=[...m.values()],box={from:{},to:{}},histogram={};for(const a of AX){box.from[a]=Infinity;box.to[a]=-Infinity;}for(const v of blocks){for(const a of AX){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}histogram[v.block.id]=(histogram[v.block.id]??0)+1;}
 return{status:'offline_connected_bank_fixed_channel_candidate_unselected_native_unverified',bankIndex,blocks,nets,groups,box,ports,routes,bindings,frontends,validGates,readyGates,sequencePorts,sequence_nominal:seq.nominal,metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,raw_consumers:8,address_mux_bits:64,logical_bytes:64,retained_request_response_bits:31,retained_protocol_bits:2,read_ready_outputs:8,write_ready_outputs:8,response_terminals:64,legal_y_translation:[-64-box.from.y,319-box.to.y],dimensions:Object.fromEntries(AX.map(a=>[a,box.to[a]-box.from[a]+1])),histogram},sources:{'hardware/memory-layout-data-owned-bank.mjs':source},protocol:{eligibility:'Per consumer read valid suppresses its write globally, then the chosen address low two bits select this one bank.',ownership:'Lowest eligible consumer is physically captured. Owner, address, data and type remain held until the matching owner valid is withdrawn after final ready.',acknowledgement:'Selected valid is (OR owner AND raw RV) AND held-read OR (OR owner AND raw WV) AND held-write. A pending opposite request cannot keep the completed operation active.',store:'The actual bank write phase is qualified by retained type. Ready is after write closure and response capture, subject to unmeasured physical margins.',reset:'A retained reset flush masks admission, all four OPEN/write phases and ready, clears ACTIVE and waits the delayed tail before reuse. Backing bytes are preserved; global reset during a write has no rollback guarantee.',data:'Eight actual copies of the retained eight-bit response. Only owner-qualified read-ready qualifies data.',arbitration:'UNSELECTED bank-fixed refinement; it is not the original arbitrary-channel allocation order.'},missing:['Four-bank raw-consumer fanout/ready return and global placement are not yet routed; this is one complete connected bank-local candidate.','This is a bank-owned arbitration refinement, not the original arbitrary-channel allocator; full matched comparison remains required.','Independent electrical review and all native initialization/phase closure/propagation/reset races/retention/whole-memory placement remain unproved.'],native_acceptance:false,selected:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDataChannel();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
