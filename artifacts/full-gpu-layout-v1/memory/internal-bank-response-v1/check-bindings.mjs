// Exact immutable-parent/source/consumer-index checks; no runtime evaluator.
import{readLargeDesign,parseLargeDesign}from'../../../../hardware/memory-layout-large-json-v2.mjs';import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
import{makeBankResponseCollector}from'../../../../hardware/memory-layout-bank-response-collector.mjs';
import{makeLiteralNetwork}from'../../../../hardware/full-gpu-literal-network.mjs';
import{makeSignalDescent}from'../../../../hardware/full-gpu-signal-descent.mjs';
const H=new URL('.',import.meta.url),read=f=>readLargeDesign(new URL(f,H)),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},sha=b=>createHash('sha256').update(b).digest('hex');

const bytes=readFileSync(new URL('../internal-write-fanout-v1/design.json',H));assert.equal(sha(bytes),'95905ba13a7732426b7dc1a982cf5a05f7986378d8949dc5c42144a428227c0d');const parent=parseLargeDesign(bytes),d=read('design.json');assert.equal(parent.blocks.length,d.metrics.parent_blocks);
for(let i=0;i<parent.blocks.length;i++)assert.deepEqual(d.blocks[i],parent.blocks[i]);
assert.deepEqual(d.ports,parent.ports);assert.deepEqual(d.preserved_interfaces,parent.preserved_interfaces);
for(const v of d.blocks.slice(parent.blocks.length)){const p=v.position;assert(!(p.x>=612&&p.x<=614&&p.y>=0&&p.y<=30&&p.z>=-8&&p.z<=52),'reserved raw external shared-write_data adapter');}
const m=new Map([...d.blocks,...d.external_obstacles].map(v=>[K(v.position),v.block]));assert.equal(m.size,d.blocks.length+d.external_obstacles.length);const seen=new Set();let bindings=0;
assert.equal(d.bank_response_bindings.length,80);const matrix=makeBankResponseCollector(),mo=d.bank_response_matrix.origin,T=p=>A(p,mo);
for(const v of matrix.blocks)assert.deepEqual(m.get(K(T(v.position))),v.block);
for(const [n,p]of Object.entries(matrix.ports))assert.deepEqual(d.bank_response_matrix.ports[n],{...p,positions:p.positions.map(T)});
const ledger=read('../internal-joins-v1/pending.json'),ready=read('../bank-ready-return-v1/ports.json');
for(const b of d.bank_response_bindings){
 if(b.kind==='bank_held_data'){const j=ledger.response_collections.find(j=>j.bank===b.bank&&j.channel===0&&j.bit===b.bit);assert.deepEqual(b.source,j.source);assert.deepEqual(b.destination,d.bank_response_matrix.ports.bank_read_data.positions[8*b.bank+b.bit]);}
 else if(b.kind==='actual_owned_bank_ready'){const j=ready.connections.find(j=>j.kind==='collector_input'&&j.channel===b.channel&&j.bank===b.bank);assert.deepEqual(b.source,j.destination);assert.deepEqual(b.destination,d.bank_response_matrix.ports.bank_channel_owned_ready.positions[4*b.channel+b.bank]);}
 else{assert.equal(b.kind,'qualified_backend_d');const j=ledger.response_collections.find(j=>j.channel===b.channel&&j.bit===b.bit);assert.deepEqual(b.destination,j.target_backend_input);assert.deepEqual(b.source,d.bank_response_matrix.ports.channel_response_d.positions[8*b.channel+b.bit]);}
 const id=[b.kind,b.channel??'',b.bank??'',b.bit??''].join('/');assert(!seen.has(id));seen.add(id);bindings++;
}
const sideEdges=new Set(d.bank_response_matrix.branches.map(b=>K(b.side)+'>'+K(b.gate)));
const graph=new Map(),diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id);let directed=0;
function edge(a,b){const ab=m.get(K(a)),bb=m.get(K(b));assert(ab&&bb);if(diode(ab))assert.deepEqual(A(a,D[ab.properties.facing]),b);if(diode(bb)&&!sideEdges.has(K(a)+'>'+K(b)))assert.deepEqual(A(a,D[bb.properties.facing]),b);let s=graph.get(K(a));if(!s)graph.set(K(a),s=new Set());s.add(K(b));directed++;}
for(const r of d.bank_response_routes){const refresh=new Set(r.refresh_indices);for(let i=0;i<r.path.length;i++)assert.equal(m.get(K(r.path[i])).id,refresh.has(i)?'minecraft:repeater':'minecraft:redstone_wire','declared refresh '+r.name+' '+i);}
for(const r of d.bank_response_routes)for(let i=1;i<r.path.length;i++){const a=r.path[i-1],b=r.path[i];if(a.y!==b.y){const low=a.y<b.y?a:b;assert(!m.has(K({...low,y:low.y+1})),'capped slope '+r.name);}edge(a,b);}
for(const t of d.bank_response_descents){const s=makeSignalDescent({drop:t.drop});for(const b of s.blocks)assert.deepEqual(m.get(K(A(b.position,t.origin))),b.block);for(let i=1;i<s.path.length;i++)edge(A(s.path[i-1],t.origin),A(s.path[i],t.origin));edge(t.output,t.normalizer);}
for(const t of d.bank_response_columns){assert.equal((t.hi-t.lo)%4,0);for(let y=t.lo;y<t.hi;y++)edge(P(t.x,y,t.z),P(t.x,y+1,t.z));}
// Join the actual route fragments only through directed rear/output cells.
for(const v of d.blocks.slice(parent.blocks.length)){if(!diode(v.block))continue;const p=v.position,f=D[v.block.properties.facing],rear=P(p.x-f.x,p.y,p.z-f.z),front=A(p,f);if(m.has(K(rear)))edge(rear,p);if(m.has(K(front))&&!diode(m.get(K(front))))edge(p,front);}

function reaches(b,destination=b.destination){const queue=[K(b.source)],seen=new Set(queue);for(let i=0;i<queue.length;i++){if(queue[i]===K(destination))return true;for(const q of graph.get(queue[i])??[])if(!seen.has(q)){seen.add(q);queue.push(q);}}return false;}
for(const b of d.bank_response_bindings)assert(reaches(b),'missing actual directed response connection '+JSON.stringify(b));
let negatives=0;for(const kind of ['bank_held_data','actual_owned_bank_ready','qualified_backend_d']){const b=d.bank_response_bindings.find(v=>v.kind===kind),p=b.arrival,v=m.get(K(p));m.set(K(p),{...v,properties:{...v.properties,facing:({east:'west',west:'east',north:'south',south:'north'})[v.properties.facing]}});assert.throws(()=>edge(p,b.destination));m.set(K(p),v);negatives++;assert.throws(()=>assert.deepEqual({...b.source,z:b.source.z+8},b.source));negatives++;}
const report={status:'offline_internal_bank_response_bindings_pass',parent_positions:parent.blocks.length,actual_held_bank_source_bits:32,actual_owned_ready_masks:16,actual_backend_D_recipients:32,directed_edges_checked:directed,endpoint_negatives:negatives,preserved_external_ports:true,native_acceptance:false};console.log(JSON.stringify(report));if(process.argv.includes('--save'))writeFileSync(new URL('bindings-checks.json',H),JSON.stringify(report,null,2)+'\n');
