// Choose a measured rigid placement, with all incident cables included in cost.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {readLargeDesign} from '../../../hardware/memory-layout-large-json-v2.mjs';
import {P,K,add,basePatch,translatedConnections} from './layout.mjs';
const read=n=>readLargeDesign(fileURLToPath(new URL(n,import.meta.url))),e=read('extraction.json'),base=read('obstacles.json'),foreign=read('foreign-obstacles.json'),map=new Map([...base.blocks,...foreign.blocks].map(v=>[K(v.position),v]));
const parentMap=new Map(base.blocks.map(v=>[K(v.position),v])),removedMap=new Map(base.removed.map(v=>[K(v.position),v])),foreignKeys=new Set(foreign.blocks.map(v=>K(v.position)));
const candidates=[],rejections={collision:0,halo:0,attachment:0},tried=[];
for(let x=-96;x<=288;x+=32)for(let y=80;y<=224;y+=24)for(let z=-96;z<=224;z+=32){
 const origin=P(x,y,z),delta=P(x-530,y-280,z+720),positions=e.cluster_cells.map(v=>add(v.position,delta));let invalid=false;
 for(const p of positions){if(map.has(K(p))){rejections.collision++;invalid=true;break;}for(let dx=-2;dx<=2&&!invalid;dx++)for(let dy=-2;dy<=2&&!invalid;dy++)for(let dz=-2;dz<=2;dz++)if(map.has(K(P(p.x+dx,p.y+dy,p.z+dz)))){invalid=true;break;}if(invalid){rejections.halo++;break;}}
 if(invalid)continue;
 let patch;try{patch=basePatch(e,base,delta,{parentMap,removedMap});}catch{rejections.attachment++;continue;}
 if(patch.blocks.some(v=>foreignKeys.has(K(v.position)))){rejections.attachment++;continue;}
 const cost=patch.connections.reduce((n,r)=>n+Math.abs(r.start.x-r.end.x)+Math.abs(r.start.z-r.end.z)+Math.abs(r.start.y-r.end.y),0);
 candidates.push({origin,translation:delta,endpoint_manhattan_sum:cost,local_patch_cells_before_external_routes:patch.blocks.length});
}
candidates.sort((a,b)=>a.endpoint_manhattan_sum-b.endpoint_manhattan_sum||a.origin.y-b.origin.y);assert(candidates.length,'No safe trial placement');
writeFileSync(new URL('placement-candidates.json',import.meta.url),JSON.stringify({status:'collision_screened_placement_trials_not_routed',candidates,rejections,complete_gpu_layout:false,native_acceptance:false},null,2)+'\n');
console.log(JSON.stringify({candidates:candidates.length,rejections,best:candidates.slice(0,5)}));
