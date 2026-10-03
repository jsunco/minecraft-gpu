// NEW derivative: actual16 raw VALID inputs fan out to64 held-owner lookups.
// Does not substitute READY for ownership or edit the frozen640-join parent.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';
import{P,K,V,F,searchPath,refreshIndices}from'./allocation-route.mjs';
import{inputs,active}from'./cut-inputs.mjs';
const H=new URL('./',import.meta.url),ROOT=new URL('../../../../',H),read=n=>JSON.parse(readFileSync(new URL(n,H))),parent=read('raw-local-design.json'),ports=read('raw-local-ports.json').ports,pins=read('raw-local-source-manifest.json').source_sha256;
for(const[p,h]of Object.entries(pins))assert.equal(createHash('sha256').update(readFileSync(new URL(p,ROOT))).digest('hex'),h);
const W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',R='minecraft:repeater',T='minecraft:redstone_torch',A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),U=p=>A(p,P(0,-1,0)),step=(p,d,n=1)=>A(p,P(V[d][0]*n,0,V[d][1]*n));
const blocks=structuredClone(parent.blocks),map=new Map(blocks.map(v=>[K(v.position),v])),edges=[],buses=[],columns=[],bindings=[];let part='';
function put(p,block){const old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'Collision '+K(p)+' '+old.part+' / '+part);assert(old.part===part||block.id===S,'Signal collision '+K(p)+' '+old.part+' / '+part);return;}const v={position:p,block,part};map.set(K(p),v);blocks.push(v);}
const solid=p=>put(p,{id:S}),dev=(p,id,props)=>{solid(U(p));put(p,{id,...props?{properties:props}:{}});},wire=p=>dev(p,W),rep=(p,d)=>dev(p,R,{facing:F[d],delay:'1'}),edge=(from,to)=>edges.push({from,to,route:part});
function receiving(destination){
 const before={get:k=>map.get(k)?.block},opposite={east:'west',west:'east',north:'south',south:'north'};
 for(const direction of['east','north','south']){
  const arrival=step(destination,direction,-1),end=step(destination,direction,-2),rows=[[arrival,{id:R,properties:{facing:F[direction],delay:'1'}}],[end,{id:W}],[U(arrival),{id:S}],[U(end),{id:S}]];
  if(rows.some(([p])=>map.has(K(p))))continue;
  const proposed=new Map(rows.map(([p,b])=>[K(p),b])),after={get:k=>proposed.get(k)??before.get(k)},allowed=new Set([K(end)+'>'+K(arrival),K(arrival)+'>'+K(destination)]),affected=new Map();
  for(const[p]of rows)for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const q=P(p.x+dx,p.y+dy,p.z+dz);if(active(after.get(K(q))))affected.set(K(q),q);}
  let good=true;for(const[k,p]of affected){const old=new Set(inputs(before,p).map(K)),next=new Set(inputs(after,p).map(K));if([...old].some(q=>!next.has(q))||[...next].some(q=>!old.has(q)&&!allowed.has(q+'>'+k))){good=false;break;}}
  if(good)return{arrival,end,arrival_direction:direction,retreat:opposite[direction]};
 }
 throw Error('No isolated receiver stub '+K(destination));
}
function line(name,points,{wireOnly=[],force=[]}={}){
 const path=[points[0]];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,n=Math.abs(dx)+Math.abs(dz);assert((!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let i=1;i<=n;i++)path.push(P(a.x+Math.sign(dx)*i,a.y+Math.sign(dy)*i,a.z+Math.sign(dz)*i));}
 let run=0;for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1],existing=map.get(K(p));if(existing){assert.equal(existing.part,part,'Foreign bus point '+K(p));assert([W,R].includes(existing.block.id));run=existing.block.id===R?0:run+1;}else{const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){rep(p,Object.keys(V).find(d=>p.x+V[d][0]===b.x&&p.z+V[d][1]===b.z));run=0;}else{wire(p);run++;}}assert(run<=14,name+' attenuation '+K(p));if(a)edge(a,p);}buses.push({name,part,path});return path;
}
for(let i=0;i<8;i++)for(const kind of['read','write']){
 part=`matching_${kind}_valid_${i}`;const source=ports['raw.'+kind+'_valid'].positions[i],y=source.y,busZ=kind==='read'?-160:-120,columnZ=busZ+2,xs=[116-4*i,596-4*i];
 rep(step(source,'north'),'north');edge(source,step(source,'north'));const begin=step(source,'north',2);wire(begin);edge(step(source,'north'),begin);
 line('spine_'+kind+'_'+i,[begin,P(source.x,y,busZ)]);
 // WV crosses the RV north spine at a real two-level underpass. Its input
 // and column base remain at the original consumer height/parity.
 const points=kind==='read'?[P(source.x,y,busZ),P(xs[0],y,busZ)]:[P(source.x,y,busZ),P(662,y,busZ),P(660,y-2,busZ),P(654,y-2,busZ),P(652,y,busZ),P(xs[0],y,busZ)];
 line('bus_'+kind+'_'+i,points,{wireOnly:xs.map(x=>K(P(x,y,busZ))),force:kind==='write'?[K(P(657,y-2,busZ))]:[]});
 for(let side=0;side<2;side++){
  const x=xs[side],base=P(x,y,columnZ),top=P(x,y+212,columnZ);rep(P(x,y,busZ+1),'south');edge(P(x,y,busZ),P(x,y,busZ+1));let prev=P(x,y,busZ+1);
  for(let yy=y;yy<=y+212;yy++)if((yy-y)%2){put(P(x,yy,columnZ),{id:T});edge(prev,P(x,yy,columnZ));prev=P(x,yy,columnZ);}else solid(P(x,yy,columnZ));columns.push({kind,consumer:i,side,base,top});
  for(let layer=0;layer<2;layer++){
   const ch=side+2*layer,ty=-39+4*i+176*layer,travel=kind==='read'?'south':'north',tap=P(x,ty,columnZ+V[travel][1]),start=step(tap,travel),destination=ports[`channel${ch}.lookup.${kind}_valid`].positions[i],rx=receiving(destination),{arrival,end}=rx;
   assert.deepEqual(destination,P(132+480*side,ty,kind==='read'?-146:-138));rep(tap,travel);wire(start);edge(P(x,ty-1,columnZ),tap);edge(tap,start);rep(arrival,rx.arrival_direction);wire(end);edge(end,arrival);edge(arrival,destination);
   bindings.push({name:`matching_${kind}_${ch}_${i}`,part,kind,consumer:i,channel:ch,source,destination,tap,start,arrival,end,source_direction:travel,...rx});
  }
 }
}
const file=new URL('raw-valid-paths.json',H),cache=existsSync(file)?JSON.parse(readFileSync(file)):{};
const reserve=r=>[...Array.from({length:4},(_,i)=>step(r.start,r.source_direction,i)),...Array.from({length:4},(_,i)=>step(r.end,r.retreat,i))],reserved=bindings.flatMap(reserve);
for(const r of bindings){part=r.part;let path=cache[r.name]?.path;if(path){assert.deepEqual(cache[r.name].source,r.start);assert.deepEqual(cache[r.name].destination,r.end);}else{const ignore=[r.tap,r.start,r.arrival,r.end,...[r.tap,r.start,r.arrival,r.end].map(U),...reserve(r)],found=searchPath(map,r.start,r.end,{ignore,reserved,limit:900000});path=found.path;cache[r.name]={source:r.start,destination:r.end,path,expanded:found.expanded};writeFileSync(file,JSON.stringify(cache)+'\n');console.log(JSON.stringify({name:r.name,points:path.length,expanded:found.expanded}));}
 const indices=refreshIndices(path),set=new Set(indices);for(let i=1;i<path.length-1;i++){const p=path[i],n=path[i+1];if(set.has(i))rep(p,Object.keys(V).find(d=>p.x+V[d][0]===n.x&&p.z+V[d][1]===n.z));else wire(p);}for(let i=1;i<path.length;i++)edge(path[i-1],path[i]);r.path=path;r.refresh_indices=indices;
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const metrics={...parent.metrics,cells:blocks.length,raw_matching_valid_inputs:16,lookup_valid_destinations:64,new_valid_cells:blocks.length-parent.blocks.length,actual_connections:parent.metrics.actual_connections+64,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y]};assert(metrics.legal_y_translation[0]<=metrics.legal_y_translation[1]);
writeFileSync(new URL('raw-valid-design.json',H),JSON.stringify({status:'raw_valid_matching_fanout_requires_checks',blocks,edges,buses,columns,bindings,box,metrics,parent:'raw-local-design.json',parent_sha256:createHash('sha256').update(readFileSync(new URL('raw-local-design.json',H))).digest('hex'),selected:false,native_acceptance:false})+'\n');console.log(JSON.stringify(metrics));
