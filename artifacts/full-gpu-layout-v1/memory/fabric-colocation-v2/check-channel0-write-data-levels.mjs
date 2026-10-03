import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {P,K} from './allocation-route.mjs';
import {inputs} from './cut-inputs.mjs';
import {backwardCone} from './settled-network.mjs';
import {makeSettledEvaluator} from './settled-bank-network.mjs';
import {checkDAG} from './fanout-dag.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const d=read('channel0-write-data-design.json'),map=new Map(d.blocks.map(v=>[K(v.position),v.block])),boundaries=d.placedSources.map(s=>s.storage),branches=d.connections.filter(c=>c.kind==='write_data_bank_branch'),outputs=branches.map(c=>c.destination);
function evaluator(){const cone=[...new Map(outputs.flatMap(p=>backwardCone(map,p,boundaries)).map(p=>[K(p),p])).values()],constants=cone.filter(p=>map.get(K(p)).id==='minecraft:redstone_block');return {cone,constants,ev:makeSettledEvaluator(map,cone,[...boundaries,...constants],{eventLimit:2000000})};}
const full=evaluator();assert.equal(full.constants.length,0);let maxEvents=0;const observations=[];
function values(mask){return new Map(boundaries.map((p,bit)=>[K(p),mask>>bit&1?15:0]));}
function wrong(result,mask){return branches.filter(c=>(result.power.get(K(c.destination))??0)!==(mask>>c.bit&1?15:0));}
for(let mask=0;mask<256;mask++){const result=full.ev(values(mask));assert.deepEqual(wrong(result,mask),[],'Actual held byte does not arrive unchanged');maxEvents=Math.max(maxEvents,result.events);observations.push({byte:mask,receiver_power:branches.map(c=>result.power.get(K(c.destination))??0),events:result.events});}
const trees=[];
for(const b of branches){const source=boundaries[b.bit],cone=backwardCone(map,b.destination,boundaries),keys=new Set(cone.map(K)),stops=new Set(boundaries.map(K)),adj=new Map([...keys].map(k=>[k,new Set()])),cost=new Map();assert.deepEqual(boundaries.filter(p=>keys.has(K(p))),[source],'Wrong or multiple retained source bits');for(const p of cone){const block=map.get(K(p));cost.set(K(p),['minecraft:repeater','minecraft:comparator'].includes(block.id)?2*Number(block.properties.delay??1):block.id.includes('torch')?2:0);if(stops.has(K(p)))continue;for(const q of inputs(map,p)){assert(keys.has(K(q)));adj.get(K(q)).add(K(p));}}trees.push({bit:b.bit,bank:b.bank,source,target:b.destination,...checkDAG([...keys],adj,cost,K(source),K(b.destination))});}
const negative=[],reverse={east:'west',west:'east',north:'south',south:'north'};
function mutation(name,p,block,bit){const before=map.get(K(p));if(block)map.set(K(p),block);else map.delete(K(p));let detected=false;try{const broken=evaluator();for(const mask of [0,1<<bit])if(wrong(broken.ev(values(mask)),mask).length)detected=true;}catch(e){if(!/Missing cone|Missing settled|Unmodeled storage|did not converge/.test(e.message))throw e;detected=true;}assert(detected,'Actual mutation unobserved '+name);map.set(K(p),before);negative.push({name,position:p,bit,detected});}
for(const c of d.connections.filter(c=>c.kind==='write_data_actual_source')){const before=map.get(K(c.tap));mutation('reverse actual retained source departure',c.tap,{...before,properties:{...before.properties,facing:reverse[before.properties.facing]}},c.bit);}
for(const col of d.columns)for(const base of [col.frontBase,col.rearBase])mutation('remove first actual shared-column receiving torch',P(base.x,base.y+1,base.z),null,col.bit);
const source_sha256=Object.fromEntries(['check-channel0-write-data-levels.mjs','channel0-write-data-design.json','next-channel0-write-data-assignment.json','settled-bank-network.mjs','settled-network.mjs','cut-inputs.mjs','fanout-dag.mjs'].map(n=>[n,hash(n)]));
const out={status:'actual_channel0_retained_byte_to_all32_bank_receivers_passed',cases:256,receiver_observations:8192,actual_retained_boundaries:boundaries,cone_devices:full.cone.length,maxEvents,observations,trees,negative,source_sha256,limits:['Actual retained source cells are clamped for settled truth only; no storage capture or event simulation.','All256 byte assignments at32 matching bank pads pass, but retained data must still settle before qualified VALID/capture and remain stable through the bank write protocol.','Only32 channel0 write-data transports are checked;352 other address/data transports remain pending.']};
writeFileSync(new URL('channel0-write-data-levels.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,cases:out.cases,receiver_observations:out.receiver_observations,cone_devices:out.cone_devices,trees:trees.length,negative:negative.length,maxEvents}));
