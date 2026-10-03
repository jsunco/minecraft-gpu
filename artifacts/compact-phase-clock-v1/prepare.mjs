// Offline candidate only. No world origin is selected and no native services are constructed.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(','),solid='minecraft:light_gray_concrete';
const opposite={east:'west',west:'east',north:'south',south:'north'};
const directions={east:[1,0],west:[-1,0],south:[0,1],north:[0,-1]};
const volume=b=>axes.reduce((v,a)=>v*(b.to[a]-b.from[a]+1),1);

export function makePhaseClock({origin={x:0,y:0,z:0},id='phase_clock4_seed',loopSpan=52,loopDelay=4,pulseDelay=4}={}){
 assert(axes.every(a=>Number.isSafeInteger(origin[a])));
 assert(origin.y>=-64&&origin.y+4<=319&&Math.abs(origin.x)<29999000&&Math.abs(origin.z)<29999000);
 assert(/^[a-z][a-z0-9_]{0,22}$/.test(id));
 assert([1,2,3,4].includes(loopDelay)&&[1,2,3,4].includes(pulseDelay));
 assert(Number.isInteger(loopSpan)&&loopSpan>=12&&loopSpan<=52&&loopSpan%2===0);
 const xMax=Math.max(46,loopSpan),halfTicks=2*(loopSpan+1)*loopDelay+4,relativeDelay=16*pulseDelay-12;
 assert(relativeDelay>0&&halfTicks-relativeDelay>=32,'Nominal pulse/dead-time budget must remain positive; native timing still required');
 const map=new Map(),signals=[],p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
 const put=(x,y,z,name,properties,replace=false)=>{
  const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})},old=map.get(key(position));
  if(old&&!replace)assert.deepEqual(old.block,block,'collision '+key(position));
  map.set(key(position),{position,block});
 };
 const stone=(x,y,z)=>put(x,y,z,'light_gray_concrete');
 const part=(x,y,z,n,props,replace=false)=>{stone(x,y-1,z);put(x,y,z,n,props,replace);};
 const wire=(x,y,z)=>part(x,y,z,'redstone_wire');
 const rep=(x,y,z,travel,delay=1)=>part(x,y,z,'repeater',{facing:opposite[travel],delay:String(delay)},true);
 const cmp=(x,y,z,travel)=>part(x,y,z,'comparator',{facing:opposite[travel],mode:'subtract'});
 const line=(x,z,X,Z,y=1)=>{assert(x===X||z===Z);const n=Math.abs(X-x)+Math.abs(Z-z);for(let i=0;i<=n;i++)wire(x+Math.sign(X-x)*i,y,z+Math.sign(Z-z)*i);};
 const probe=(name,x,y,z,property)=>signals.push({name,position:p(x,y,z),property});

 // Slow inverter loop. No small fast torch clock and no prewritten internal power.
 stone(0,0,0);stone(0,1,0);put(1,1,0,'redstone_wall_torch',{facing:'east'});
 line(2,0,loopSpan,0);for(let x=3;x<loopSpan;x+=2)rep(x,1,0,'east',loopDelay);
 line(loopSpan,1,loopSpan,4);rep(loopSpan,1,2,'south',loopDelay);
 line(loopSpan-1,4,-2,4);for(let x=loopSpan-2;x>=0;x-=2)rep(x,1,4,'west',loopDelay);
 line(-2,3,-2,0);rep(-2,1,2,'north',loopDelay);rep(-1,1,0,'east');
 // One normalized source forks into a long direct route and an intentionally
 // delayed route. They never meet again before the two subtract comparators.
 rep(2,1,-1,'north');line(2,-2,-10,-2);rep(-6,1,-2,'west');
 line(-10,-3,-10,-30);for(const z of[-5,-17,-29])rep(-10,1,z,'north');
 line(-9,-30,30,-30);for(const x of[-8,4,16,28])rep(x,1,-30,'east');
 line(30,-29,30,-24);rep(30,1,-27,'south');
 line(2,-3,2,-18);for(const z of[-3,-5,-7,-9,-11,-13,-15,-17])rep(2,1,z,'north',pulseDelay);
 line(3,-18,30,-18);for(const x of[4,16,28])rep(x,1,-18,'east');line(30,-17,30,-16);

 // Two directional branches of the accepted compact half-adder motif.
 // A-B and B-A stay separate: they are the two phase pulses, not an XOR bus.
 for(const z of[-24,-16]){
  line(30,z,33,z);rep(34,1,z,'east');cmp(35,1,z,'east');wire(36,1,z);rep(37,1,z,'east');wire(38,1,z);
  rep(39,1,z,'east');cmp(40,1,z,'east');wire(41,1,z);rep(42,1,z,'east');wire(43,1,z);
 }
 line(31,-16,31,-22);line(31,-22,35,-22);rep(35,1,-23,'north');
 for(let n=1;n<=3;n++)wire(31,1+n,-24-n);
 line(31,-27,35,-27,4);line(35,-27,35,-21,4);rep(33,4,-27,'east');rep(35,4,-24,'south');
 for(let n=1;n<=3;n++)wire(35,4-n,-21+n);rep(35,1,-17,'south');

 // HALT masks both phase outputs. It does not stop the oscillator. This avoids
 // assuming that stopping an oscillator also closes both transparent banks.
 part(46,1,-10,'lever',{face:'floor',facing:'west',powered:'false'});
 line(46,-11,46,-26);for(const z of[-15,-23])rep(46,1,z,'north');
 for(const z of[-22,-14]){line(45,z,40,z);rep(45,1,z,'west');rep(40,1,z-1,'north');}
 const inputs=[{name:'halt',position:p(46,1,-10)}];
 probe('raw_clock',1,1,0,'lit');probe('loop_feedback',-1,1,0,'powered');
 probe('clock_a',34,1,-24,'powered');probe('clock_b',34,1,-16,'powered');
 probe('side_b',35,1,-23,'powered');probe('side_a',35,1,-17,'powered');
 probe('raw_phase_a',37,1,-24,'powered');probe('raw_phase_b',37,1,-16,'powered');
 probe('halt_a',40,1,-23,'powered');probe('halt_b',40,1,-15,'powered');
 probe('phase_a',42,1,-24,'powered');probe('phase_b',42,1,-16,'powered');probe('raw_halt',46,1,-10,'powered');
 const blocks=[...map.values()],box={from:p(-10,0,-30),to:p(xMax,4,4)},tiles=[];
 // Disjoint height bands, then complete-width rows. Supports precede components;
 // the sole wall torch shares its row with its support. No live site is implied.
 for(let y=0;y<=4;y+=2){let z=-30;while(z<=4){let best=null;for(let end=z;end<=4;end++){
   const b={from:p(-10,y,z),to:p(xMax,Math.min(y+1,4),end)},items=blocks.filter(v=>axes.every(a=>v.position[a]>=b.from[a]&&v.position[a]<=b.to[a]));
   if(items.length+1>128||volume(b)+items.length>4096)break;best={b,items,end};
  }assert(best);z=best.end+1;if(!best.items.length)continue;
  best.items.sort((a,b)=>a.position.y-b.position.y||Number(a.block.id!==solid)-Number(b.block.id!==solid)||a.position.z-b.position.z||a.position.x-b.position.x);
  const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:'minecraft:overworld',box:best.b},plan:{id:tid,region_id:tid,label:'Unplaced phase-clock motif',operations:[{op:'fill',box:best.b,block:{id:'minecraft:air'}},...best.items.map(v=>({op:'set',...v}))]}});
 }}
 const histogram={};for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 const circuit={id,dimension:'minecraft:overworld',description:'Unbuilt physical two-phase pulse seed; no counter connected.',signals,buses:[{name:'phases',bits:['phase_a','phase_b']},{name:'raw_phases',bits:['raw_phase_a','raw_phase_b']}]};
 return{status:'offline_routed_clock_motif_native_unverified',origin,box,blocks,tiles,inputs,circuit,ports:{phase_a:p(43,1,-24),phase_b:p(43,1,-16),halt:inputs[0].position},metrics:{blocks:blocks.length,histogram,dimensions:{x:xMax+11,y:5,z:35},bounding_volume:volume(box)},settings:{loopSpan,loopDelay,pulseDelay},intended_logic:{raw_phase_a:'clock_a AND NOT clock_b',raw_phase_b:'clock_b AND NOT clock_a',phase_a:'raw_phase_a AND NOT halt',phase_b:'raw_phase_b AND NOT halt'},timing_estimate:{basis:'Scheduled component-delay arithmetic only; wire timing, side-path skew and loading are not proved.',loop_half_ticks:halfTicks,direct_fork_route_ticks:18,delayed_fork_route_ticks:16*pulseDelay+6,relative_branch_delay_ticks:relativeDelay,nominal_closed_gap_ticks:halfTicks-relativeDelay},scope:'Clock/blanking dependency only. Current/next counter banks, incrementer, reset sequencer and DONE feedback are not placed or counted here.'};
}

