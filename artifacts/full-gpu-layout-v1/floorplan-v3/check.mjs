// Bounded actual-cell replacement/composition proof. No geometry or native writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),H=new URL('.',import.meta.url);
const read=p=>JSON.parse(readFileSync(resolve(ROOT,p))),local=f=>JSON.parse(readFileSync(new URL(f,H))),axes=['x','y','z'];
const sha=async p=>{const h=createHash('sha256');for await(const b of createReadStream(resolve(ROOT,p)))h.update(b);return h.digest('hex')};
const K=p=>`${p.x},${p.y},${p.z}`,move=(p,t)=>({x:p.x+t.x,y:p.y+t.y,z:p.z+t.z}),bk=p=>axes.map(a=>Math.floor(p[a]/4)),state=b=>JSON.stringify([b.id,Object.entries(b.properties??{}).sort(([a],[b])=>a.localeCompare(b))]);
const f=local('frame-config.json'),pins={};
function addPin(p,h){assert(!pins[p]||pins[p]===h,'Conflicting source '+p);pins[p]=h;}
for(const c of [...Object.values(f.instances),...Object.values(f.route_deltas)]){
 assert.equal(await sha(c.manifest),c.manifest_sha256,c.manifest);addPin(c.manifest,c.manifest_sha256);
 const m=read(c.manifest);for(const[p,h]of Object.entries(m.files??m.source_sha256))addPin(p,h);
}
assert.equal(await sha(f.previous_frame),f.previous_frame_sha256);addPin(f.previous_frame,f.previous_frame_sha256);
for(const[p,h]of Object.entries(pins))assert.equal(await sha(p),h,p);
const routes={},routeBuckets=new Map(),routeKeys=new Map(),nearBucketKeys=new Set();
function nearby(p){const k=bk(p),out=[];if(!nearBucketKeys.has(k.join(',')))return out;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const r of routeBuckets.get([k[0]+x,k[1]+y,k[2]+z].join(','))??[])if(axes.every(a=>Math.abs(p[a]-r.position[a])<=3))out.push(r);return out;}
const routePairs=[];
for(const[name,c]of Object.entries(f.route_deltas)){
 const d=read(c.path);assert.equal(new Set(d.blocks.map(r=>K(r.position))).size,d.blocks.length,'Duplicate route cell');routes[name]=d;let near=0;const examples=[];
 for(const r of d.blocks){assert(!routeKeys.has(K(r.position)),'Route delta collision '+K(r.position));for(const q of nearby(r.position)){near++;if(examples.length<12)examples.push({a:q.instance,b:name,from:q.position,to:r.position});}}
 routePairs.push({added:name,near_previous_delta_pairs:near,examples});assert.equal(near,0,'New cross-delta three-cell contact requires explicit electrical review');
 for(const r of d.blocks){const row={...r,instance:name},key=bk(r.position).join(',');if(!routeBuckets.has(key)){routeBuckets.set(key,[]);const k=bk(r.position);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)nearBucketKeys.add([k[0]+x,k[1]+y,k[2]+z].join(','));}routeBuckets.get(key).push(row);routeKeys.set(K(r.position),row);}
}
const instanceMeta={},nearMaps={},ports={},stats=[];
// One source design at a time; duplicated core copies share a parsed source.
const groups=new Map();for(const[name,c]of Object.entries(f.instances)){if(!groups.has(c.path))groups.set(c.path,[]);groups.get(c.path).push({name,...c});}
const pairRegions=[];const boxMove=(b,t)=>({from:move(b.from,t),to:move(b.to,t)}),inside=(p,b)=>axes.every(a=>p[a]>=b.from[a]&&p[a]<=b.to[a]);
function region(a,b){const r={from:{},to:{}};for(const k of axes){r.from[k]=Math.max(a.from[k],b.from[k])-3;r.to[k]=Math.min(a.to[k],b.to[k])+3;if(r.from[k]>r.to[k])return null;}return r;}
const previous=read('artifacts/full-gpu-layout-v1/floorplan-v2/sparse-checks.json');
// New parents promise same envelope; establish it from actual cells below.
for(const[name,c]of Object.entries(f.instances))instanceMeta[name]={translation:c.translation,box:previous.per_instance[name].box,path:c.path,manifest_sha256:c.manifest_sha256};
const names=Object.keys(f.instances);for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i],b=names[j],r=region(instanceMeta[a].box,instanceMeta[b].box);if(r)pairRegions.push({a,b,region:r,cells:{[a]:[],[b]:[]}});}
for(const[path,instances]of groups){
 const d=read(path);for(const v of instances){
  const box={from:{x:Infinity,y:Infinity,z:Infinity},to:{x:-Infinity,y:-Infinity,z:-Infinity}},near=new Map();
  for(const row of d.blocks){const p=move(row.position,v.translation);for(const a of axes){assert(Number.isSafeInteger(p[a]));box.from[a]=Math.min(box.from[a],p[a]);box.to[a]=Math.max(box.to[a],p[a]);}assert(!routeKeys.has(K(p)),'New parent intersects route '+v.name+' '+K(p));if(nearby(p).length)near.set(K(p),state(row.block));for(const r of pairRegions)if((r.a===v.name||r.b===v.name)&&inside(p,r.region))r.cells[v.name].push(p);}
  assert.deepEqual(box,instanceMeta[v.name].box,'Changed parent envelope requires new placement');assert(box.from.y>=-64&&box.to.y<=319);instanceMeta[v.name].blocks=d.blocks.length;nearMaps[v.name]=near;ports[v.name]=d.ports;
 }
}
// Replacements must preserve every old block/state in each actual route halo.
for(const[path,instances]of groups){
 const changed=instances.filter(v=>v.previous_path);if(!changed.length)continue;
 assert(pins[changed[0].previous_path],'Old parent not pinned');assert.equal(await sha(changed[0].previous_path),pins[changed[0].previous_path]);const old=read(changed[0].previous_path);for(const v of changed){const before=new Map();for(const row of old.blocks){const p=move(row.position,v.translation);if(nearby(p).length)before.set(K(p),state(row.block));}
  const after=nearMaps[v.name],diff=[];for(const[k,s]of before)if(after.get(k)!==s)diff.push({position:k,before:s,after:after.get(k)??null});for(const[k,s]of after)if(!before.has(k))diff.push({position:k,before:null,after:s});stats.push({instance:v.name,old_blocks:old.blocks.length,new_blocks:instanceMeta[v.name].blocks,old_route_neighborhood:before.size,new_route_neighborhood:after.size,changed_route_neighborhood_cells:diff.length,examples:diff.slice(0,20)});assert.equal(diff.length,0,'Replacement changes existing route neighborhood '+v.name);
 }
}
const sparse=[];for(const r of pairRegions){const m=new Map();for(const p of r.cells[r.a]){const k=bk(p).join(',');if(!m.has(k))m.set(k,[]);m.get(k).push(p);}let n=0;const examples=[];for(const p of r.cells[r.b]){const k=bk(p);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of m.get([k[0]+x,k[1]+y,k[2]+z].join(','))??[])if(axes.every(a=>Math.abs(p[a]-q[a])<=3)){n++;if(examples.length<10)examples.push({a:q,b:p});}}sparse.push({a:r.a,b:r.b,cells_a:r.cells[r.a].length,cells_b:r.cells[r.b].length,near_pairs:n,examples});assert.equal(n,0,'New module cross contact');}
const endpointChecks=[];
for(const[name,d]of Object.entries(routes))for(const c of d.connections){for(const side of['source','destination']){const inst=c[side+'_instance'],pos=c[side];assert(nearMaps[inst]?.has(K(pos)),'Missing routed endpoint '+name+' '+c.name+' '+side);assert.equal(JSON.parse(nearMaps[inst].get(K(pos)))[0],'minecraft:redstone_wire');}endpointChecks.push({name:c.name,source:c.source,destination:c.destination});}
const out={status:'frozen_source_master_composition_checked',frame_sha256:await sha('artifacts/full-gpu-layout-v1/floorplan-v3/frame-config.json'),source_pins_verified:Object.keys(pins).length,instances:instanceMeta,route_blocks:Object.fromEntries(Object.entries(routes).map(([n,d])=>[n,d.blocks.length])),total_blocks:Object.values(instanceMeta).reduce((n,v)=>n+v.blocks,0)+routeKeys.size,parent_replacement_route_neighborhoods:stats,cross_module_checks:sparse,cross_delta_checks:routePairs,routed_endpoint_pairs: endpointChecks.length,endpoints:endpointChecks,three_cell_neighborhoods_unchanged:true,actual_sparse_collisions:0,complete_gpu_layout:false,native_acceptance:false,limits:['Reuses source-bound individual delta electrical checks because replacement route neighborhoods are identical; pairwise new-to-new distance greater than3 excludes extra contacts.','Does not discharge inherited timing, initialization, source coherence, final resetACK or missing memory return producers.']};
writeFileSync(new URL('composition-checks.json',H),JSON.stringify(out,null,2)+'\n');writeFileSync(new URL('source-bindings.json',H),JSON.stringify(pins,null,2)+'\n');writeFileSync(new URL('local-ports.json',H),JSON.stringify(ports,null,2)+'\n');console.log(JSON.stringify({...out,endpoints:undefined}));
