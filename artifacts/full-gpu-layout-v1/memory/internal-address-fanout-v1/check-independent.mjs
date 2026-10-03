// Bounded independent retained-field and typed pair-adapter audit. No native API.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
const H=new URL('.',import.meta.url),ROOT=new URL('../../../../',H),load=u=>JSON.parse(readFileSync(u)),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
async function hash(u){const h=createHash('sha256');for await(const b of createReadStream(u))h.update(b);return h.digest('hex');}
const manifest=load(new URL('source-manifest.json',H));assert.equal(await hash(new URL('source-manifest.json',H)),'9324ba447cd7195edecd67ceab413584e2fc583e1e4e708f847d845f560d24ef');
for(const[p,h]of Object.entries(manifest.source_sha256))assert.equal(await hash(new URL(p,ROOT)),h,p);
let d=load(new URL('design.json',H));const sources=d.address_sources,adapters=d.address_adapters,bindings=d.address_bindings,metrics=d.metrics;
// Restrict the independent map to real endpoint neighborhoods, not the large route graph.
const wanted=new Set();for(const q of[...sources.map(s=>s.source),...adapters.map(a=>a.solid)])for(let x=-3;x<=51;x++)for(let z=-2;z<=2;z++)for(let y=-3;y<=2;y++)wanted.add(K(P(q.x+x,q.y+y,q.z+z)));
const cells=new Map(d.blocks.filter(v=>wanted.has(K(v.position))).map(v=>[K(v.position),v.block]));d=null;
let payload=load(new URL('../channel-payload-v1/design.json',H));const fields=payload.fields.map(f=>f.name),held=payload.ports.payload.positions;payload=null;
const at=(p,m=cells)=>m.get(K(p)),id=(p,v,m=cells)=>assert.equal(at(p,m)?.id,'minecraft:'+v,K(p));
function source(s){const f=fields.indexOf('address'+s.bit);assert(f>=0);assert.deepEqual(s.source,held[17*s.channel+f]);assert.deepEqual(s.tap,P(s.source.x-1,s.source.y,s.source.z));id(s.source,'redstone_wire');id(s.tap,'repeater');assert.equal(at(s.tap).properties.facing,'east');}
function pair(a,m=cells){const x=220+432*(a.bank%2),y=-28+4*a.channel,z=834+622*Math.floor(a.bank/2)+8*a.bit;
 for(const[n,p]of Object.entries({solid:P(x,y,z),driver:P(x+1,y,z),read:P(x,y,z-1),write:P(x,y,z+1),input:P(x+50,y-2,z)}))assert.deepEqual(a[n],p,n);
 id(a.solid,'light_gray_concrete',m);id(a.driver,'repeater',m);assert.equal(at(a.driver,m).properties.facing,'east');assert.equal(at(a.driver,m).properties.delay,'1');id(P(x+1,y-1,z),'light_gray_concrete',m);
 id(P(x+2,y,z),'redstone_wire',m);id(P(x+3,y-1,z),'redstone_wire',m);id(P(x+4,y-2,z),'redstone_wire',m);
 for(const p of[a.read,a.write]){id(p,'redstone_wire',m);id(P(x-1,y,p.z),'repeater',m);assert.equal(at(P(x-1,y,p.z),m).properties.facing,'east');id(P(x-2,y,p.z),'comparator',m);assert.equal(at(P(x-2,y,p.z),m).properties.facing,'east');assert.equal(at(P(x-2,y,p.z),m).properties.mode,'subtract');}
 // The old powered rail floors are above isolated diodes, not wire which
 // would receive their weak power. The diode's actual rear is horizontal.
 assert.deepEqual(a.underpasses,[P(x+6,y-2,z),P(x+14,y-2,z)]);
 for(const p of a.underpasses){id(p,'repeater',m);assert.equal(at(p,m).properties.facing,'east');id(P(p.x,p.y+1,p.z),'light_gray_concrete',m);}
}
assert.equal(sources.length,32);assert.equal(adapters.length,128);assert.equal(bindings.length,128);
const seen=new Set();for(const s of sources){assert(!seen.has(s.channel+'/'+s.bit));seen.add(s.channel+'/'+s.bit);source(s);}assert.equal(seen.size,32);
const expectedPaths=new Set();for(const a of adapters){pair(a);const b=bindings.find(b=>b.bank===a.bank&&b.channel===a.channel&&b.bit===a.bit);assert(b);const s=sources.find(s=>s.channel===a.channel&&s.bit===a.bit);assert.deepEqual(b.source,s.source);assert.deepEqual(b.tap,s.tap);assert.deepEqual(b.destination,a.input);for(const n of['solid','driver','read','write'])assert.deepEqual(b[n],a[n]);for(const p of[a.read,a.write])expectedPaths.add([K(a.driver),K(a.solid),K(p)].join('|'));}
const power=load(new URL('power-checks.json',H)),paths=new Set(power.new_strong_wire_paths.map(v=>v.map(p=>p.join(',')).join('|')));assert.deepEqual(paths,expectedPaths);assert.equal(paths.size,256);
let negatives=0;function rejects(f){assert.throws(f);negatives++;}
for(let c=0;c<4;c++){const s=sources.find(s=>s.channel===c&&s.bit===0);rejects(()=>source({...s,bit:1}));rejects(()=>source({...s,source:{...s.source,z:s.source.z+8}}));const a=adapters.find(a=>a.channel===c);const m=new Map(cells);m.set(K(a.driver),{...at(a.driver),properties:{...at(a.driver).properties,facing:'west'}});rejects(()=>pair(a,m));rejects(()=>pair({...a,write:{...a.write,z:a.write.z+1}}));}
const report={status:'independently_checked_retained_fields_and_pair_adapters',pins:Object.keys(manifest.source_sha256).length,retained_source_fields:32,source_to_bank_bindings:128,typed_read_write_recipients:256,exact_reported_strong_paths:256,negative_refusals:negatives,metrics,scope:'Endpoint neighborhoods and saved electrical proof inspected; full route graph and 2.7M-cell power replay not repeated.',native_acceptance:false};
writeFileSync(new URL('independent-checks.json',H),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
