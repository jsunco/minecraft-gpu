// Join all64 moved local cables against the immutable544-destination fanout.
// No frozen source or map is edited; output remains an incomplete fabric.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';
import{P,K,V,F,searchPath,refreshIndices}from'./allocation-route.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),parent=read('raw-shared-design.json'),pin=read('raw-shared-source-manifest.json');
const ROOT=new URL('../../../../',H);for(const[p,h]of Object.entries(pin.source_sha256))assert.equal(createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex'),h);
const A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),under=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n));
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater';
const blocks=structuredClone(parent.blocks),map=new Map(blocks.map(v=>[K(v.position),v])),edges=[...parent.edges],connections=structuredClone(parent.localConnections);
function put(v){assert(!map.has(K(v.position)),'Collision '+v.part+' '+K(v.position)+' '+map.get(K(v.position))?.part);map.set(K(v.position),v);blocks.push(v);}
for(const r of connections){
 r.tap=step(r.source,r.source_direction);r.start=step(r.source,r.source_direction,2);r.arrival=step(r.destination,r.arrival_direction,-1);r.end=step(r.destination,r.arrival_direction,-2);
 for(const p of[r.source,r.destination])assert.equal(map.get(K(p))?.block.id,W);
 for(const[p,dir]of[[r.tap,r.source_direction],[r.start,null],[r.arrival,r.arrival_direction],[r.end,null]]){put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:dir?R:W,...dir?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 for(const[from,to]of[[r.source,r.tap],[r.tap,r.start],[r.end,r.arrival],[r.arrival,r.destination]])edges.push({from,to,route:r.name});
}
const file=new URL('raw-local-paths.json',H),cache=existsSync(file)?JSON.parse(readFileSync(file)):{};
const reserve=r=>[...Array.from({length:5},(_,i)=>step(r.source,r.source_direction,i+2)),...Array.from({length:5},(_,i)=>step(r.destination,r.arrival_direction,-i-2))],reserved=connections.flatMap(reserve);
for(const r of [...connections].sort((a,b)=>a.channel-b.channel||Number(b.name.startsWith('held_type'))-Number(a.name.startsWith('held_type')))){
 let path=cache[r.name]?.path;if(path){assert.deepEqual(cache[r.name].source,r.source);assert.deepEqual(cache[r.name].destination,r.destination);}
 else{const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(under),...reserve(r)],found=searchPath(map,r.start,r.end,{ignore,reserved,limit:1600000});path=found.path;cache[r.name]={source:r.source,destination:r.destination,path,expanded:found.expanded};writeFileSync(file,JSON.stringify(cache)+'\n');console.log(JSON.stringify({route:r.name,points:path.length,expanded:found.expanded}));}
 const indices=refreshIndices(path),rs=new Set(indices);for(let i=1;i<path.length-1;i++){const p=path[i],n=path[i+1],dir=Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z);put({position:under(p),block:{id:S},part:r.name});put({position:p,block:{id:rs.has(i)?R:W,...rs.has(i)?{properties:{facing:F[dir],delay:'1'}}:{}},part:r.name});}
 r.path=path;r.refresh_indices=indices;for(let i=1;i<path.length;i++)edges.push({from:path[i-1],to:path[i],route:r.name});
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const metrics={...parent.metrics,cells:blocks.length,local_cables_pending:0,local_cables:connections.length,new_local_cable_cells:blocks.length-parent.blocks.length,actual_connections:544+64+32,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y]};assert(metrics.legal_y_translation[0]<=metrics.legal_y_translation[1]);
const out={...parent,status:'raw_and_local_joined_requires_checks',blocks,edges,connections,box,metrics,source_sha256:{...parent.source_sha256,'raw-shared-source-manifest.json':createHash('sha256').update(readFileSync(new URL('raw-shared-source-manifest.json',H))).digest('hex')},selected:false,native_acceptance:false};
writeFileSync(new URL('raw-local-design.json',H),JSON.stringify(out)+'\n');console.log(JSON.stringify(metrics));
