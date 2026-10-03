import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeFullLaneAluNetlist} from '../../../hardware/full-lane-alu-netlist.mjs';
import {makeFullLaneAluLayout} from '../../../hardware/full-lane-alu-layout.mjs';
import {runLane} from './microcode.mjs';
const dir=new URL('.',import.meta.url),load=n=>JSON.parse(readFileSync(new URL(n,dir))),n=makeFullLaneAluNetlist(),d=makeFullLaneAluLayout();
assert.deepEqual(n,load('netlist.json'));assert.deepEqual(d,load('layout-increment.json'));
assert.equal(n.state.reduce((s,v)=>s+v.width,0),57);assert.equal(new Set(n.nets.map(v=>v.id)).size,n.nets.length);
const sinks=new Set();for(const net of n.nets){assert(net.width>=1);assert(net.driver.instance&&net.driver.port);for(const s of net.sinks){const k=s.instance+'.'+s.port;assert(!sinks.has(k),'Multiple logical drivers '+k);sinks.add(k);}}
assert.equal(n.state.filter(v=>v.geometry==='missing').length,3);
assert.equal(load('physical-control-interface.json').total_physical_bits,38);
const map=new Map(d.blocks.map(v=>[Object.values(v.position).join(','),v.block]));
assert.equal(map.size,d.blocks.length);let supports=0;
for(const v of d.blocks){if(v.block.id.endsWith('_concrete'))continue;let p={...v.position,y:v.position.y-1};if(v.block.id==='minecraft:redstone_wall_torch'){const dx={east:1,west:-1,north:0,south:0}[v.block.properties.facing],dz={east:0,west:0,north:-1,south:1}[v.block.properties.facing];p={...v.position,x:v.position.x-dx,z:v.position.z-dz};}assert(map.get(Object.values(p).join(','))?.id.endsWith('_concrete'),'Missing support '+JSON.stringify(v));supports++;}
let longest=0;for(const r of d.routes){let run=0;for(const p of r.positions){const b=map.get(Object.values(p).join(','));run=b.id==='minecraft:repeater'?0:run+1;longest=Math.max(longest,run);assert(run<=12);}}
const counts={},boundaries=[];let faults=0;
for(const op of ['ADD','SUB','CMP','MUL','DIV']){let count=0;for(let a=0;a<256;a++)for(let b=0;b<256;b++){
 const flags=(a^b)&7,r=runLane(op,a,b,{flags});
 const expected=op==='ADD'?(a+b)&255:op==='SUB'?(a-b)&255:op==='MUL'?(a*b)&255:op==='CMP'?a<b?4:a===b?2:1:b?Math.floor(a/b):null;
 assert.equal(r.value,expected);assert.equal(r.flags,op==='CMP'?expected:flags);
 if(expected===null){assert.equal(r.state.fault,1);assert.equal(r.state.ready,0);faults++;}else{assert.equal(r.state.ready,1);assert.equal(r.state.fault,0);count++;}
 }counts[op]=count;}
for(const [op,a,b]of [['ADD',255,1],['SUB',0,255],['CMP',255,128],['MUL',255,255],['DIV',128,129],['DIV',255,1],['DIV',255,129]])boundaries.push({op,a,b,...runLane(op,a,b,{flags:5,record:true})});
const result={status:'offline_logical_checks_passed_geometry_incomplete',operations:counts,division_by_zero_faults:faults,total_legal_operations:Object.values(counts).reduce((a,b)=>a+b,0),state_bits:57,geometry:d.metrics,support_checks:supports,maximum_added_route_dust_run:longest,net_drivers:n.nets.length,physical_microcontrol_bits:38,boundary_traces:boundaries,native_calls:0,service_constructors:0,limitations:['Generated partial geometry is not a functional full ALU and has no build plans.','These are model/structural checks, not vanilla transient, routing-isolation, timing, or handshake acceptance.','Physical new mode/control/conditioning geometry remains missing; see layout-increment.missing_geometry.']};
if(process.argv.includes('--save'))writeFileSync(new URL('offline-check.json',dir),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,boundary_traces:boundaries.map(({op,a,b,value,bit_commits,captures,commits})=>({op,a,b,value,bit_commits,captures,commits}))}));
