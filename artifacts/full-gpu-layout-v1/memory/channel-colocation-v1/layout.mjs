import assert from 'node:assert/strict';
import {P,K,V,F} from '../../control-commit-v2/route.mjs';export{P,K,V,F};
export const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>P(p.x,p.y-1,p.z),step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
export function makePatch(e,base,local,origin){
 const parent=new Map(base.blocks.map(v=>[K(v.position),v])),map=new Map(),blocks=[],edges=[],oldToNew=new Map();
 for(const[name,p]of Object.entries(e.backend_ports))for(let bit=0;bit<p.positions.length;bit++)oldToNew.set(K(p.positions[bit]),add(local.ports[name].positions[bit],origin));
 function put(v){const k=K(v.position);assert(!parent.has(k)&&!map.has(k),'Patch collision '+k);map.set(k,v);blocks.push(v);}
 for(const v of local.blocks)put({...v,position:add(v.position,origin),part:'relocated_complete_backend'});
 const connections=[];
 for(const l of e.incident_interfaces){const kind=l.name??l.kind;if(['retire_mask','busy_or'].includes(kind))continue;const name=kind+(l.bit!==undefined?'_'+l.bit:'');
  let source=oldToNew.get(K(l.source))??l.source,destination=oldToNew.get(K(l.destination))??l.destination,sd,ad;
  if(kind==='active'){source=P(50,5,176);sd='south';ad='south';}
  else if(kind==='backend_busy'){destination=P(48,5,22);sd='south';ad='north';}
  else if(kind==='reset_blocked'){source=P(740,-31,504);sd='east';ad='south';}
  else if(['retire','owner_valid','request','actual_backend_ready','backend_ready'].includes(kind)){sd='south';ad=kind==='retire'?'north':'south';}
  else if(kind==='retained_response'){sd='east';ad=l.bit===7?'south':'west';}
  else if(kind==='qualified_backend_d'){sd='east';ad='east';}
  else throw Error('Unclassified interface '+kind);
  connections.push({name,kind,bit:l.bit??null,source,destination,source_direction:sd,arrival_direction:ad,original:l,upstream_source:l.source,original_final_destination:l.destination});
 }
 const tail=e.incident_interfaces.filter(v=>v.kind==='retire_mask'||v.kind==='busy_or');assert.equal(tail.length,2);assert.deepEqual(tail[0].source,tail[1].source);
 connections.push({name:'downstream_bank_busy',kind:'actual_matching_bank_tail',source:tail[0].source,destination:add(local.ports.downstream_bank_busy.positions[0],origin),source_direction:'south',arrival_direction:'north',original:tail});
 assert.equal(connections.length,25);assert.equal(new Set(connections.map(v=>v.name)).size,25);
 for(const r of connections){r.tap=step(r.source,r.source_direction);r.start=step(r.source,r.source_direction,2);r.arrival=step(r.destination,r.arrival_direction,-1);r.end=step(r.destination,r.arrival_direction,-2);
  for(const[p,d,id]of[[r.tap,r.source_direction,'minecraft:repeater'],[r.start,null,W],[r.arrival,r.arrival_direction,'minecraft:repeater'],[r.end,null,W]]){put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id,...d?{properties:{facing:F[d],delay:'1'}}:{}},part:r.name});}
  for(const p of[r.source,r.destination])assert.equal((map.get(K(p))??parent.get(K(p)))?.block.id,W,'Missing physical boundary '+r.name+' '+K(p));
  for(const[from,to]of[[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from,to,route:r.name});
 }
 return {blocks,map,connections,edges};
}
