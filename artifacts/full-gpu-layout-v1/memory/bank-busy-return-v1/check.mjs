import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeSignalDescent} from '../../../../hardware/full-gpu-signal-descent.mjs';
import {makeLiteralNetwork} from '../../../../hardware/full-gpu-literal-network.mjs';
import {makeBankBusyReturn} from '../../../../hardware/memory-layout-bank-busy-return.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const d=makeBankBusyReturn(),saved=read('design.json'),parent=read('../bank-tail-sources-v1/design.json');
assert.equal(digest(d),digest(saved));
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),R='minecraft:repeater',W='minecraft:redstone_wire',S='minecraft:light_gray_concrete',T='minecraft:redstone_torch';
const D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
assert.equal(m.size,d.blocks.length);
const changes=new Map(d.replacements.map(v=>[K(v.position),v]));assert.equal(changes.size,4);for(const v of parent.blocks){const c=changes.get(K(v.position));if(c)assert.deepEqual(c.before,v.block);assert.deepEqual(m.get(K(v.position)),c?c.after:v.block);}
assert.deepEqual(d.quiet,parent.quiet);assert.deepEqual(d.banks,parent.banks);for(const[k,v]of Object.entries(parent.ports))assert.deepEqual(d.ports[k],v);
assert.equal(d.bindings.length,24);assert.equal(new Set(d.bindings.map(b=>`${b.channel}/${b.bank}/${b.kind}`)).size,24);
const logic=makeLiteralNetwork(d.logic_contract);let literalCells=0;
for(const g of d.gates){const T=p=>P(p.x+g.origin.x,p.y+g.origin.y,p.z+g.origin.z);for(const v of logic.blocks){assert.deepEqual(m.get(K(T(v.position))),v.block);literalCells++;}for(const[n,p]of Object.entries(logic.ports))assert.deepEqual(g.ports[n].positions,p.bits.map(v=>T(v.position)));}
function binding(b){
 const o=parent.controllers[b.channel].origin,dst=b.destination;
 assert.deepEqual(m.get(K(b.driver)),{id:R,properties:{facing:b.kind==='collector_input'?'north':'south',delay:'1'}});
 assert.deepEqual(b.driver,P(dst.x,dst.y,dst.z+(b.kind==='collector_input'?-1:1)));
 if(b.kind==='collector_input'){
  assert.deepEqual(b.source,parent.ports.bank_owned_busy.positions[b.bank*4+b.channel]);assert.deepEqual(dst,d.gates[b.channel].ports['bank'+b.bank].positions[0]);assert.equal(m.get(K(dst)).id,W);
 }else{
  assert.deepEqual(b.source,d.gates[b.channel].ports.next_values.positions[0]);
  if(b.kind==='retire_mask'){
   assert.deepEqual(dst,P(o.x+[118,114,114,122][b.channel],297+4*b.channel,o.z+6));assert.deepEqual(m.get(K(dst)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});assert.deepEqual(m.get(K(P(dst.x-1,dst.y,dst.z))),{id:R,properties:{facing:'west',delay:'1'}});
  }else{assert.equal(b.kind,'busy_or');assert.deepEqual(dst,P(o.x+120,281+4*b.channel,o.z+6));assert.equal(m.get(K(dst)).id,W);}
 }
}
for(const b of d.bindings)binding(b);
function column(c){assert.equal((c.hi-c.lo)%4,0);for(let y=c.lo;y<=c.hi;y++)assert.equal(m.get(K(P(c.x,y,c.z)))?.id,(y-c.lo)%2?T:S);}
for(const c of d.columns)column(c);assert.equal(d.columns.length,20);
function route(r){for(let i=0;i<r.path.length;i++){const p=r.path[i],v=m.get(K(p));assert(v,'missing route '+r.name+' '+K(p));assert.equal(d.nets[K(p)],r.net);if(v.id===R){assert(i>0&&i<r.path.length-1);const t=D[v.properties.facing];assert.deepEqual(r.path[i-1],P(p.x-t.x,p.y,p.z-t.z));assert.deepEqual(r.path[i+1],P(p.x+t.x,p.y,p.z+t.z));assert.equal(v.properties.delay,'1');}else assert.equal(v.id,W);}}
for(const r of d.routes)route(r);
let negatives=0;
for(const b of d.bindings){const k=K(b.driver),old=m.get(k);m.set(k,{id:R,properties:{facing:old.properties.facing==='south'?'north':'south',delay:'1'}});assert.throws(()=>binding(b));m.set(k,old);negatives++;}
for(const c of d.columns){const k=K(P(c.x,c.lo+1,c.z)),old=m.get(k);m.delete(k);assert.throws(()=>column(c));m.set(k,old);negatives++;}
for(const r of d.routes){const k=K(r.path[Math.min(1,r.path.length-1)]),old=m.get(k);m.delete(k);assert.throws(()=>route(r));m.set(k,old);negatives++;}
let descentCells=0;for(const v of d.descents){const local=makeSignalDescent({drop:v.drop}),T=p=>P(p.x+v.origin.x,p.y+v.origin.y,p.z+v.origin.z);for(const p of local.blocks){assert.deepEqual(m.get(K(T(p.position))),p.block);descentCells++;}}
for(const v of d.replacements){const k=K(v.position),old=m.get(k),b=d.bindings.find(b=>b.kind==='retire_mask'&&b.channel===v.channel);m.set(k,v.before);assert.throws(()=>binding(b));m.set(k,old);negatives++;}
let truth=0,releaseCases=0;
for(let code=0;code<16;code++){
 const v=Object.fromEntries(logic.input_names.map((n,i)=>[n,(code>>i)&1]));
 const products=logic.rows.map(row=>{let p=15;for(const g of row.gates){let x=v[g.name],tower=logic.towers.find(t=>t.name===g.name);for(let y=tower.first_y+1;y<row.y;y+=2)x=1-x;const side=g.wanted?1-x:x;p=Math.max(0,p-side*15);}return p>0;});
 const actual=logic.or_columns.map(c=>{let state=false;for(let y=1;y<c.output_y;y+=2){const ri=logic.rows.findIndex(r=>r.y===y),injected=ri>=0&&products[ri]&&logic.rows[ri].bits.includes(c.bit);state=!(state||injected);}return +state;});assert.deepEqual(actual,[+(code!==0)]);truth++;
 for(let rawRetire=0;rawRetire<2;rawRetire++)for(let localBusy=0;localBusy<2;localBusy++){const side=actual[0]*15,rear=rawRetire*15,filtered=Math.max(0,rear-side),busy=Math.max(localBusy*15,side);assert.equal(filtered>0,!!rawRetire&&code===0);assert.equal(busy>0,!!localBusy||code!==0);releaseCases++;}
}
const out={status:'offline_actual_bank_busy_and_retire_return_geometry_pass',...d.metrics,exact_regeneration:true,exact_parent_cells:parent.blocks.length,canonical_logic_cells:literalCells,canonical_descent_cells:descentCells,settled_input_combinations:truth,retire_and_busy_cases:releaseCases,quiet_drivers_preserved:d.quiet.length,positive_columns:d.columns.length,recorded_route_cells:d.routes.reduce((n,r)=>n+r.path.length,0),corruptions_rejected:negatives,occupied_chunk_columns:new Set(d.blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`)).size,complete_component_geometry:false,native_acceptance:false};
if(process.argv.includes('--save')){writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(out,null,2)+'\n');writeFileSync(new URL('inventory.json',import.meta.url),JSON.stringify(d.metrics,null,2)+'\n');writeFileSync(new URL('ports.json',import.meta.url),JSON.stringify({downstream_bank_busy:d.ports.downstream_bank_busy,qualified_retire:d.ports.qualified_retire,connections:d.bindings,replacements:d.replacements,missing:d.missing},null,2)+'\n');}
console.log(JSON.stringify(out));
