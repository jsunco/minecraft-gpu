import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeLiteralNetwork} from '../../../../hardware/full-gpu-literal-network.mjs';
import {makeBankTailSources} from '../../../../hardware/memory-layout-bank-tail-sources.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const d=makeBankTailSources(),saved=read('design.json'),parent=read('../bank-request-fanout-v1/design.json');
assert.equal(digest(d),digest(saved));
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),R='minecraft:repeater',W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',T='minecraft:redstone_torch';
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
assert.equal(m.size,d.blocks.length);
for(const v of parent.blocks)assert.deepEqual(m.get(K(v.position)),v.block);
assert.deepEqual(d.quiet,parent.quiet);assert.deepEqual(d.banks,parent.banks);for(const[k,v]of Object.entries(parent.ports))assert.deepEqual(d.ports[k],v);
assert.equal(d.bindings.length,28);assert.equal(new Set(d.bindings.map(b=>`${b.bank}/${b.name}`)).size,28);
const logic=makeLiteralNetwork(d.logic_contract);let literalCells=0;
for(const g of d.gates){const T=p=>P(p.x+g.origin.x,p.y+g.origin.y,p.z+g.origin.z);for(const v of logic.blocks){assert.deepEqual(m.get(K(T(v.position))),v.block);literalCells++;}for(const[n,p]of Object.entries(logic.ports))assert.deepEqual(g.ports[n].positions,p.bits.map(v=>T(v.position)));}
function binding(b){
 const bo=d.banks[b.bank].origin,T=p=>P(p.x+bo.x,p.y+bo.y,p.z+bo.z),i=Number(b.name.slice(9));
 const local=b.name==='active'?P(8,-41,-454):b.name==='tail'?P(10,-41,-454):b.name==='reset'?P(-248,-41,-514):P(100,-52+4*i,[-114,-111,-108,-102][i]);
 assert.deepEqual(b.source,T(local));assert.equal(parent.nets[K(b.source)],'bank'+b.bank+'/'+({active:'sequence_active_flush',tail:'sequence_active_delayed_flush',reset:'sequence_reset_blocked'}[b.name]??b.name));
 assert.deepEqual(b.destination,d.gates[b.bank].ports[b.name].positions[0]);assert.deepEqual(b.driver,P(b.destination.x,b.destination.y,b.destination.z-1));
 assert.deepEqual(m.get(K(b.driver)),{id:R,properties:{facing:'north',delay:'1'}});assert.equal(m.get(K(b.destination))?.id,W);assert.equal(d.nets[K(b.driver)],parent.nets[K(b.source)]);
}
for(const b of d.bindings)binding(b);
function column(c){assert.equal((c.hi-c.lo)%4,0);for(let y=c.lo;y<=c.hi;y++)assert.equal(m.get(K(P(c.x,y,c.z)))?.id,(y-c.lo)%2?T:S);}
for(const c of d.columns)column(c);assert.equal(d.columns.length,28);
function route(r){for(let i=0;i<r.path.length;i++){const p=r.path[i],v=m.get(K(p));assert(v,'missing route '+r.name+' '+K(p));assert.equal(d.nets[K(p)],r.net);if(v.id===R){assert(i>0&&i<r.path.length-1);const t=D[v.properties.facing];assert.deepEqual(r.path[i-1],P(p.x-t.x,p.y,p.z-t.z));assert.deepEqual(r.path[i+1],P(p.x+t.x,p.y,p.z+t.z));assert.equal(v.properties.delay,'1');}else assert.equal(v.id,W);}}
for(const r of d.routes)route(r);
let negatives=0;
for(const b of d.bindings){const k=K(b.driver),old=m.get(k);m.set(k,{id:R,properties:{facing:'south',delay:'1'}});assert.throws(()=>binding(b));m.set(k,old);negatives++;}
for(const c of d.columns){const k=K(P(c.x,c.lo+1,c.z)),old=m.get(k);m.delete(k);assert.throws(()=>column(c));m.set(k,old);negatives++;}
for(const r of d.routes){const k=K(r.path[Math.min(1,r.path.length-1)]),old=m.get(k);m.delete(k);assert.throws(()=>route(r));m.set(k,old);negatives++;}
let truth=0;
for(let code=0;code<128;code++){
 const v=Object.fromEntries(logic.input_names.map((n,i)=>[n,(code>>i)&1]));
 const products=logic.rows.map(row=>{let p=15;for(const g of row.gates){let x=v[g.name],tower=logic.towers.find(t=>t.name===g.name);for(let y=tower.first_y+1;y<row.y;y+=2)x=1-x;const side=g.wanted?1-x:x;p=Math.max(0,p-side*15);}return p>0;});
 const actual=logic.or_columns.map(c=>{let state=false;for(let y=1;y<c.output_y;y+=2){const ri=logic.rows.findIndex(r=>r.y===y),injected=ri>=0&&products[ri]&&logic.rows[ri].bits.includes(c.bit);state=!(state||injected);}return +state;});
 const busy=v.active|v.tail|v.reset;assert.deepEqual(actual,[busy,...Array.from({length:4},(_,i)=>busy&(1-v['not_owner'+i]))]);truth++;
}
const out={status:'offline_actual_bank_owner_and_tail_source_geometry_pass',...d.metrics,exact_regeneration:true,exact_parent_cells:parent.blocks.length,canonical_logic_cells:literalCells,settled_input_combinations:truth,quiet_drivers_preserved:d.quiet.length,positive_columns:d.columns.length,recorded_route_cells:d.routes.reduce((n,r)=>n+r.path.length,0),corruptions_rejected:negatives,occupied_chunk_columns:new Set(d.blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)).size,complete_component_geometry:false,native_acceptance:false};
if(process.argv.includes('--save')){writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify(d.metrics,null,2)+'\n');writeFileSync(new URL('ports.json',import.meta.url),JSON.stringify({bank_busy_any:d.ports.bank_busy_any,bank_owned_busy:d.ports.bank_owned_busy,connections:d.bindings,missing:d.missing},null,2)+'\n');}
console.log(JSON.stringify(out));
