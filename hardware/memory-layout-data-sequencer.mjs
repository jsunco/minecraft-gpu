// Physical ACTIVE/reset/phase submap used only inside the connected RAM derivative.
// Adapted from the pinned program controller; no host transitions or native calls.
import assert from 'node:assert/strict';
import {makeProgramResetDrain} from './memory-layout-program-reset.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'},V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
export function makeDataSequencer(){
 const map=new Map(),nets={},added=[],routes=[],edges=[],stages=[],sourceKeys=new Set();let net='';
 const put=(p,id,properties)=>{const block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p)+' '+nets[K(p)]+' / '+net);assert(block.id===S||nets[K(p)]===net);return;}const v={position:p,block};map.set(K(p),v);nets[K(p)]=net;added.push(v);};
 const solid=(x,y,z)=>put(P(x,y,z),S),dev=(x,y,z,id,props)=>{solid(x,y-1,z);put(P(x,y,z),id,props);},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d,t=1)=>dev(x,y,z,'repeater',{facing:F[d],delay:String(t)}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'}),wall=(x,y,z,f)=>put(P(x,y,z),'redstone_wall_torch',{facing:f});
 const edge=(a,b,kind)=>edges.push({from:a,to:b,kind});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2)put(P(x,y,z),'redstone_torch');else solid(x,y,z);};
 function route(name,waypoints,{force=[],wireOnly=[]}={}){const ps=[P(...waypoints[0])];for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n&&(!dx||!dz)&&(dy===0||Math.abs(dy)===n),'route '+name);for(let j=1;j<=n;j++)ps.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}
 let run=0;const refresh=[];for(let i=0;i<ps.length;i++){const p=ps[i],a=ps[i-1],b=ps[i+1],old=map.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire');assert.equal(nets[K(p)],net);run=0;}else{const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');refresh.push(p);run=0;}else{w(p.x,p.y,p.z);assert(++run<=14,name+' attenuation');}}if(i)edge(ps[i-1],p,name);}routes.push({name,net,path:ps,refresh});return ps;}
 const O=P(0,0,0),G=p=>P(p.x+O.x,p.y+O.y,p.z+O.z),local=(f,...args)=>f(...args); // All helpers below use actual coordinates.
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
 importState('reset',176,-260,-60);importState('active',96,0,0);
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
 // Extended normal row turns at128 now lie well outside T5's tower.
 // OPEN_OWNER = ACTIVE - T1; OPEN_ADDRESS = T2 - T3; RESPONSE = T4 - T5.
 net='active_delayed_flush';for(const[x,hi]of[[31,9],[63,9]]){LR(x-1,9,-2,'west');LW(x-2,9,-2);LR(x-2,9,-3,'north');LP('late_to_phase_'+x,[[x-2,9,-4],[x-2,9,-10]]);LR(x-2,9,-11,'north');LT(x-2,-12,9,13);LR(x-1,13,-12,'east');}
 LR(48,13,-2,'east');LP('t2_to_address_phase',[[49,13,-2],[63,13,-2]]);LR(63,13,-3,'north');LP('address_phase_rear',[[63,13,-4],[63,13,-10]]);LR(63,13,-11,'north');
 LR(64,13,10,'east');LP('t4_to_response_phase',[[65,13,10],[79,13,10]]);LR(79,13,11,'south');LP('response_phase_rear',[[79,13,12],[79,13,18]]);LR(79,13,19,'south');LR(78,9,10,'west');LW(77,9,10);LR(77,9,11,'south');LP('t5_to_response_mask',[[77,9,12],[77,9,18]]);LR(77,9,19,'south');LT(77,20,9,13);LR(78,13,20,'east');
 for(const[x,z,d,name]of[[31,-12,'north','open_owner'],[63,-12,'north','open_address'],[79,20,'south','open_response']]){net=name;LC(x,13,z,d);LR(x,13,z+(d==='north'?-1:1),d);LW(x,13,z+(d==='north'?-2:2));LE([x,13,z+(d==='north'?1:-1)],[x,13,z],'phase_rear');LE([x-1,13,z],[x,13,z],'phase_late_mask');LE([x+1,13,z],[x,13,z],'phase_reset_mask');}
 // The one actual reset-busy output drives all admission/effect masks.
 net='reset_blocked';LR(-248,9,-63,'south');LP('reset_busy_main',[[-248,9,-62],[-248,9,-24],[90,9,-24]],{wireOnly:[-12,20,33,65,90].map(x=>K(P(x,9,-24)))});
 for(const x of[33,65]){LR(x,9,-23,'south');LP('reset_phase_'+x,[[x,9,-22],[x,9,-14]]);LR(x,9,-13,'south');LT(x,-12,9,13);LR(x-1,13,-12,'west');}
 LR(90,9,-23,'south');LP('reset_response_phase',[[90,9,-22],[90,9,20],[83,9,20]]);LR(82,9,20,'west');LT(81,20,9,13);LR(80,13,20,'west');
 LR(-12,9,-23,'south');LP('reset_to_active_floor',[[-12,9,-22],[-12,1,-14],[14,1,-14],[14,1,-2]]);
 LR(0,1,-13,'south');LP('reset_active_clear',[[0,1,-12],[0,1,-2]]);
 // External any-request and selected-valid ports are physically supplied by the bank fabric.
 // READY = T6 - (!ACTIVE OR reset-busy), before owner demultiplexing.
 net='active_flush';LR(8,9,-5,'north');LS(8,9,-6);net='not_active';LWall(8,9,-7,'north');LP('not_active_to_ready',[[8,9,-8],[16,9,-8],[16,9,-6]]);LR(16,9,-5,'south');
 net='ready';LC(16,9,-4,'east');LR(17,9,-4,'east');LW(18,9,-4);LE([15,9,-4],[16,9,-4],'ready_tail');LE([16,9,-5],[16,9,-4],'ready_active');LE([16,9,-3],[16,9,-4],'ready_reset');
 net='reset_blocked';LR(20,9,-23,'south');LP('reset_ready',[[20,9,-22],[20,9,-2],[16,9,-2]]);LR(16,9,-3,'north');

 // WRITE = T_write_start - T_write_end; both taps are after payload closure.
 // A dedicated reset side mask closes bank writes throughout reset/drain.
 for(const [x,hi] of [[95,13],[111,9]]){
  replace(P(x,5,0),'redstone_wire');delete map.get(K(P(x,5,0))).block.properties;
  net='active_delayed_flush';r(x,5,-1,'north');tower(x,-2,5,hi);
 }
 net='active_delayed_flush';r(96,13,-2,'east');route('write_start_rear',[[97,13,-2],[111,13,-2],[111,13,-10]]);r(111,13,-11,'north');
 r(110,9,-2,'west');w(109,9,-2);r(109,9,-3,'north');route('write_end_mask',[[109,9,-4],[109,9,-10]]);r(109,9,-11,'north');tower(109,-12,9,13);r(110,13,-12,'east');
 net='reset_blocked';route('reset_write_spine',[[90,9,-24],[113,9,-24]]);r(113,9,-23,'south');route('reset_write_mask',[[113,9,-22],[113,9,-14]]);r(113,9,-13,'south');tower(113,-12,9,13);r(112,13,-12,'west');
 net='write_phase';c(111,13,-12,'north');r(111,13,-13,'north');w(111,13,-14);
 return{blocks:[...map.values()],nets,routes,edges,stages,ports:{reset:P(-68,1,-60),request:P(112,1,0),selected_valid:P(8,5,14),open_owner:P(31,13,-14),open_payload:P(63,13,-14),write_phase:P(111,13,-14),open_response:P(79,13,22),ready:P(18,9,-4),active:P(8,9,-4),blocked:P(-248,9,-64)},nominal:{normal_slow_repeaters:441,reset_slow_repeaters:768,owner_window_slow_ticks:120,payload_window_slow_ticks:120,write_window_slow_ticks:120,normal_slow_ticks:3528,reset_slow_ticks:6144}};
}
