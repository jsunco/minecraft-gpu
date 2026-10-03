// Exact finite geometry and abstract state check. No block-update simulation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeProgramResetDrain} from '../../../../hardware/memory-layout-program-reset.mjs';
const d=makeProgramResetDrain();assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete',dirs=[[1,0],[-1,0],[0,1],[0,-1]],V={west:[1,0],east:[-1,0],north:[0,1],south:[0,-1]},m=new Map(d.blocks.map(v=>[K(v.position),v.block])),get=p=>m.get(K(p)),solid=p=>get(p)?.id===S;
assert.equal(m.size,d.blocks.length);
const edge=(a,b)=>[K(a),K(b)].sort().join('|'),allowed=new Set(d.edges.map(e=>edge(e.from,e.to)));let supports=0,foreignFaces=0,foreignSlopes=0,sideInputs=0,strongShortcuts=0;
for(const v of d.blocks){const p=v.position,b=v.block;if(b.id===S)continue;
 let s=P(p.x,p.y-1,p.z);if(b.id==='minecraft:redstone_wall_torch'){const [dx,dz]=V[b.properties.facing];s=P(p.x+dx,p.y,p.z+dz);}assert(solid(s),'support '+K(p));supports++;
 for(const[dx,dz]of dirs){const q=P(p.x+dx,p.y,p.z+dz),bb=get(q);if(bb&&bb.id!==S&&d.nets[K(p)]!==d.nets[K(q)]){assert(allowed.has(edge(p,q)),'foreign face '+K(p)+' > '+K(q));foreignFaces++;}
  if(b.id==='minecraft:redstone_wire')for(const dy of[-1,1]){const q=P(p.x+dx,p.y+dy,p.z+dz);if(get(q)?.id!=='minecraft:redstone_wire'||d.nets[K(p)]===d.nets[K(q)])continue;if(dy>0&&m.has(K(P(p.x,p.y+1,p.z))))continue;if(dy<0&&m.has(K(P(q.x,p.y,q.z))))continue;foreignSlopes++;assert.fail('foreign slope '+K(p)+' > '+K(q));}
 }
 if(/:(repeater|comparator)$/.test(b.id)){
  const [dx,dz]=V[b.properties.facing];for(const sign of[-1,1]){const q=P(p.x+sign*dz,p.y,p.z+sign*dx),bb=get(q);if(!bb||bb.id===S)continue;assert(b.id==='minecraft:comparator'&&K(q)==='14,1,1'&&bb.properties.facing==='south','unexpected side neighbor '+K(p)+' > '+K(q));sideInputs++;}
  const rear=P(p.x-dx,p.y,p.z-dz);if(solid(rear)){
   const candidates=[];for(const [xx,zz]of dirs){const q=P(rear.x-xx,rear.y,rear.z-zz),bb=get(q);if(/:(repeater|comparator)$/.test(bb?.id??'')&&JSON.stringify(V[bb.properties.facing])===JSON.stringify([xx,zz]))candidates.push(q);}
   for(const q of[P(rear.x,rear.y+1,rear.z),P(rear.x,rear.y-1,rear.z)]){const bb=get(q);if(q.y>rear.y&&bb?.id==='minecraft:redstone_wire'||q.y<rear.y&&bb?.id==='minecraft:redstone_torch')candidates.push(q);}
   for(const q of candidates)if(d.nets[K(q)]!==d.nets[K(p)]){strongShortcuts++;assert.fail('foreign strong rear '+K(q)+' > '+K(p));}
  }
 }
}
assert.equal(sideInputs,1);assert.equal(foreignSlopes,0);assert.equal(strongShortcuts,0);
const rep=(p,f,t='1')=>assert.deepEqual(get(p),{id:'minecraft:repeater',properties:{facing:f,delay:t}});
// Trace every slow element and each actual turn in chronological order.
const pipeline=[];for(let row=0;row<4;row++){for(let j=0;j<16;j++){const p=P(row%2?31-j:16+j,5,4*row);rep(p,row%2?'east':'west','4');pipeline.push(p);}if(row<3){const x=row%2?15:32;for(let z=row*4;z<row*4+5;z++){const p=P(x,5,z);if(z===row*4+1)rep(p,'north');else assert.equal(get(p)?.id,'minecraft:redstone_wire');pipeline.push(p);}}}
for(let i=1;i<pipeline.length;i++){const a=pipeline[i-1],b=pipeline[i];assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(a.z-b.z),1);}
assert.equal(d.delay_cells.length,64);assert.equal(pipeline.length,79);
for(const r of d.routes){assert(r.max_dust_run<=12);for(const p of r.refresh){const i=r.path.findIndex(q=>K(p)===K(q)),a=r.path[i-1],b=r.path[i+1],[dx,dz]=V[get(p).properties.facing];assert.deepEqual(P(p.x-dx,p.y,p.z-dz),a);assert.deepEqual(P(p.x+dx,p.y,p.z+dz),b);}}
assert.deepEqual(get(P(14,1,0)),{id:'minecraft:comparator',properties:{facing:'east',mode:'subtract'}});rep(P(15,1,0),'east');rep(P(14,1,1),'south');rep(P(13,1,0),'east');
for(const[x,z,lo,hi]of[[4,0,1,5],[40,0,1,9],[6,-4,5,9],[10,16,5,9]])for(let y=lo;y<=hi;y++)assert.equal(get(P(x,y,z))?.id,(y-lo)%2?'minecraft:redstone_torch':S);
function directCandidates(p){const out=[];for(const[dx,dz]of dirs){const q=P(p.x-dx,p.y,p.z-dz),b=get(q);if(/:(repeater|comparator)$/.test(b?.id??'')&&JSON.stringify(V[b.properties.facing])===JSON.stringify([dx,dz]))out.push(K(q));if(b?.id==='minecraft:redstone_wire')out.push(K(q));}
 for(const dy of[-1,1]){const q=P(p.x,p.y+dy,p.z),b=get(q);if(dy===-1&&b?.id==='minecraft:redstone_torch'||dy===1&&b?.id==='minecraft:redstone_wire')out.push(K(q));}return out.sort();}
