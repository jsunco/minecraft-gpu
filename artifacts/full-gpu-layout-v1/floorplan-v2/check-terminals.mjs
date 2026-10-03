// Checks every advertised route endpoint against actual pinned parent cells.
// Endpoint occupancy is not an electrical-connection or timing proof.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {iterateObstacles,shaFile,frame} from './obstacles.mjs';
const HERE=new URL('.',import.meta.url),K=p=>`${p.x},${p.y},${p.z}`;
export async function checkTerminals(){
 const d=JSON.parse(readFileSync(new URL('placement.json',HERE),'utf8')),r=d.candidates[0],want=new Map(),rows=[];
 assert.equal(d.complete_gpu_layout,false);assert.equal(r.mapped_component_blocks,5615575);
 for(const [n,v]of Object.entries(frame.instances))assert.deepEqual(v.translation,r.transforms[n].t);
 for(const n of r.external){
  assert.equal(n.route,null);assert.equal(n.added_route_blocks,null);
  for(const role of ['driver','sink']){const e=n[role];if(e.positions===null)continue;
   assert.equal(e.positions.length,n.width);assert.equal(e.coordinate_frame,'master');
   for(let i=0;i<e.positions.length;i++){
    const p=e.positions[i];assert(['x','y','z'].every(a=>Number.isSafeInteger(p[a])));
    if(e.declared_bits)assert.deepEqual(e.declared_bits[i].position,p,`${n.name} bit${i} metadata frame`);
    const id=e.instance+':'+K(p);if(!want.has(id))want.set(id,[]);
    const row={net:n.name,role,bit:i,instance:e.instance,port:e.port,position:p,block:null};want.get(id).push(row);rows.push(row);
   }
  }
 }
 for await(const c of iterateObstacles({verify:false})){for(const row of want.get(c.instance+':'+K(c.position))??[])row.block=c.block;}
 const missing=rows.filter(r=>!r.block);assert.deepEqual(missing,[],'advertised endpoint has no actual cell');
 for(let ci=0;ci<2;ci++){
  assert.equal(r.external.find(n=>n.name==='dispatch_done_'+ci).driver.positions,null);
  assert.equal(r.external.find(n=>n.name==='dispatch_reset_ack_'+ci).driver.positions,null);
 }
 assert.equal(r.external.filter(n=>n.scope==='data_memory'&&n.driver.positions===null).reduce((n,r)=>n+r.width,0),80);
 const report={status:'all_advertised_terminal_positions_exist_in_bound_parent_maps',source_sha256:{'artifacts/full-gpu-layout-v1/floorplan-v2/placement.json':await shaFile(fileURLToPath(new URL('placement.json',HERE))),'artifacts/full-gpu-layout-v1/floorplan-v2/check-terminals.mjs':await shaFile(fileURLToPath(new URL('check-terminals.mjs',HERE))),...d.source_sha256},endpoint_occurrences:rows.length,unique_instance_positions:want.size,missing_endpoints:0,rows,limitations:['Actual cells and consistent coordinate frames only; isolated escape routes and endpoint directions still require route-specific electrical checks.','The route list is an explicit partial interface matrix. Cold initialization/phase distribution and internal unfinished producers remain separately named.'],native_acceptance:false};
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const d=await checkTerminals();writeFileSync(new URL('terminal-checks.json',HERE),JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify({status:d.status,endpoint_occurrences:d.endpoint_occurrences,unique_instance_positions:d.unique_instance_positions}));}
