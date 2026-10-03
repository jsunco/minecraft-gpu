// Explicit delta: snapshot live bank eligibility before priority-owner capture.
// Reuses the frozen physical sequencer and its unused middle-row phase space.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeDataChannel} from './memory-layout-data-channel.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',F={east:'west',west:'east',north:'south',south:'north'};
export function makeSampledBank({bankIndex=0}={}){
 const parent=makeDataChannel({bankIndex}),m=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),nets={...parent.nets},added=[],removed=[],changed=[],routes=[],columns=[],bindings=[],snapshots=[];let net='';
 const put=(p,id,properties)=>{const block={id:id.startsWith('minecraft:')?id:'minecraft:'+id,...(properties?{properties}:{})},old=m.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p)+' '+nets[K(p)]+' / '+net);assert(block.id===S||nets[K(p)]===net,'net collision '+K(p));return;}const v={position:p,block};m.set(K(p),v);nets[K(p)]=net;added.push(v);};
 const solid=(x,y,z)=>put(P(x,y,z),S),dev=(x,y,z,id,props)=>{solid(x,y-1,z);put(P(x,y,z),id,props);},w=(x,y,z)=>dev(x,y,z,'redstone_wire'),r=(x,y,z,t,delay=1)=>dev(x,y,z,'repeater',{facing:F[t],delay:String(delay)}),c=(x,y,z,t)=>dev(x,y,z,'comparator',{facing:F[t],mode:'subtract'});
 function remove(p,id){const v=m.get(K(p));assert.equal(v?.block.id,'minecraft:'+id);removed.push(structuredClone(v));m.delete(K(p));delete nets[K(p)];}
 function replace(p,from,id,properties){const v=m.get(K(p));assert.equal(v?.block.id,'minecraft:'+from);const block={id:'minecraft:'+id,...(properties?{properties}:{})};changed.push({position:p,from:structuredClone(v.block),to:block});v.block=block;nets[K(p)]=net;}
 function tower(name,x,z,lo,hi,{extend=false}={}){assert.equal((hi-lo)%4,0);for(let y=lo+(extend?1:0);y<=hi;y++)put(P(x,y,z),(y-lo)%2?'redstone_torch':S);columns.push({name,net,x,z,lo,hi,extend});}
 function route(name,ws,{wireOnly=[],force=[]}={}){const path=[P(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.abs(dx)+Math.abs(dz);assert(len&&(!dx||!dz)&&(!dy||Math.abs(dy)===len),name);for(let j=1;j<=len;j++)path.push(P(a[0]+Math.sign(dx)*j,a[1]+Math.sign(dy)*j,a[2]+Math.sign(dz)*j));}
  const choices=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!m.has(K(p))&&!wireOnly.includes(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)choices.push(i);}choices.push(path.length);const cost=new Map([[-1,0]]),prev=new Map();for(const end of choices.slice(1))for(const start of choices){if(start>=end)break;if(!cost.has(start)||end-start>12)continue;const n=cost.get(start)+(end===path.length?0:1);if(n<(cost.get(end)??Infinity)){cost.set(end,n);prev.set(end,start);}}assert(prev.has(path.length),'unrefreshable '+name);const refresh=new Set();for(let i=prev.get(path.length);i!==-1;i=prev.get(i))refresh.add(i);for(const p of force){const i=path.findIndex(v=>K(v)===K(p));assert(choices.includes(i),'forced refresh '+name);refresh.add(i);}
  for(let i=0;i<path.length;i++){const p=path[i],b=path[i+1],old=m.get(K(p));if(old){assert.equal(old.block.id,'minecraft:redstone_wire',name+' occupied '+K(p));assert.equal(nets[K(p)],net,name+' net '+K(p));}else if(refresh.has(i))r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');else w(p.x,p.y,p.z);}routes.push({name,net,path,refresh_indices:[...refresh]});return path;
 }
 function stair(name,x,y,z,toY,dz){const points=[[x,y,z]];while(y!==toY){const n=Math.min(8,Math.abs(y-toY));y+=Math.sign(toY-y)*n;z+=n*dz;points.push([x,y,z]);if(y!==toY){z+=3*dz;points.push([x,y,z]);}}route(name,points);return P(x,y,z);}
 // Eight real eligible repeaters gain side locks. Raw eligibility is separately
 // tapped before these stores, so closed/unknown snapshots cannot deadlock ACTIVE.
 for(let i=0;i<8;i++){
  const x=5*i;net='sample_hold';r(x+1,-52,-246,'west');tower('hold_'+i,x+2,-246,-56,-52);r(x+2,-56,-247,'south');
  snapshots.push({slot:i,driver:P(x,-52,-248),input:P(x,-52,-247),storage:P(x,-52,-246),lock:P(x+1,-52,-246),held_column:P(x,-52,-245)});
  net='raw_eligible'+i;r(x-1,-52,-249,'west');w(x-2,-52,-249);r(x-2,-52,-250,'north');tower('raw_eligible_'+i,x-2,-251,-52,-44);r(x-2,-44,-252,'north');
  bindings.push({kind:'raw_eligibility_tap',source:P(x,-52,-249),driver:P(x-1,-52,-249),slot:i});
  // The old top OR must no longer be fed by the now-held priority columns.
  for(const z of[-246,-247]){remove(P(x,-24,z),'repeater');remove(P(x,-25,z),'light_gray_concrete');}
 }
 net='sample_hold';route('sample_hold',[[-4,-56,-248],[37,-56,-248]],{wireOnly:snapshots.map((_,i)=>K(P(5*i+2,-56,-248)))});
 // Source-low closes by a real inverter, not a placement-powered default.
 net='open_sample';w(-8,-56,-248);r(-7,-56,-248,'east');solid(-6,-56,-248);net='sample_hold';put(P(-5,-56,-248),'redstone_wall_torch',{facing:'east'});
 net='raw_any_eligible';route('raw_any_eligible',[[-2,-44,-253],[42,-44,-253]],{wireOnly:snapshots.map((_,i)=>K(P(5*i-2,-44,-253)))});r(43,-44,-253,'east');tower('raw_any_eligible',44,-253,-44,-24);r(43,-24,-253,'west');route('raw_any_to_old_request',[[42,-24,-253],[42,-24,-248]]);r(41,-24,-248,'west');bindings.push({kind:'raw_request_join',driver:P(41,-24,-248),destination:P(40,-24,-248)});
 // Detach only the early parts of three original phase output routes. Their
 // long distribution to actual owner/payload/RAM locks is reused below.
 for(const x of[31,63,111])for(const z of[-465,-466,-467]){remove(P(x,-37,z),'redstone_wire');remove(P(x,-38,z),'light_gray_concrete');}
 // Old first window -> eligibility sample. This closes before the former
 // payload window now captures owner, then the old write window captures payload.
 net='open_sample';r(30,-37,-464,'west');tower('sample_source',29,-464,-37,-17);r(28,-17,-464,'west');route('sample_high',[[27,-17,-464],[-20,-17,-464],[-20,-17,-340]],{force:[P(-20,-17,-341)]});const se=stair('sample_descent',-20,-17,-340,-56,1);route('sample_low',[[se.x,se.y,se.z],[-20,-56,-248],[-10,-56,-248]]);r(-9,-56,-248,'east');bindings.push({kind:'sample_source',source:P(31,-37,-464),driver:P(30,-37,-464),destination:P(-8,-56,-248)});
 net='retimed_owner';r(62,-37,-464,'west');tower('owner_source',61,-464,-37,-29);r(60,-29,-464,'west');route('owner_high',[[59,-29,-464],[57,-29,-464],[57,-29,-480],[20,-29,-480]],{force:[P(21,-29,-480)]});stair('owner_descent',20,-29,-480,-37,1);route('owner_low',[[20,-37,-472],[20,-37,-470],[29,-37,-470],[29,-37,-468]]);r(30,-37,-468,'east');bindings.push({kind:'owner_phase',source:P(63,-37,-464),driver:P(30,-37,-468),destination:P(31,-37,-468)});
 net='retimed_payload';r(110,-37,-464,'west');tower('payload_source',109,-464,-37,-25);r(108,-25,-464,'west');route('payload_high',[[107,-25,-464],[105,-25,-464],[105,-25,-484],[72,-25,-484]],{force:[P(73,-25,-484)]});stair('payload_descent',72,-25,-484,-37,1);const pe=routes.at(-1).path.at(-1);route('payload_low',[[pe.x,pe.y,pe.z],[72,-37,-468],[65,-37,-468]]);r(64,-37,-468,'west');bindings.push({kind:'payload_phase',source:P(111,-37,-464),driver:P(64,-37,-468),destination:P(63,-37,-468)});
 // A new write window is drawn from two unused taps on the existing second
 // slow row. Only these two slow cells become wires; their loss is counted.
 for(const x of[111,95]){net='sequence_active_delayed_flush';replace(P(x,-45,-446),'repeater','redstone_wire');r(x,-45,-447,'north');tower('new_write_tap_'+x,x,-448,-45,-25);}
 net='write_early';r(111,-25,-449,'north');route('write_early',[[111,-25,-450],[107,-25,-450],[107,-25,-442]]);r(107,-25,-441,'south');
 net='write_late';r(96,-25,-448,'east');route('write_late',[[97,-25,-448],[103,-25,-448],[103,-25,-440],[105,-25,-440]]);r(106,-25,-440,'east');
 net='sequence_reset_blocked';tower('write_reset_extension',113,-462,-37,-25,{extend:true});r(113,-25,-461,'south');route('write_reset',[[113,-25,-460],[113,-25,-440],[109,-25,-440]]);r(108,-25,-440,'west');
 net='retimed_write';c(107,-25,-440,'south');r(107,-25,-439,'south');w(107,-25,-438);r(107,-25,-437,'south');tower('write_output',107,-436,-25,-17);r(108,-17,-436,'east');route('write_high',[[109,-17,-436],[118,-17,-436]],{force:[P(117,-17,-436)]});const we=stair('write_descent',118,-17,-436,-37,-1);route('write_low',[[we.x,we.y,we.z],[118,-37,-466]]);r(118,-37,-467,'north');bindings.push({kind:'write_phase',source:P(107,-25,-438),driver:P(118,-37,-467),destination:P(118,-37,-468)});
 const blocks=[...m.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_sampled_bank_admission_repair_draft',bankIndex,blocks,nets,added_blocks:added,removed_blocks:removed,changes:changed,routes,columns,bindings,snapshots,ports:parent.ports,box,metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,added_blocks:added.length,removed_blocks:removed.length,changed_blocks:changed.length,snapshot_bits:8,extra_slow_repeaters:0,removed_slow_repeaters:2,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},phase_roles:{sample:'Original ACTIVE..T1 owner window',owner:'Original T2..T3 payload window',payload:'Original first-row95..111 write window',write:'New second-row111..95 window',response:'Original third-row63..79 response window, unchanged',ready:'Original final tail after all windows, unchanged'},limits:['Draft until support/contact/order checks pass.','Nominal windows and gaps are not measured propagation bounds.','Raw trigger remains live; held eligibility alone controls priority while owner capture is open.','Reset masks old sample/owner/payload outputs and the new write gate; old response/ready masks remain.','Requester valid/payload must remain stable until matching ready.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeSampledBank();writeFileSync(join(out,'bank.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
