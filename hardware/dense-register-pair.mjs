// Offline two-word integration proposal. The live dense-register-word is unchanged.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(',');
const opposite={east:'west',west:'east',north:'south',south:'north'};
const delta={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
const solid='minecraft:light_gray_concrete';
const volume=b=>axes.reduce((n,a)=>n*(b.to[a]-b.from[a]+1),1);

export function makeDensePair({origin={x:0,y:0,z:0},id='dense_pair8'}={}){
 assert(axes.every(a=>Number.isSafeInteger(origin[a])));
 assert(origin.y>=-64&&origin.y+13<=319);
 assert(Math.abs(origin.x)<29999000&&Math.abs(origin.z)<29999000);
 assert(/^[a-z][a-z0-9_]{0,19}$/.test(id));
 const map=new Map(),inputs=[],signals=[],p=(x,y,z)=>({x:origin.x+x+2,y:origin.y+y,z:origin.z+z+16});
 const put=(x,y,z,name,properties)=>{const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})},k=key(position);if(map.has(k))assert.deepEqual(map.get(k).block,block,'conflicting placement '+k);else map.set(k,{position,block});};
 const block=(x,y,z)=>put(x,y,z,'light_gray_concrete');
 const component=(x,y,z,name,properties)=>{block(x,y-1,z);put(x,y,z,name,properties);};
 const wire=(x,y,z)=>component(x,y,z,'redstone_wire');
 const rep=(x,y,z,travel)=>component(x,y,z,'repeater',{facing:opposite[travel],delay:'1'});
 const cmp=(x,y,z,travel)=>component(x,y,z,'comparator',{facing:opposite[travel],mode:'subtract'});
 const lever=(name,x,y,z)=>{component(x,y,z,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name,position:p(x,y,z)});};
 const wall=(x,y,z,face)=>put(x,y,z,'redstone_wall_torch',{facing:face});
 const tower=(x,z,bottom,top)=>{for(let y=bottom;y<=top;y++)if((y-bottom)%2===0)block(x,y,z);else put(x,y,z,'redstone_torch');};
 const probe=(name,x,y,z,property)=>signals.push({name,position:p(x,y,z),property});

 // Shared D: two positive phases eight blocks apart, each followed by an
 // independent input repeater. Only the eight external lever positions are inputs.
 for(let b=0;b<8;b++){
  const right=b>=4,z=8*(b%4),x=right?12:0;
  lever('d'+b,right?14:-2,1,z);rep(right?13:-1,1,z,right?'west':'east');block(x,0,z);tower(x,z,1,9);
 }
 // Shared WE and WA supply both word planes. WA's upper arm is locally inverted.
 lever('we',6,1,-16);rep(6,1,-15,'south');block(6,0,-14);tower(6,-14,1,9);
 lever('wa',11,1,-15);rep(10,1,-15,'west');block(9,0,-15);tower(9,-15,1,9);
 // Read-address tower gives lower inhibit=RA; the upper wall torch gives !RA.
 lever('ra',15,1,-11);rep(15,1,-10,'south');block(15,0,-9);tower(15,-9,1,13);
 wall(14,13,-9,'west');wire(13,13,-9);

 for(let word=0;word<2;word++){
  const y=1+8*word,maskY=y+4,railX=word?13:15;
  rep(6,y,-13,'south');cmp(6,y,-12,'south');block(6,y,-11);wall(6,y,-10,'south');
  if(word)wall(9,y,-14,'south');else wire(9,y,-14);
  wire(9,y,-13);wire(9,y,-12);rep(8,y,-12,'west');wire(7,y,-12);
  for(let z=-9;z<=26;z++)if([-7,5,17].includes(z))rep(6,y,z,'south');else wire(6,y,z);
  for(let z=-8;z<=18;z++)if([-3,9].includes(z))rep(railX,maskY,z,'south');else wire(railX,maskY,z);
  probe('qualified'+word,6,y,-12,'powered');probe('far_hold'+word,6,y,26,'power');
  for(let b=0;b<8;b++){
   const right=b>=4,z=8*(b%4),driver=right?11:1,store=right?10:2,gate=right?9:3;
   rep(driver,y,z,right?'west':'east');rep(store,y,z,right?'west':'east');cmp(gate,y,z,right?'west':'east');
   rep(store,y,z+1,'north');
   for(const x of right?[8,9,10]:[2,3,4])wire(x,y,z+2);
   rep(right?7:5,y,z+2,right?'east':'west');
   // Four descending steps from a raised, refreshed read-mask crossbar.
   // Pitch eight keeps this stair clear of the preceding word's lock branch.
   for(let n=0;n<=4;n++)wire(gate,maskY-n,z-6+n);
   rep(gate,y,z-1,'south');
   probe(`q${word}_${b}`,store,y,z,'powered');probe(`local_d${word}_${b}`,driver,y,z,'powered');probe(`lock${word}_${b}`,store,y,z+1,'powered');
  }
  for(const z of [-6,2,10,18]){
   // The shared branch also visits both bit sides. Each comparator side receives
   // a fresh 15 through its own final repeater, regardless of trunk attenuation.
   rep(railX-1,maskY,z,'west');
   for(let x=3;x<railX-1;x++)if(x===5)rep(x,maskY,z,'west');else wire(x,maskY,z);
  }
 }
 // One upward OR column per bit. The upper comparator injects at the second
 // positive block level; its output cannot power the lower comparator's rear.
 for(let b=0;b<8;b++){
  const right=b>=4,z=8*(b%4),x=right?8:4;
  tower(x,z,1,11);put(x,12,z,'redstone_torch');
  rep(right?9:3,12,z,right?'east':'west');wire(right?10:2,12,z);
  probe('read'+b,right?9:3,12,z,'powered');
 }
 probe('raw_we',6,1,-16,'powered');probe('raw_wa',11,1,-15,'powered');probe('raw_ra',15,1,-11,'powered');
 const blocks=[...map.values()],box={from:p(-2,0,-16),to:p(15,13,26)};
 const buses=[];for(let w=0;w<2;w++)for(const n of ['q','local_d','lock'])buses.push({name:n+w,bits:Array.from({length:8},(_,b)=>`${n}${w}_${b}`)});
 buses.push({name:'read',bits:Array.from({length:8},(_,b)=>'read'+b)},{name:'qualified',bits:['qualified0','qualified1']},{name:'holds',bits:['far_hold0','far_hold1']});
 const circuit={id,dimension:'minecraft:overworld',description:'Offline compact 2x8 register integration: shared data, addressed writes and one addressed read bus.',signals,buses};
 const tiles=[];
 // Greedy nonoverlapping height bands; each local wall support is north of
 // its attached torch, so north-to-south tiles retain placement dependencies.
 for(let y=0;y<=13;y+=2){
  let z=-16;
  while(z<=26){
   let best=null;
   for(let end=z;end<=26;end++){
    const b={from:p(-2,y,z),to:p(15,Math.min(y+1,13),end)};
    const items=blocks.filter(v=>axes.every(a=>v.position[a]>=b.from[a]&&v.position[a]<=b.to[a]));
    if(items.length+1>128||volume(b)+items.length>4096)break;
    best={b,items,end};
   }
   assert(best);const{b,items,end}=best;z=end+1;
   if(!items.length)continue;
   items.sort((a,b)=>a.position.y-b.position.y||(Number(a.block.id!==solid)-Number(b.block.id!==solid))||a.position.z-b.position.z||a.position.x-b.position.x);
   const tid=id+'_t'+tiles.length,operations=[{op:'fill',box:b,block:{id:'minecraft:air'}},...items.map(v=>({op:'set',...v}))];
   tiles.push({region:{id:tid,dimension:'minecraft:overworld',box:b,description:'Unplaced compact two-word experiment'},plan:{id:tid,region_id:tid,label:'Shared buses, support before devices',operations}});
  }
 }
 const histogram={};for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 return{status:'offline_candidate_native_unverified',id,origin,box,blocks,tiles,inputs,circuit,metrics:{blocks:blocks.length,dimensions:{x:18,y:14,z:43},bounding_volume:volume(box),floor_footprint:18*43,storage_bits:16,histogram},semantics:{we_false:'Both words closed; change D, WA and RA only in this phase.',we_true:'Selected word transparent. Hold WA and D fixed until WE has closed again.',read:'One physical combinational byte port selected by RA, independent of WA.',reset:'No reset pin: write zero to both words, then close WE.',architectural_scope:'Two ordinary words only. No protected identities, operand capture, phase controller or ALU.'}};
}

