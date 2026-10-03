// Bounded independent source/endpoint/directed-route review. No parent generation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {decodeSlice} from '../floorplan-v3/obstacles.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),F={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};
const d=read('design.json'),ledger=read('../floorplan-v3/connections.json'),obs=read('obstacles.json'),m=new Map([...decodeSlice(obs)].map(v=>[K(v.position),v.block]));
const before=m.size;for(const b of d.blocks){assert(!m.has(K(b.position)));m.set(K(b.position),b.block);}assert.equal(d.blocks.length,37832);assert.equal(d.connections.length,4);assert.equal(d.columns.length,4);
const diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id),graph=new Map();let directed=0;
function edge(a,b){assert(m.has(K(a))&&m.has(K(b)));const ab=m.get(K(a)),bb=m.get(K(b));if(diode(ab))assert.deepEqual(A(a,F[ab.properties.facing]),b,'reversed output '+K(a));if(diode(bb))assert.deepEqual(A(a,F[bb.properties.facing]),b,'not diode rear '+K(b));let s=graph.get(K(a));if(!s)graph.set(K(a),s=new Set());s.add(K(b));directed++;}
for(const e of d.edges)edge(e.from,e.to);
for(const c of d.columns){assert.equal((c.output_y-c.bottom)%4,1);for(let y=c.bottom;y<c.output_y;y++)assert.equal(m.get(K(P(c.x,y,c.z))).id,(y-c.bottom)%2?'minecraft:redstone_torch':'minecraft:light_gray_concrete');assert.equal(m.get(K(P(c.x,c.output_y,c.z))).id,'minecraft:redstone_wire');edge(P(c.x,c.bottom,c.z),P(c.x,c.output_y,c.z));}
function reaches(src,dst){const q=[K(src)],seen=new Set(q);for(let i=0;i<q.length;i++){if(q[i]===K(dst))return true;for(const k of graph.get(q[i])??[])if(!seen.has(k)){seen.add(k);q.push(k);}}return false;}
for(const c of d.connections){
 const e=ledger.nets.find(v=>v.name===c.name);assert(e);const i=Number(c.name.at(-1)),warm=c.name.includes('warm_reset');assert.equal(c.source_instance,'global');assert.equal(c.destination_instance,`core${i}`);assert.equal(c.source_port,e.driver.port);assert.equal(c.destination_port,warm?'reset_request':'start_request');assert.deepEqual(c.source,e.driver.positions[0]);assert.deepEqual(c.destination,e.sink.positions[0]);
 assert.deepEqual(c.source,P(-507+8*i+(warm?4:0),105,555));assert.deepEqual(c.destination,warm?P(-836,77,-1737-1520*i):P(-676,57,-1677-1520*i));assert.deepEqual(c.source_normalizer,A(c.source,P(0,0,1)));assert.equal(m.get(K(c.source_normalizer)).properties.facing,'north');assert.deepEqual(A(c.source_normalizer,F.north),A(c.source,P(0,0,2)));
 assert.deepEqual(c.normalizer,A(c.destination,P(0,0,-1)));assert.equal(m.get(K(c.normalizer)).properties.facing,'north');assert.deepEqual(A(c.normalizer,F.north),c.destination);assert.equal(m.get(K(c.destination)).id,'minecraft:redstone_wire');
 const receiver=A(c.destination,P(1,0,0));assert.equal(m.get(K(receiver)).id,'minecraft:repeater');assert.equal(m.get(K(receiver)).properties.facing,'west');assert(reaches(c.source,c.destination));
 assert(!['local_reset_service','initialize','cold_initialize'].includes(c.destination_port));
}
let negatives=0;for(const c of d.connections){const r=m.get(K(c.normalizer));const wrong={...r,properties:{...r.properties,facing:'south'}};assert.throws(()=>assert.deepEqual(A(c.normalizer,F[wrong.properties.facing]),c.destination));negatives++;const shifted={...c.source,x:c.source.x+1};assert.throws(()=>assert.deepEqual(shifted,ledger.nets.find(v=>v.name===c.name).driver.positions[0]));negatives++;}
const report={status:'bounded_offline_core_command_route_review_pass',new_cells:d.blocks.length,obstacle_slice_cells:before,actual_connections:4,directed_edges_checked:directed,positive_columns:4,endpoint_negatives:negatives,source_kind:'actual qualified held launch/staged reset commands',native_acceptance:false,full_parent_replay_performed:false};console.log(JSON.stringify(report));if(process.argv.includes('--save'))writeFileSync(new URL('reviewer-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
