// Bounded local receiving routes over the frozen lane. Offline design aid only.
import assert from'node:assert/strict';
import{makeFullLaneAluStatusV5}from'./full-lane-alu-status-v5.mjs';
import{COMMANDS}from'../artifacts/full-gpu-layout-v1/alu-control/microprogram.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,D={east:P(1,0,0),west:P(-1,0,0),south:P(0,0,1),north:P(0,0,-1)},F={east:'west',west:'east',north:'south',south:'north'},add=(p,q)=>P(p.x+q.x,p.y+q.y,p.z+q.z),neg=p=>P(-p.x,-p.y,-p.z),E=(p,q)=>K(p)+'>'+K(q),V=Object.values(D);
export function makeAluLaneConnectors(){
 const parent=makeFullLaneAluStatusV5(),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'lane_parent'}])),old=new Set(map.keys()),routes=[],edges=[],ports=[],diagnostics=[];
 const b=p=>map.get(K(p))?.block??{},wire=p=>b(p).id==='minecraft:redstone_wire',solid=p=>b(p).id?.endsWith('_concrete'),diode=p=>['minecraft:repeater','minecraft:comparator'].includes(b(p).id),oldPair=(p,q)=>old.has(K(p))&&old.has(K(q));
 function check(added,es){
  const allowed=new Set([...edges,...es].flatMap(e=>[E(e.from,e.to),E(e.to,e.from)])),nodes=new Map();for(const v of added)for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++){const q=add(v.position,P(x,y,z));if(map.has(K(q)))nodes.set(K(q),q);}
  for(const p of nodes.values()){
   const a=b(p),id=a.id;if(wire(p))for(const dv of V){const q=add(p,dv),qs=[q];if(solid(q)&&!solid(add(p,P(0,1,0))))qs.push(add(q,P(0,1,0)));if(!solid(q))qs.push(add(q,P(0,-1,0)));for(const r of qs)if(wire(r)&&!oldPair(p,r)&&!allowed.has(E(p,r)))throw Error('wire '+E(p,r));if(diode(q)&&E(add(q,D[b(q).properties.facing]),q)===E(p,q)&&!oldPair(p,q)&&!allowed.has(E(p,q)))throw Error('wire rear '+E(p,q));}
   if(diode(p)){
    const face=D[a.properties.facing];for(const dv of(face.x?[D.north,D.south]:[D.east,D.west])){const q=add(p,dv);if(diode(q)&&K(add(q,neg(D[b(q).properties.facing])))===K(p)&&!oldPair(p,q))throw Error('side lock '+E(q,p));}
   }
   let targets=[];if(wire(p))targets=[add(p,P(0,-1,0))];else if(diode(p))targets=[add(p,neg(D[a.properties.facing]))];else if(id==='minecraft:redstone_torch'||id==='minecraft:redstone_wall_torch'){targets=[add(p,P(0,1,0))];for(const dv of V){const q=add(p,dv);if(wire(q)&&!oldPair(p,q)&&!allowed.has(E(p,q)))throw Error('torch wire '+E(p,q));}}
   for(const q of targets){if(!solid(q))continue;for(const dv of [...V,P(0,1,0),P(0,-1,0)]){const r=add(q,dv);if(K(r)===K(p)||!map.has(K(r))||(oldPair(p,q)&&oldPair(q,r)))continue;if(wire(r)&&!wire(p)&&!allowed.has(E(q,r))&&!allowed.has(E(p,r)))throw Error('solid wire '+E(p,r));if(diode(r)&&K(add(r,D[b(r).properties.facing]))===K(q)&&!allowed.has(E(q,r)))throw Error('solid rear '+E(p,r));if(b(r).id==='minecraft:redstone_wall_torch'&&K(add(r,neg(D[b(r).properties.facing])))===K(q)&&!allowed.has(E(q,r)))throw Error('solid torch '+E(p,r));}}
  }
 }
 function candidate(name,ws,pad,rr,travel,outgoing=false){
  const ps=[ws[0]];for(let i=1;i<ws.length;i++){const a=ws[i-1],c=ws[i],dx=c.x-a.x,dy=c.y-a.y,dz=c.z-a.z,n=Math.abs(dx)+Math.abs(dz);if(!n)continue;assert((!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let j=1;j<=n;j++)ps.push(P(a.x+Math.sign(dx)*j,a.y+Math.sign(dy)*j,a.z+Math.sign(dz)*j));}
  if(!outgoing)ps.reverse();assert.equal(new Set(ps.map(K)).size,ps.length);const candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],p=ps[i],q=ps[i+1];if(a.y===p.y&&p.y===q.y&&p.x-a.x===q.x-p.x&&p.z-a.z===q.z-p.z)candidates.push(i);}candidates.push(ps.length);const costs=new Map([[-1,0]]),prev=new Map();for(const to of candidates.slice(1))for(const from of candidates){if(from>=to)break;if(!costs.has(from)||to-from>12)continue;const cost=costs.get(from)+(to===ps.length?0:1);if(cost<(costs.get(to)??Infinity)){costs.set(to,cost);prev.set(to,from);}}if(!prev.has(ps.length))throw Error('refresh');const refresh=[];for(let i=prev.get(ps.length);i!==-1;i=prev.get(i))refresh.push(i);
  const added=[],es=[];function put(p,id,props){if(map.has(K(p)))throw Error('collision '+K(p));const v={position:p,block:{id:'minecraft:'+id,...(props?{properties:props}:{})},part:name};map.set(K(p),v);added.push(v);}function dev(p,id,props){put(add(p,P(0,-1,0)),'light_gray_concrete');put(p,id,props);}
  try{
   for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[i+1];if(refresh.includes(i)){const dir=q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north';dev(p,'repeater',{facing:F[dir],delay:'1'});}else dev(p,'redstone_wire');if(i)es.push({from:ps[i-1],to:p});}
   dev(rr,'repeater',{facing:F[travel],delay:'1'});if(outgoing)es.push({from:pad,to:rr},{from:rr,to:ps[0]});else es.push({from:ps.at(-1),to:rr},{from:rr,to:pad});check(added,es);
   // Full wire stair connectivity, including newly introduced support/headroom.
   for(let i=1;i<ps.length;i++){const a=ps[i-1],p=ps[i];if(wire(a)&&wire(p)&&a.y!==p.y){const lo=a.y<p.y?a:p,hi=a.y>p.y?a:p;if(solid(add(lo,P(0,1,0))))throw Error('headroom '+K(lo));if(!solid(P(hi.x,lo.y,hi.z)))throw Error('stairs '+K(hi));}}
   return{added,edges:es,path:ps,refresh_indices:refresh.sort((a,b)=>a-b),source:ps[0],receiver:rr,pad};
  }catch(e){for(const v of added)map.delete(K(v.position));throw e;}
 }
 for(const name of COMMANDS){
  const target=parent.ports.find(v=>v.name===name);assert(target,name);const p=target.position,rx=Math.sign(target.receiver.x-p.x),rz=Math.sign(target.receiver.z-p.z),direct=rx===1?'east':rx===-1?'west':rz===1?'south':'north',errors=new Map();let found,chosen;
  for(const travel of [direct,...Object.keys(D).filter(n=>n!==direct&&n!==F[direct])]){
   const dv=D[travel],rr=add(p,neg(dv)),s=add(rr,neg(dv)),g=P(s.x,s.y,-84),options=[];
   options.push([s,g]);for(const first of[0,3,6])for(const dx of[-4,4,-8,8,-12,12,-16,16])options.push([s,...(first?[P(s.x,s.y,s.z-first)]:[]),P(s.x+dx,s.y,s.z-first),P(s.x+dx,s.y,-78),P(g.x,g.y,-78),g]);
   for(const h of[4,-4,8,-8])for(const sign of[-1,1])for(const first of[0,3,6]){const x=s.x+sign*Math.abs(h),z=s.z-first;options.push([s,...(first?[P(s.x,s.y,z)]:[]),P(x,s.y+h,z),P(x,s.y+h,-76),P(s.x,s.y,-76),g]);}
   for(const h of[4,-4,8,-8,12,-12])for(const sign of[-1,1])for(const first of[0,3,6]){const x=s.x+sign*Math.abs(h),z=s.z-first;options.push([s,...(first?[P(s.x,s.y,z)]:[]),P(x,s.y+h,z),P(x,s.y+h,-84)]);}
   for(const ws of options){try{found=candidate(name,ws,p,rr,travel);chosen={rr,travel};break;}catch(e){errors.set(e.message,(errors.get(e.message)??0)+1);}}if(found)break;
  }
  if(!found)throw Error('No escape '+name+' '+JSON.stringify([...errors].slice(0,30)));edges.push(...found.edges);routes.push({name,path:found.path,refresh_indices:found.refresh_indices,receiver:chosen.rr,destination:p});ports.push({name,direction:'input',width:1,position:found.source,destination:p,final_receiver:chosen.rr,travel:P(0,0,1)});diagnostics.push({name,candidates_rejected:[...errors.values()].reduce((a,b)=>a+b,0),route_blocks:found.added.length});
 }
 const status_ports=[];
 for(const name of ['busy','ready','fault_div_zero']){
  const source=parent.front.local_source_outputs[name],errors=new Map();let found,chosen;
  for(const travel of ['south','east','west','north']){
   const dv=D[travel],rr=add(source,dv),s=add(rr,dv),options=[];
   options.push([s,P(s.x,s.y,124)]);
   for(const first of [0,3,6])for(const dx of [-4,4,-8,8,-12,12,-16,16])options.push([s,...(first?[P(s.x,s.y,s.z+first)]:[]),P(s.x+dx,s.y,s.z+first),P(s.x+dx,s.y,124)]);
   for(const h of[4,-4,8,-8,12,-12])for(const sign of[-1,1])for(const first of[0,3,6]){const x=s.x+sign*Math.abs(h),z=s.z+first;options.push([s,...(first?[P(s.x,s.y,z)]:[]),P(x,s.y+h,z),P(x,s.y+h,124)]);}
   for(const ws of options){try{found=candidate('status_return_'+name,ws,source,rr,travel,true);chosen={rr,travel};break;}catch(e){errors.set(e.message,(errors.get(e.message)??0)+1);}}if(found)break;
  }
  if(!found)throw Error('No status escape '+name+' '+JSON.stringify([...errors].slice(0,25)));
  edges.push(...found.edges);routes.push({name:'status_return_'+name,path:found.path,refresh_indices:found.refresh_indices,receiver:chosen.rr,source});status_ports.push({name,direction:'output',width:1,position:found.path.at(-1),source:parent.ports.find(p=>p.name===name).position,actual_tapped_source:source,travel:P(0,0,1)});diagnostics.push({name:'status_return_'+name,candidates_rejected:[...errors.values()].reduce((a,b)=>a+b,0),route_blocks:found.added.length});
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 return{status:'offline_lane_command_receiving_routes',blocks,ports,status_ports,routes,edges,diagnostics,box,parent_blocks:parent.blocks.length,metrics:{blocks:blocks.length,added_blocks:blocks.length-parent.blocks.length,receiving_commands:ports.length,status_returns:status_ports.length},native_calls:0,missing:['Actual shared command-source fanout and lane OPEN enable/fault/reset masks.','All remaining core/register/status interconnect and native propagation checks.']};
}
