import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeResetQuiet} from './prepare.mjs';
import {laneDefinition,joinDefinition} from './logic.mjs';
import {makeMatrix} from '../control-lsu-v2/matrix.mjs';
import {screen} from '../control-reset-retire-v1/check-interactions.mjs';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z});
const d=makeResetQuiet(),base=read('../control-reset-retire-v1/design.json'),m=new Map(d.blocks.map(b=>[K(b.position),b])),old=new Map(base.blocks.map(b=>[K(b.position),b]));
assert.deepEqual(d,read('design.json'));assert.equal(d.metrics.retained_bits,1034);assert.equal(d.connections.length,30);
for(const b of base.blocks)assert.deepEqual(m.get(K(b.position))?.block,b.block,'Parent changed '+K(b.position));
function evaluate(def,bits){return Object.fromEntries(def.outputs.map(out=>[out,def.products.some(t=>t.out===out&&Object.entries(t.literals).every(([n,v])=>Number(bits[n])===Number(v)))]));}
let cases=0,matrixGates=0;for(const def of [laneDefinition(),joinDefinition()]){
 const physical=makeMatrix(def);
 for(let mask=0;mask<2**def.inputs.length;mask++){
  const v=Object.fromEntries(def.inputs.map((n,i)=>[n,!!(mask&(1<<i))])),got=evaluate(def,v);
  const want=def.inputs.length===5?{quiet:v.drained&&!v.read_ready&&!v.write_ready&&!v.read_valid&&!v.write_valid}:{lsu_quiet:v.quiet0&&v.quiet1&&v.quiet2&&v.quiet3,rf_quiet:(v.owner_idle||v.owner_complete)&&!v.rf_request&&!v.rf_ack};assert.deepEqual(got,want);
  for(const product of physical.products){let power=15;for(const gate of product.gates){power=Math.max(0,power-((v[gate.name]===!!gate.want)?0:15));matrixGates++;}const wantProduct=Object.entries(product.literals).every(([n,w])=>v[n]===!!w);assert.equal(power>0,wantProduct);}cases++;
 }
}
// Inactive lanes do not disappear from the ownership-drain test.
for(let lane=0;lane<4;lane++){const v={quiet0:true,quiet1:true,quiet2:true,quiet3:true,owner_idle:true,owner_complete:false,rf_request:false,rf_ack:false};v['quiet'+lane]=false;assert.equal(evaluate(joinDefinition(),v).lsu_quiet,false);}
// COMPLETE is intentionally allowed; requiring IDLE strands a parked UPDATE.
assert(evaluate(joinDefinition(),{owner_idle:false,owner_complete:true,rf_request:false,rf_ack:false}).rf_quiet);
const commit=read('../control-commit-v2/design.json');
for(const [name,rn]of [['owner_idle','input_owner_idle'],['owner_complete','input_owner_complete']]){const actual=d.connections.find(c=>c.name===name),r=commit.routes.find(r=>r.name===rn),i=r.path.findIndex(p=>K(p)===K(actual.source));assert(i>0&&r.refresh_indices.includes(i-1));}
let freshSourceBindings=2;
for(let lane=0;lane<4;lane++){
 const t=P(300+300*(lane%2),150*Math.floor(lane/2),400);
 for(const [name,y]of [['read_ready',21],['write_ready',25],['drained',29]]){const c=d.connections.find(c=>c.name==='lane'+lane+'_'+name);assert.deepEqual(c.source,P(t.x+242,t.y+y,t.z+80));assert.deepEqual(m.get(K(P(t.x+241,t.y+y,t.z+80))).block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});freshSourceBindings++;}
 for(const [name,x]of [['read_valid',192],['write_valid',196]]){const c=d.connections.find(c=>c.name==='lane'+lane+'_'+name);assert.deepEqual(c.source,base.ports.lsus[lane][name].bits[0].position);assert.deepEqual(m.get(K(P(t.x+x,t.y+60,t.z+4))).block,{id:'minecraft:repeater',properties:{facing:'north',delay:'1'}});freshSourceBindings++;}
}
for(const[name,source,driver,face]of [['held_rf_request',P(645,250,-320),P(644,250,-320),'west'],['actual_rf_ack',P(980,305,2),P(980,305,3),'south']]){assert.deepEqual(d.connections.find(c=>c.name===name).source,source);assert.deepEqual(m.get(K(driver)).block,{id:'minecraft:repeater',properties:{facing:face,delay:'1'}});freshSourceBindings++;}
const eligible=new Set(base.blocks.filter(b=>b.block.id==='minecraft:redstone_wire').map(b=>K(b.position)));let oldEdges=0;
function neighbors(p,map){const out=[];for(const[x,z]of [[1,0],[-1,0],[0,1],[0,-1]])for(const y of[-1,0,1]){const q=P(p.x+x,p.y+y,p.z+z);if(!eligible.has(K(q)))continue;if(y===1&&map.has(K(P(p.x,p.y+1,p.z))))continue;if(y===-1&&map.has(K(P(q.x,q.y+1,q.z))))continue;out.push(K(q));}return out.sort();}
for(const k of eligible){const p=old.get(k).position,a=neighbors(p,old);assert.deepEqual(neighbors(p,m),a,'Old wire graph changed '+k);oldEdges+=a.length;}
const r={status:'author_static_reset_quiet_checks',...d.metrics,preserved_parent_cells:base.blocks.length,preserved_directed_old_wire_edges:oldEdges,boolean_cases:cases,physical_product_gate_cases:matrixGates,fresh_source_bindings:freshSourceBindings,...screen(d),native_acceptance:false,reset_ack_proven:false};
if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({...r,taps:undefined}));
