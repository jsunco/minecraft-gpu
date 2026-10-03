import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeCoreLsus,joinDefinition} from './prepare.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {checkMatrix} from '../control-lsu-v2/check-matrix.mjs';
import {equation} from '../control-lsu-v2/logic.mjs';
import {makeLaneJoin,checkMap} from '../control-event-gates-v1/prepare.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`;
const d=makeCoreLsus(),base=read('../control-start-other-v1/design.json'),local=read('../control-lsu-v2/design.json');
const m=new Map(d.blocks.map(b=>[K(b.position),b.block])),connections=new Map(d.connections.map(c=>[c.name,c]));
assert.equal(connections.size,167);assert.equal(d.metrics.retained_bits,1024);
let preserved=0,bindings=0;
function keep(source,t){for(const b of source.blocks){const p={x:b.position.x+t.x,y:b.position.y+t.y,z:b.position.z+t.z};assert.deepEqual(m.get(K(p)),b.block,'changed parent '+K(p));preserved++;}}
keep(base,{x:0,y:0,z:0});
const expected=(name,s,t)=>{const c=connections.get(name);assert(c,name);assert.deepEqual(c.source,s,name+' source');assert.deepEqual(c.destination,t,name+' destination');bindings++;};
const travel={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]};
function endpointDirections(c){
 const first=m.get(K(c.tap)),last=m.get(K(c.arrival));
 for(const b of [first,last])assert.equal(b?.id,'minecraft:repeater');
 const a=travel[first.properties.facing],b=travel[last.properties.facing];
 assert.deepEqual(c.tap,{x:c.source.x+a[0],y:c.source.y,z:c.source.z+a[1]},c.name+' source tap direction');
 assert.deepEqual(c.destination,{x:c.arrival.x+b[0],y:c.arrival.y,z:c.arrival.z+b[1]},c.name+' final normalizer direction');
 assert.equal(m.get(K(c.source))?.id,'minecraft:redstone_wire');assert.equal(m.get(K(c.destination))?.id,'minecraft:redstone_wire');
}
for(const c of d.connections)endpointDirections(c);
for(let lane=0;lane<4;lane++){
 const t={x:300+300*(lane%2),y:150*Math.floor(lane/2),z:400},port=n=>d.ports.lsus[lane][n];keep(local,t);
 assert.deepEqual(d.parents['lsu'+lane].translation,t);
 for(let bit=0;bit<8;bit++){
  expected(`lane${lane}_rs${bit}`,base.ports.rf[`lane${lane}_operand_a`].bits[bit].position,port('rs').bits[bit].position);
  expected(`lane${lane}_rt${bit}`,base.ports.rf[`lane${lane}_operand_b`].bits[bit].position,port('rt').bits[bit].position);
  expected(`lane${lane}_result${bit}`,port('result').bits[bit].position,base.ports.rf[`lane${lane}_writeback_lsu`].bits[bit].position);
  assert.deepEqual(port('read_address').bits[bit],port('write_address').bits[bit],'one held address aliases both interfaces');
 }
 const en=connections.get(`lane${lane}_enable`);assert.deepEqual(en.source,{x:718,y:194+4*lane,z:92});assert.deepEqual(en.destination,port('enable').bits[0].position);bindings++;
 for(const n of ['read_ready','write_ready','drained','read_data'])assert(!d.connections.some(c=>port(n).bits.some(b=>K(c.destination)===K(b.position))),'pending memory return accidentally claimed');
}
expected('core_wait_request',{x:14,y:33,z:4},connections.get('core_wait_request').destination);
expected('wait_complete_to_core',connections.get('wait_complete_to_core').source,{x:22,y:33,z:-4});
expected('lsu_fault_to_core',connections.get('lsu_fault_to_core').source,{x:549,y:281,z:-724});
const definition=joinDefinition(),matrix=checkMatrix(makeMatrix(definition));
let qualification=0;
for(let bits=0;bits<2**definition.inputs.length;bits++){
 const v=Object.fromEntries(definition.inputs.map((n,i)=>[n,!!(bits&2**i)])),a=equation(definition,v);
 assert.equal(a.request,v.wait&&v.permit&&v.valid&&!v.fault&&!v.initialize&&!v.reset);
 assert.equal(a.wait_complete,!v.mem_read&&!v.mem_write||v.all_ready);
 assert.equal(a.reset_ack,v.ack0&&v.ack1&&v.ack2&&v.ack3);qualification++;
}
const join=makeLaneJoin();checkMap(join);let joinCases=0;
for(let enabled=0;enabled<16;enabled++)for(let ready=0;ready<16;ready++)for(let faults=0;faults<16;faults++){
 let pending=false,bad=false;
 for(let y=1;y<=27;y+=2){const lane=(y-1)/8,real=Number.isInteger(lane),e=real?15*(enabled>>lane&1):0,r=real?15*(ready>>lane&1):0,f=real?15*(faults>>lane&1):0;pending=!(pending||real&&Math.max(0,e-r)>0);bad=!(bad||real&&Math.max(0,e-(15-f))>0);}
 assert.equal(!pending,(enabled&~ready)===0);assert.equal(bad,(enabled&faults)!==0);joinCases++;
}
const corruptions=[];
{const c=connections.get('lane0_result0'),b=m.get(K(c.arrival)),old=b.properties.facing;b.properties.facing=old==='west'?'east':'west';assert.throws(()=>endpointDirections(c));b.properties.facing=old;corruptions.push('reverse_actual_result_normalizer');}
{const c=connections.get('lane0_rs0'),old=c.destination;c.destination=connections.get('lane1_rs0').destination;assert.throws(()=>endpointDirections(c));c.destination=old;corruptions.push('wrong_lane_destination');}
{const v=Object.fromEntries(definition.inputs.map(n=>[n,true]));v.reset=false;v.initialize=false;v.fault=false;assert(equation(definition,v).request);for(const n of ['reset','initialize','fault']){const bad={...v,[n]:true};assert(!equation(definition,bad).request);}corruptions.push('reset_initialize_fault_block_request');}
const result={status:'author_static_core_lsu_boundary_checks',preserved_blocks:preserved,rf_and_core_bit_bindings:bindings,normalized_endpoints:d.connections.length*2,qualification_cases:qualification,lane_join_cases:joinCases,protocol_matrix:matrix,corruptions,retained_bits:1024,native_acceptance:false,limits:['Exact endpoints and settled equations; no scheduled block update or end-to-end memory proof.','Memory requester/return master routes remain absent. Both ready-low and real owner/backend drain are required.','Cold initialize and full core reset closure remain separate from the local LSU reset acknowledgment.']};
if(process.argv.includes('--save'))writeFileSync(new URL('boundary-checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
