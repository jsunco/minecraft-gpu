// New density experiment only. No native calls, services, or site reservation.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const axes=['x','y','z'],key=p=>axes.map(k=>p[k]).join(',');
const facing={east:'west',west:'east',south:'north',north:'south'};
const volume=b=>axes.reduce((v,k)=>v*(b.to[k]-b.from[k]+1),1);
export function makeDenseWord({origin={x:0,y:0,z:0},id='dense_word8'}={}){
 assert(axes.every(k=>Number.isSafeInteger(origin[k])));
 assert(origin.y>=-64&&origin.y+1<=319);
 assert(Math.abs(origin.x)<29999000&&Math.abs(origin.z)<29999000);
 assert(/^[a-z][a-z0-9_]{0,22}$/.test(id));
 const map=new Map(),inputs=[],signals=[],p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
 const put=(x,y,z,name,properties)=>{const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})};assert(!map.has(key(position)),'Block collision');map.set(key(position),{position,block});};
 const component=(x,z,name,properties)=>{put(x,0,z,'light_gray_concrete');put(x,1,z,name,properties);};
 const wire=(x,z)=>component(x,z,'redstone_wire');
 const rep=(x,z,travel)=>component(x,z,'repeater',{facing:facing[travel],delay:'1'});
 const lever=(name,x,z)=>{component(x,z,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name,position:p(x,1,z)});};
 const probe=(name,x,z,property)=>signals.push({name,position:p(x,1,z),property});
 for(let bit=0;bit<8;bit++){
  const right=bit>=4,z=4*(bit%4),data=right?12:0,driver=right?11:1,store=right?10:2,q=right?9:3;
  lever('d'+bit,data,z);rep(driver,z,right?'west':'east');rep(store,z,right?'west':'east');wire(q,z);
  rep(store,z+1,'north');
  for(const x of right?[8,9,10]:[2,3,4])wire(x,z+2);
  rep(right?7:5,z+2,right?'east':'west');
  probe('q'+bit,store,z,'powered');probe('local_d'+bit,driver,z,'powered');
  probe('lock'+bit,store,z+1,'powered');probe('output'+bit,q,z,'power');probe('raw_d'+bit,data,z,'powered');
 }
 lever('hold',6,0);
 for(let z=1;z<=14;z++)if(z===11)rep(6,z,'south');else wire(6,z);
 probe('raw_hold',6,0,'powered');probe('far_hold',6,14,'power');
 const blocks=[...map.values()],box={from:p(0,0,0),to:p(12,1,14)};
 const bus=(name,prefix)=>({name,bits:Array.from({length:8},(_,i)=>prefix+i)});
 const circuit={id,dimension:'minecraft:overworld',description:'Unbuilt compact eight-bit locked-repeater word; HOLD high closes storage.',signals,buses:[bus('q','q'),bus('local_d','local_d'),bus('locks','lock'),bus('output_q','output'),bus('raw_d','raw_d')]};
 const tiles=[];
 // Nonoverlapping shallow bands. Every local support precedes its component.
 for(const[lo,hi]of[[0,6],[7,14]]){
  const tid=id+'_t'+tiles.length,b={from:p(0,0,lo),to:p(12,1,hi)};
  const items=blocks.filter(v=>v.position.z>=b.from.z&&v.position.z<=b.to.z).sort((a,b)=>a.position.y-b.position.y||a.position.z-b.position.z||a.position.x-b.position.x);
  const operations=[{op:'fill',box:b,block:{id:'minecraft:air'}},...items.map(v=>({op:'set',...v}))];
  assert(operations.length<=128&&volume(b)+items.length<=4096);
  tiles.push({region:{id:tid,dimension:'minecraft:overworld',box:b,description:'Unplaced dense word experiment; no decoder or independent reset'},plan:{id:tid,region_id:tid,label:'Compact word; support before component',operations}});
 }
 const histogram={};for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 return{status:'offline_density_prototype_native_unverified',id,origin,origin_status:'Local coordinates only. Default fits one aligned chunk; no world selected or inspected.',box,blocks,tiles,inputs,circuit,
  metrics:{blocks:blocks.length,dimensions:{x:13,y:2,z:15},bounding_volume:390,floor_footprint:195,bits:8,blocks_per_bit:blocks.length/8,histogram},
  semantics:{hold_false:'Transparent: after propagation Q follows D.',hold_true:'Store: after lock arrival Q retains its value while D changes.',initialization:'Write zero with HOLD low. No independent reset input.',integration:'Decoder, addressed read port, automatic clear sequencing, operand capture and clock are not included.'},
  native_gates:['All eight actual local-D signals must change opposite held Q while locks remain asserted.','Verify rising and falling data while transparent, HOLD close before D changes, and near/far lock skew.','A hold claim requires the full unchanged-input 200-tick interval after opposite local D was observed.','Verify all power states after a world reload and all output pads remain isolated.']};
}