export async function checkPhaseClock(){
 const[{buildRegionSchema,buildPlanSchema},{circuitSchema}]=await Promise.all([import('../../tools/minecraft-redstone/scripts/build-service.mjs'),import('../../tools/minecraft-redstone/scripts/circuit-service.mjs')]);
 const d=makePhaseClock(),seen=new Map();let supports=0;
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);for(const op of t.plan.operations){if(op.op==='fill'){for(let y=op.box.from.y;y<=op.box.to.y;y++)for(let z=op.box.from.z;z<=op.box.to.z;z++)for(let x=op.box.from.x;x<=op.box.to.x;x++)seen.set(key({x,y,z}),op.block);}else{
   assert(axes.every(a=>op.position[a]>=t.region.box.from[a]&&op.position[a]<=t.region.box.to[a]));
   if(op.block.id!==solid){let under={...op.position,y:op.position.y-1};if(op.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=directions[op.block.properties.facing];under={...op.position,x:op.position.x-dx,z:op.position.z-dz};}assert.equal(seen.get(key(under))?.id,solid,'missing support '+key(op.position));supports++;}
   seen.set(key(op.position),op.block);
  }}
 }
 for(const v of d.blocks)assert.deepEqual(seen.get(key(v.position)),v.block);
 assert.equal([...seen.values()].filter(b=>b.id!=='minecraft:air').length,d.blocks.length);circuitSchema.parse(d.circuit);
 for(const signal of d.circuit.signals)assert(d.blocks.some(b=>key(b.position)===key(signal.position)));
 let truth=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let h=0;h<2;h++){
  const pa=Math.max(0,Math.max(0,a*15-b*15)-h*15)>0,pb=Math.max(0,Math.max(0,b*15-a*15)-h*15)>0;
  assert.equal(pa,!!(a&&!b&&!h));assert.equal(pb,!!(b&&!a&&!h));assert(!(pa&&pb));truth++;
 }
 return{status:'offline_schemas_support_and_static_truth_pass_native_unverified',...d.metrics,tiles:d.tiles.length,support_checks:supports,truth_combinations:truth,signals:d.circuit.signals.length,native_calls:0,service_constructors:0,limits:'Static truth is not transient non-overlap or oscillator startup proof.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await checkPhaseClock();if(process.argv[2]==='--out'){const dir=resolve(process.argv[3]);mkdirSync(dir,{recursive:true});for(const[n,v]of Object.entries({design:makePhaseClock(),'offline-check':result}))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}else assert(!process.argv[2]||process.argv[2]==='--check');console.log(JSON.stringify(result));
}
