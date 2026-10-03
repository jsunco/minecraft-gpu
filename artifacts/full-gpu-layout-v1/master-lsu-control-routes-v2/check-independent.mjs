// Bounded peer check: contracts, endpoint devices and exact repair accounting.
// Author whole-parent/electrical reports are bound, not regenerated here.
import assert from 'node:assert/strict';
import {readFileSync,createReadStream,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const B='artifacts/full-gpu-layout-v1/master-lsu-control-routes-v2/',R='artifacts/full-gpu-layout-v1/';
const read=p=>JSON.parse(readFileSync(p)),K=p=>`${p.x},${p.y},${p.z}`;
async function hash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
const manifest=read(B+'source-manifest.json');
assert.equal(await hash(B+'source-manifest.json'),'e6dc44c39340bccd63111b0dd1b231c6da56097f9f8010d536d6cc36f11e6de7');
for(const[p,h]of Object.entries(manifest.files))assert.equal(await hash(p),h,p);
const d=read(B+'design.json'),old=read(R+'master-lsu-control-routes-v1/design.json'),report=read(B+'repair-comparison.json');
const core=read(R+'control-reset-master-compatible-v2/design.json');
const mem=read(R+'memory/consumer-return-v1/ports.json').ports;
const m=new Map(d.blocks.map(v=>[K(v.position),v])), cm=new Map(core.blocks.map(v=>[K(v.position),v]));
const D={east:{x:-1,y:0,z:0},west:{x:1,y:0,z:0},south:{x:0,y:0,z:-1},north:{x:0,y:0,z:1}};
const step=(p,v,n=1)=>({x:p.x+n*v.x,y:p.y+n*v.y,z:p.z+n*v.z});
const local=(p,c)=>({x:p.x+400,y:p.y,z:p.z+1552+1520*c});
function checkConnection(c){
 const prior=old.connections.find(v=>v.name===c.name);assert.deepEqual(c,prior);
 assert.equal(c.consumer,4*c.core+c.lane);const valid=c.type.endsWith('valid');
 const port=core.ports.lsus[c.lane][c.type];assert(port,c.type);
 const corePosition=port.bits[0].position;
 assert.deepEqual(local(valid?c.source:c.destination,c.core),corePosition);
 assert.equal(cm.get(K(corePosition))?.block.id,'minecraft:redstone_wire');
 const memoryName=c.type==='drained'?'consumer_drained':c.type;
 assert.deepEqual((valid?c.destination:c.source),mem[memoryName].positions[c.consumer]);
 assert.equal(c.source_bit,valid?0:c.consumer);assert.equal(c.destination_bit,valid?c.consumer:0);
 assert.equal(c.source_port,valid?c.type:memoryName);assert.equal(c.destination_port,c.type);
 for(const[p,q,isSource]of [[c.source_normalizer,c.source,true],[c.normalizer,c.destination,false]]){
  const v=m.get(K(p));assert.equal(v?.block.id,'minecraft:repeater');assert.equal(v.block.properties.delay,'1');
  assert.deepEqual(step(p,D[v.block.properties.facing],isSource?-1:1),q);
  assert.equal(m.get(K({...p,y:p.y-1}))?.block.id,'minecraft:light_gray_concrete');
 }
}
for(const c of d.connections)checkConnection(c);assert.equal(d.connections.length,40);
assert.equal(new Set(d.connections.map(c=>c.consumer+'/'+c.type)).size,40);
let negatives=0;for(const mutate of[c=>{c.consumer=(c.consumer+1)%8;},c=>{c.source_bit++;},c=>{c.destination.z++;},c=>{c.type=c.type==='drained'?'read_ready':'drained';}]){const c=structuredClone(d.connections[0]);mutate(c);assert.throws(()=>checkConnection(c));negatives++;}
const oldM=new Map(old.blocks.map(v=>[K(v.position),v]));let equal=0;
for(const[k,v]of oldM)if(JSON.stringify(m.get(k))===JSON.stringify(v))equal++;
assert.equal(equal,report.exact_preserved_records);assert.equal(old.blocks.length-equal,report.removed_or_replaced_old_records);assert.equal(d.blocks.length-equal,report.new_or_replaced_records);
const changed=(a,b)=>a.filter(v=>JSON.stringify(v)!==JSON.stringify(b.find(o=>o.name===v.name))).map(v=>v.name);
assert.deepEqual(changed(d.routes,old.routes),report.changed_routes);assert.deepEqual(changed(d.descents,old.descents),report.changed_descents);
assert.equal(report.changed_routes.length,42);assert.equal(report.changed_descents.length,18);
const conflicts=read(B+'before-repair-collisions.json').collisions;assert.equal(conflicts.length,73);
for(const c of conflicts){assert(oldM.has(K(c.position)));assert(!m.has(K(c.position)),'Old conflicting cell remains');}
const cfg=read(B+'parents.json');for(const v of d.blocks)assert(!cfg.planning_keepouts.some(b=>['x','y','z'].every(a=>v.position[a]>=b[a][0]&&v.position[a]<=b[a][1])));
const sha=await hash(B+'design.json');for(const n of ['all-parent-checks.json','power-checks.json'])assert.equal(read(B+n).design_sha256,sha);
const power=read(B+'power-checks.json');assert.equal(power.new_strong_solid_to_parent_paths,0);assert.equal(power.all_six_face_strong_paths_to_new_dust,40);assert(power.all_new_dust_paths_are_named_column_tops);
const result={status:'bounded_independent_endpoint_and_repair_checks_pass',source_pins_verified:Object.keys(manifest.files).length,endpoint_contracts:40,source_and_arrival_normalizers:80,negative_contract_cases:negatives,exact_preserved_records:equal,original_collision_cells_removed:73,changed_routes:42,changed_descents:18,author_whole_parent_and_electrical_reports_hash_bound:true,whole_parent_geometry_repeated:false,native_acceptance:false};
writeFileSync(B+'independent-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
