// Bounded independent endpoint, polarity, actual path and parent-boundary review.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {makeMasterControlRoutes} from '../../../hardware/full-gpu-master-control-routes-v1.mjs';
import {routeDelays} from '../../../scripts/check-route-delay.mjs';
import {shaFile,decodeSlice} from '../floorplan-v2/obstacles.mjs';
const H=new URL('.',import.meta.url),P='artifacts/full-gpu-layout-v1/master-control-routes-v1/';
const read=f=>JSON.parse(readFileSync(new URL(f,H),'utf8'));
const manifest=read('source-manifest.json');for(const[p,h]of Object.entries(manifest.files))assert.equal(await shaFile(p),h,p);
const d=read('design.json');assert.deepEqual(makeMasterControlRoutes({obstaclePath:d.obstacle_path}),d);
const f=JSON.parse(readFileSync(d.obstacle_path,'utf8')),parent=[...decodeSlice(f)],K=p=>`${p.x},${p.y},${p.z}`,A=(p,v)=>({x:p.x+v.x,y:p.y+v.y,z:p.z+v.z});
const base=new Map(parent.map(v=>[K(v.position),v])),newMap=new Map(d.blocks.map(v=>[K(v.position),v])),all=[...parent,...d.blocks];assert.equal(newMap.size,d.blocks.length);
const dir={west:{x:1,y:0,z:0},east:{x:-1,y:0,z:0},north:{x:0,y:0,z:1},south:{x:0,y:0,z:-1}};
const designs={dispatch:JSON.parse(readFileSync(new URL('../dispatch-input-sampling-v1/design.json',H))),global:JSON.parse(readFileSync(new URL('../global-command-assembly-v3/design.json',H)))};
const ts={dispatch:{x:-1712,y:55,z:-600},global:{x:-1000,y:-55,z:550}};
function boundary(c){
 const src=designs[c.source_instance].ports[c.source_port].bits[0],dst=designs[c.destination_instance].ports[c.destination_port].bits[0];
 assert.deepEqual(c.source,A(src.position,ts[c.source_instance]));assert.deepEqual(c.destination,A(dst.position,ts[c.destination_instance]));
 assert.equal(base.get(K(c.source))?.block.id,'minecraft:redstone_wire');assert.equal(base.get(K(c.destination))?.block.id,'minecraft:redstone_wire');
 const sourceDriver=base.get(K(A(src.source,ts[c.source_instance])));assert.equal(sourceDriver?.block.id,'minecraft:repeater');assert.deepEqual(A(sourceDriver.position,dir[sourceDriver.block.properties.facing]),c.source);
 const tap=newMap.get(K(A(c.source,src.travel)));assert.equal(tap?.block.id,'minecraft:repeater');assert.deepEqual(dir[tap.block.properties.facing],src.travel);
 const r=newMap.get(K(c.normalizer));assert.equal(r?.block.id,'minecraft:repeater');assert.deepEqual(A(r.position,dir[r.block.properties.facing]),c.destination);assert.deepEqual(dir[r.block.properties.facing],dst.travel);
 const receiver=base.get(K(A(dst.receiver,ts[c.destination_instance])));assert.equal(receiver?.block.id,'minecraft:repeater');assert.deepEqual(dir[receiver.block.properties.facing],dst.travel);
 // Straight same-axis source/recipient connections preserve the existing forced wire legs.
 assert.deepEqual(src.travel,{x:0,y:0,z:1});
}
for(const c of d.connections)boundary(c);assert.equal(d.connections.length,7);
const merged={...d,blocks:all},timing=routeDelays(merged);assert(timing.routes.every(r=>r.torch_inversions.length===1&&r.torch_inversions[0]%2===0));
let negatives=0;
for(const mutate of [c=>{c.source.x++},c=>{c.destination.z++},c=>{c.source_port='admission_start0_visible'}]){const c=structuredClone(d.connections[0]);mutate(c);assert.throws(()=>boundary(c));negatives++;}
const bad=structuredClone(merged);bad.columns[0].output_y-=2;assert.throws(()=>routeDelays(bad));negatives++;
const complete=read('all-parent-checks.json');assert.equal(complete.parent_cells,5615575);assert.equal(complete.slice_cells_matched,350312);assert.equal(complete.parent_delta_collisions,0);assert.equal(complete.route_neighborhood_margin,3);assert.equal(complete.design_sha256,await shaFile(P+'design.json'));
const report={status:'independent_seven_route_endpoint_and_path_check_pass',manifest_sha256:await shaFile(P+'source-manifest.json'),source_pins:Object.keys(manifest.files).length,exact_regeneration:true,connections:d.connections.map(c=>({name:c.name,source:c.source,destination:c.destination})),source_and_destination_existing_diodes_verified:14,straight_wire_shape_boundaries:14,positive_paths:timing.routes.length,negative_refusals:negatives,added_blocks:d.blocks.length,all_parent_evidence:complete,limitations:['Binds and reviews author full-parent/contact/power evidence; independently regenerates endpoints and declared directed positive paths.','Nominal route sums do not prove pulse transport or multi-clock setup, closure and held-level duration.','No native computation or complete GPU claim.'],native_acceptance:false};
writeFileSync(new URL('independent-checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,pins:report.source_pins,positive_paths:7,negative_refusals:negatives}));
