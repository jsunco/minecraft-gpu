// NEW group: actual free-request stores and raw-valid delivery before allocator0.
// Claims and capture OPEN are named pending physical inputs, not host eligibility.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K,V,F,searchPath,refreshIndices} from './allocation-route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const parent=read('joined-valid-local-design.json'),manifest=read('joined-valid-local-source-manifest.json'),retention=read('../channel-retention-v1/design.json'),ports=read('raw-local-ports.json').ports;
for(const[p,h]of Object.entries(manifest.source_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex'),h,p);
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater',T='minecraft:redstone_torch',A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),U=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n)),offset=P(0,-40,-20),translate=p=>A(p,offset);
const blocks=structuredClone(parent.blocks),map=new Map(blocks.map(v=>[K(v.position),v])),edges=[],connections=[],body=[],snapshotPorts={};let part='free_snapshot';
function put(p,block){assert(!map.has(K(p)),'Collision '+K(p)+' '+map.get(K(p))?.part+' / '+part);const row={position:p,block,part};map.set(K(p),row);blocks.push(row);return row;}
const dev=(p,id,properties)=>{put(U(p),{id:S});put(p,{id,...properties?{properties}:{}});},wire=p=>dev(p,W),rep=(p,dir)=>dev(p,R,{facing:F[dir],delay:'1'}),edge=(from,to)=>edges.push({from,to,route:part});
for(const v of retention.blocks)if(['free_request_snapshot','snapshot_hold'].includes(retention.groups[K(v.position)])){const row=put(translate(v.position),v.block);body.push({...row,original_position:v.position});}
assert.equal(body.length,642);
const direct=[];for(let i=0;i<8;i++){
 const source=translate(P(5*i,1,-8)),destination=ports['channel0.allocator.eligible'].positions[i];assert.deepEqual(destination,translate(P(5*i,1,-7)));edge(source,destination);direct.push({consumer:i,source,destination});
 // Real original subtract-side receiver, retained as an external claim boundary.
 const gate=translate(P(5*i,1,-16)),arrival=translate(P(5*i+1,1,-16)),input=translate(P(5*i+2,1,-16));rep(arrival,'west');wire(input);edge(input,arrival);edge(arrival,gate);snapshotPorts['claimed_'+i]=input;
 for(const kind of['read','write']){
  part=`free_snapshot_${kind}_${i}`;const col=parent.validColumns.find(v=>v.kind===kind&&v.consumer===i&&v.side===0);assert(col);
  const y=-39,dir=kind==='read'?'north':'south',source=P(col.base.x,y-1,col.base.z),tap=P(col.base.x,y,col.base.z+V[dir][1]),start=step(tap,dir);
  assert.equal(map.get(K(source))?.block.id,T);assert.equal((y-col.base.y)%4,0);
  const destination=translate(P(5*i,1,kind==='read'?-34:-30)),arrivalDirection=kind==='read'?'south':'west',arrival=step(destination,arrivalDirection,-1),end=step(destination,arrivalDirection,-2);
  for(const[p,d]of[[tap,dir],[start,null],[arrival,arrivalDirection],[end,null]]){if(d)rep(p,d);else wire(p);}
  edge(source,tap);edge(tap,start);edge(end,arrival);edge(arrival,destination);
  connections.push({name:part,kind,consumer:i,raw_source:ports['raw.'+kind+'_valid'].positions[i],source,tap,start,destination,arrival,end,source_direction:dir,arrival_direction:arrivalDirection});
 }
 part='free_snapshot';
}
snapshotPorts.open_snapshot=translate(P(-8,-3,-10));
const file=new URL('free-snapshot-paths.json',H),cache=existsSync(file)?JSON.parse(readFileSync(file)):{};
const reserve=r=>[...Array.from({length:4},(_,i)=>step(r.start,r.source_direction,i)),...Array.from({length:4},(_,i)=>step(r.end,r.arrival_direction,-i))],reserved=connections.flatMap(reserve);
for(const r of connections){part=r.name;let path=cache[r.name]?.path;if(path){assert.deepEqual(cache[r.name].source,r.start);assert.deepEqual(cache[r.name].destination,r.end);}else{const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(U),...reserve(r)],found=searchPath(map,r.start,r.end,{ignore,reserved,limit:900000});path=found.path;cache[r.name]={source:r.start,destination:r.end,path,expanded:found.expanded};writeFileSync(file,JSON.stringify(cache)+'\n');console.log(JSON.stringify({name:r.name,points:path.length,expanded:found.expanded}));}
 const indices=refreshIndices(path),set=new Set(indices);for(let i=1;i<path.length-1;i++){const p=path[i],n=path[i+1];if(set.has(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);r.path=path;r.refresh_indices=indices;
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const metrics={parent_cells:parent.blocks.length,cells:blocks.length,copied_snapshot_body_cells:body.length,added_cells:blocks.length-parent.blocks.length,new_side_locked_stores:8,actual_raw_valid_to_snapshot_routes:16,direct_snapshot_to_allocator:8,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y]};assert(metrics.legal_y_translation[0]<=metrics.legal_y_translation[1]);
writeFileSync(new URL('free-snapshot-body.json',H),JSON.stringify({blocks:body,offset,ports:snapshotPorts,stores:retention.snapshots.map(v=>({...v,driver:translate(v.driver),storage:translate(v.storage),lock:translate(v.lock),terminal:translate(v.terminal)})),source_sha256:{'../channel-retention-v1/design.json':hash('../channel-retention-v1/design.json')}})+'\n');
writeFileSync(new URL('free-snapshot-design.json',H),JSON.stringify({status:'free_snapshot_connected_requires_checks',blocks,edges,connections,direct,snapshotPorts,box,metrics,parent_sha256:hash('joined-valid-local-design.json'),source_sha256:{'joined-valid-local-source-manifest.json':hash('joined-valid-local-source-manifest.json'),'../channel-retention-v1/design.json':hash('../channel-retention-v1/design.json')},limits:['Eight real claim inputs and one snapshot OPEN source remain pending; this cannot admit allocation yet.','Raw upstream normalized drive and phase/hold timing remain unproved.'],selected:false,native_acceptance:false})+'\n');console.log(JSON.stringify(metrics));
