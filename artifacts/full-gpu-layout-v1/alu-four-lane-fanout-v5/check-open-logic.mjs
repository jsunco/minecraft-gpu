// Finite actual-route and settled subtract-gate check. Not a dynamic redstone simulator.
import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const d=JSON.parse(readFileSync(new URL('./design.json',import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),b=new Map(d.blocks.map(v=>[K(v.position),v.block])),adj=new Map();
for(const e of d.edges){const a=K(e.from),z=K(e.to);if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(z);if(b.get(a).id===b.get(z).id&&b.get(a).id==='minecraft:redstone_wire'){if(!adj.has(z))adj.set(z,new Set());adj.get(z).add(a);}}
const rear=new Set(d.masks.map(v=>K(v.rear))),side=new Set(d.masks.map(v=>K(v.side))),targets=new Set(d.masks.map(v=>K(v.target))),stop=new Set([...rear,...side,...targets]);
function follow(start,power){const values=new Map([[K(start),power]]),queue=[K(start)];for(let i=0;i<queue.length;i++){const a=queue[i],v=values.get(a);if(!v||stop.has(a))continue;for(const z of adj.get(a)??[]){const to=b.get(z);assert(to,'Missing route block '+z);assert(['minecraft:repeater','minecraft:redstone_wire'].includes(to.id),'Unexpected route block '+z);const n=to.id==='minecraft:repeater'?15:v-(b.get(a).id==='minecraft:redstone_wire'?1:0);if(n>0&&n>(values.get(z)??0)){values.set(z,n);queue.push(z);}}}return values;}
function exact(p,id,properties){const a=b.get(K(p));assert.equal(a?.id,'minecraft:'+id,'Block '+K(p));if(properties)assert.deepEqual(a.properties,properties,'Properties '+K(p));}
function verify(){
 assert.equal(d.masks.length,24);assert.equal(new Set(d.masks.map(v=>v.name+':'+v.lane)).size,24);
 const pulse=new Map(),inhibit=new Map();let combinations=0;
 for(const g of d.masks){const{x,y,z}=g.comparator;exact(g.comparator,'comparator',{facing:'north',mode:'subtract'});assert.deepEqual(g.rear,P(x,y,z-1));assert.deepEqual(g.side,P(x-1,y,z));assert.deepEqual(g.output,P(x,y,z+1));exact(g.rear,'repeater',{facing:'north',delay:'1'});exact(g.side,'repeater',{facing:'west',delay:'1'});exact(g.output,'redstone_wire');exact(P(x,y,z+2),'repeater',{facing:'north',delay:'1'});
  assert.deepEqual(g.target,d.ports['lane'+g.lane+'_commands'].bits.find(v=>v.name===g.name).position);assert.deepEqual(g.inhibit_source,d.ports.lane_data_open_inhibit.bits[g.lane].position);
  const a=K(g.pulse_source),c=K(g.inhibit_source);if(!pulse.has(a))pulse.set(a,new Set());pulse.get(a).add(K(g.rear));if(!inhibit.has(c))inhibit.set(c,new Set());inhibit.get(c).add(K(g.side));
  const v=follow(g.output,15);assert.deepEqual(new Set([...v.keys()].filter(k=>stop.has(k))),new Set([K(g.target)]),'Unique actual bank receiver');assert.equal(v.get(K(g.target)),15);
  const dark=follow(g.output,0);assert(![...dark.keys()].some(k=>stop.has(k)),'No signal without a positive gate output');
  for(const e of[0,1])for(const f of[0,1])for(const r of[0,1])for(const p of[0,1]){const mask=15*Number(!r&&(!e||f)),out=Math.max(15*p-mask,0);assert.equal(out,15*Number(p&&(r||(e&&!f))));combinations++;}
 }
 assert.equal(pulse.size,6);assert.equal(inhibit.size,4);
 for(const[source,expected]of[...pulse,...inhibit]){const[x,y,z]=source.split(',').map(Number),v=follow(P(x,y,z),1);assert.deepEqual(new Set([...v.keys()].filter(k=>stop.has(k))),expected,'Exact mask input fanout '+source);for(const k of expected)assert.equal(v.get(k),15,'Normalized comparator rear/side '+k);}
 return{combinations,pulse_sources:pulse.size,inhibit_sources:inhibit.size};
}
const result=verify();let rejected=0;
for(const[field,property,value]of[['comparator','mode','compare'],['comparator','facing','south'],['rear','facing','south'],['side','facing','east']]){const a=b.get(K(d.masks[0][field])),old=a.properties[property];a.properties[property]=value;try{assert.throws(verify);rejected++;}finally{a.properties[property]=old;}}
const old=d.masks[0].target;d.masks[0].target=d.masks[1].target;try{assert.throws(verify);rejected++;}finally{d.masks[0].target=old;}
console.log(JSON.stringify({status:'all_six_OPEN_commands_reach_exact24_physical_masks_and_bank_receivers',...result,physical_masks:24,normalized_mask_inputs:48,normalized_bank_receivers:24,cross_lane_or_command_targets:0,negative_cases:rejected,scope:'settled routing and binary truth only; mask-before-pulse and farthest lock closure remain unmeasured',native_calls:0}));