export function makeDensePairTests(d){
 const suites=[];
 const make=(label,patterns,hold=false)=>{
  let words=[null,null],data=0,wa=0,ra=0,we=false;const cases=[];
  const add=(name,changes={})=>{({data,wa,ra,we}={data,wa,ra,we,...changes});if(we)words[wa]=data;const inputs=Object.fromEntries([...Array.from({length:8},(_,b)=>['d'+b,!!(data&(1<<b))]),['we',we],['wa',!!wa],['ra',!!ra]]);const qualified=we?2**wa:0;cases.push({name,inputs,expect:{...(words[0]===null?{}:{q0:words[0]}),...(words[1]===null?{}:{q1:words[1]}),local_d0:data,local_d1:data,lock0:we&&wa===0?0:255,lock1:we&&wa===1?0:255,...(words[ra]===null?{}:{read:words[ra]}),qualified,holds:3-qualified,raw_we:Number(we),raw_wa:wa,raw_ra:ra}});};
  const write=(prefix,word,value)=>{add(prefix+'_stage',{we:false,wa:word,data:value});add(prefix+'_open',{we:true});add(prefix+'_close',{we:false});};
  write('clear0',0,0);write('clear1',1,0);
  for(let w=0;w<2;w++)write('load'+w,w,patterns[w]);
  add('read0',{ra:0});add('read1',{ra:1});
  if(hold){add('opposite_prepare',{data:patterns[0]^255,wa:0,ra:0});add('opposite_hold_200');add('other_prepare',{data:patterns[1]^255,wa:1,ra:1});add('other_hold_200');}
  else{add('closed_perturb0',{data:255,wa:1,ra:0});add('closed_perturb1',{data:0,wa:0,ra:1});}
  add('all_controls_off',{data:0,wa:0,ra:0,we:false});
  suites.push({label,spec:{circuit_id:d.id,inputs:d.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
 };
 make('pair_00_ff',[0,255]);make('pair_ff_00',[255,0]);make('pair_55_aa',[85,170],true);make('pair_aa_55',[170,85],true);make('pair_cc_33',[204,51]);make('pair_f0_0f',[240,15]);
 const clear=structuredClone(suites[0]);clear.label='pair_final_clear';clear.spec.cases=clear.spec.cases.slice(0,6);clear.spec.cases.push({name:'all_controls_off',inputs:Object.fromEntries(d.inputs.map(v=>[v.name,false])),expect:{q0:0,q1:0,local_d0:0,local_d1:0,lock0:255,lock1:255,read:0,qualified:0,holds:3,raw_we:0,raw_wa:0,raw_ra:0}});suites.push(clear);
 return suites;
}

export async function checkDensePair(){
 const [{buildRegionSchema,buildPlanSchema},{circuitSchema},{testRunSchema}]=await Promise.all([import('../tools/minecraft-redstone/scripts/build-service.mjs'),import('../tools/minecraft-redstone/scripts/circuit-service.mjs'),import('../tools/minecraft-redstone/scripts/test-runner-service.mjs')]);
 const d=makeDensePair(),tests=makeDensePairTests(d),seen=new Map();let supports=0,expectations=0;
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);for(const o of t.plan.operations){if(o.op==='fill'){for(let y=o.box.from.y;y<=o.box.to.y;y++)for(let z=o.box.from.z;z<=o.box.to.z;z++)for(let x=o.box.from.x;x<=o.box.to.x;x++)seen.set(key({x,y,z}),o.block);}else{assert(axes.every(a=>o.position[a]>=t.region.box.from[a]&&o.position[a]<=t.region.box.to[a]));if(o.block.id!==solid){let under={...o.position,y:o.position.y-1};if(o.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=delta[o.block.properties.facing];under={...o.position,x:o.position.x-dx,z:o.position.z-dz};}assert.equal(seen.get(key(under))?.id,solid,'missing support '+key(o.position));supports++;}seen.set(key(o.position),o.block);}}}
 for(const b of d.blocks)assert.deepEqual(seen.get(key(b.position)),b.block);assert.equal([...seen.values()].filter(b=>b.id!=='minecraft:air').length,d.blocks.length);circuitSchema.parse(d.circuit);
 for(const{spec}of tests){testRunSchema.parse(spec);assert(spec.cases.length*spec.settle_ticks<=6000);const q=[null,null];let previous=null;for(const c of spec.cases){const we=+c.inputs.we,wa=+c.inputs.wa,ra=+c.inputs.ra,db=Array.from({length:8},(_,b)=>+c.inputs['d'+b]),pack=v=>v.reduce((n,bit,b)=>n+bit*2**b,0);if(previous?.we||we){assert.equal(previous?.wa??wa,wa,'address changed across write window');assert.equal(previous?.data??pack(db),pack(db),'data changed across write window');}if(we)q[wa]=[...db];const qual=we*2**wa;assert.deepEqual(c.expect,{...(q[0]===null?{}:{q0:pack(q[0])}),...(q[1]===null?{}:{q1:pack(q[1])}),local_d0:pack(db),local_d1:pack(db),lock0:we&&wa===0?0:255,lock1:we&&wa===1?0:255,...(q[ra]===null?{}:{read:pack(q[ra])}),qualified:qual,holds:3-qual,raw_we:we,raw_wa:wa,raw_ra:ra});expectations+=Object.keys(c.expect).length;previous={we,wa,data:pack(db)};}}
 for(const s of d.circuit.signals)assert(d.blocks.some(b=>key(b.position)===key(s.position)));
 assert.equal(d.inputs.length,11);assert.equal(d.circuit.signals.length,63);
 return{status:'offline_schema_support_and_oracle_pass_native_unverified',...d.metrics,tiles:d.tiles.length,support_checks:supports,signals:63,inputs:11,test_jobs:tests.length,test_cases:tests.reduce((n,t)=>n+t.spec.cases.length,0),expectations,native_calls:0,service_constructors:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await checkDensePair();if(process.argv[2]==='--out'){assert(process.argv[3]);const dir=resolve(process.argv[3]);mkdirSync(dir);const d=makeDensePair();for(const[n,v]of Object.entries({design:d,tests:makeDensePairTests(d),'offline-check':result}))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(result));}
