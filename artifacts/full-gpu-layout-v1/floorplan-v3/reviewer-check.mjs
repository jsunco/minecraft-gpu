// Bounded independent frame contract / neighborhood proof check. No native calls.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),load=f=>JSON.parse(readFileSync(new URL(f,H))),sha=f=>createHash('sha256').update(readFileSync(new URL(f,H))).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
assert.equal(sha('source-manifest.json'),'a5765a161bdcdc12a766f4dce8bc8309f2ad0c22859a2fcac8157b7f69367602');
const f=load('frame-config.json'),ports=load('ports.json'),ledger=load('connections.json'),report=load('composition-checks.json'),pins=load('source-manifest.json').files;
assert.equal(Object.keys(pins).length,930);assert.equal(report.total_blocks,6052812);assert.equal(ledger.routed_bit_connections,46);assert.equal(ledger.advertised_unique_endpoints_checked,686);assert.equal(ledger.complete_gpu_layout,false);assert.equal(ports.final_core_reset_ack,null);
assert.equal(f.instances.loader.manifest_sha256,'a0a5fb2ebcf50d554d24d1da66c2f52a6daa2d55ba26d657a40004356e9fd9b0');
for(let i=0;i<2;i++) { const p=ports.instances['core'+i].core_done.bits[0].position,t=f.instances['core'+i].translation;assert.deepEqual(p,{x:185+t.x,y:41+t.y,z:-160+t.z});const n=ledger.nets.find(n=>n.name==='dispatch_done_'+i);assert.deepEqual(n.driver.positions,[p]);assert.equal(n.routed_bits,0); }
const connections=[];for(const d of Object.values(f.route_deltas)){assert.deepEqual(d.translation,{x:0,y:0,z:0});const data=JSON.parse(readFileSync(d.path));assert.equal(createHash('sha256').update(readFileSync(d.path)).digest('hex'),pins[d.path]);connections.push(...data.connections);}
assert.equal(connections.length,46);assert.equal(new Set(connections.map(c=>c.name)).size,46);
let bound=0;for(const n of ledger.nets)for(const name of n.routed_connections){const c=connections.find(c=>c.name===name);assert(c);const bit=n.driver.positions.findIndex(p=>K(p)===K(c.source));assert(bit>=0);assert.equal(K(n.sink.positions[bit]),K(c.destination));assert.equal(n.driver.instance,c.source_instance);assert.equal(n.sink.instance,c.destination_instance);bound++;}assert.equal(bound,46);
for(const c of report.parent_replacement_route_neighborhoods){assert.equal(c.changed_route_neighborhood_cells,0);assert.equal(c.old_route_neighborhood,c.new_route_neighborhood);}assert.deepEqual(report.parent_replacement_route_neighborhoods.map(c=>c.old_route_neighborhood),[1392,1252,1274]);
for(const c of [...report.cross_module_checks,...report.cross_delta_checks])assert.equal(c.near_pairs??c.near_previous_delta_pairs,0);
// Exhaustive one-axis bucket implication, including negative boundaries. The
// Cartesian product yields the checker's complete 27-bucket 3D neighborhood.
let closePairs=0;for(let a=-40;a<=40;a++)for(let b=-40;b<=40;b++)if(Math.abs(a-b)<=3){assert(Math.abs(Math.floor(a/4)-Math.floor(b/4))<=1);closePairs++;}
// Independently test the pair-region pruning for disjoint, touching and nested
// interval envelopes. Any possible actual near pair must be in the clipped region.
let regionPairs=0;for(let a0=-8;a0<=8;a0++)for(let a1=a0;a1<=8;a1++)for(let b0=-8;b0<=8;b0++)for(let b1=b0;b1<=8;b1++){const lo=Math.max(a0,b0)-3,hi=Math.min(a1,b1)+3;for(let a=a0;a<=a1;a++)for(let b=b0;b<=b1;b++)if(Math.abs(a-b)<=3){assert(lo<=hi&&a>=lo&&a<=hi&&b>=lo&&b<=hi);regionPairs++;}}
const out={status:'independent_bounded_frame_contract_pass',source_manifest_sha256:sha('source-manifest.json'),source_pins:930,actual_route_bindings:bound,held_done_bindings:2,missing_architectural_reset_ack:true,consumer_returns_not_admitted:true,bucket_near_pairs:closePairs,interval_pruning_near_pairs:regionPairs,full_sparse_replay_repeated:false,native_acceptance:false};
if(process.argv.includes('--save'))writeFileSync(new URL('reviewer-check.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