export function makeDenseWordTests(d){
 const values=(data,hold)=>Object.fromEntries([...Array.from({length:8},(_,i)=>['d'+i,!!(data&(1<<i))]),['hold',hold]]);
 const patterns=[[255,0],[85,170],[1,128]];
 return patterns.map((ps,suite)=>{
  let q=0;const cases=[];
  const add=(name,data,hold)=>{if(!hold)q=data;cases.push({name,inputs:values(data,hold),expect:{q,local_d:data,locks:hold?255:0,output_q:q,raw_d:data,raw_hold:Number(hold),far_hold:Number(hold)}});};
  add('initialize_open_zero',0,false);add('initialize_close_zero',0,true);
  for(const [i,data]of ps.entries()){
   add('p'+i+'_data_while_closed',data,true);
   add('p'+i+'_write_open',data,false);
   add('p'+i+'_close_same_data',data,true);
   add('p'+i+'_prepare_opposite',data^255,true);
   add('p'+i+'_hold_opposite_200',data^255,true);
  }
  // A transparent path must respond without another HOLD edge.
  add('transparent_zero',0,false);add('transparent_one',255,false);add('transparent_zero_again',0,false);
  return{label:'dense_word_patterns_'+suite,spec:{circuit_id:d.id,inputs:d.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}};
 });
}

export async function checkDenseWord(){
 const [{buildRegionSchema,buildPlanSchema},{circuitSchema},{testRunSchema}]=await Promise.all([
  import('../tools/minecraft-redstone/scripts/build-service.mjs'),
  import('../tools/minecraft-redstone/scripts/circuit-service.mjs'),
  import('../tools/minecraft-redstone/scripts/test-runner-service.mjs')]);
 const d=makeDenseWord(),tests=makeDenseWordTests(d),seen=new Map();let supports=0,expectations=0;
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);for(const o of t.plan.operations){if(o.op==='fill'){for(let y=o.box.from.y;y<=o.box.to.y;y++)for(let z=o.box.from.z;z<=o.box.to.z;z++)for(let x=o.box.from.x;x<=o.box.to.x;x++)seen.set(key({x,y,z}),o.block);}else{if(o.block.id!=='minecraft:light_gray_concrete'){assert.equal(seen.get(key({...o.position,y:o.position.y-1}))?.id,'minecraft:light_gray_concrete');supports++;}seen.set(key(o.position),o.block);}}}
 for(const b of d.blocks)assert.deepEqual(seen.get(key(b.position)),b.block);
 assert.equal([...seen.values()].filter(b=>b.id!=='minecraft:air').length,d.blocks.length);circuitSchema.parse(d.circuit);
 for(const {spec}of tests){testRunSchema.parse(spec);assert(spec.cases.length*spec.settle_ticks<=6000);let stored=Array(8).fill(0);for(const c of spec.cases){for(let b=0;b<8;b++)if(!c.inputs.hold)stored[b]=Number(c.inputs['d'+b]);const data=Array.from({length:8},(_,b)=>Number(c.inputs['d'+b])).reduce((n,v,b)=>n+v*2**b,0),q=stored.reduce((n,v,b)=>n+v*2**b,0);assert.deepEqual(c.expect,{q,local_d:data,locks:c.inputs.hold?255:0,output_q:q,raw_d:data,raw_hold:Number(c.inputs.hold),far_hold:Number(c.inputs.hold)});expectations+=Object.keys(c.expect).length;}}
 // Native state is unproved; these only catch layout/schema/oracle mistakes.
 assert.equal(d.metrics.blocks,174);assert.equal(d.inputs.length,9);assert.equal(d.circuit.signals.length,42);
 return{status:'offline_checks_passed_native_unverified',...d.metrics,tiles:d.tiles.length,support_checks:supports,signals:d.circuit.signals.length,inputs:d.inputs.length,test_jobs:tests.length,test_cases:tests.reduce((n,t)=>n+t.spec.cases.length,0),expectations,native_calls:0,service_constructors:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await checkDenseWord();
 if(process.argv[2]==='--out'){assert(process.argv[3]);const out=resolve(process.argv[3]);mkdirSync(out);const d=makeDenseWord();for(const[n,v]of Object.entries({design:d,tests:makeDenseWordTests(d),'offline-check':result}))writeFileSync(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}
 else assert(process.argv.length===2||process.argv[2]==='--check');
 console.log(JSON.stringify(result));
}
