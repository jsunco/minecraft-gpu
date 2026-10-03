// Bounded independent source/endpoint/directed-route review. No parent generation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {decodeSlice} from '../floorplan-v3/obstacles.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),F={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)};
const d=read('design.json'),ledger=read('../floorplan-v3/connections.json'),obs=read('obstacles.json'),m=new Map([...decodeSlice(obs)].map(v=>[K(v.position),v.block]));
const before=m.size;for(const b of d.blocks){assert(!m.has(K(b.position)));m.set(K(b.position),b.block);}assert.equal(d.blocks.length,39878);assert.equal(d.connections.length,4);assert.equal(d.columns.length,3);
const diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id),graph=new Map();let directed=0;
function edge(a,b){assert(m.has(K(a))&&m.has(K(b)));const ab=m.get(K(a)),bb=m.get(K(b));if(diode(ab))assert.deepEqual(A(a,F[ab.properties.facing]),b,'reversed output '+K(a));if(diode(bb))assert.deepEqual(A(a,F[bb.properties.facing]),b,'not diode rear '+K(b));let s=graph.get(K(a));if(!s)graph.set(K(a),s=new Set());s.add(K(b));directed++;}
for(const e of d.edges)edge(e.from,e.to);
for(const c of d.columns){assert.equal((c.output_y-c.bottom)%4,1);for(let y=c.bottom;y<c.output_y;y++)assert.equal(m.get(K(P(c.x,y,c.z))).id,(y-c.bottom)%2?'minecraft:redstone_torch':'minecraft:light_gray_concrete');assert.equal(m.get(K(P(c.x,c.output_y,c.z))).id,'minecraft:redstone_wire');edge(P(c.x,c.bottom,c.z),P(c.x,c.output_y,c.z));}
function reaches(src,dst){const q=[K(src)],seen=new Set(q);for(let i=0;i<q.length;i++){if(q[i]===K(dst))return true;for(const k of graph.get(q[i])??[])if(!seen.has(k)){seen.add(k);q.push(k);}}return false;}

const S='minecraft:light_gray_concrete',W='minecraft:redstone_wire',R='minecraft:repeater',T='minecraft:redstone_torch',WT='minecraft:redstone_wall_torch';
function sources(p){const out=[];for(const v of Object.values(F)){const q=P(p.x-v.x,p.y,p.z-v.z),b=m.get(K(q));if(b?.id===W||diode(b)&&K(A(q,F[b.properties.facing]))===K(p))out.push(K(q));}const above=A(p,P(0,1,0)),below=A(p,P(0,-1,0));if(m.get(K(above))?.id===W)out.push(K(above));if([T,WT].includes(m.get(K(below))?.id))out.push(K(below));return out.sort();}
for(const c of d.connections){
 const e=ledger.nets.find(v=>v.name===c.name);assert(e);const i=Number(c.name.at(-1)),permit=c.name.startsWith('core_normal');assert.equal(c.source_instance,e.driver.instance);assert.equal(c.destination_instance,`core${i}`);assert.equal(c.source_port,e.driver.port);assert.equal(c.destination_port,e.sink.port);assert.deepEqual(c.source,e.driver.positions[0]);assert.deepEqual(c.destination,e.sink.positions[0]);
 assert.deepEqual(c.source,permit?P(-555,-46,550):P(-981+4*i,-47,845));assert.deepEqual(c.destination,permit?P(-542,1,-1552-1520*i):P(-758,77,-1737-1520*i));
 assert.deepEqual(c.source_normalizer,A(c.source,P(0,0,permit?-1:1)));assert.equal(m.get(K(c.source_normalizer)).properties.facing,permit?'south':'north');assert(reaches(c.source,c.destination));
 assert.equal(m.get(K(c.destination)).id,W);assert.equal(m.get(K(A(c.destination,P(1,0,0)))).properties.facing,'west');
 if(permit){
  assert.equal(c.arrival_kind,'upper_solid_adapter');assert.deepEqual(c.normalizer,A(c.destination,P(0,1,-1)));assert.equal(m.get(K(c.normalizer)).properties.facing,'north');
  assert.deepEqual(c.rear_solid,A(c.destination,P(0,1,-2)));assert.deepEqual(c.input_wire,A(c.rear_solid,P(0,1,0)));assert.deepEqual(c.injection_support,A(c.destination,P(0,1,0)));
  assert.equal(m.get(K(c.rear_solid)).id,S);assert.equal(m.get(K(c.injection_support)).id,S);assert.deepEqual(sources(c.rear_solid),[K(c.input_wire)]);assert.deepEqual(sources(c.injection_support),[K(c.normalizer)]);
  assert.equal(m.get(K(A(c.rear_solid,P(0,-1,0)))).id,W); // unrelated old reset wire exists but is not an upward source
 }else{
  assert.equal(c.destination_port,'reset_barrier.program_quiet');assert.deepEqual(c.normalizer,A(c.destination,P(0,0,1)));assert.equal(m.get(K(c.normalizer)).properties.facing,'south');assert.deepEqual(A(c.normalizer,F.south),c.destination);
 }
}

let negatives=0;for(const c of d.connections){const r=m.get(K(c.normalizer));const wrong={...r,properties:{...r.properties,facing:r.properties.facing==='north'?'south':'north'}};const target=c.injection_support??c.destination;assert.throws(()=>assert.deepEqual(A(c.normalizer,F[wrong.properties.facing]),target));negatives++;assert.throws(()=>assert.deepEqual({...c.source,x:c.source.x+1},ledger.nets.find(v=>v.name===c.name).driver.positions[0]));negatives++;}
for(const c of d.connections.filter(v=>v.input_wire)){const original=m.get(K(c.input_wire));m.delete(K(c.input_wire));assert.deepEqual(sources(c.rear_solid),[]);m.set(K(c.input_wire),original);negatives++;}
const report={status:'bounded_offline_core_service_route_review_pass',new_cells:d.blocks.length,obstacle_slice_cells:before,actual_connections:4,directed_edges_checked:directed,positive_columns:3,endpoint_and_source_negatives:negatives,source_kind:'held normal permission and actual conservative program quiet',upper_adapters:2,native_acceptance:false,full_parent_replay_performed:false};console.log(JSON.stringify(report));if(process.argv.includes('--save'))writeFileSync(new URL('reviewer-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
