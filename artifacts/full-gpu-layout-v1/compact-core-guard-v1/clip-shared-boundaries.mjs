// Preserve pre-existing shared wire branches while moving the far matrix.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,copyFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{readLargeDesign}from'../../../hardware/memory-layout-large-json-v2.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>[p.x,p.y,p.z].join(','),read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),initial=new URL('extraction-unclipped.json',import.meta.url),failure=new URL('ownership-before-clips.json',import.meta.url);
if(!existsSync(initial))copyFileSync(new URL('extraction.json',import.meta.url),initial);if(!existsSync(failure))copyFileSync(new URL('ownership-checks.json',import.meta.url),failure);
const e=read('extraction-unclipped.json'),bad=read('ownership-before-clips.json').unaccounted_direct_contacts,parent=readLargeDesign(fileURLToPath(new URL('../compact-core-fault-v1/design.json',import.meta.url))),actual=new Map(parent.blocks.map(v=>[K(v.position),v.block])),groups=new Map,clips=[];
for(const contact of bad){const hits=e.connections.filter(r=>r.path.some(p=>K(p)===K(contact.inside)));assert.equal(hits.length,1,'Shared cable ownership must be unique');const r=hits[0];if(!groups.has(r.name))groups.set(r.name,[]);groups.get(r.name).push(contact.inside);}
const flat=(a,b,c)=>a.y===b.y&&b.y===c.y&&Math.abs(a.x-b.x)+Math.abs(a.z-b.z)===1&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z;
for(const[name,taps]of groups){const r=e.connections.find(v=>v.name===name),old=structuredClone(r),indices=taps.map(p=>r.path.findIndex(q=>K(q)===K(p)));
 if(!r.source_moves_with_cluster&&r.destination_moves_with_cluster){let j=Math.max(...indices);while(j<r.path.length-2&&!(actual.get(K(r.path[j]))?.id==='minecraft:redstone_wire'&&flat(r.path[j],r.path[j+1],r.path[j+2])))j++;assert(j<r.path.length-2);
  r.source=r.path[j];r.tap=r.path[j+1];r.path=r.path.slice(j+2);clips.push({route:name,side:'source',shared_taps:taps,old_source:old.source,new_source:r.source,retained_prefix_path_points:j+1});
 }else if(r.source_moves_with_cluster&&!r.destination_moves_with_cluster){let j=Math.min(...indices);while(j>1&&!(actual.get(K(r.path[j]))?.id==='minecraft:redstone_wire'&&flat(r.path[j-2],r.path[j-1],r.path[j])))j--;assert(j>1);
  r.destination=r.path[j];r.arrival=r.path[j-1];r.path=r.path.slice(0,j-1);clips.push({route:name,side:'destination',shared_taps:taps,old_destination:old.destination,new_destination:r.destination,retained_suffix_path_points:old.path.length-j});
 }else assert.fail('Unexpected shared internal or detached route '+name);
 r.points=r.path.length;
}
e.shared_boundary_clips=clips;for(const n of['clip-shared-boundaries.mjs','extraction-unclipped.json','ownership-before-clips.json'])e.source_sha256['artifacts/full-gpu-layout-v1/compact-core-guard-v1/'+n]=createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex');
writeFileSync(new URL('extraction.json',import.meta.url),JSON.stringify(e,null,2)+'\n');console.log(JSON.stringify({clipped_boundaries:clips.length,clips}));
