// NEW incomplete fabric derivative. One real raw selector set drives all544
// payload choices through buses BELOW the two same-height owner banks.
// Frozen direct/96-join inputs are never changed; local64 cables must be redrawn.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('./',import.meta.url),root=new URL('../../../../',H);
const read=n=>JSON.parse(readFileSync(new URL(n,H))),old=read('direct-design.json'),body=read('direct-bodies.json');
const rawPath='artifacts/full-gpu-layout-v1/memory/channel-payload-v1/design.json',raw=JSON.parse(readFileSync(new URL(rawPath,root)));
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),U=p=>A(p,P(0,-1,0));
const S='minecraft:light_gray_concrete',W='minecraft:redstone_wire',R='minecraft:repeater',T='minecraft:redstone_torch',F={east:'west',west:'east',north:'south',south:'north'};
const map=new Map(),blocks=[],edges=[],paths=[],bindings=[],columns=[];let part='';
function put(p,block,{parent=false}={}){const k=K(p),v=map.get(k);if(v){assert.deepEqual(v.block,block,'Block collision '+k+' '+v.part+' / '+part);assert(v.part===part||block.id===S,'Signal collision '+k+' '+v.part+' / '+part);return;}const row={position:p,block,part};map.set(k,row);blocks.push(row);}
const solid=(x,y,z)=>put(P(x,y,z),{id:S}),device=(p,id,properties)=>{solid(p.x,p.y-1,p.z);put(p,{id,...properties?{properties}:{}});};
const w=(x,y,z)=>device(P(x,y,z),W),r=(x,y,z,d)=>device(P(x,y,z),R,{facing:F[d],delay:'1'});
const edge=(from,to,role=part)=>edges.push({from,to,route:role});
const delta=v=>v.part.startsWith('owner_valid_')?P(0,0,-120):P(0,0,0);
for(const v of body.blocks){part=v.part;put(A(v.position,delta(v)),v.block);}
const rawShift=P(40,-76,-20);part='raw_selectors';
for(const v of raw.blocks)if(raw.groups[K(v.position)]==='raw_request_selectors')put(A(v.position,rawShift),v.block);
const modules=[...body.modules.map(m=>({...m,offset:A(m.offset,m.name.startsWith('owner_valid_')?P(0,0,-120):P(0,0,0))})),{name:'raw_selectors',offset:rawShift}];
const baseBlocks=structuredClone(blocks);
function route(name,points,{wireOnly=[],force=[]}={}){
 const path=[P(...points[0])];for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],n=Math.abs(dx)+Math.abs(dz);assert(n||dy===0);assert((!dx||!dz)&&(!dy||Math.abs(dy)===n));for(let i=1;i<=n;i++)path.push(P(a[0]+Math.sign(dx)*i,a[1]+Math.sign(dy)*i,a[2]+Math.sign(dz)*i));}
 let run=0,max=0;for(let i=0;i<path.length;i++){const p=path[i],a=path[i-1],b=path[i+1],exists=map.get(K(p));
  if(exists){assert.equal(exists.part,part,'Route overlaps foreign cell '+name+' '+K(p)+' '+exists.part);assert([W,R].includes(exists.block.id));run=exists.block.id===R?0:run+1;}
  else{const flat=a&&b&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z;if(flat&&(run>=10||force.includes(K(p)))&&!wireOnly.includes(K(p))){r(p.x,p.y,p.z,b.x>p.x?'east':b.x<p.x?'west':b.z>p.z?'south':'north');run=0;}else{w(p.x,p.y,p.z);run++;}}
  max=Math.max(max,run);assert(run<=14,'Dust run '+name+' '+K(p));if(a)edge(a,p,name);
 }paths.push({name,part,path,max_dust_run:max});return path;
}
function tower(x,z,lo,hi){assert.equal((hi-lo)%4,0);let previous=null;for(let y=lo;y<=hi;y++)if((y-lo)%2){put(P(x,y,z),{id:T});if(previous)edge(previous,P(x,y,z));previous=P(x,y,z);}else solid(x,y,z);return{first:P(x,lo+1,z),last:previous};}
for(let i=0;i<8;i++)for(let f=0;f<17;f++){
 part=`raw_candidate_${i}_${f}`;const y=-75+4*i,z=raw.fields[f].z-18,busZ=f===14?z-2:z,xs=[128+4*i,608+4*i];
 const source=P(645,y,z);assert.equal(map.get(K(source))?.block.id,R);assert.equal(map.get(K(source)).block.properties.facing,F.west);
 if(f===14){route('type_turn_'+i,[[644,y,z],[644,y,busZ]]);edge(source,P(644,y,z));}
 const bus=route('shared_'+i+'_'+f,[[644,y,busZ],[xs[0],y,busZ]],{wireOnly:xs.map(x=>K(P(x,y,busZ)))});if(f!==14)edge(source,bus[0]);
 for(let side=0;side<2;side++){
  const x=xs[side];r(x,y,busZ+1,'south');edge(P(x,y,busZ),P(x,y,busZ+1));const t=tower(x,busZ+2,y,y+212);edge(P(x,y,busZ+1),t.first);columns.push({consumer:i,field:f,side,base:P(x,y,busZ+2),top:P(x,y+212,busZ+2)});
  for(let layer=0;layer<2;layer++){
   const ch=side+2*layer,ty=-39+4*i+176*layer,X=480*side;
   r(x-1,ty,busZ+2,'west');edge(P(x,ty-1,busZ+2),P(x-1,ty,busZ+2));
   w(x-2,ty,busZ+2);w(x-3,ty-1,busZ+2);w(x-4,ty-2,busZ+2);
   edge(P(x-1,ty,busZ+2),P(x-2,ty,busZ+2));edge(P(x-2,ty,busZ+2),P(x-3,ty-1,busZ+2));edge(P(x-3,ty-1,busZ+2),P(x-4,ty-2,busZ+2));
   if(busZ!==z)route('type_return_'+ch+'_'+i,[[x-4,ty-2,busZ+2],[x-4,ty-2,z+2]]);
   let normalizer,destination=P(X+118,ty,z-2),supportDrive=null;
   if(f===15){route('terminal_'+ch+'_'+i+'_'+f,[[x-4,ty-2,z+2],[x-4,ty-2,z],[X+119,ty-2,z]],{force:[K(P(X+121,ty-2,z))]});w(X+118,ty-1,z);solid(X+118,ty,z);r(X+118,ty-1,z-1,'north');normalizer=P(X+118,ty-1,z-1);supportDrive=U(destination);edge(P(X+119,ty-2,z),P(X+118,ty-1,z));edge(P(X+118,ty-1,z),normalizer);}
   else{route('terminal_'+ch+'_'+i+'_'+f,[[x-4,ty-2,z+2],[X+118,ty-2,z+2]],{force:[K(P(X+121,ty-2,z+2))]});w(X+118,ty-1,z+1);w(X+118,ty,z);r(X+118,ty,z-1,'north');normalizer=P(X+118,ty,z-1);edge(P(X+118,ty-2,z+2),P(X+118,ty-1,z+1));edge(P(X+118,ty-1,z+1),P(X+118,ty,z));edge(P(X+118,ty,z),normalizer);}
   assert.equal(map.get(K(destination))?.block.id,W,'Actual retained selector input '+K(destination));edge(normalizer,destination);
   bindings.push({consumer:i,field:f,channel:ch,source,destination,normalizer,supportDrive,part});
  }
 }
}
const box={from:P(Infinity,Infinity,Infinity),to:P(-Infinity,-Infinity,-Infinity)};for(const v of blocks)for(const a of['x','y','z']){box.from[a]=Math.min(box.from[a],v.position[a]);box.to[a]=Math.max(box.to[a],v.position[a]);}
const direct=old.direct,localConnections=old.connections.map(r=>{const endpoint=p=>{const v=body.blocks.find(v=>K(v.position)===K(p));assert(v);return A(p,delta(v));};return{name:r.name,source:endpoint(r.source),destination:endpoint(r.destination),source_direction:r.source_direction,arrival_direction:r.arrival_direction,channel:r.channel,bit:r.bit};});
const metrics={body_cells:baseBlocks.length,cells:blocks.length,new_fanout_cells:blocks.length-baseBlocks.length,raw_selector_cells:baseBlocks.length-body.blocks.length,raw_consumers:8,field_sources:136,payload_destinations:bindings.length,positive_columns:columns.length,local_cables_pending:64,direct_grants:32,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),legal_y_translation:[-64-box.from.y,319-box.to.y]};
assert.equal(bindings.length,544);assert(metrics.legal_y_translation[0]<=metrics.legal_y_translation[1]);
const hashes={};for(const n of['direct-local-manifest.json','direct-design.json','direct-bodies.json','place-raw-shared.mjs'])hashes[n]=createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');hashes[rawPath]=createHash('sha256').update(readFileSync(new URL(rawPath,root))).digest('hex');
writeFileSync(new URL('raw-shared-bodies.json',H),JSON.stringify({blocks:baseBlocks,modules})+'\n');
writeFileSync(new URL('raw-shared-design.json',H),JSON.stringify({status:'incomplete_raw_fanout_requires_checks_and64local_cables',blocks,modules,edges,paths,bindings,columns,direct,localConnections,box,metrics,source_sha256:hashes,selected:false,native_acceptance:false})+'\n');console.log(JSON.stringify(metrics));
