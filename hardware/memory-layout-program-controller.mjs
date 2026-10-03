// Connected program-memory controller derivative; offline geometry only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeProgramCapture} from './memory-layout-program-capture.mjs';
import {makeProgramResetDrain} from './memory-layout-program-reset.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export function makeProgramController(){
 const pins={'memory-layout-program-capture.mjs':'c38161db65a8da4a6e70c77f1329598ea17c6cc819cd16637eb3c59862a41718','memory-layout-program-reset.mjs':'24953a4e5a25452b402ff580ff9b132d7090e0b6527c6744fe7edfc8735a0fdd'};for(const[n,h]of Object.entries(pins))assert.equal(hash(new URL(n,import.meta.url)),h);
 const parent=makeProgramCapture(),map=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),nets={...parent.nets},added=[],routes=[],edges=[],stages=[],sourceKeys=new Set(map.keys());let net='';
 const put=(p,id,properties)=>{const block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p)+' '+nets[K(p)]+' / '+net);assert(block.id===S||nets[K(p)]===net,'net overlap '+K(p)+' '+nets[K(p)]+' / '+net);return;}const v={position:p,block};map.set(K(p),v);nets[K(p)]=net;added.push(v);};
 const solid=(x,y,z)=>put(P(x,y,z),S),dev=(x,y,z,id,props)=>{solid(x,y-1,z);put(P(x,y,z),id,props);},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d,t=1)=>dev(x,y,z,'repeater',{facing:F[d],delay:String(t)}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'}),wall=(x,y,z,f)=>put(P(x,y,z),'redstone_wall_torch',{facing:f});
 const edge=(a,b,kind)=>edges.push({from:a,to:b,kind});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2)put(P(x,y,z),'redstone_torch');else solid(x,y,z);};
 function route(name,waypoints,{refreshLast=false,force=[]}={}){const ps=[P(...waypoints[0])];for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n&&(!dx||!dz)&&(dy===0||Math.abs(dy)===n),'route '+name);for(let j=1;j<=n;j++)ps.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}
  let power=15,run=0,maxRun=0;const refresh=[];for(let i=0;i<ps.length;i++){const p=ps[i],a=ps[i-1],b=ps[i+1],old=map.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire','route occupied '+name+' '+K(p));assert.equal(nets[K(p)],net,'route net '+name+' '+K(p));power=15;run=0;}else{const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(power<=4||force.includes(K(p))||refreshLast&&i===ps.length-2)){const d=Object.keys(V).find(d=>V[d][0]===b.x-p.x&&V[d][1]===b.z-p.z);r(p.x,p.y,p.z,d);refresh.push(p);power=15;run=0;}else{w(p.x,p.y,p.z);power--;maxRun=Math.max(maxRun,++run);assert(power>0,'attenuation '+name+' '+K(p));}}if(i)edge(ps[i-1],p,name);}
  routes.push({name,net,path:ps,refresh,max_dust_run:maxRun});return ps;
 }
 const O=P(-60,-50,-180),G=p=>P(p.x+O.x,p.y+O.y,p.z+O.z),local=(f,...args)=>f(...args); // All helpers below use actual coordinates.
 const LW=(x,y,z)=>w(x+O.x,y+O.y,z+O.z),LR=(x,y,z,d,t)=>r(x+O.x,y+O.y,z+O.z,d,t),LC=(x,y,z,d)=>c(x+O.x,y+O.y,z+O.z,d),LS=(x,y,z)=>solid(x+O.x,y+O.y,z+O.z),LT=(x,z,lo,hi)=>tower(x+O.x,z+O.z,lo+O.y,hi+O.y),LWall=(x,y,z,f)=>wall(x+O.x,y+O.y,z+O.z,f),LP=(name,a,opt)=>route(name,a.map(([x,y,z])=>[x+O.x,y+O.y,z+O.z]),opt),LE=(a,b,k)=>edge(G(P(...a)),G(P(...b)),k);
 // Exact stretched reset/ACTIVE motifs. Only the named contiguous X cut is
 // lengthened; every bridge and slow element occupies real cells.
 const reset=makeProgramResetDrain();
 function importState(kind,extra,dx,dz){const allowed=new Set(['flush','not_flush','admitted_reset','clear','delayed_flush']);
  for(const v of reset.blocks){const p=v.position,n=reset.nets[K(p)];if(kind==='active'&&!allowed.has(n)&&!(n==='reset'&&p.y<=1&&p.z===0&&[15,16].includes(p.x)))continue;
   const q=G(P(p.x+(p.x>=16?extra:0)+dx,p.y,p.z+dz));net=kind+'_'+n;put(q,v.block.id,v.block.properties);
  }
  for(const e of reset.edges){const transform=p=>G(P(p.x+(p.x>=16?extra:0)+dx,p.y,p.z+dz));let a=transform(e.from),b=transform(e.to);if(e.from.x===15&&e.to.x===16)b=G(P(16+dx,e.to.y,e.to.z+dz));edges.push({from:a,to:b,kind:kind+'_'+e.kind});}
  const q=(x,y,z)=>P(x+dx,y,z+dz);
  net=kind+'_reset';for(let x=16;x<16+extra;x++){const p=q(x,1,0);if((x-16)%12===0)LR(p.x,p.y,p.z,'west');else LW(p.x,p.y,p.z);}
  net=kind+'_delayed_flush';for(let row=0;row<4;row++)for(let x=16;x<16+extra;x++){const p=q(x,5,row*4);LR(p.x,p.y,p.z,row%2?'west':'east',4);}
  if(kind==='reset')for(const[z,n,d]of[[-8,'reset','west'],[-4,'drained','east']]){net=kind+'_'+n;for(let x=16;x<16+extra;x++){const p=q(x,9,z);if((x-16)%12===0)LR(p.x,p.y,p.z,d);else LW(p.x,p.y,p.z);}}
 }
 importState('reset',112,-180,-60);importState('active',48,0,0);
 // ACTIVE clears only when the held owner releases valid after the full tail.
 const replace=(p,id,props)=>{assert(!sourceKeys.has(K(p)));const v=map.get(K(p));assert(v);v.block={id:'minecraft:'+id,properties:props};};
 replace(G(P(8,5,12)),'comparator',{facing:'east',mode:'subtract'});
 net='selected_valid';LR(8,5,13,'north');LW(8,5,14);LE([8,5,13],[8,5,12],'owner_ack_mask');
 // Additional immediate ACTIVE-clear input and SET inhibition from reset busy.
 net='reset_blocked';LW(0,1,-2);LR(0,1,-1,'south');LE([0,1,-1],[0,1,0],'reset_active_clear');LR(14,1,-1,'south');LW(14,1,-2);LE([14,1,-1],[14,1,0],'reset_admit_mask');
 // Expose the positive state and final timing tail without joining them.
 net='active_flush';LW(8,9,-4);LT(6,-4,9,13);LR(7,13,-4,'east');LP('active_to_owner_phase',[[8,13,-4],[31,13,-4]]);LR(31,13,-5,'north');LP('owner_phase_rear',[[31,13,-6],[31,13,-10]]);LR(31,13,-11,'north');
 net='active_delayed_flush';LW(10,9,-4);LR(11,9,-4,'east');LW(12,9,-4);LW(13,9,-4);LW(14,9,-4);LR(15,9,-4,'east');
 const taps=[[31,0,'t1',9],[47,0,'t2',13],[63,0,'t3',9],[63,8,'t4',13],[79,8,'t5',9]];
 for(const[x,z,n,hi]of taps){const p=G(P(x,5,z));replace(p,'redstone_wire',undefined);delete map.get(K(p)).block.properties;net='active_delayed_flush';const south=z===8;LR(x,5,z+(south?1:-1),south?'south':'north');LT(x,z+(south?2:-2),5,hi);stages.push({name:n,position:p,tower:G(P(x,hi,z+(south?2:-2)))});}
 // The row turn beside T5 must not weakly power its tower base. This
 // directional segment preserves the turn and removes that parallel feed.
 replace(G(P(80,5,10)),'repeater',{facing:'north',delay:'1'});
 // OPEN_OWNER = ACTIVE - T1; OPEN_ADDRESS = T2 - T3; RESPONSE = T4 - T5.
 net='active_delayed_flush';for(const[x,hi]of[[31,9],[63,9]]){LR(x-1,9,-2,'west');LW(x-2,9,-2);LR(x-2,9,-3,'north');LP('late_to_phase_'+x,[[x-2,9,-4],[x-2,9,-10]]);LR(x-2,9,-11,'north');LT(x-2,-12,9,13);LR(x-1,13,-12,'east');}
 LR(48,13,-2,'east');LP('t2_to_address_phase',[[49,13,-2],[63,13,-2]]);LR(63,13,-3,'north');LP('address_phase_rear',[[63,13,-4],[63,13,-10]]);LR(63,13,-11,'north');
 LR(64,13,10,'east');LP('t4_to_response_phase',[[65,13,10],[79,13,10]]);LR(79,13,11,'south');LP('response_phase_rear',[[79,13,12],[79,13,18]]);LR(79,13,19,'south');LR(78,9,10,'west');LW(77,9,10);LR(77,9,11,'south');LP('t5_to_response_mask',[[77,9,12],[77,9,18]]);LR(77,9,19,'south');LT(77,20,9,13);LR(78,13,20,'east');
 for(const[x,z,d,name]of[[31,-12,'north','open_owner'],[63,-12,'north','open_address'],[79,20,'south','open_response']]){net=name;LC(x,13,z,d);LR(x,13,z+(d==='north'?-1:1),d);LW(x,13,z+(d==='north'?-2:2));LE([x,13,z+(d==='north'?1:-1)],[x,13,z],'phase_rear');LE([x-1,13,z],[x,13,z],'phase_late_mask');LE([x+1,13,z],[x,13,z],'phase_reset_mask');}
 // The one actual reset-busy output drives all admission/effect masks.
 net='reset_blocked';LR(-168,9,-63,'south');LP('reset_busy_main',[[-168,9,-62],[-168,9,-24],[90,9,-24]]);
 for(const x of[33,65]){LR(x,9,-23,'south');LP('reset_phase_'+x,[[x,9,-22],[x,9,-14]]);LR(x,9,-13,'south');LT(x,-12,9,13);LR(x-1,13,-12,'west');}
 LR(90,9,-23,'south');LP('reset_response_phase',[[90,9,-22],[90,9,20],[83,9,20]]);LR(82,9,20,'west');LT(81,20,9,13);LR(80,13,20,'west');
 LR(-12,9,-23,'south');LP('reset_to_active_floor',[[-12,9,-22],[-12,1,-14],[14,1,-14],[14,1,-2]]);
 LR(0,1,-13,'south');LP('reset_active_clear',[[0,1,-12],[0,1,-2]]);
 // Raw valid inputs have isolated any-request and owned-valid paths.
 for(const[x,dir]of[[-24,'east'],[-4,'west']]){net=x===-24?'valid0':'valid1';LW(x,1,18);LR(x+(dir==='east'?1:-1),1,18,dir);LT(x+(dir==='east'?2:-2),18,1,5);LR(x+(dir==='east'?3:-3),5,18,dir);LW(x+(dir==='east'?4:-4),5,18);LR(x+(dir==='east'?4:-4),5,19,'south');LR(x,1,19,'south');}
 net='valid0';LP('valid0_to_request',[[-24,1,20],[-24,1,28],[68,1,28],[68,1,0],[66,1,0]]);LR(65,1,0,'west');LE([65,1,0],[64,1,0],'valid0_any_request');
 net='valid1';LP('valid1_to_request',[[-4,1,20],[-4,1,24],[64,1,24],[64,1,2]]);LR(64,1,1,'north');LE([64,1,1],[64,1,0],'valid1_any_request');
 net='selected_valid';for(const x of[-20,-8]){LC(x,5,20,'south');LR(x,5,21,'south');LE([x,5,19],[x,5,20],'valid_mux_rear');}LP('selected_valid_join',[[-20,5,22],[8,5,22],[8,5,14]]);LE([-21,5,20],[-20,5,20],'owner_mask0');LE([-7,5,20],[-8,5,20],'owner_mask1');
 net='owner';LW(-28,1,16);LR(-27,1,16,'east');LT(-26,16,1,5);LR(-26,5,17,'south');LP('owner_to_valid0',[[-26,5,18],[-26,5,20],[-22,5,20]]);LR(-21,5,20,'east');LR(-25,5,16,'east');LS(-24,5,16);
 net='not_owner';LWall(-23,5,16,'east');LP('not_owner_to_valid1',[[-22,5,16],[-4,5,16],[-4,5,20],[-6,5,20]]);LR(-7,5,20,'west');
 // READY = T6 - (!ACTIVE OR reset-busy), before owner demultiplexing.
 net='active_flush';LR(8,9,-5,'north');LS(8,9,-6);net='not_active';LWall(8,9,-7,'north');LP('not_active_to_ready',[[8,9,-8],[16,9,-8],[16,9,-6]]);LR(16,9,-5,'south');
 net='ready';LC(16,9,-4,'east');LR(17,9,-4,'east');LW(18,9,-4);LE([15,9,-4],[16,9,-4],'ready_tail');LE([16,9,-5],[16,9,-4],'ready_active');LE([16,9,-3],[16,9,-4],'ready_reset');
 net='reset_blocked';LR(20,9,-23,'south');LP('reset_ready',[[20,9,-22],[20,9,-2],[16,9,-2]]);LR(16,9,-3,'north');
 // Actual connections to the frozen owner/address/response OPEN pads.
 net='open_owner';route('owner_open_to_rise',[[-29,-37,-194],[-29,-37,-204],[58,-37,-204],[58,-37,-102]]);r(58,-37,-101,'south');tower(58,-100,-37,-33);r(58,-33,-99,'south');route('owner_open_to_pad',[[58,-33,-98],[58,-33,-86],[58,-37,-82],[58,-37,-79]]);r(57,-37,-79,'west');edge(P(57,-37,-79),P(56,-37,-79),'owner_open_pad');
 net='open_address';route('address_open_to_rise',[[3,-37,-194],[3,-37,-200]]);r(3,-37,-201,'north');tower(3,-202,-37,-29);r(4,-29,-202,'east');route('address_open_to_pad',[[5,-29,-202],[74,-29,-202],[74,-29,-90],[74,-37,-82],[74,-37,-77]]);r(75,-37,-77,'east');edge(P(75,-37,-77),P(76,-37,-77),'address_open_pad');
 net='open_response';route('response_open_to_rise',[[19,-37,-158],[19,-37,-148]]);r(19,-37,-147,'south');tower(19,-146,-37,279);r(20,279,-146,'east');route('response_open_to_pad',[[21,279,-146],[90,279,-146],[90,279,-50]]);r(90,279,-49,'south');edge(P(90,279,-49),P(90,279,-48),'response_open_pad');
 // Buffered source taps: original valid and held owner pads remain unchanged.
 net='valid0';r(48,-37,-82,'south');edge(P(48,-37,-83),P(48,-37,-82),'v0_tap');route('valid0_parent_to_controller',[[48,-37,-81],[38,-37,-81],[38,-37,-84],[38,-49,-96],[38,-49,-100],[-80,-49,-100],[-80,-49,-166],[-84,-49,-166],[-84,-49,-164]],{force:['38,-37,-83']});r(-84,-49,-163,'south');
 net='valid1';r(44,-37,-85,'west');edge(P(45,-37,-85),P(44,-37,-85),'v1_tap');route('valid1_parent_to_controller',[[43,-37,-85],[35,-45,-85],[32,-45,-85],[24,-53,-85],[-62,-53,-85],[-62,-53,-168],[-64,-53,-168]],{force:['33,-45,-85']});r(-64,-53,-167,'south');tower(-64,-166,-53,-49);r(-64,-49,-165,'south');w(-64,-49,-164);r(-64,-49,-163,'south');
 net='owner';r(53,-37,-86,'north');edge(P(53,-37,-85),P(53,-37,-86),'owner_tap');route('owner_tap_route',[[53,-37,-87],[53,-37,-96]]);r(53,-37,-97,'north');tower(53,-98,-37,-33);r(53,-33,-99,'north');route('owner_to_high_column',[[53,-33,-100],[53,-33,-108],[100,-33,-108],[100,-33,-106]]);r(100,-33,-105,'south');tower(100,-104,-33,287);r(52,-37,-96,'west');route('owner_to_controller',[[51,-37,-96],[-90,-37,-96],[-90,-37,-100],[-90,-49,-112],[-90,-49,-164]],{force:['-90,-37,-99']});r(-89,-49,-164,'east');
 // READY's long physical rise and owner-qualified return gates are counted.
 net='ready';r(-42,-41,-185,'north');w(-42,-41,-186);r(-42,-41,-187,'north');tower(-42,-188,-41,287);r(-41,287,-188,'east');route('ready_to_demux',[[-40,287,-188],[106,287,-188],[106,287,-100],[100,287,-100]]);route('ready_demux_branch',[[106,287,-100],[112,287,-100]]);for(const x of[100,112]){r(x,287,-99,'south');route('ready_rear_'+x,[[x,287,-98],[x,287,-96]]);r(x,287,-95,'south');}
 net='owner';r(99,287,-104,'west');w(98,287,-104);r(98,287,-103,'south');route('owner_to_ready0',[[98,287,-102],[98,287,-94]]);r(99,287,-94,'east');r(101,283,-104,'east');solid(102,283,-104);
 net='not_owner_ready';wall(103,283,-104,'east');route('not_owner_to_ready1',[[104,283,-104],[114,283,-104]]);r(114,283,-103,'south');tower(114,-102,283,287);r(114,287,-101,'south');route('not_owner_ready1_mask',[[114,287,-100],[114,287,-94]]);r(113,287,-94,'west');
 const ready=[];for(const[x,n]of[[100,0],[112,1]]){net='consumer_ready'+n;c(x,287,-94,'south');r(x,287,-93,'south');w(x,287,-92);ready.push(P(x,287,-92));edge(P(x,287,-95),P(x,287,-94),'ready_demux_rear');edge(P(x+(n?1:-1),287,-94),P(x,287,-94),'ready_owner_mask');}
 // A capped lower repeater reads each response pad's powered support. A
 // supported underpass crosses the HOLD rail, then an isolated positive rise
 // supplies two real output terminals per retained response bit.
 const data=[[],[]];for(let b=0;b<16;b++){const y=b%2?283:279,z=-60-2*b;net='response'+b;solid(79,y,z);r(79,y-1,z,'east');w(80,y-1,z);w(81,y-2,z);w(82,y-2,z);w(83,y-2,z);r(84,y-2,z,'east');tower(85,z,y-2,y+10);r(86,y+10,z,'east');w(87,y+10,z);r(88,y+10,z,'east');w(89,y+10,z);r(87,y+10,z-1,'north');w(87,y+10,z-2);data[0].push(P(89,y+10,z));data[1].push(P(87,y+10,z-2));edge(P(78,y-1,z),P(79,y-1,z),'response_support_tap');}
 const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'offline_connected_program_controller_candidate_not_native_verified',blocks,added_blocks:added,nets,routes,edges,stages,box,ports:{read_valid:parent.ports.consumer_read_valid,read_address:parent.ports.consumer_read_address,read_ready:{direction:'output',width:2,positions:ready},read_data:{direction:'output',width:32,bit_order:'consumer_major_lsb_first',positions:data.flat()},reset:{direction:'input',width:1,positions:[G(P(-52,1,-60))]}},metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:added.length,configuration_bits:4096,retained_payload_bits:25,retained_protocol_bits:2,normal_slow_repeaters:251,normal_slow_nominal_ticks:2008,reset_slow_repeaters:512,reset_slow_nominal_ticks:4096,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},protocol:{ownership:'Capture priority owner, close before owned address capture; retain until owner valid falls while ready. No grant until normal tail and retained reset flush are low.',reset:'Held reset masks admission/OPEN/ready and clears ACTIVE, leaving payload unqualified. Actual reset/drain startup and margins remain unverified.',data:'Two physical fanouts of one retained response. Only the saved owner ready qualifies data; inactive/reset data may retain old values.',timing:'All delays are physical component counts, not measured propagation bounds. No host phases.'},missing:['Bounded static validation completed; independent electrical review remains pending.','Native placement initialization, entire 8-bit-address path timing, physical non-overlap/reset races and end-to-end acceptance.','Whole-machine interface placement and final vanilla execution.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeProgramController();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
