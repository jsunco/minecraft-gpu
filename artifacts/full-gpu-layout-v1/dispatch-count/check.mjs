// Static geometry and bounded steady-state graph checks, never native evidence.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeDispatchCount} from '../../../hardware/full-gpu-dispatch-count.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,add=(a,b)=>P(a.x+b.x,a.y+b.y,a.z+b.z),neg=a=>P(-a.x,-a.y,-a.z),D={west:P(1,0,0),east:P(-1,0,0),north:P(0,0,1),south:P(0,0,-1)},dirs=Object.values(D);
const design=makeDispatchCount();assert.deepEqual(design,JSON.parse(readFileSync(new URL('./design.json',import.meta.url))));
const map=new Map(design.blocks.map(v=>[K(v.position),v])),at=p=>map.get(K(p));
let supports=0,diodeSides=0,carryEndpoints=0;
for(const v of design.blocks){if(v.block.id==='minecraft:light_gray_concrete')continue;assert.equal(at({...v.position,y:v.position.y-1})?.block.id,'minecraft:light_gray_concrete','unsupported '+K(v.position));supports++;}
for(const link of design.links){assert.deepEqual(link.path[0],design.halves[link.from_bit].carry);assert.deepEqual(link.path.at(-1),design.halves[link.to_bit].b);for(let i=1;i<link.path.length;i++){const a=link.path[i-1],b=link.path[i];assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(a.z-b.z),1);assert(at(b));}carryEndpoints+=2;}
// New carry/output/input repeaters may have no side-locking diode or stray side wire.
for(const v of design.blocks.filter(v=>v.block.id==='minecraft:repeater'&&!v.part.startsWith('half_'))){const d=D[v.block.properties.facing];for(const side of dirs.filter(s=>s.x*d.x+s.z*d.z===0)){const b=at(add(v.position,side))?.block;assert(!b||b.id==='minecraft:light_gray_concrete','new diode side contact '+K(v.position));diodeSides++;}}
function compile(blocks){
 const cells=new Map(blocks.map(v=>[K(v.position),v])),active=blocks.filter(v=>v.block.id!=='minecraft:light_gray_concrete'),index=new Map(active.map((v,i)=>[K(v.position),i]));
 const get=p=>cells.get(K(p)),idx=p=>index.get(K(p)),rules=[];
 function emits(source,target){if(!source)return false;const id=source.block.id;if(id==='minecraft:redstone_wire'||id==='minecraft:redstone_block')return true;return K(add(source.position,D[source.block.properties.facing]))===K(target);}
 function sources(target,ds,steps=false){const out=[];for(const delta of ds)for(const dy of steps?[-1,0,1]:[0]){
  const q=add(target,delta);q.y+=dy;const other=get(q);if(!other||other.block.id==='minecraft:light_gray_concrete')continue;
  if(dy!==0&&other.block.id!=='minecraft:redstone_wire')continue;
  if(dy===1&&get({...target,y:target.y+1}))continue;if(dy===-1&&get({...q,y:target.y}))continue;
  if(emits(other,target))out.push({index:idx(q),dust:other.block.id==='minecraft:redstone_wire'});
 }return out;}
 for(const v of active){const id=v.block.id,p=v.position;if(id==='minecraft:redstone_block')rules.push({kind:'constant'});
  else if(id==='minecraft:redstone_wire')rules.push({kind:'wire',incoming:sources(p,dirs,true)});
  else{const d=D[v.block.properties.facing],rear=sources(p,[neg(d)]),side=dirs.filter(s=>s.x*d.x+s.z*d.z===0);rules.push({kind:id.endsWith(':repeater')?'repeater':'comparator',rear,side:sources(p,side)});}
 }
 const input=design.ports.thread_count.bits.map(b=>idx(b.position)),output=design.ports.total_blocks.bits.map(b=>idx(b.position));
 return{run(value){let state=new Uint8Array(active.length),maxIterations=0;
  for(let iteration=0;iteration<300;iteration++){const next=new Uint8Array(state.length),peak=list=>Math.max(0,...list.map(s=>state[s.index]));
   for(let i=0;i<rules.length;i++){const r=rules[i];next[i]=r.kind==='constant'?15:r.kind==='wire'?Math.max(0,...r.incoming.map(s=>state[s.index]-(s.dust?1:0))):r.kind==='repeater'?(peak(r.rear)>0?15:0):Math.max(0,peak(r.rear)-peak(r.side));}
   input.forEach((i,bit)=>{next[i]=Math.max(next[i],(value>>bit)&1?15:0);});maxIterations=iteration+1;
   if(state.every((v,i)=>v===next[i]))return{output:output.reduce((n,i,bit)=>n+(next[i]>0?1<<bit:0),0),iterations:maxIterations,powers:output.map(i=>next[i])};state=next;
  }throw Error('Steady-state graph did not settle');
 },rules,index,active};
}
const graph=compile(design.blocks);let worstIterations=0,values=0;
for(let pc=0;pc<256;pc++){const result=graph.run(pc);assert.equal(result.output,Math.ceil(pc/4),'thread_count='+pc);assert(result.powers.every(v=>v===0||v===15));worstIterations=Math.max(worstIterations,result.iterations);values++;}
let negatives=0;
for(const [point,test]of[['14,1,8',5],['62,1,18',61],['-13,1,4',1],['-13,1,12',2]]){const corrupt=structuredClone(design.blocks),v=corrupt.find(v=>K(v.position)===point);assert(v);v.block.properties.facing={west:'east',east:'west',north:'south',south:'north'}[v.block.properties.facing];assert.notEqual(compile(corrupt).run(test).output,Math.ceil(test/4),'Must detect wrong input/carry direction '+point);negatives++;}
const lostOverflow=structuredClone(design.blocks);lostOverflow.find(v=>K(v.position)==='33,1,20').block.properties.facing='west';assert.notEqual(compile(lostOverflow).run(255).output,64,'Carry bit6 must not be dropped');negatives++;
// Count cross-part dust edges for an auditable exact connection list.
const contacts=[];for(let i=0;i<graph.rules.length;i++){const r=graph.rules[i];if(r.kind!=='wire')continue;for(const s of r.incoming)if(s.dust&&s.index<i){const a=graph.active[i],b=graph.active[s.index];if(a.part!==b.part)contacts.push({a:a.position,b:b.position,a_part:a.part,b_part:b.part});}}
const sha=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const result={status:'offline_dispatch_count_static_and_bounded_settled_graph_pass',blocks:design.blocks.length,supports,new_diode_side_faces:diodeSides,carry_endpoint_checks:carryEndpoints,complete_thread_count_cases:values,corruption_refusals:negatives,maximum_graph_iterations:worstIterations,cross_part_dust_contacts:contacts,sources:{generator:sha('../../../hardware/full-gpu-dispatch-count.mjs'),design:sha('./design.json'),checker:sha('./check.mjs')},native_acceptance:false,limits:['Bounded authored steady-state wire/diode/comparator graph is not a Minecraft simulator.','Does not model scheduled ticks, repeater/comparator delays, transient hazards, chunk boundaries or weak/strong support-block power.','Maximum graph iterations is not game-tick timing. Thread-count arithmetic is not an autonomous dispatcher. All core allocation/reuse/done control and routes remain missing.']};
writeFileSync(new URL('./checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,cross_part_dust_contacts:contacts.length}));
