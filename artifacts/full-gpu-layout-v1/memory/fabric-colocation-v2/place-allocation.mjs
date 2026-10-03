// Add all four physical allocation matrices and their serial availability chain.
// This remains a partial fabric, not a master replacement.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K,V,F,searchPath,refreshIndices} from './allocation-route.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),read=n=>JSON.parse(readFileSync(new URL(n,H)));
const d=read('local-design.json'),base=read('local-bodies.json');
const file='artifacts/full-gpu-layout-v1/memory/channel-allocator-v1/design.json',raw=readFileSync(new URL(file,ROOT)),old=JSON.parse(raw),pins={...d.source_sha256,[file]:createHash('sha256').update(raw).digest('hex')};
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n));
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater',origins=[P(0,0,0),P(480,0,0),P(0,176,0),P(480,176,0)];
const blocks=[...d.blocks],bodyBlocks=[...base.blocks],map=new Map(blocks.map(v=>[K(v.position),v])),modules=[...d.modules],ports={...d.ports},connections=[...d.connections],edges=[...d.edges];
function put(v){assert(!map.has(K(v.position)),'Collision '+v.part+' '+K(v.position));map.set(K(v.position),v);blocks.push(v);}
const removed=new Set(),chain=[];
for(const r of old.routes.filter(v=>v.name.startsWith('remaining_to_next_'))){
 const[,, ,ch,i]=r.name.split('_'); // Parse explicitly below to avoid name ambiguity.
 const m=/^remaining_to_next_(\d)_(\d)$/.exec(r.name);assert(m);const channel=Number(m[1]),bit=Number(m[2]);
 for(const p of r.path.slice(1))for(const q of[p,under(p)])removed.add(K(q));
 const link=old.links.find(v=>v.channel===channel&&v.consumer===bit);assert(link);
 for(const p of[link.driver,under(link.driver)])removed.add(K(p));
 chain.push({channel,bit,source:r.path[0],destination:link.next_input});
}
assert.equal(chain.length,24);
const matrixOffsets=origins.map((o,ch)=>A(o,P(-128*ch,-40-80*ch,-180)));
for(let ch=0;ch<4;ch++){
 const rows=old.blocks.filter(v=>{if(removed.has(K(v.position)))return false;const n=old.nets[K(v.position)];return n.startsWith('c'+ch+'/')||n==='busy'+ch||n.startsWith('grant'+ch+'_')||n.startsWith('remaining'+ch+'_');});
 const offset=matrixOffsets[ch],part='allocator_'+ch;
 for(const v of rows){const row={...v,position:A(v.position,offset),original_position:v.position,part};put(row);bodyBlocks.push(row);}
 modules.push({name:part,offset,cells:rows.length});
 for(let bit=0;bit<8;bit++){
  const source=A(old.ports.grant.positions[ch*8+bit],offset),destination=A(origins[ch],P(46,-39+4*bit,-20));
  // Restore the old real grant/owner-driver boundary wire after moving the
  // owner bank. It is a receiving terminal, not a test source or new store.
  const part='owner_grant_pad_'+ch+'_'+bit;
  put({position:under(destination),block:{id:S},part});put({position:destination,block:{id:W},part});
  const driver=A(destination,P(0,0,-1));assert.equal(map.get(K(driver))?.block.id,R);
  edges.push({from:destination,to:driver,route:'grant_'+ch+'_'+bit});
  connections.push({name:'grant_'+ch+'_'+bit,source,destination,source_direction:'north',arrival_direction:'west',channel:ch,bit});
 }
 ports['channel'+ch+'.allocator.busy']={direction:'input',positions:[A(old.ports.channel_busy.positions[ch],offset)],width:1};
 ports['channel'+ch+'.allocator.eligible']={direction:ch?'internal_serial_availability':'input',positions:Array.from({length:8},(_,i)=>A(P(128*ch+5*i,80*ch+1,-7),offset)),width:8};
}
for(const c of chain)connections.push({name:'remaining_'+c.channel+'_'+c.bit,source:A(c.source,matrixOffsets[c.channel]),destination:A(c.destination,matrixOffsets[c.channel+1]),source_direction:'north',arrival_direction:'south',channel:c.channel,bit:c.bit});
const added=connections.slice(d.connections.length);assert.equal(added.length,56);
for(const r of added){
 r.tap=step(r.source,r.source_direction);r.start=step(r.source,r.source_direction,2);r.arrival=step(r.destination,r.arrival_direction,-1);r.end=step(r.destination,r.arrival_direction,-2);
 for(const p of[r.source,r.destination])assert.equal(map.get(K(p))?.block.id,W,'Actual boundary '+r.name+' '+K(p));
 for(const[p,dir]of[[r.tap,r.source_direction],[r.start,null],[r.arrival,r.arrival_direction],[r.end,null]]){put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:dir?R:W,...dir?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 for(const[from,to]of[[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from,to,route:r.name});
}
const cacheFile=new URL('allocation-paths.json',H),cache=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile)):{};
const reserve=r=>[...Array.from({length:5},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:5},(_,i)=>step(r.destination,r.arrival_direction,-i-2))];
const reserved=added.flatMap(reserve);
for(const r of [...added].sort((a,b)=>a.channel-b.channel||a.bit-b.bit||a.name.localeCompare(b.name))){
 let path=cache[r.name]?.path;
 if(path){assert.deepEqual(cache[r.name].source,r.source);assert.deepEqual(cache[r.name].destination,r.destination);}
 else{const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...reserve(r)],opts={ignore,reserved,limit:1200000,layer:undefined};let found;if(r.name.startsWith('grant_')){const waypoint=A(origins[r.channel],P(132,r.source.y-origins[r.channel].y,110)),a=searchPath(map,r.start,waypoint,opts),secondMap=new Map(map);for(const p of a.path.slice(0,-1)){secondMap.set(K(p),{position:p,block:{id:W}});secondMap.set(K(under(p)),{position:under(p),block:{id:S}});}const b=searchPath(secondMap,waypoint,r.end,opts);found={path:[...a.path,...b.path.slice(1)],expanded:a.expanded+b.expanded};}else found=searchPath(map,r.start,r.end,opts);path=found.path;cache[r.name]={source:r.source,destination:r.destination,path,expanded:found.expanded};writeFileSync(cacheFile,JSON.stringify(cache)+'\n');console.log(JSON.stringify({route:r.name,points:path.length,expanded:found.expanded}));}
 assert.deepEqual(path[0],r.start);assert.deepEqual(path.at(-1),r.end);const indices=refreshIndices(path),rs=new Set(indices);
 for(let i=1;i<path.length-1;i++){const p=path[i],n=path[i+1],dir=Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z);put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:rs.has(i)?R:W,...rs.has(i)?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 r.path=path;r.refresh_indices=indices;for(let i=1;i<path.length;i++)edges.push({from:path[i-1],to:path[i],route:r.name});
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const metrics={...d.metrics,cells:blocks.length,body_cells:bodyBlocks.length,new_cable_cells:blocks.length-bodyBlocks.length,actual_connections:connections.length,allocator_matrix_cells:bodyBlocks.length-base.blocks.length};
writeFileSync(new URL('allocation-bodies.json',H),JSON.stringify({...base,blocks:bodyBlocks,modules,ports,source_sha256:pins})+'\n');
writeFileSync(new URL('allocation-design.json',H),JSON.stringify({...d,status:'provisional_local_allocation_group_routed_requires_checks',blocks,modules,ports,connections,edges,box,metrics,source_sha256:pins,limits:['The four actual grant matrices now feed the 32 owner stores and form the complete 24-wire ascending-channel availability chain.','Snapshot and busy/commit/claim admission, candidate/valid distribution, bank-facing and consumer return routes remain incomplete.','No replacement, full-fabric density saving or native timing claim.']})+'\n');console.log(JSON.stringify(metrics));