assert.deepEqual(directCandidates(P(0,1,0)),['-1,1,0','0,1,1']);assert.deepEqual(directCandidates(P(12,1,0)),['12,1,-1','13,1,0']);assert.deepEqual(directCandidates(P(14,9,-4)),['13,9,-4']);
for(const[x,z,lo,hi,source]of[[4,0,1,5,P(3,1,0)],[40,0,1,9,P(39,1,0)],[6,-4,5,9,P(6,5,-3)],[10,16,5,9,P(10,5,15)]])for(let y=lo;y<=hi;y+=2)assert.deepEqual(directCandidates(P(x,y,z)),[K(y===lo?source:P(x,y-1,z))]);
// Boolean state recurrence and finite transport lag only. It tests the reset
// extension logic; its time unit is NOT a measured Minecraft tick.
let scenarios=0;
for(let lag=1;lag<=32;lag++)for(let width=1;width<=16;width++){
 let f=0,q=Array(lag).fill(0),lastReset=-1,sawHigh=false,sawTailOnly=false;
 for(let t=0;t<8*lag+4*width+20;t++){
  const reset=t<width||(t>=width+lag&&t<width+lag+width),tail=q[0];
  if(reset)lastReset=t;
  f=tail?0:reset?1:f;const blocked=!!(reset||f||tail);q.shift();q.push(f);
  if(reset)assert(blocked);if(f)sawHigh=true;if(!f&&tail)sawTailOnly=true;
  if(!blocked&&t>lastReset)assert(q.every(x=>x===0));
 }
 assert(sawHigh&&sawTailOnly);assert.equal(f,0);assert(q.every(x=>x===0));scenarios++;
}
// Preserve the discovered reason for masking SET during the old tail. The
// naive F=RESET?1:tail?0:F circuit can announce clear with a second pulse queued.
let rejectsNaive=false;for(let lag=1;lag<=8;lag++)for(let width=1;width<=8;width++){let f=0,q=Array(lag).fill(0);for(let t=0;t<8*lag+4*width+20;t++){const reset=t<width||(t>=width+lag&&t<width+lag+width),tail=q[0];f=reset?1:tail?0:f;const blocked=!!(f||tail);q.shift();q.push(f);if(!blocked&&q.some(Boolean))rejectsNaive=true;}}assert(rejectsNaive);
const result={status:'offline_reset_drain_geometry_and_abstract_logic_checked',...d.metrics,support_checks:supports,intended_directed_cross_net_faces:foreignFaces,foreign_step_dust:foreignSlopes,unexpected_strong_rear_paths:strongShortcuts,comparator_side_inputs:sideInputs,checked_torch_support_direct_source_sets:17,chronological_delay_path_cells:pipeline.length,abstract_reset_reassertion_scenarios:scenarios,naive_retrigger_variant_rejected:rejectsNaive,complete_program_memory:false,native_acceptance:false,limits:d.limits};
if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
