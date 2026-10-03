// Exact body-input preservation + intended544-sink fanout, no same-net exemption.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inputs,active} from './cut-inputs.mjs';
import {checkDAG} from './fanout-dag.mjs';
import {key as packedKey,encode,repeater,findFeedback} from '../../repeater-feedback-census-v1/dependencies.mjs';
const H=new URL('./',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,H))),d=read('raw-shared-design.json'),base=read('raw-shared-bodies.json');
const K=p=>`${p.x},${p.y},${p.z}`,P=(x,y,z)=>({x,y,z}),W='minecraft:redstone_wire',R='minecraft:repeater',C='minecraft:comparator',T='minecraft:redstone_torch',S='minecraft:light_gray_concrete';
const solid=b=>b?.id.endsWith('_concrete'),E=(a,b)=>K(a)+'>'+K(b),world=new Map(d.blocks.map(v=>[K(v.position),v.block])),parts=new Map(d.blocks.map(v=>[K(v.position),v.part]));
assert.equal(world.size,d.blocks.length);assert(d.metrics.legal_y_translation[0]<=d.metrics.legal_y_translation[1]);
const local=new Map(base.modules.map(m=>[m.name,new Map()]));for(const v of base.blocks)local.get(v.part).set(K(v.position),v.block);
const expected=new Map(),allowed=new Set();let oldEdges=0;
for(const v of base.blocks)if(active(v.block)){const ins=inputs(local.get(v.part),v.position);expected.set(K(v.position),new Set(ins.map(K)));for(const q of ins){allowed.add(E(q,v.position));oldEdges++;}}
for(const e of d.edges){allowed.add(E(e.from,e.to));if(world.get(K(e.from))?.id===W&&world.get(K(e.to))?.id===W)allowed.add(E(e.to,e.from));}
const bad=[],lost=[],missing=[],supports=[];let activeCells=0,kept=0,newEdges=0;
const actualInputs=new Map();for(const v of d.blocks){const p=v.position,k=K(p);if([W,R,C,T].includes(v.block.id)&&!solid(world.get(K(P(p.x,p.y-1,p.z)))))supports.push(p);if(!active(v.block))continue;activeCells++;const after=inputs(world,p),set=new Set(after.map(K));actualInputs.set(k,after);
 for(const q of after)if(!allowed.has(E(q,p)))bad.push({source:q,target:p,source_block:world.get(K(q)),target_block:v.block,source_part:parts.get(K(q)),target_part:v.part});else if(expected.get(k)?.has(K(q)))kept++;else newEdges++;
 for(const q of expected.get(k)??[])if(!set.has(q))lost.push({source:q,target:p});
}
for(const e of d.edges)if(!actualInputs.get(K(e.to))?.some(p=>K(p)===K(e.from)))missing.push(e);
// Structural maximum signal reach between actual refreshing devices. This is
// not simultaneous Boolean evaluation of inverting torches or a timing proof.
const wirePower=new Map(),queue=[],wireTargets=new Map();
for(const v of d.blocks)if(v.block.id===W){const k=K(v.position);let seed=0;for(const q of actualInputs.get(k)??[]){if(world.get(K(q))?.id===W){if(!wireTargets.has(K(q)))wireTargets.set(K(q),[]);wireTargets.get(K(q)).push(k);}else seed=15;}wirePower.set(k,seed);if(seed)queue.push(k);}
for(let i=0;i<queue.length;i++){const k=queue[i],power=wirePower.get(k)-1;if(power<=0)continue;for(const target of wireTargets.get(k)??[])if(power>(wirePower.get(target)??0)){wirePower.set(target,power);queue.push(target);}}
const weakRears=[];let newRears=0,minimumRear=15;
for(const v of d.blocks)if(v.block.id===R&&v.part.startsWith('raw_candidate_')){const power=Math.max(0,...(actualInputs.get(K(v.position))??[]).map(q=>world.get(K(q))?.id===W?wirePower.get(K(q))??0:15));newRears++;minimumRear=Math.min(minimumRear,power);if(!power)weakRears.push(v.position);}
const packed=new Map(d.blocks.map(v=>[packedKey(P(v.position.x,v.position.y+16,v.position.z)),encode(v.block)])),feedback=[];let repeatersChecked=0;
for(const[k,v]of packed)if(repeater(v)){repeatersChecked++;const witness=findFeedback(packed,k);if(witness)feedback.push(witness);}
const dags=[],dagFailures=[];for(let i=0;i<8;i++)for(let field=0;field<17;field++){
 const part=`raw_candidate_${i}_${field}`,bs=d.bindings.filter(b=>b.consumer===i&&b.field===field);assert.equal(bs.length,4);
 const rows=d.blocks.filter(v=>v.part===part&&active(v.block));const positions=[...rows.map(v=>v.position),bs[0].source,...bs.map(b=>b.destination)],keys=new Set(positions.map(K)),adj=new Map([...keys].map(k=>[k,new Set()])),cost=new Map();
 for(const p of positions){const b=world.get(K(p));cost.set(K(p),b.id===R?2*Number(b.properties.delay):b.id===T?2:0);for(const q of actualInputs.get(K(p))??[])if(keys.has(K(q)))adj.get(K(q)).add(K(p));}
 for(const b of bs)try{const dag=checkDAG([...keys],adj,cost,K(b.source),K(b.destination));dags.push({consumer:i,field,channel:b.channel,...dag});}catch(e){dagFailures.push({consumer:i,field,channel:b.channel,error:e.message});}
}
let negatives=0;const b=d.bindings[0],n=K(b.normalizer),saved=world.get(n);world.set(n,{...saved,properties:{...saved.properties,facing:'north'}});assert(!inputs(world,b.destination).some(p=>K(p)===n));world.set(n,saved);negatives++;
const stair=d.edges.find(e=>e.to.y===e.from.y+1&&world.get(K(e.from))?.id===W&&world.get(K(e.to))?.id===W);assert(stair);const cap=P(stair.from.x,stair.from.y+1,stair.from.z),oldCap=world.get(K(cap));assert(!oldCap);world.set(K(cap),{id:S});assert(!inputs(world,stair.to).some(p=>K(p)===K(stair.from)));world.delete(K(cap));negatives++;
assert.throws(()=>checkDAG(['a','b','c'],new Map([['a',new Set(['b'])],['b',new Set(['c'])],['c',new Set(['a'])]]),new Map([['a',0],['b',2],['c',0]]),'a','c'),/Positive-device cycle/);negatives++;
const failed=bad.length||lost.length||missing.length||supports.length||feedback.length||dagFailures.length||weakRears.length;
const hashes={};for(const n of['check-raw-shared.mjs','place-raw-shared.mjs','cut-inputs.mjs','fanout-dag.mjs','raw-shared-design.json','raw-shared-bodies.json'])hashes[n]=createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const out={status:failed?'raw_shared_fanout_refused':'raw_shared_fanout_static_checks_passed',metrics:d.metrics,activeCells,oldEdges,kept,newEdges,bad,lost,missing,supports,newRears,minimumRear,weakRears,repeatersChecked,census_translation:{x:0,y:16,z:0},feedback,dags,dagFailures,negative_cases:negatives,source_sha256:hashes,limits:['64 previous local cables remain to be redrawn against this exact fanout.','136 shared consumer fields and544 destinations only; remaining raw-valid/claim/bank/reset/quiet/witness cuts are unconnected.','No whole-fabric/temporal/native/footprint acceptance.'],selected:false,native_acceptance:false};
writeFileSync(new URL('raw-shared-checks.json',H),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,source_sha256:undefined,dags:undefined,bad:bad.slice(0,12),lost:lost.slice(0,5),missing:missing.slice(0,5),feedback:feedback.slice(0,3),dagFailures:dagFailures.slice(0,8)}));assert(!failed,'Unexpected power, changed body, absent route, unsupported cell or positive cycle');
