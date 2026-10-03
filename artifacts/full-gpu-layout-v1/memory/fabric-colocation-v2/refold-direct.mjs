// Complete matched local scope, refolded so grant→owner is again direct.
// Preserves the frozen40-join and96-join comparisons; no whole-memory edit.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';
import{P,K,V,F,searchPath,refreshIndices}from'./allocation-route.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),old=read('allocation-design.json'),body=read('allocation-bodies.json');
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n));
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater';
const delta=part=>part.startsWith('owner_valid_')?P(112,0,0):part.startsWith('backend_')||part.startsWith('allocator_')?P(0,0,160):P(0,0,0);
const before=new Map(body.blocks.map(v=>[K(v.position),v])),blocks=[],map=new Map(),edges=[];
function put(v){assert(!map.has(K(v.position)),'Collision '+v.part+' '+K(v.position));map.set(K(v.position),v);blocks.push(v);}
for(const v of body.blocks)put({...v,position:A(v.position,delta(v.part))});
const modules=body.modules.map(m=>({...m,offset:A(m.offset,delta(m.name))}));
const transform=p=>{const v=before.get(K(p));assert(v,'Not an inherited physical endpoint '+K(p));return A(p,delta(v.part));};
const ports=Object.fromEntries(Object.entries(body.ports).map(([n,p])=>[n,{...p,positions:p.positions.map(transform)}]));
const direct=[];for(const s of body.stores.filter(v=>v.name==='owner')){
 const destination=s.driver,source=A(destination,P(0,0,1));assert.equal(map.get(K(source))?.block.id,W);assert.equal(map.get(K(destination))?.block.id,R);
 direct.push({name:'direct_grant_'+s.channel+'_'+s.bit,channel:s.channel,bit:s.bit,source,destination});edges.push({from:source,to:destination,route:direct.at(-1).name});
}assert.equal(direct.length,32);
const connections=old.connections.filter(r=>!r.name.startsWith('grant_')).map(r=>({name:r.name,source:transform(r.source),destination:transform(r.destination),source_direction:r.source_direction,arrival_direction:r.arrival_direction,channel:r.channel,bit:r.bit}));assert.equal(connections.length,64);
writeFileSync(new URL('direct-bodies.json',H),JSON.stringify({...body,blocks:[...blocks],modules,ports})+'\n');
for(const r of connections){
 r.tap=step(r.source,r.source_direction);r.start=step(r.source,r.source_direction,2);r.arrival=step(r.destination,r.arrival_direction,-1);r.end=step(r.destination,r.arrival_direction,-2);
 for(const p of[r.source,r.destination])assert.equal(map.get(K(p))?.block.id,W);
 for(const[p,dir]of[[r.tap,r.source_direction],[r.start,null],[r.arrival,r.arrival_direction],[r.end,null]]){put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:dir?R:W,...dir?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 for(const[from,to]of[[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from,to,route:r.name});
}
const cacheFile=new URL('direct-paths.json',H),cache=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile)):{};
const reserve=r=>[...Array.from({length:5},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:5},(_,i)=>step(r.destination,r.arrival_direction,-i-2))];
const reserved=connections.flatMap(reserve);
for(const r of [...connections].sort((a,b)=>a.channel-b.channel||Number(b.name.startsWith('held_type'))-Number(a.name.startsWith('held_type')))){
 let path=cache[r.name]?.path;if(path){assert.deepEqual(cache[r.name].source,r.source);assert.deepEqual(cache[r.name].destination,r.destination);}
 else{const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...reserve(r)],found=searchPath(map,r.start,r.end,{ignore,reserved,limit:1200000});path=found.path;cache[r.name]={source:r.source,destination:r.destination,path,expanded:found.expanded};writeFileSync(cacheFile,JSON.stringify(cache)+'\n');console.log(JSON.stringify({route:r.name,points:path.length,expanded:found.expanded}));}
 const indices=refreshIndices(path),rs=new Set(indices);for(let i=1;i<path.length-1;i++){const p=path[i],n=path[i+1],dir=Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z);put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:rs.has(i)?R:W,...rs.has(i)?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 r.path=path;r.refresh_indices=indices;for(let i=1;i<path.length;i++)edges.push({from:path[i-1],to:path[i],route:r.name});
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const metrics={...old.metrics,cells:blocks.length,body_cells:body.blocks.length,new_cable_cells:blocks.length-body.blocks.length,actual_connections:96,cabled_connections:64,direct_connections:32};
const out={...old,status:'provisional_direct_grant_refold_requires_checks',blocks,modules,ports,connections,edges,direct,box,metrics,source_sha256:{...old.source_sha256,'artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/allocation-comparison-manifest.json':createHash('sha256').update(readFileSync(new URL('allocation-comparison-manifest.json',H))).digest('hex')},limits:['Same complete local96-connection scope as the preceding comparison, with32 adjacent grant→owner connections and64 actual cables.','The944-edge original island boundary still requires full raw-consumer/bank/retirement/claim/reset/witness routing accounting.','No full-memory density or native/timing acceptance.']};
writeFileSync(new URL('direct-design.json',H),JSON.stringify(out)+'\n');console.log(JSON.stringify(metrics));
