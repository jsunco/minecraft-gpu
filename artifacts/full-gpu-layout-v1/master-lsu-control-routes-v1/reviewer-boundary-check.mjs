// Independent bounded review: exact consumer role matrix and actual directed paths.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeSlice} from '../floorplan-v3/obstacles.mjs';
const H=new URL('.',import.meta.url),read=p=>JSON.parse(readFileSync(p)),K=p=>`${p.x},${p.y},${p.z}`;
async function sha(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');}
const manifestPath=new URL('source-manifest.json',H),manifestHash=await sha(manifestPath);assert.equal(manifestHash,'df0c63a0d771539dcad2a74e419c6eda94de04c88b123ddb8d627c846d683d34');const manifest=read(manifestPath);for(const[p,h]of Object.entries(manifest.files))assert.equal(await sha(p),h,p);
const designPath=new URL('design.json',H),d=read(designPath),ledger=read(new URL('../floorplan-v3/connections.json',H)),ret=read(new URL('../memory/consumer-return-v1/ports.json',H)).ports,obs=read(d.obstacle_path),m=new Map([...decodeSlice(obs)].map(v=>[K(v.position),v.block]));for(const v of d.blocks){assert(!m.has(K(v.position)));m.set(K(v.position),v.block);}
const expected=new Map();for(let consumer=0;consumer<8;consumer++){const core=Math.floor(consumer/4),lane=consumer%4,prefix=`gpu/core${core}/lane${lane}/lsu`;for(const type of['read_valid','write_valid','read_ready','write_ready','drained']){const outgoing=type.endsWith('valid'),memtype=type==='drained'?'consumer_drained':type,name=outgoing?`${prefix}.${type}->gpu/data_memory.${type}`:`gpu/data_memory.${memtype}->${prefix}.${type}`,n=ledger.nets.find(n=>n.name===name);assert(n);expected.set(consumer+'/'+type,{source:type.endsWith('ready')?ret[type].positions[consumer]:n.driver.positions[0],destination:n.sink.positions[0],source_instance:outgoing?'core'+core:'loader',destination_instance:outgoing?'loader':'core'+core});}}
function roles(connections){assert.equal(connections.length,40);const seen=new Set();for(const c of connections){const key=c.consumer+'/'+c.type,e=expected.get(key);assert(e&&!seen.has(key),'Missing/duplicate consumer role');seen.add(key);for(const p of['source','destination','source_instance','destination_instance'])assert.deepEqual(c[p],e[p],c.name+' '+p);assert.equal(c.core,Math.floor(c.consumer/4));assert.equal(c.lane,c.consumer%4);}}
roles(d.connections);
const graph=new Map(),edge=(a,b)=>{assert(m.has(K(a))&&m.has(K(b)));if(!graph.has(K(a)))graph.set(K(a),new Set());graph.get(K(a)).add(K(b));};let slopeChecks=0;
for(const e of d.edges){edge(e.from,e.to);if(m.get(K(e.from)).id==='minecraft:redstone_wire'&&m.get(K(e.to)).id==='minecraft:redstone_wire'){const a=e.from,b=e.to;assert.equal(Math.abs(a.x-b.x)+Math.abs(a.z-b.z),1);assert(Math.abs(a.y-b.y)<=1);if(a.y!==b.y){const low=a.y<b.y?a:b;assert(!m.has(K({...low,y:low.y+1})),'Blocked actual dust step '+K(low));slopeChecks++;}}}
for(const c of d.columns){assert.equal((c.output_y-c.bottom)%4,1);for(let y=c.bottom;y<c.output_y;y++){const p={x:c.x,y,z:c.z};assert.equal(m.get(K(p)).id,'minecraft:'+((y-c.bottom)%2===0?'light_gray_concrete':'redstone_torch'));edge(p,{...p,y:y+1});}}
for(const c of d.connections){const seen=new Set([K(c.source)]),todo=[K(c.source)];for(const p of todo)for(const q of graph.get(p)??[])if(!seen.has(q)){seen.add(q);todo.push(q);}assert(seen.has(K(c.destination)),c.name);}
let negatives=0;for(const mutate of[
 cs=>{cs[0]={...cs[0],consumer:(cs[0].consumer+1)%8};},
 cs=>{const c=cs.find(c=>c.type==='read_ready');c.source={...c.source,z:410};},
 cs=>{const c=cs.find(c=>c.type==='write_ready');c.source={...c.source,z:402};},
 cs=>{cs.pop();},
 cs=>{cs[0]={...cs[1]};},
 cs=>{const c=cs.find(c=>c.type==='read_valid');c.source={...c.source,y:c.source.y+4};},
 cs=>{const c=cs.find(c=>c.type==='drained');c.destination={...c.destination,z:c.destination.z+1};},
 cs=>{cs[0].source_instance='global';}
]){const cs=d.connections.map(c=>({...c}));mutate(cs);assert.throws(()=>roles(cs));negatives++;}
const sources={'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v1/source-manifest.json':manifestHash,'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v1/design.json':await sha(designPath),'artifacts/full-gpu-layout-v1/master-lsu-control-routes-v1/reviewer-boundary-check.mjs':await sha(new URL('reviewer-boundary-check.mjs',H))};
const out={status:'independent_bounded_LSU_handshake_boundary_review_pass',source_sha256:sources,component_source_pins_verified:Object.keys(manifest.files).length,consumer_role_bindings:40,independent_consumers:8,roles_per_consumer:5,actual_directed_paths:40,positive_columns:d.columns.length,actual_dust_steps_checked:slopeChecks,negative_refusals:negatives,complete_gpu_layout:false,native_acceptance:false,world_mutations:0,limits:['Exact source/destination roles and declared actual paths reviewed; this does not repeat the complete author power/attenuation or complete-parent screen.','Shared global/bank quiet is not substituted for per-consumer drained. READY read/write identity is checked independently.','No setup, held-data, asynchronous response timing or Minecraft behavior is established.']};writeFileSync(new URL('independent-review.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
