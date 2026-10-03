// Choose a measured rigid placement, with all incident cables included in cost.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {P,K,add,basePatch,translatedConnections} from './layout.mjs';
const read=n=>readLargeDesign(fileURLToPath(new URL(n,import.meta.url))),e=read('extraction.json'),base=read('obstacles.json'),foreign=read('../compact-core-fault-v1/foreign-obstacles.json'),map=new Map([...base.blocks,...foreign.blocks].map(v=>[K(v.position),v]));
const parentMap=new Map(base.blocks.map(v=>[K(v.position),v])),removedMap=new Map(base.removed.map(v=>[K(v.position),v])),foreignKeys=new Set(foreign.blocks.map(v=>K(v.position)));
// Dense byte-mask is only a local design-search acceleration. Every marked
// voxel means an actual selected block lies within two cells in each axis.
const low={x:-192+2-2,y:0-4-2,z:-480-5-2},high={x:640+164+2,y:200+116+2,z:128+5+2},nx=high.x-low.x+1,ny=high.y-low.y+1,nz=high.z-low.z+1,halo=new Uint8Array(nx*ny*nz),index=p=>((p.x-low.x)*ny+(p.y-low.y))*nz+(p.z-low.z);
let markedSources=0;for(const v of map.values()){const p=v.position;if(p.x<low.x-2||p.x>high.x+2||p.y<low.y-2||p.y>high.y+2||p.z<low.z-2||p.z>high.z+2)continue;markedSources++;for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const q={x:p.x+dx,y:p.y+dy,z:p.z+dz};if(q.x>=low.x&&q.x<=high.x&&q.y>=low.y&&q.y<=high.y&&q.z>=low.z&&q.z<=high.z)halo[index(q)]=1;}}
console.error(JSON.stringify({halo_bytes:halo.length,actual_block_sources:markedSources}));
const candidates=[],rejections={collision:0,halo:0,attachment:0},tried=[];
for(let x=-192;x<=640;x+=32)for(let y=0;y<=200;y+=20)for(let z=-480;z<=128;z+=32){
 const origin=P(x,y,z),delta=P(x-e.reference_origin.x,y-e.reference_origin.y,z-e.reference_origin.z),positions=e.cluster_cells.map(v=>add(v.position,delta));let invalid=false;
 for(const p of positions){assert(p.x>=low.x&&p.x<=high.x&&p.y>=low.y&&p.y<=high.y&&p.z>=low.z&&p.z<=high.z);if(halo[index(p)]){rejections.halo++;invalid=true;break;}}
 if(invalid)continue;
 let patch;try{patch=basePatch(e,base,delta,{parentMap,removedMap});}catch{rejections.attachment++;continue;}
 if(patch.blocks.some(v=>foreignKeys.has(K(v.position)))){rejections.attachment++;continue;}
 const cost=patch.connections.reduce((n,r)=>n+Math.abs(r.start.x-r.end.x)+Math.abs(r.start.z-r.end.z)+Math.abs(r.start.y-r.end.y),0);
 candidates.push({origin,translation:delta,endpoint_manhattan_sum:cost,local_patch_cells_before_external_routes:patch.blocks.length});
}
candidates.sort((a,b)=>a.endpoint_manhattan_sum-b.endpoint_manhattan_sum||a.origin.y-b.origin.y);assert(candidates.length,'No safe trial placement');
writeFileSync(new URL('placement-candidates-fast.json',import.meta.url),JSON.stringify({status:'collision_screened_placement_trials_not_routed',candidates,rejections,complete_gpu_layout:false,native_acceptance:false},null,2)+'\n');
console.log(JSON.stringify({candidates:candidates.length,rejections,best:candidates.slice(0,5)}));
