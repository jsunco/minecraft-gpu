// Connected original grant matrix plus retained owners/full request payload.
// Offline connected retention/claims/admission. Raw payload fanout and backend remain explicit.
import assert from 'node:assert/strict';import{readFileSync,mkdirSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
import{makeChannelAllocator}from'./memory-layout-channel-allocator.mjs';
import{makeChannelAdmission}from'./memory-layout-channel-admission.mjs';
import{makeSignalDescent}from'./full-gpu-signal-descent.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeChannelRetention(){
 const hash='0bf4f6ab27f94e3a98653be08607d58b36b120d6a08bd788a06a65c96da9660e';assert.equal(createHash('sha256').update(readFileSync(new URL('./memory-layout-channel-allocator.mjs',import.meta.url))).digest('hex'),hash);
 const parent=makeChannelAllocator(),map=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),nets={...parent.nets},groups=Object.fromEntries(parent.blocks.map(v=>[K(v.position),'grant_matrix'])),routes=[],stores=[],muxes=[],owners=[],payload=[],candidate=[],openOwner=[],openPayload=[];let net='',group='';
 const put=(p,b)=>{const old=map.get(K(p));if(old){assert.deepEqual(old.block,b,'collision '+K(p)+' '+groups[K(p)]+'/'+group);assert(b.id===S||nets[K(p)]===net,'net collision '+K(p));return;}map.set(K(p),{position:p,block:b});nets[K(p)]=net;groups[K(p)]=group;};
 const solid=(x,y,z)=>put(P(x,y,z),{id:S}),dev=(x,y,z,id,properties)=>{solid(x,y-1,z);put(P(x,y,z),{id:'minecraft:'+id,...(properties?{properties}:{})});},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,d)=>dev(x,y,z,'repeater',{facing:F[d],delay:'1'}),c=(x,y,z,d)=>dev(x,y,z,'comparator',{facing:F[d],mode:'subtract'}),wall=(x,y,z,facing)=>put(P(x,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing}});
 const tower=(x,z,lo,hi)=>{assert.equal((hi-lo)%4,0);for(let y=lo;y<=hi;y++)if((y-lo)%2)put(P(x,y,z),{id:'minecraft:redstone_torch'});else solid(x,y,z);};
 function route(name,points,{wireOnly=[],force=[]}={}){const path=[P(...points[0])];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);if(!n){assert.equal(dy,0);continue;}assert((!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let i=1;i<=n;i++)path.push(P(a[0]+Math.sign(dx)*i,a[1]+Math.sign(dy)*i,a[2]+Math.sign(dz)*i));}let run=0,max=0;for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1];if(map.has(K(p))){const old=map.get(K(p)).block;assert(['minecraft:redstone_wire','minecraft:repeater'].includes(old.id),name+' occupied '+K(p));assert.equal(nets[K(p)],net,name+' net '+K(p));if(old.id==='minecraft:repeater'){const d=b??p,from=b?p:a;assert(from);assert.equal(d.y,from.y);assert.equal(old.properties.facing,F[d.x>from.x?'east':d.x<from.x?'west':d.z>from.z?'south':'north'],name+' existing diode direction '+K(p));}run=0;continue;}const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');run=0;}else{w(p.x,p.y,p.z);max=Math.max(max,++run);assert(run<=14,name+' attenuation '+K(p));}}routes.push({name,net,path,max_dust_run:max});}
 const fields=[...Array.from({length:6},(_,b)=>({name:'address'+(b+2),z:8*b+8})),...Array.from({length:8},(_,b)=>({name:'write_data'+b,z:8*(b+6)+8})),{name:'is_write',z:120},{name:'address0',z:-8},{name:'address1',z:0}];
 for(let ch=0;ch<4;ch++){
  const X=128*ch,Y=80*ch;group='retained_owner';
  for(let i=0;i<8;i++){
   const y=Y+1+4*i;net='owner'+ch+'_'+i;r(X+46,y,-1,'north');r(X+46,y,-2,'north');w(X+46,y,-3);r(X+46,y,-4,'north');w(X+46,y,-5);owners.push(P(X+46,y,-5));stores.push({channel:ch,name:'owner',bit:i,driver:P(X+46,y,-1),storage:P(X+46,y,-2),lock:P(X+45,y,-2),terminal:P(X+46,y,-5)});
   net='owner_hold'+ch;r(X+45,y,-2,'east');r(X+44,y,-2,'east');w(X+43,y,-2);w(X+42,y,-2);r(X+41,y,-2,'east');w(X+40,y,-2);w(X+40,y,-3);w(X+40,y,-4);r(X+40,y,-5,'south');
  }
  group='owner_hold';net='open_owner'+ch;w(X+44,Y+1,-10);r(X+43,Y+1,-10,'west');solid(X+42,Y+1,-10);net='owner_hold'+ch;wall(X+41,Y+1,-10,'west');w(X+40,Y+1,-10);r(X+40,Y+1,-9,'south');w(X+40,Y+1,-8);r(X+40,Y+1,-7,'south');tower(X+40,-6,Y+1,Y+29);openOwner.push(P(X+44,Y+1,-10));
  for(let i=0;i<8;i++){
   const y=Y+1+4*i;group='held_owner_mask';net='owner'+ch+'_'+i;
   // Capped lower read leaves the original grant route and the owner pad's
   // existing receiver untouched. A diode passes beneath its own grant wire.
   r(X+47,y-1,-5,'east');solid(X+47,y,-5);w(X+48,y-1,-5);w(X+49,y-2,-5);route('owner_mask_underpass_'+ch+'_'+i,[[X+50,y-2,-5],[X+104,y-2,-5]],{force:[K(P(X+68+4*i,y-2,-5)),K(P(X+103,y-2,-5))]});w(X+105,y-1,-5);w(X+106,y,-5);r(X+107,y,-5,'east');solid(X+108,y,-5);net='not_owner'+ch+'_'+i;wall(X+109,y,-5,'east');route('owner_mask_feed_'+ch+'_'+i,[[X+110,y,-5],[X+120,y,-5]],{wireOnly:[K(P(X+120,y,-5))]});r(X+120,y,-6,'north');route('owner_mask_north_'+ch+'_'+i,[[X+120,y,-7],[X+120,y,-10]],{wireOnly:fields.map(f=>K(P(X+120,y,f.z-2)))});r(X+120,y,-4,'south');route('owner_mask_south_'+ch+'_'+i,[[X+120,y,-3],[X+120,y,122]],{wireOnly:fields.map(f=>K(P(X+120,y,f.z-2)))});
   for(let b=0;b<17;b++){
    const z=fields[b].z;group='payload_mux';net='candidate'+ch+'_'+i+'_'+b;w(X+118,y,z);r(X+117,y,z,'west');candidate.push(P(X+118,y,z));net='selected'+ch+'_'+b;c(X+116,y,z,'west');r(X+115,y,z,'west');net='not_owner'+ch+'_'+i;r(X+119,y,z-2,'west');w(X+118,y,z-2);w(X+117,y,z-2);w(X+116,y,z-2);r(X+116,y,z-1,'south');muxes.push({channel:ch,consumer:i,field:b,gate:P(X+116,y,z),rear:P(X+117,y,z),mask:P(X+116,y,z-1),collector:P(X+114,y,z)});
   }
  }
  for(let b=0;b<17;b++){
   const z=fields[b].z;group='payload_collectors';net='selected'+ch+'_'+b;tower(X+114,z,Y+1,Y+29);put(P(X+114,Y+30,z),{id:'minecraft:redstone_torch'});solid(X+114,Y+31,z);put(P(X+114,Y+32,z),{id:'minecraft:redstone_torch'});r(X+113,Y+32,z,'west');w(X+112,Y+32,z);r(X+111,Y+32,z,'west');
   group='payload_storage';net='payload'+ch+'_'+b;r(X+110,Y+32,z,'west');w(X+109,Y+32,z);r(X+108,Y+32,z,'west');w(X+107,Y+32,z);stores.push({channel:ch,name:'payload',bit:b,field:fields[b].name,driver:P(X+111,Y+32,z),storage:P(X+110,Y+32,z),lock:P(X+110,Y+32,z+1),terminal:P(X+107,Y+32,z)});net='payload_hold'+ch;r(X+110,Y+32,z+1,'north');r(X+105,Y+32,z+2,'east');for(let x=106;x<=110;x++)w(X+x,Y+32,z+2);
   group='payload_exports';net='payload'+ch+'_'+b;r(X+107,Y+31,z-1,'north');solid(X+107,Y+32,z-1);tower(X+107,z-2,Y+31,Y+35);r(X+106,Y+35,z-2,'west');w(X+105,Y+35,z-2);payload.push(P(X+105,Y+35,z-2));
  }
  group='payload_hold';net='open_payload'+ch;w(X+104,Y+32,-16);r(X+104,Y+32,-15,'south');solid(X+104,Y+32,-14);net='payload_hold'+ch;wall(X+104,Y+32,-13,'south');route('payload_hold_'+ch,[[X+104,Y+32,-12],[X+104,Y+32,122]],{wireOnly:fields.map(f=>K(P(X+104,Y+32,f.z+2)))});openPayload.push(P(X+104,Y+32,-16));
 }

 // Retained owners contribute to a global consumer claim only while their
 // channel is ACTIVE. Distinct positive towers and a common per-consumer OR
 // reach eight refreshed downward routes. No host supplies these claims.
 const claims=[],claimGates=[],claimDescents=[],activeMask=[],rawRV=[],rawWV=[],snapshots=[];
 for(let ch=0;ch<4;ch++){
  const X=128*ch,Y=80*ch;group='active_claim_mask';net='not_active'+ch;
  w(X+126,281,134);r(X+127,281,134,'east');tower(X+128,134,281,313);activeMask.push(P(X+126,281,134));
  for(let i=0;i<8;i++){
   const y=Y+1+4*i,x=X+164-4*i,top=313-4*i,z=-100-16*i;
   group='owner_claim_exports';net='not_owner'+ch+'_'+i;r(X+120,y,123,'south');route('held_owner_to_claim_'+ch+'_'+i,[[X+120,y,124],[x,y,124]]);r(x,y,125,'south');solid(x,y,126);net='owner'+ch+'_'+i;wall(x,y,127,'south');w(x,y,128);r(x,y,129,'south');tower(x,130,y,top);r(x,top,131,'south');w(x,top,132);r(x,top,133,'south');
   net='not_active'+ch;r(X+129,top,134,'east');route('claim_active_mask_'+ch+'_'+i,[[X+130,top,134],[x-2,top,134]]);r(x-1,top,134,'east');
   net='claimed'+i;c(x,top,134,'south');r(x,top,135,'south');w(x,top,136);claimGates.push({channel:ch,consumer:i,gate:P(x,top,134),owner_rear:P(x,top,133),inactive_mask:P(x-1,top,134),collector:P(x,top,136)});
  }
 }
 // All descents end toward south. Reflection keeps their complete footprints
 // east of their terminal, clear of the earlier consumer's ground-level run.
 const rawDirection={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},faceFrom=v=>Object.keys(rawDirection).find(k=>rawDirection[k][0]===v[0]&&rawDirection[k][1]===v[1]);
 for(let i=0;i<8;i++){
  const top=313-4*i,d=makeSignalDescent({drop:top-1}),e=d.ports.output.bits[0],x=5*i+2,z=-100-16*i;group='global_claim_return';net='claimed'+i;
  let turns=0,v=[e.travel.x,e.travel.z];while(v[0]!==0||v[1]!==1){v=[-v[1],v[0]];turns++;}
  const rot=p=>{let a=p.x,b=p.z;for(let n=0;n<turns;n++)[a,b]=[-b,a];return P(a,p.y,b);};
  let re=rot(e.position),rs=d.blocks.map(q=>rot(q.position));const reflect=Math.min(...rs.map(q=>q.x))<re.x;
  const orient=p=>{let q=rot(p);return P(reflect?-q.x:q.x,q.y,q.z);},oe=orient(e.position),off=P(x-oe.x,top,z-oe.z),trans=p=>{const q=orient(p);return P(q.x+off.x,q.y+off.y,q.z+off.z);};
  for(const b of d.blocks){const block=structuredClone(b.block);if(block.properties?.facing){let vec=[...rawDirection[block.properties.facing]];for(let n=0;n<turns;n++)vec=[-vec[1],vec[0]];if(reflect)vec[0]*=-1;block.properties.facing=faceFrom(vec);}put(trans(b.position),block);}
  const input=trans(d.path[0]),output=trans(e.position),next=trans(d.path[1]),iv=P(next.x-input.x,0,next.z-input.z),bus=z-19;
  // Four isolated gates enter a refreshed one-way OR rail; only its eastern
  // endpoint crosses north outside every inherited matrix plane.
  route('claim_shared_or_'+i,[[164-4*i,top,136],[560,top,136]],{wireOnly:Array.from({length:4},(_,ch)=>K(P(128*ch+164-4*i,top,136)))});r(561,top,136,'east');w(562,top,136);r(562,top,135,'north');route('claim_north_'+i,[[562,top,134],[562,top,bus+2]]);r(562,top,bus+1,'north');route('claim_descent_bus_'+i,[[562,top,bus],[input.x-12,top,bus]],{wireOnly:[input.x-12,input.x,input.x+3,input.x+12,input.x-iv.x*2].map(x=>K(P(x,top,bus)))});
  // Connect the actual shared bus to the descent's directed entrance.
  const ax=input.x-iv.x*2,az=input.z-iv.z*2;
  if(iv.x>0){route('claim_descent_entry_'+i,[[ax,top,bus],[ax,top,az]]);r(input.x-1,top,input.z,'east');}
  else if(iv.x<0){route('claim_descent_entry_'+i,[[ax,top,bus],[ax,top,az]]);r(input.x+1,top,input.z,'west');}
  else {const side=input.x+3;route('claim_descent_entry_'+i,[[side,top,bus],[side,top,az],[input.x,top,az]]);r(input.x,top,input.z-iv.z,iv.z>0?'south':'north');}
  assert.deepEqual(output,P(x,1,z));route('claim_to_snapshot_mask_'+i,[[x,1,z+1],[x,1,-16]]);r(x-1,1,-16,'west');claims.push(P(x,1,-16));claimDescents.push({consumer:i,input,output,drop:d.drop,turns,reflect,source_port:d.ports.output.bits[0]});
  // Physical any-valid OR (read/write payload selection remains read-first).
  group='free_request_snapshot';net='read_valid'+i;w(5*i,1,-34);r(5*i,1,-33,'south');rawRV.push(P(5*i,1,-34));net='write_valid'+i;w(5*i,1,-30);r(5*i,1,-31,'north');rawWV.push(P(5*i,1,-30));
  net='any_valid'+i;solid(5*i,1,-32);put(P(5*i,2,-32),{id:'minecraft:redstone_torch'});solid(5*i,3,-32);put(P(5*i,4,-32),{id:'minecraft:redstone_torch'});r(5*i,4,-31,'south');w(5*i,4,-30);w(5*i,4,-29);r(5*i,4,-28,'south');w(5*i,4,-27);w(5*i,3,-26);w(5*i,2,-25);w(5*i,1,-24);route('any_valid_to_free_'+i,[[5*i,1,-23],[5*i,1,-18]]);r(5*i,1,-17,'south');
  net='free_candidate'+i;c(5*i,1,-16,'south');r(5*i,1,-15,'south');w(5*i,1,-14);r(5*i,1,-13,'south');
  net='c0/eligible'+i;r(5*i,1,-12,'south');w(5*i,1,-11);r(5*i,1,-10,'south');w(5*i,1,-9);r(5*i,1,-8,'south');snapshots.push({kind:'free_request',bit:i,driver:P(5*i,1,-13),storage:P(5*i,1,-12),lock:P(5*i+1,1,-12),terminal:parent.ports.free_request.positions[i]});
  net='snapshot_hold';r(5*i+1,1,-12,'west');tower(5*i+2,-12,-3,1);r(5*i+2,-3,-11,'north');
 }
 group='snapshot_hold';net='snapshot_hold';route('snapshot_hold_rail',[[-2,-3,-10],[37,-3,-10]],{wireOnly:Array.from({length:8},(_,i)=>K(P(5*i+2,-3,-10)))});net='open_snapshot';w(-8,-3,-10);r(-7,-3,-10,'east');solid(-6,-3,-10);net='snapshot_hold';wall(-5,-3,-10,'east');w(-4,-3,-10);r(-3,-3,-10,'east');

 // One physical free-running admission sequencer. Its positive/negative tail
 // enforces separate snapshot/owner/payload/ACTIVE windows. Its actual request
 // is a vanilla constant; reset has a separately retained longer flush.
 const master=makeChannelAdmission(),masterO=P(300,-32,350),MP=p=>P(p.x+masterO.x,p.y+masterO.y,p.z+masterO.z);group='admission_sequencer';
 for(const v of master.blocks){net='admission/'+master.nets[K(v.position)];put(MP(v.position),v.block);}
 const masterPorts=Object.fromEntries(Object.entries(master.ports).map(([n,p])=>[n,MP(p)]));
 const phaseSpines=[{name:'snapshot',net:'admission/open_owner',x:-40,z:214,lo:-11,hi:229},{name:'owners',net:'admission/open_address',x:-36,z:218,lo:-15,hi:233},{name:'payload',net:'admission/write_phase',x:-32,z:222,lo:-20,hi:264},{name:'commit',net:'admission/open_response',x:-28,z:226,lo:-23,hi:261},{name:'barrier',net:'admission/active_flush',x:-24,z:230,lo:-27,hi:225},{name:'reset',net:'admission/reset_blocked',x:-20,z:234,lo:-31,hi:221}];
 group='admission_phase_spines';
 for(const [name,port]of[['snapshot','open_owner'],['owners','open_address'],['payload','write_phase'],['commit','open_response']]){
  const ph=phaseSpines.find(v=>v.name===name),src=masterPorts[port];net=ph.net;r(src.x-1,src.y,src.z,'west');
  if(name==='snapshot')route('master_'+name,[[src.x-2,src.y,src.z],[270,src.y,src.z],[270,src.y,280],[ph.x,src.y,280],[ph.x,src.y,ph.z+2]]);
  else {route('master_'+name+'_departure',[[src.x-2,src.y,src.z],[282,src.y,src.z]]);r(281,src.y,src.z,'west');const drop=src.y-ph.lo,d=makeSignalDescent({drop}),T=p=>P(280-p.x,src.y+p.y,src.z+p.z);for(const v of d.blocks){const b=structuredClone(v.block);if(b.properties?.facing==='west')b.properties.facing='east';else if(b.properties?.facing==='east')b.properties.facing='west';put(T(v.position),b);}const e=T(d.path.at(-1)),raw=d.ports.output.bits[0].travel,dir=P(-raw.x,0,raw.z);r(e.x+dir.x,e.y,e.z+dir.z,dir.x>0?'east':dir.x<0?'west':dir.z>0?'south':'north');const begin=[[e.x+2*dir.x,e.y,e.z+2*dir.z],[e.x+3*dir.x,e.y,e.z+3*dir.z]];if(dir.x)begin.push([e.x+3*dir.x,e.y,e.z+4]);const last=begin.at(-1);route('master_'+name,[...begin,[270,e.y,last[2]],[270,e.y,280],[ph.x,e.y,280],[ph.x,e.y,ph.z+2]]);}
  r(ph.x,ph.lo,ph.z+1,'north');tower(ph.x,ph.z,ph.lo,ph.hi);
 }
 for(const [name,sx,sy,sz,dx,dz]of[['barrier',316,-15,350,250,420],['reset',336,-19,394,230,440]]){
  const ph=phaseSpines.find(v=>v.name===name);net=ph.net;r(sx,sy,sz+1,'south');route('master_'+name+'_departure',[[sx,sy,sz+2],[sx,sy,dz],[dx+2,sy,dz]]);r(dx+1,sy,dz,'west');const d=makeSignalDescent({drop:12}),T=p=>P(dx-p.x,sy+p.y,dz+p.z);for(const v of d.blocks){const b=structuredClone(v.block);if(b.properties?.facing==='west')b.properties.facing='east';else if(b.properties?.facing==='east')b.properties.facing='west';put(T(v.position),b);}const e=T(d.path.at(-1));r(e.x,e.y,e.z-1,'north');route('master_'+name,[[e.x,e.y,e.z-2],[ph.x,e.y,e.z-2],[ph.x,e.y,ph.z+2]]);r(ph.x,ph.lo,ph.z+1,'north');tower(ph.x,ph.z,ph.lo,ph.hi);
 }
 const phaseTap=(name,ch,x,z,y,viaX=x)=>{const ph=phaseSpines.find(v=>v.name===name);net=ph.net;const by=y; r(ph.x,by,ph.z-1,'north');route('phase_'+name+'_'+ch,[[ph.x,by,ph.z-2],[viaX,by,ph.z-2],[viaX,by,z]],{force:[K(P(viaX,by,z+2))],wireOnly:[K(P(viaX,by,z+4))]});if(viaX!==x)route('phase_'+name+'_terminal_'+ch,[[viaX,by,z],[x+Math.sign(viaX-x)*2,by,z]]);};
 // The eight common request stores use the same capture window as all four
 // busy snapshots. They close long before any owner latch is opened.
 net='admission/open_owner';r(-40,-11,213,'north');route('request_snapshot_open',[[-40,-11,212],[-8,-11,212],[-8,-11,-10]]);r(-8,-11,-11,'north');tower(-8,-12,-11,-3);r(-8,-3,-11,'south');
 const activeStates=[],busySnapshots=[],retire=[],commits=[];
 for(let ch=0;ch<4;ch++){
  const X=128*ch,Y=80*ch,y=Y+1,z=172;group='channel_active_state';
  // Cross-coupled NOR state, identical supported latch motif to the reset
  // component. SET follows complete payload closure; normal CLEAR is masked
  // by the global admission barrier. RESET independently forces CLEAR.
  net='active'+ch;solid(X+48,y,z);wall(X+49,y,z,'east');w(X+50,y,z);r(X+50,y,z-1,'north');route('active_feedback_'+ch,[[X+50,y,z-2],[X+50,y,z-4],[X+60,y,z-4]]);r(X+60,y,z-3,'south');w(X+60,y,z-2);r(X+60,y,z-1,'south');
  net='not_active'+ch;solid(X+60,y,z);wall(X+59,y,z,'west');w(X+58,y,z);r(X+58,y,z+1,'south');route('inactive_feedback_'+ch,[[X+58,y,z+2],[X+58,y,z+4],[X+48,y,z+4]]);r(X+48,y,z+3,'north');w(X+48,y,z+2);r(X+48,y,z+1,'north');
  r(X+58,y,z-1,'north');tower(X+58,z-2,y,281);r(X+59,281,z-2,'east');route('inactive_to_claim_mask_'+ch,[[X+60,281,z-2],[X+124,281,z-2],[X+124,281,134]]);r(X+125,281,134,'east');
  net='commit'+ch;w(X+64,y,z);r(X+63,y,z,'west');c(X+62,y,z,'west');r(X+61,y,z,'west');
  net='retire'+ch;w(X+44,y,z);r(X+45,y,z,'east');net='clear'+ch;c(X+46,y,z,'east');r(X+47,y,z,'east');retire.push(P(X+44,y,z));
  net='admission/active_flush';r(X+46,y,z-1,'south');tower(X+46,z-2,Y-15,y);activeStates.push({channel:ch,positive:P(X+50,y,z),negative:P(X+58,y,z),set:P(X+64,y,z),clear:P(X+44,y,z),clear_gate:P(X+46,y,z),barrier:P(X+46,y,z-1)});
  net='admission/reset_blocked';r(X+48,y,z-1,'south');r(X+48,y,z-2,'south');tower(X+48,z-3,Y-19,y);tower(X+64,z-2,Y-19,y);r(X+63,y,z-2,'west');w(X+62,y,z-2);r(X+62,y,z-1,'south');
  // Actual ACTIVE drives the channel's retained busy bit before the matrix.
  group='channel_busy_snapshot';net='active'+ch;r(X+51,Y,z,'east');solid(X+51,y,z);w(X+52,Y,z);w(X+53,Y-1,z);w(X+54,Y-2,z);w(X+55,Y-3,z);route('active_to_busy_'+ch,[[X+56,Y-3,z],[X+80,Y-3,z],[X+80,Y-3,16]]);r(X+79,Y-3,16,'west');tower(X+78,16,Y-3,y);r(X+77,y,16,'west');route('busy_driver_'+ch,[[X+76,y,16],[X+48,y,16]]);r(X+48,y,15,'north');r(X+48,y,14,'north');
  net='busy'+ch;r(X+48,y,13,'north');w(X+48,y,12);r(X+48,y,11,'north');w(X+48,y,10);r(X+48,y,9,'north');busySnapshots.push({channel:ch,driver:P(X+48,y,14),storage:P(X+48,y,13),lock:P(X+49,y,13),terminal:parent.ports.channel_busy.positions[ch]});
  net='busy_hold'+ch;r(X+49,y,13,'west');tower(X+50,13,Y-3,y);r(X+50,Y-3,14,'north');w(X+50,Y-3,15);r(X+51,Y-3,15,'west');w(X+52,Y-3,15);wall(X+53,Y-3,15,'west');net='admission/open_owner';solid(X+54,Y-3,15);r(X+55,Y-3,15,'west');tower(X+56,15,Y-11,Y-3);
  // Snapshot BUSY masks both owner/payload OPEN gates. Its own store stays
  // closed throughout those phases, so a mid-epoch release cannot erase data.
  net='busy'+ch;r(X+49,Y,10,'east');solid(X+49,y,10);w(X+50,Y,10);w(X+51,Y-1,10);w(X+52,Y-2,10);w(X+53,Y-3,10);route('busy_to_owner_mask_'+ch,[[X+54,Y-3,10],[X+60,Y-3,10],[X+60,Y-3,-16],[X+46,Y-3,-16]]);r(X+46,Y-3,-15,'south');w(X+46,Y-3,-14);r(X+46,Y-3,-13,'south');tower(X+46,-12,Y-3,y);r(X+46,y,-11,'south');
  route('busy_to_payload_mask_'+ch,[[X+60,Y-3,-16],[X+60,Y-3,-18],[X+99,Y-3,-18]],{wireOnly:[K(P(X+99,Y-3,-18))]});w(X+100,Y-4,-18);r(X+101,Y-4,-18,'east');tower(X+102,-18,Y-4,Y+32);r(X+103,Y+32,-18,'east');
  net='admission/open_address';tower(X+48,-10,Y-7,y);r(X+47,y,-10,'west');net='open_owner'+ch;c(X+46,y,-10,'west');r(X+45,y,-10,'west');
  net='admission/write_phase';tower(X+104,-22,Y+24,Y+32);r(X+104,Y+32,-21,'south');w(X+104,Y+32,-20);r(X+104,Y+32,-19,'south');net='open_payload'+ch;c(X+104,Y+32,-18,'south');r(X+104,Y+32,-17,'south');
  // Capture is committed only if a real retained owner bit is high. This
  // OR column counts its complete supports and per-row isolation diodes.
  group='commit_active';net='any_owner'+ch;tower(X+168,128,y,Y+29);
  for(let i=0;i<8;i++){const yy=y+4*i,xx=X+164-4*i;net='owner'+ch+'_'+i;r(xx+1,yy,128,'east');net='any_owner'+ch;route('owner_to_commit_'+ch+'_'+i,[[xx+2,yy,128],[X+166,yy,128]]);r(X+167,yy,128,'east');}
  net='any_owner'+ch;r(X+169,Y+29,128,'east');w(X+170,Y+29,128);r(X+171,Y+29,128,'east');net='commit'+ch;c(X+172,Y+29,128,'east');r(X+173,Y+29,128,'east');w(X+174,Y+29,128);r(X+175,Y+29,128,'east');route('commit_to_descent_'+ch,[[X+176,Y+29,128],[X+176,Y+29,180],[X+178,Y+29,180]]);r(X+179,Y+29,180,'east');
  const down=makeSignalDescent({drop:28}),DP=p=>P(p.x+X+180,p.y+Y+29,p.z+180);for(const v of down.blocks)put(DP(v.position),v.block);const end=DP(down.path.at(-1));assert.deepEqual(end,P(X+186,y,187));r(end.x,y,188,'south');route('commit_to_active_'+ch,[[end.x,y,189],[end.x,y,192],[X+66,y,192],[X+66,y,z]]);r(X+65,y,z,'west');commits.push({channel:ch,gate:P(X+172,Y+29,128),owner_collector:P(X+168,Y+29,128),descent_input:DP(down.path[0]),state_input:P(X+64,y,z)});
  net='admission/open_response';tower(X+172,124,Y+21,Y+29);net='not_commit_phase'+ch;wall(X+172,Y+29,125,'south');w(X+172,Y+29,126);r(X+172,Y+29,127,'south');
  group='admission_phase_routes';
  phaseTap('snapshot',ch,X+56,15,Y-11,X+58);r(X+57,Y-11,15,'west');
  phaseTap('owners',ch,X+48,-10,Y-7,X+54);r(X+49,Y-7,-10,'west');
  phaseTap('payload',ch,X+104,-22,Y+24,X+188);r(X+105,Y+24,-22,'west');
  phaseTap('commit',ch,X+172,124,Y+21,X+174);r(X+173,Y+21,124,'west');
  phaseTap('barrier',ch,X+46,z-2,Y-15,X+44);r(X+45,Y-15,z-2,'east');
  phaseTap('reset',ch,X+48,z-3,Y-19,X+50);r(X+49,Y-19,z-3,'west');route('reset_set_mask_'+ch,[[X+50,Y-19,z+1],[X+66,Y-19,z+1],[X+66,Y-19,z-2]]);r(X+65,Y-19,z-2,'west');
 }
 const port=(direction,positions)=>({direction,width:positions.length,positions,polarity:'active_high',order:'channel_major_consumer_or_field_minor'});const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const a of['x','y','z']){box.from[a]=blocks.reduce((v,b)=>Math.min(v,b.position[a]),Infinity);box.to[a]=blocks.reduce((v,b)=>Math.max(v,b.position[a]),-Infinity);}for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'offline_connected_original_channel_retention_claims_admission_candidate',blocks,nets,groups,routes,stores,snapshots,muxes,claimGates,claimDescents,claims,admission_nominal:master.nominal,masterPorts,phaseSpines,activeStates,busySnapshots,commits,fields,box,ports:{free_request:{...parent.ports.free_request,direction:'diagnostic'},channel_busy:{...parent.ports.channel_busy,direction:'diagnostic'},owner:port('diagnostic',owners),read_valid:port('input',rawRV),write_valid:port('input',rawWV),active:port('diagnostic',activeStates.map(v=>v.positive)),retire:port('unresolved_backend_input',retire),reset:port('input',[masterPorts.reset]),candidate_payload:port('input',candidate),payload:port('output',payload),open_owner:port('diagnostic',openOwner),open_payload:port('diagnostic',openPayload)},metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,owner_bits:32,retained_request_bits:68,full_address_bits:32,payload_select_comparators:544,free_request_snapshot_bits:8,busy_snapshot_bits:4,active_bits:4,admission_reset_bits:2,total_retained_control_payload_bits:118,legal_y_translation:[-64-box.from.y,319-box.to.y],dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),histogram},source_sha256:{'hardware/memory-layout-channel-allocator.mjs':hash},missing:['One physical raw8-LSU read-first address/type selector and all candidate payload fanout remain unrouted; current candidate_payload inputs are explicit independent terminals, not a fictitious shared net.','Retire inputs must come from actual owned backend response/acknowledgement/ready-low state, never host transitions; response storage and ready return are not present here.','Four-consumer bank frontends, full retained-address bank selection, payload routing and response/ready paths are the next connected dependency.','Settled ascending-channel allocation is preserved, but exact HDL release-within-loop timing and race/latency retiming have not been proved.','Native initialization, all long-route capture/closure margins, reset flushing, electrical review, whole-memory placement and complete matched cost comparison remain pending.'],complete_component_geometry:false,selected:false,native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeChannelRetention();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
