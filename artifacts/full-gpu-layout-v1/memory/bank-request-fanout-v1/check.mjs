import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeBankRequestFanout} from '../../../../hardware/memory-layout-bank-request-fanout.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const d=makeBankRequestFanout(),saved=read('design.json'),parent=read('../channel-typed-request-v1/design.json');
assert.equal(digest(d),digest(saved));
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),R='minecraft:repeater',W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',T='minecraft:redstone_torch';
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
assert.equal(m.size,d.blocks.length);
for(const v of parent.blocks)assert.deepEqual(m.get(K(v.position)),v.block);
assert.deepEqual(d.quiet,parent.quiet);assert.deepEqual(d.banks,parent.banks);assert.deepEqual(d.ports,parent.ports);
assert.equal(d.bindings.length,32);assert.equal(new Set(d.bindings.map(b=>`${b.bank}/${b.channel}/${b.kind}`)).size,32);
function binding(b){
 const kind=b.kind==='write_valid'?1:0;assert(['read_valid','write_valid'].includes(b.kind));
 assert.deepEqual(b.source,parent.ports.typed_bank_request.positions[2*b.channel+kind]);
 assert.deepEqual(b.destination,parent.banks[b.bank].ports[b.kind].positions[b.channel]);
 assert.deepEqual(b.driver,P(b.destination.x+(kind?1:-1),b.destination.y,b.destination.z));
 assert.deepEqual(m.get(K(b.driver)),{id:R,properties:{facing:kind?'east':'west',delay:'1'}});
 assert.equal(m.get(K(b.destination))?.id,W);assert.equal(d.nets[K(b.driver)],parent.nets[K(b.source)]);
}
for(const b of d.bindings)binding(b);
function column(c){assert.equal((c.hi-c.lo)%4,0);for(let y=c.lo;y<=c.hi;y++)assert.equal(m.get(K(P(c.x,y,c.z)))?.id,(y-c.lo)%2?T:S);}
for(const c of d.columns)column(c);assert.equal(d.columns.length,32);
function route(r){for(let i=0;i<r.path.length;i++){const p=r.path[i],v=m.get(K(p));assert(v,'missing route '+r.name+' '+K(p));assert.equal(d.nets[K(p)],r.net);if(v.id===R){assert(i>0&&i<r.path.length-1);const t=D[v.properties.facing];assert.deepEqual(r.path[i-1],P(p.x-t.x,p.y,p.z-t.z));assert.deepEqual(r.path[i+1],P(p.x+t.x,p.y,p.z+t.z));assert.equal(v.properties.delay,'1');}else assert.equal(v.id,W);}}
for(const r of d.routes)route(r);
let negatives=0;
for(const b of d.bindings){const k=K(b.driver),old=m.get(k);m.set(k,{id:R,properties:{facing:old.properties.facing==='east'?'west':'east',delay:'1'}});assert.throws(()=>binding(b));m.set(k,old);negatives++;}
for(const c of d.columns){const k=K(P(c.x,c.lo+1,c.z)),old=m.get(k);m.delete(k);assert.throws(()=>column(c));m.set(k,old);negatives++;}
for(const r of d.routes){const k=K(r.path[1]),old=m.get(k);m.delete(k);assert.throws(()=>route(r));m.set(k,old);negatives++;}
const out={status:'offline_four_bank_valid_fanout_geometry_pass',...d.metrics,exact_regeneration:true,exact_parent_cells:parent.blocks.length,channels:4,banks:4,typed_valid_bindings:32,quiet_drivers_preserved:d.quiet.length,positive_columns:d.columns.length,recorded_route_cells:d.routes.reduce((n,r)=>n+r.path.length,0),corruptions_rejected:negatives,occupied_chunk_columns:new Set(d.blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)).size,complete_component_geometry:false,native_acceptance:false};
if(process.argv.includes('--save')){writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify(d.metrics,null,2)+'\n');writeFileSync(new URL('ports.json',import.meta.url),JSON.stringify({connections:d.bindings,missing:d.missing},null,2)+'\n');}
console.log(JSON.stringify(out));
