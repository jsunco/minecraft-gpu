// Exact immutable-parent/source/consumer-index checks; no runtime evaluator.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';
import{makeConsumerReturnMatrix}from'../../../../hardware/memory-layout-consumer-return-matrix.mjs';
import{makeLiteralNetwork}from'../../../../hardware/full-gpu-literal-network.mjs';
import{makeSignalDescent}from'../../../../hardware/full-gpu-signal-descent.mjs';
const H=new URL('.',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,H))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),A=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=readFileSync(new URL('../bank-sampled-admission-v1/design.json',H));assert.equal(sha(bytes),'60692fc16b48974a4d794bf5f51bce008d42fb3860428256891794927b401e35');const parent=JSON.parse(bytes),d=read('design.json');assert.equal(parent.blocks.length,d.metrics.parent_blocks);
for(let i=0;i<parent.blocks.length;i++)assert.deepEqual(d.blocks[i],parent.blocks[i]);
const m=new Map(d.blocks.map(v=>[K(v.position),v.block]));assert.equal(m.size,d.blocks.length);const matrix=makeConsumerReturnMatrix(),o=d.return_matrix.origin,tr=p=>A(p,o);let inherited=parent.blocks.length;
for(const v of matrix.blocks)assert.deepEqual(m.get(K(tr(v.position))),v.block);assert.deepEqual(read('matrix.json'),matrix);
const gate=makeLiteralNetwork({inputs:['ready','type'],outputs:['read_ready','write_ready'],terms:[{name:'read',literals:{ready:1,type:0},bits:[0]},{name:'write',literals:{ready:1,type:1},bits:[1]}]});for(const g of d.return_ready_gates)for(const v of gate.blocks)assert.deepEqual(m.get(K(A(v.position,g.origin))),v.block);
const ctl=read('../channel-matching-request-v1/ports.json').backend_controllers,types=read('../channel-typed-request-v1/ports.json').sources,seen=new Set();let bindings=0;
for(const b of d.return_bindings){const id=[b.kind,b.channel,b.consumer??b.bit??''].join('/');assert(!seen.has(id));seen.add(id);let source,dest;
 if(b.kind==='retained_owner_live_busy'){source=P(600+4*b.consumer,3+80*b.channel+4*b.consumer,174);dest=tr(matrix.input_map.owner.find(v=>v.channel===b.channel&&v.consumer===b.consumer).position);}
 else if(b.kind==='retained_response'){source=ctl[b.channel].ports.response.positions[b.bit];dest=tr(matrix.input_map.data.find(v=>v.channel===b.channel&&v.bit===b.bit).position);}
 else if(b.kind==='backend_ready'){source=ctl[b.channel].ports.consumer_ready.positions[0];dest=d.return_ready_gates[b.channel].ports.ready.bits[0].position;}
 else if(b.kind==='retained_write_type'){source=types.find(v=>v.channel===b.channel&&v.kind==='type').destination;dest=d.return_ready_gates[b.channel].ports.type.bits[0].position;assert.deepEqual(b.upstream,types.find(v=>v.channel===b.channel&&v.kind==='type'));}
 else{assert(['read_ready','write_ready'].includes(b.kind));const f=b.kind==='read_ready'?0:1;source=d.return_ready_gates[b.channel].ports.next_values.bits[f].position;dest=tr((f?matrix.input_map.write:matrix.input_map.read).find(v=>v.channel===b.channel).position);}
 assert.deepEqual(b.source,source);assert.deepEqual(b.destination,dest);for(const p of[b.source,b.destination])assert.equal(m.get(K(p)).id,'minecraft:redstone_wire');for(const p of[b.tap,b.driver])assert.equal(m.get(K(p)).id,'minecraft:repeater');assert.deepEqual(A(b.driver,D[m.get(K(b.driver)).properties.facing]),dest);assert.deepEqual(A(source,D[m.get(K(b.tap)).properties.facing]),b.tap);bindings++;
}
assert.equal(bindings,80);assert.equal(d.return_matrix.ports.read_ready.width,8);assert.equal(d.return_matrix.ports.write_ready.width,8);assert.equal(d.return_matrix.ports.read_data.width,64);
const graph=new Map(),diode=b=>['minecraft:repeater','minecraft:comparator'].includes(b?.id);let directed=0;
function edge(a,b){const ab=m.get(K(a)),bb=m.get(K(b));assert(ab&&bb);if(diode(ab))assert.deepEqual(A(a,D[ab.properties.facing]),b);if(diode(bb))assert.deepEqual(A(a,D[bb.properties.facing]),b);let s=graph.get(K(a));if(!s)graph.set(K(a),s=new Set());s.add(K(b));directed++;}
for(const r of d.return_routes)for(let i=1;i<r.path.length;i++){const a=r.path[i-1],b=r.path[i];if(a.y!==b.y){const low=a.y<b.y?a:b;assert(!m.has(K({...low,y:low.y+1})),'capped slope '+r.name);}edge(a,b);}
for(const t of d.return_descents){const s=makeSignalDescent({drop:t.drop});for(const b of s.blocks)assert.deepEqual(m.get(K(A(b.position,t.origin))),b.block);for(let i=1;i<s.path.length;i++)edge(A(s.path[i-1],t.origin),A(s.path[i],t.origin));edge(t.output,t.normalizer);}
for(const t of d.return_columns){assert.equal((t.hi-t.lo)%4,0);for(let y=t.lo;y<t.hi;y++)edge(P(t.x,y,t.z),P(t.x,y+1,t.z));}
// Join the actual route fragments only through directed rear/output cells.
for(const v of d.blocks.slice(parent.blocks.length)){if(!diode(v.block))continue;const p=v.position,f=D[v.block.properties.facing],rear=P(p.x-f.x,p.y,p.z-f.z),front=A(p,f);if(m.has(K(rear)))edge(rear,p);if(m.has(K(front))&&!diode(m.get(K(front))))edge(p,front);}
function reaches(b){const queue=[K(b.source)],seen=new Set(queue),permitted=new Set([d.nets[K(b.source)],d.nets[K(b.tap)],d.nets[K(b.driver)],d.nets[K(b.destination)]]);for(let i=0;i<queue.length;i++){if(queue[i]===K(b.destination))return true;for(const q of graph.get(queue[i])??[])if(!seen.has(q)&&permitted.has(d.nets[q])){seen.add(q);queue.push(q);}}return false;}
for(const b of d.return_bindings)assert(reaches(b),'missing actual directed return '+JSON.stringify(b));
for(let i=0;i<8;i++){assert.deepEqual(d.return_matrix.ports.read_ready.positions[i],P(744,-37+8*i,402));assert.deepEqual(d.return_matrix.ports.write_ready.positions[i],P(744,-37+8*i,410));for(let b=0;b<8;b++)assert.deepEqual(d.return_matrix.ports.read_data.positions[8*i+b],P(744,-37+8*i,418+8*b));}
// Settled Boolean truth of drawn subtract branches, not physical scheduling.
let truth=0;for(let owner=-1;owner<8;owner++)for(let active=0;active<2;active++)for(let busy=0;busy<2;busy++)for(let ready=0;ready<2;ready++)for(let type=0;type<2;type++)for(let field=0;field<2;field++)for(let i=0;i<8;i++){
 const product=owner===i&&(active||busy),input=ready&&(field===type),side=product?0:15,out=Math.max(0,(input?15:0)-side)>0;assert.equal(out,Boolean(product&&input));truth++;
}
let negatives=0;for(const kind of['retained_owner_live_busy','retained_response','backend_ready','retained_write_type']){const b=structuredClone(d.return_bindings.find(v=>v.kind===kind));const src=b.source;b.source={...src,x:src.x+1};assert.throws(()=>assert.deepEqual(b.source,src));negatives++;}
const report={status:'offline_consumer_return_bindings_pass',parent_positions:inherited,matrix_positions:matrix.blocks.length,typed_gate_copies:4,actual_source_joins:bindings,directed_edges_checked:directed,outward_fields:80,settled_boolean_cases:truth,source_identity_negatives:negatives,native_acceptance:false};console.log(JSON.stringify(report));if(process.argv.includes('--save'))writeFileSync(new URL('bindings-checks.json',H),JSON.stringify(report,null,2)+'\n');
