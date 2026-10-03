import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),d=read('design.json'),K=p=>`${p.x},${p.y},${p.z}`,m=new Map(d.blocks.map(v=>[K(v.position),v.block])),W='minecraft:redstone_wire',V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},edge=new Set(d.edges.map(e=>K(e.from)+'>'+K(e.to)));
function connection(c){const a=m.get(K(c.tap)),b=m.get(K(c.arrival));assert.equal(m.get(K(c.source))?.id,W);assert.equal(a?.id,'minecraft:repeater');assert.equal(b?.id,'minecraft:repeater');for(const[p,q,out]of[[c.tap,c.source,false],[c.arrival,c.destination,true]]){const[x,z]=V[m.get(K(p)).properties.facing];assert.deepEqual(q,{x:p.x+(out?x:-x),y:p.y,z:p.z+(out?z:-z)},c.name);}assert(edge.has(K(c.source)+'>'+K(c.tap)));assert(edge.has(K(c.arrival)+'>'+K(c.destination)));}
// Four enable bridges intentionally end at the comparator, with their declared
// arrival being its real rear diode. Every other route ends at a receiving wire.
for(const c of d.connections)connection(c);
assert.equal(d.connections.length,29);const names=d.connections.map(c=>c.name);assert.equal(new Set(names).size,29);
for(const n of['mode0','mode1','compare'])assert(names.includes('held_IR_'+n+'_to_ALU'));
for(let i=0;i<4;i++){assert(names.includes('actual_enable_to_lane_'+i));for(const n of['execute_request','mode0','mode1','compare'])assert(names.includes(n+'_to_lane_'+i));}
let segments=0;for(const r of d.routes){for(let i=1;i<r.path.length;i++){const p=r.path[i-1],q=r.path[i];assert.equal(Math.abs(p.x-q.x)+Math.abs(p.z-q.z),1);assert(Math.abs(p.y-q.y)<=1);assert(edge.has(K(p)+'>'+K(q)),r.name);segments++;}}
let negatives=0;for(const key of['tap','arrival']){const c=structuredClone(d.connections.at(-1));c[key].x++;assert.throws(()=>connection(c));negatives++;}const c=structuredClone(d.connections.at(-1));c.source.z++;assert.throws(()=>connection(c));negatives++;
console.log(JSON.stringify({status:'exact_actual_sources_and_receivers_checked',connections:29,retained_IR_controls:3,lane_high_level_deliveries:20,route_segments:segments,corrupt_endpoints_rejected:negatives,native_calls:0,scope:'Directions, actual cells and mapped paths; no dynamic timing claim.'}));
