// Bounded exact-boundary checks; not a scheduled redstone simulator.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
export function checkBindings(d){
 const m=new Map(d.blocks.map(v=>[K(v.position),v])),cs=new Map(d.connections.map(c=>[c.name,c]));assert.equal(cs.size,67);assert.equal(m.size,d.blocks.length);
 const at=p=>m.get(K(p))?.block,rep=(p,face)=>assert.deepEqual(at(p),{id:'minecraft:repeater',properties:{facing:face,delay:'1'}},K(p));
 for(const c of d.connections){assert.equal(at(c.source)?.id,'minecraft:redstone_wire');assert.equal(at(c.destination)?.id,'minecraft:redstone_wire');for(const [p,q,sign]of[[c.tap,c.source,-1],[c.arrival,c.destination,1]]){assert.equal(at(p)?.id,'minecraft:repeater');const [x,z]=V[at(p).properties.facing];assert.deepEqual(P(p.x+sign*x,p.y,p.z+sign*z),q,c.name+' orientation');}}
 const endpoints={actual_all_status_low:[[2129,308,122],[372,249,-404]],actual_all_ready:[[2149,302,160],[22,41,-4]],held_alu_request:[null,[1434,-37,13]],held_alu_ack:[[495,291,-710],[1440,-37,13]],alu_reset_request:[[-140,1,-2],[1422,-37,13]],branch_fault_idle:[[364,201,-394],[584,281,-746]],branch_fault_phase:[[-82,1,16],[598,281,-746]],sticky_fault_next:[[-82,1,16],[530,280,-717]],sticky_fault_current:[[-62,1,16],[542,280,-717]],immediate_or_retained_fault:[[551,281,-720],[-120,1,-2]]};
 for(const[n,[s,t]]of Object.entries(endpoints)){const c=cs.get(n);assert(c,n);if(s)assert.deepEqual(c.source,P(...s),n);assert.deepEqual(c.destination,P(...t),n);}
 for(let lane=0;lane<4;lane++)for(let b=0;b<3;b++){const c=cs.get(`cmp_lane_${lane}_bit_${b}`);assert.deepEqual(c.source,P(1400+(lane%2?584:400)-2,-34+(lane<2?112:236)+9,-7+12*b));assert.deepEqual(c.destination,P(178+32*lane,285,-8+16*b));}
 // Three serial subtract gates implement UPDATE & !agreement & IDLE & rawA.
 for(const x of[570,584,598]){assert.deepEqual(at(P(x,281,-740)),{id:'minecraft:comparator',properties:{facing:'west',mode:'subtract'}});rep(P(x-1,281,-740),'west');rep(P(x+1,281,-740),'west');rep(P(x,281,-741),'north');}
 for(const x of[584,598]){rep(P(x,281,-745),'north');assert.equal(at(P(x,281,-744)).id,'minecraft:light_gray_concrete');assert.deepEqual(at(P(x,281,-743)),{id:'minecraft:redstone_wall_torch',properties:{facing:'south'}});}
 const delayRoutes=d.routes.map(r=>({name:r.name,cells:r.path.length,delay_one_repeaters:r.refresh_indices.length+2,nominal_repeater_ticks:2*(r.refresh_indices.length+2)}));
 return{connections:cs.size,cmp_source_bindings:12,fault_gate_comparators:3,maximum_route_repeaters:Math.max(...delayRoutes.map(v=>v.delay_one_repeaters)),route_delay_counts:delayRoutes,native_acceptance:false,limits:['Nominal repeater sums exclude inherited producer/receiver delays and are not a clock budget, waveform or measured closure proof.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=JSON.parse(readFileSync(new URL('design.json',import.meta.url))),r=checkBindings(d),m=new Map(d.blocks.map(v=>[K(v.position),v]));let rejected=0;function bad(mutate,restore){mutate();assert.throws(()=>checkBindings(d));restore();rejected++;}
const tap=m.get(K(d.connections[0].tap)),face=tap.block.properties.facing;bad(()=>tap.block.properties.facing=face==='west'?'east':'west',()=>tap.block.properties.facing=face);
const c=d.connections.find(c=>c.name==='actual_all_status_low'),old=c.source;bad(()=>c.source=d.connections.find(c=>c.name==='actual_all_ready').source,()=>c.source=old);
const g=m.get('598,281,-740'),block=g.block;bad(()=>g.block={id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},()=>g.block=block);
const cmp=d.connections.find(c=>c.name==='cmp_lane_3_bit_2'),source=cmp.source;bad(()=>cmp.source=d.connections.find(c=>c.name==='cmp_lane_2_bit_2').source,()=>cmp.source=source);
const result={status:'bounded_boundary_checks_passed',...r,corruptions_rejected:rejected};if(process.argv.includes('--save'))writeFileSync(new URL('binding-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,route_delay_counts:undefined}));}
