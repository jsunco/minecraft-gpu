// Offline first connected group of the complete fabric refold. No runtime imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K,V,F,searchPath,refreshIndices} from '../../control-commit-v2/route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),pins={};
const read=p=>{const b=readFileSync(new URL(p,ROOT));pins[p]=createHash('sha256').update(b).digest('hex');return JSON.parse(b);};
const retention=read('artifacts/full-gpu-layout-v1/memory/channel-retention-v1/design.json');
const lookup=read('artifacts/full-gpu-layout-v1/memory/owner-valid-v1/design.json');
const backend=read('artifacts/full-gpu-layout-v1/memory/channel-colocation-v1/local-qualified.json');
read('artifacts/full-gpu-layout-v1/memory/channel-colocation-v1/source-manifest.json');
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater';
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),N=p=>P(-p.x,-p.y,-p.z),under=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n));
const chosen=new Set(['retained_owner','owner_hold','held_owner_mask','payload_mux','payload_collectors','payload_storage','payload_exports','payload_hold']);
const blocks=[],map=new Map(),modules=[],connections=[],edges=[],stores=[],ports={},channelOrigins=[P(0,0,0),P(480,0,0),P(0,176,0),P(480,176,0)];
function put(v){assert(!map.has(K(v.position)),'Collision '+v.part+' '+K(v.position));map.set(K(v.position),v);blocks.push(v);}
function append(name,rows,offset){const start=blocks.length;for(const v of rows)put({...v,position:A(v.position,offset),original_position:v.position,part:name});modules.push({name,offset,cells:blocks.length-start});}
function define(name,source,destination,sd,ad,channel,bit=null){connections.push({name,source,destination,source_direction:sd,arrival_direction:ad,channel,bit});}
for(let ch=0;ch<4;ch++){
 const o=channelOrigins[ch],original=P(128*ch,80*ch,0),ownerOffset=A(o,A(P(0,-40,-20),N(original))),lookupOffset=A(o,P(20,-40,-26));
 const rows=retention.blocks.filter(v=>chosen.has(retention.groups[K(v.position)])&&v.position.x>=128*ch&&v.position.x<128*(ch+1));
 assert.equal(rows.length,7503);append('owner_payload_'+ch,rows,ownerOffset);append('owner_valid_'+ch,lookup.blocks,lookupOffset);append('backend_'+ch,backend.blocks,o);
 const ss=retention.stores.filter(v=>v.channel===ch);assert.equal(ss.length,25);
 for(const s of ss)stores.push({...s,original_storage:s.storage,driver:A(s.driver,ownerOffset),storage:A(s.storage,ownerOffset),lock:A(s.lock,ownerOffset),terminal:A(s.terminal,ownerOffset)});
 for(const [name,p]of Object.entries(backend.ports))ports['channel'+ch+'.backend.'+name]={...p,positions:p.positions.map(v=>A(v,o))};
 for(const [name,p]of Object.entries(lookup.ports))ports['channel'+ch+'.lookup.'+name]={...p,positions:p.positions.map(v=>A(v,lookupOffset))};
 for(let bit=0;bit<8;bit++){
  const s=A(retention.ports.owner.positions[ch*8+bit],ownerOffset),d=A(lookup.ports.owner.positions[bit],lookupOffset);
  define('owner_'+ch+'_'+bit,s,d,'north','west',ch,bit);
 }
 // Real retained payload bit14, after its existing normalization diode.
 const type=A(P(105+128*ch,35+80*ch,118),ownerOffset);
 define('held_type_'+ch,type,A(lookup.ports.is_write.positions[0],lookupOffset),'west','east',ch);
 define('owner_valid_'+ch,A(lookup.ports.owner_valid.positions[0],lookupOffset),A(backend.ports.owner_valid.positions[0],o),'south','south',ch);
}
assert.equal(blocks.length,142464);assert.equal(connections.length,40);
// Record the exact isolated body image before any cable or input pad is added.
writeFileSync(new URL('local-bodies.json',H),JSON.stringify({status:'provisional_complete_bodies_unjoined',blocks,modules,stores,ports,source_sha256:pins})+'\n');
for(const r of connections){
 r.tap=step(r.source,r.source_direction);r.start=step(r.source,r.source_direction,2);r.arrival=step(r.destination,r.arrival_direction,-1);r.end=step(r.destination,r.arrival_direction,-2);
 for(const p of[r.source,r.destination])assert.equal(map.get(K(p))?.block.id,W,'Actual boundary '+r.name+' '+K(p));
 for(const[p,d]of[[r.tap,r.source_direction],[r.start,null],[r.arrival,r.arrival_direction],[r.end,null]]){
  put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:d?R:W,...d?{properties:{facing:F[d],delay:'1'}}:{}},part:r.name});
 }
 for(const[from,to]of[[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from,to,route:r.name});
}
const cacheFile=new URL('local-paths.json',H),cache=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile)):{};
const reserve=r=>[...Array.from({length:5},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:5},(_,i)=>step(r.destination,r.arrival_direction,-i-2))];
const reserved=connections.flatMap(reserve);
for(const r of [...connections].sort((a,b)=>a.channel-b.channel||Number(b.name.startsWith('held_type'))-Number(a.name.startsWith('held_type')))){
 let path=cache[r.name]?.path;
 if(path){assert.deepEqual(cache[r.name].source,r.source);assert.deepEqual(cache[r.name].destination,r.destination);}
 else{
  const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...reserve(r)];
  const found=searchPath(map,r.start,r.end,{ignore,reserved,limit:1000000});path=found.path;
  cache[r.name]={source:r.source,destination:r.destination,path,expanded:found.expanded};writeFileSync(cacheFile,JSON.stringify(cache)+'\n');
  console.log(JSON.stringify({route:r.name,points:path.length,expanded:found.expanded}));
 }
 assert.deepEqual(path[0],r.start);assert.deepEqual(path.at(-1),r.end);
 const refresh=refreshIndices(path),rs=new Set(refresh);
 for(let i=1;i<path.length-1;i++){
  const p=path[i],n=path[i+1],dir=Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z);
  put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:rs.has(i)?R:W,...rs.has(i)?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});
 }
 r.path=path;r.refresh_indices=refresh;
 for(let i=1;i<path.length;i++)edges.push({from:path[i-1],to:path[i],route:r.name});
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const out={status:'provisional_local_fabric_group_routed_requires_checks',blocks,modules,connections,edges,stores,ports,box,source_sha256:pins,metrics:{cells:blocks.length,body_cells:142464,new_cable_cells:blocks.length-142464,actual_connections:40,owner_payload_side_locks:100,backend_response_side_locks:32,backend_protocol_sr_bits:8},limits:['Complete four-channel fabric is not yet connected.','Allocator/open/commit, raw candidate and valid distribution, bank fanout, bank tail and response collectors, consumers, loader/admission/reset/witness remain explicit unfinished routes.','This map is not a replacement or selected master geometry.','No density saving is claimed until every incident route is counted.'],native_acceptance:false,selected:false};
writeFileSync(new URL('local-design.json',H),JSON.stringify(out)+'\n');console.log(JSON.stringify(out.metrics));
