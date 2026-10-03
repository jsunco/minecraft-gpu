// Bounded endpoint/upper-adapter peer review. Does not regenerate master geometry.
import assert from 'node:assert/strict';
import {readFileSync,createReadStream,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const B='artifacts/full-gpu-layout-v1/master-lsu-read-data-routes-v1/',R='artifacts/full-gpu-layout-v1/';
const read=p=>JSON.parse(readFileSync(p)),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
async function hash(p){const h=createHash('sha256');for await(const b of createReadStream(p))h.update(b);return h.digest('hex');}
const manifest=read(B+'source-manifest.json');
assert.equal(await hash(B+'source-manifest.json'),'ee225b262ddca2aa7bd5191ebf6c982d37a11ed074614f667ca8e39d778e3ba5');
for(const[p,h]of Object.entries(manifest.files))assert.equal(await hash(p),h,p);
const d=read(B+'design.json'),core=read(R+'control-reset-master-compatible-v3/design.json'),mem=read(R+'memory/consumer-return-v1/ports.json').ports;
const m=new Map(d.blocks.map(v=>[K(v.position),v.block])),cm=new Map(core.blocks.map(v=>[K(v.position),v.block]));
const V={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},add=(a,b,n=1)=>P(a.x+b.x*n,a.y+b.y*n,a.z+b.z*n),up=p=>add(p,P(0,1,0));
const local=(p,c)=>P(p.x+400,p.y,p.z+1552+1520*c),same=(a,b)=>assert.deepEqual(a,b);
const at=(p,c)=>m.get(K(p))??cm.get(K(local(p,c)));
let fromWest=0,fromSouth=0;
function check(c,world=m){
 assert.equal(c.consumer,4*c.core+c.lane);assert(c.core>=0&&c.core<2&&c.lane>=0&&c.lane<4&&c.bit>=0&&c.bit<8);
 same(c.source,mem.read_data.positions[8*c.consumer+c.bit]);same(local(c.destination,c.core),core.ports.lsus[c.lane].read_data.bits[c.bit].position);
 assert.equal(c.source_bit,8*c.consumer+c.bit);assert.equal(c.destination_bit,c.bit);assert.equal(c.source_port,'read_data');assert.equal(c.destination_port,`lane${c.lane}.lsu.read_data`);
 assert.equal(c.source_instance,'loader');assert.equal(c.destination_instance,'core'+c.core);
 const tap=world.get(K(c.source_normalizer));assert.equal(tap?.id,'minecraft:repeater');assert.equal(tap.properties.delay,'1');assert.equal(tap.properties.facing,'west');same(add(c.source_normalizer,V.west,-1),c.source);
 const n=world.get(K(c.normalizer));assert.equal(n?.id,'minecraft:repeater');assert.equal(n.properties.delay,'1');const v=V[n.properties.facing];assert(v);
 same(add(c.normalizer,v),c.injection_support);same(add(c.normalizer,v,-1),c.rear_solid);same(up(c.rear_solid),c.input_wire);same(up(c.destination),c.injection_support);
 assert.equal(world.get(K(c.rear_solid))?.id,'minecraft:light_gray_concrete');assert.equal(world.get(K(c.injection_support))?.id,'minecraft:light_gray_concrete');assert.equal(world.get(K(c.input_wire))?.id,'minecraft:redstone_wire');
 assert.equal(world.get(K(add(c.normalizer,P(0,-1,0))))?.id,'minecraft:light_gray_concrete');
 const destLocal=local(c.destination,c.core);assert.equal(cm.get(K(destLocal))?.id,'minecraft:redstone_wire');
 // The original receiver remains eastward. Its block is outside the delta.
 const oldReceiver=add(c.destination,V.west);assert.equal(cm.get(K(local(oldReceiver,c.core)))?.id,'minecraft:repeater');assert.equal(cm.get(K(local(oldReceiver,c.core))).properties.facing,'west');assert(!world.has(K(oldReceiver)));
 // The upper output solid has one declared dust sink, directly below.
 const dust=[];for(const a of[...Object.values(V),P(0,1,0),P(0,-1,0)]){const q=add(c.injection_support,a);if(at(q,c.core)?.id==='minecraft:redstone_wire')dust.push(q);}
 same(dust,[c.destination]);
 for(const side of Object.values(V).filter(a=>a.x*v.x+a.z*v.z===0)){const b=at(add(c.normalizer,side),c.core);assert(!b||b.id.endsWith('_concrete'),'Side drive');}
 return n.properties.facing;
}
for(const c of d.connections){const f=check(c);if(f==='west')fromWest++;else{assert.equal(f,'south');fromSouth++;}}
assert.equal(d.connections.length,64);assert.equal(new Set(d.connections.map(c=>c.consumer+'/'+c.bit)).size,64);assert.equal(fromWest,62);assert.equal(fromSouth,2);
let negatives=0;
for(const mutate of[c=>c.consumer=(c.consumer+1)%8,c=>c.source_bit++,c=>c.destination_bit++,c=>c.source.z+=8,c=>c.destination.y+=4,c=>c.destination_port='lane0.lsu.write_data',c=>c.input_wire.y--,c=>c.rear_solid.x--]){const c=structuredClone(d.connections[0]);mutate(c);assert.throws(()=>check(c));negatives++;}
for(const c of [d.connections[0],d.connections.find(c=>m.get(K(c.normalizer)).properties.facing==='south')]){const w=new Map(m);w.set(K(c.normalizer),{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});assert.throws(()=>check(c,w));negatives++;}
const sha=await hash(B+'design.json'),power=read(B+'power-checks.json'),parents=read(B+'all-parent-checks.json'),repair=read(B+'repair-comparison.json');
assert.equal(power.design_sha256,sha);assert.equal(parents.design_sha256,sha);assert.equal(repair.after_design_sha256,sha);
assert.equal(power.new_strong_solid_to_parent_paths,64);assert.equal(power.all_six_face_strong_paths_to_new_dust,64);assert(power.all_new_dust_paths_are_named_column_tops);
const paths=power.exact_declared_strong_solid_injections.map(p=>p.map(q=>q.join(',')).join('>')).sort();same(paths,d.connections.map(c=>[c.normalizer,c.injection_support,c.destination].map(K).join('>')).sort());
for(const p of repair.former_bad_paths)assert(!m.has(p[2].join(',')));assert.equal(repair.former_bad_paths.length,3);assert.equal(repair.changed_path_count,45);
assert.equal(parents.parent_delta_collisions,0);assert.equal(parents.parent_cells,9484648);
const out={status:'bounded_independent_read_data_endpoint_adapter_review_pass',source_pins_verified:Object.keys(manifest.files).length,consumer_bit_contracts:64,old_receivers_preserved:64,east_source_isolators:64,upper_adapters:{from_west:fromWest,from_south:fromSouth},negative_refusals:negatives,former_bad_dust_positions_absent:3,author_geometry_power_and_parent_reports_hash_bound:true,whole_parent_screen_repeated:false,native_acceptance:false};
writeFileSync(B+'independent-checks.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
