// Sparse actual-cell placement check. Draft mode cannot admit a source frame.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url)),read=p=>readFileSync(resolve(root,p)),sha=p=>createHash('sha256').update(read(p)).digest('hex'),config=JSON.parse(readFileSync(new URL('frame-config.json',import.meta.url))),draft=process.argv.includes('--draft'),axes=['x','y','z'],margin=3;
const move=(p,t)=>Object.fromEntries(axes.map(a=>[a,p[a]+t[a]])),boxMove=(b,t)=>({from:move(b.from,t),to:move(b.to,t)}),inside=(p,b)=>axes.every(a=>p[a]>=b.from[a]&&p[a]<=b.to[a]),intersect=(a,b,m=0)=>{const c={from:{},to:{}};for(const k of axes){c.from[k]=Math.max(a.from[k],b.from[k])-m;c.to[k]=Math.min(a.to[k],b.to[k])+m;if(c.to[k]<c.from[k])return null;}return c;},bucket=p=>axes.map(a=>Math.floor(p[a]/4)).join(',');
const sources={},loaded=new Map(),models={};
for(const[id,c]of Object.entries(config.instances)){
 if(!draft){assert(c.manifest_sha256,'Unfrozen module '+id);assert.equal(sha(c.manifest),c.manifest_sha256,'Manifest '+id);const sm=JSON.parse(read(c.manifest));for(const[p,h]of Object.entries(sm.files??sm.source_sha256))assert.equal(sha(p),h,'Source '+p);}
 if(!loaded.has(c.path))loaded.set(c.path,JSON.parse(read(c.path)));const d=loaded.get(c.path),box=boxMove(d.box,c.translation);assert(box.from.y>=-64&&box.to.y<=319,id+' height');models[id]={d,box,c};sources[c.path]=sha(c.path);
}
const pairs=[],names=Object.keys(models);let nearTotal=0,overlapTotal=0;
for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
 const na=names[i],nb=names[j],a=models[na],b=models[nb],region=intersect(a.box,b.box,margin);if(!region){pairs.push({a:na,b:nb,bounding_boxes_separated:true,overlapping_cells:0,near_cell_pairs:0});continue;}
 const buckets=new Map();let countA=0,countB=0,overlap=0,near=0;const examples=[];
 for(const v of a.d.blocks){const p=move(v.position,a.c.translation);if(!inside(p,region))continue;const k=bucket(p);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(p);countA++;}
 for(const v of b.d.blocks){const p=move(v.position,b.c.translation);if(!inside(p,region))continue;countB++;const k=axes.map(a=>Math.floor(p[a]/4));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of buckets.get([k[0]+x,k[1]+y,k[2]+z].join(','))??[]){const dist=Math.max(...axes.map(a=>Math.abs(p[a]-q[a])));if(dist>margin)continue;near++;if(dist===0)overlap++;if(examples.length<12)examples.push({a:q,b:p,chebyshev_distance:dist});}}
 pairs.push({a:na,b:nb,bounding_boxes_separated:false,tested_cells_a:countA,tested_cells_b:countB,overlapping_cells:overlap,near_cell_pairs:near,examples});nearTotal+=near;overlapTotal+=overlap;
}
const perInstance=Object.fromEntries(Object.entries(models).map(([id,{d,box,c}])=>[id,{blocks:d.blocks.length,box,translation:c.translation,provisional:c.provisional??false}])),r={status:draft?'draft_source_sparse_clearance_only':overlapTotal||nearTotal?'frozen_source_frame_collision_refused':'frozen_source_sparse_obstacle_frame_clear',source_sha256:sources,per_instance:perInstance,component_blocks:Object.values(models).reduce((n,v)=>n+v.d.blocks.length,0),margin,pairs,overlapping_cells:overlapTotal,near_cell_pairs:nearTotal,master_route_admission:!draft&&!nearTotal&&!overlapTotal,external_routes_drawn:0,native_calls:0,native_acceptance:false};
if(process.argv.includes('--save'))writeFileSync(new URL(draft?'draft-sparse-checks.json':'sparse-checks.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));if(!draft)assert(r.master_route_admission,'Actual sparse component frame is not clear');
