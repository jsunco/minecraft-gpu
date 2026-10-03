// Additive offline operand-capture candidate. No native calls or parent writes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeDensePair} from './dense-register-pair.mjs';

const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(',');
const solid='minecraft:light_gray_concrete',facing={east:'west',west:'east',north:'south',south:'north'};
const volume=b=>axes.reduce((n,a)=>n*(b.to[a]-b.from[a]+1),1);
const contains=(b,p)=>axes.every(a=>p[a]>=b.from[a]&&p[a]<=b.to[a]);

export function makeDenseOperands({parent=makeDensePair(),id='dense_operands'}={}){
 assert(/^[a-z][a-z0-9_]{0,19}$/.test(id));
 assert.deepEqual(parent,makeDensePair({origin:parent.origin,id:parent.id}),'Parent must be the unchanged pair generator output');
 assert(parent.origin.y+20<=319);
 const original=JSON.stringify(parent),map=new Map(),parentMap=new Map(parent.blocks.map(v=>[key(v.position),v]));
 const p=(x,y,z)=>({x:parent.origin.x+x+2,y:parent.origin.y+y,z:parent.origin.z+z+16});
 const put=(x,y,z,name,properties)=>{const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})},k=key(position);assert(!parentMap.has(k),'would write parent '+k);if(map.has(k))assert.deepEqual(map.get(k).block,block,'addition collision '+k);else map.set(k,{position,block});};
 const block=(x,y,z)=>put(x,y,z,'light_gray_concrete');
 const component=(x,y,z,name,properties)=>{block(x,y-1,z);put(x,y,z,name,properties);};
 const wire=(x,y,z)=>component(x,y,z,'redstone_wire');
 const rep=(x,y,z,travel)=>component(x,y,z,'repeater',{facing:facing[travel],delay:'1'});
 const inputs=structuredClone(parent.inputs),signals=[],guardSignals=[];
 const signal=(name,x,y,z,property)=>({name,position:p(x,y,z),property});
 const lever=(name,x,y,z)=>{component(x,y,z,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name,position:p(x,y,z)});};
 // The old pad is a source only. A northbound diode isolates the new column.
 for(let bit=0;bit<8;bit++){
  const x=bit<4?2:10,row=8*(bit%4);
  rep(x,12,row-1,'north');
  for(let y=12;y<=20;y++)if(y%2===0)block(x,y,row-2);else put(x,y,row-2,'redstone_torch');
 }
 for(const [operand,y]of[['a',16],['b',20]]){
  lever('capture_'+operand,6,y,-7);rep(6,y,-6,'south');block(6,y,-5);
  put(6,y,-4,'redstone_wall_torch',{facing:'south'});
  for(let z=-3;z<=24;z++)if(z===5||z===17)rep(6,y,z,'south');else wire(6,y,z);
  for(let bit=0;bit<8;bit++){
   const right=bit>=4,row=8*(bit%4),driver=right?11:1,store=right?12:0,output=right?13:-1;
   rep(driver,y,row-2,right?'east':'west');rep(store,y,row-2,right?'east':'west');wire(output,y,row-2);
   rep(store,y,row-1,'north');rep(right?7:5,y,row,right?'east':'west');
   for(const x of right?[8,9,10,11,12]:[0,1,2,3,4])wire(x,y,row);
   signals.push(signal(operand+bit,store,y,row-2,'powered'),signal('d'+operand+bit,driver,y,row-2,'powered'),signal('l'+operand+bit,store,y,row-1,'powered'));
  }
  signals.push(signal('raw_capture_'+operand,6,y,-7,'powered'));
 }
 for(const s of parent.circuit.signals.filter(s=>/^read\d+$/.test(s.name)||/^raw_(we|wa|ra)$/.test(s.name)))signals.push(structuredClone(s));
 const byte=(name,prefix)=>({name,bits:Array.from({length:8},(_,b)=>prefix+b)});
 const buses=[byte('a','a'),byte('b','b'),byte('local_a','da'),byte('local_b','db'),byte('locks_a','la'),byte('locks_b','lb'),byte('read','read')];
 const circuit={id,dimension:parent.circuit.dimension,description:'Two physically retained byte operands from the shared addressed read bus; CAPTURE=true opens only its operand.',signals,buses};
 guardSignals.push(...signals.filter(s=>!/^d[ab]\d+$/.test(s.name)),...parent.circuit.signals.filter(s=>/^q[01]_\d+$/.test(s.name)));
 const guardCircuit={id:id+'_parent',dimension:circuit.dimension,description:'Parent-storage isolation during operand capture; actual-local-D retention uses the main view.',signals:structuredClone(guardSignals),buses:[...buses.filter(b=>!b.name.startsWith('local_')),...parent.circuit.buses.filter(b=>/^q[01]$/.test(b.name))]};
 const additions=[...map.values()],tiles=[];
 const tile=(box,items)=>{
  assert(items.length>0&&items.length<=127&&volume(box)<=4096);
  assert(!parent.blocks.some(v=>contains(box,v.position)),'tile is not parent-empty');
  items.sort((a,b)=>a.position.y-b.position.y||(Number(a.block.id!==solid)-Number(b.block.id!==solid))||a.position.z-b.position.z||a.position.x-b.position.x);
  const tid=id+'_t'+tiles.length;
  tiles.push({region:{id:tid,dimension:circuit.dimension,box,description:'Additive operand tile; whole rectangle was empty in exact parent map; fresh native check required'},plan:{id:tid,region_id:tid,label:'Set-only new operand blocks; no parent writes or fills',operations:items.map(v=>({op:'set',...v}))}});
 };
 // Skinny low tap regions avoid the old read pads, collector and RA wiring.
 for(const row of[0,8,16,24]){const box={from:p(2,11,row-2),to:p(10,13,row-1)};tile(box,additions.filter(v=>contains(box,v.position)));}
 // Everything from Y14 upward is above the parent. Greedy set count bounds.
 for(let y=14;y<=20;y+=2){let z=-7;while(z<=24){let best=null;for(let end=z;end<=24;end++){const box={from:p(-1,y,z),to:p(13,Math.min(y+1,20),end)},items=additions.filter(v=>contains(box,v.position));if(items.length>127||volume(box)>4096)break;best={box,items,end};}assert(best);z=best.end+1;if(best.items.length)tile(best.box,best.items);}}
 const blocks=[...structuredClone(parent.blocks),...additions],histogram={};for(const b of additions)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 assert.equal(JSON.stringify(parent),original,'parent mutated');
 return{status:'offline_additive_candidate_native_unverified',id,origin:structuredClone(parent.origin),box:{from:structuredClone(parent.box.from),to:{...parent.box.to,y:parent.origin.y+20}},blocks,additions,tiles,inputs,circuit,guard_circuit:guardCircuit,parent_reference:{id:parent.id,box:structuredClone(parent.box),blocks:structuredClone(parent.blocks),circuit:structuredClone(parent.circuit)},metrics:{parent_blocks:parent.blocks.length,added_blocks:additions.length,total_blocks:blocks.length,added_histogram:histogram,combined_dimensions:{x:18,y:21,z:43},combined_bounding_volume:18*21*43,unchanged_xz_footprint:true,added_controls:2,controls:inputs.length,capture_bits:16,plans:tiles.length},semantics:{capture_false:'The inverted HOLD rail closes the operand. This is the default control state.',capture_true:'Only this operand is transparent to the actual read bus, after propagation.',sequence:'Close both operands and WE; select Rs; capture/close A; select Rt; capture/close B; only then UPDATE.',reset:'Read a physically cleared source and deliberately open both operands, then close; no direct internal-state edit.',scope:'Two ordinary parent words and two retained operands. No ALU or automatic REQUEST/UPDATE controller.'},native_gates:['All input and control timing is physical; no host-held operands.','Require all local lock drivers high before RA or WE changes, then retain both operand values throughout the complete switch/write window.','Opposite-D holds require actual da/db, la/lb and retained a/b throughout an extra unchanged-input200-tick interval.','The existing read pads gain a north connection; check their expected shape and all parent signals. No parent coordinate is written.']};
}

export function makeDenseOperandTests(d){
 const suites=[];
 const make=(label,values,aliasWord,sameAddress=false,guard=false,clearOnly=false)=>{
  let words=[null,null],a=null,b=null,data=0,wa=0,ra=0,we=false,ca=false,cb=false;const cases=[];
  const add=(name,changes={})=>{
   ({data,wa,ra,we,ca,cb}={data,wa,ra,we,ca,cb,...changes});if(we)words[wa]=data;const read=words[ra];if(ca)a=read;if(cb)b=read;
   const inputs=Object.fromEntries([...Array.from({length:8},(_,i)=>['d'+i,!!(data&(1<<i))]),['we',we],['wa',!!wa],['ra',!!ra],['capture_a',ca],['capture_b',cb]]);
   const expect={...(a===null?{}:{a}),...(b===null?{}:{b}),locks_a:ca?0:255,locks_b:cb?0:255,...(read===null?{}:{read}),raw_we:+we,raw_wa:wa,raw_ra:ra,raw_capture_a:+ca,raw_capture_b:+cb};
   if(guard){if(words[0]!==null)expect.q0=words[0];if(words[1]!==null)expect.q1=words[1];}else if(read!==null){expect.local_a=read;expect.local_b=read;}
   cases.push({name,inputs,expect});
  };
  const write=(prefix,word,value)=>{add(prefix+'_stage',{we:false,wa:word,data:value});add(prefix+'_open',{we:true});add(prefix+'_close',{we:false});};
  write('clear0',0,0);write('clear1',1,0);add('initialize_operands',{ca:true,cb:true,ra:0});add('close_initial_operands',{ca:false,cb:false});
  if(!clearOnly){
   write('load0',0,values[0]);write('load1',1,values[1]);
   add('request_a_select',{ra:sameAddress?1:0});add('request_a_open',{ca:true});add('request_a_close',{ca:false});
   add('request_b_select',{ra:1});add('request_b_open',{cb:true});add('request_b_close',{cb:false});
   write('aliased_update',aliasWord,values[aliasWord]^255);
   add('opposite_local_d_prepare',{ra:aliasWord});add('opposite_local_d_hold_200');
  }
  add('all_controls_off',{data:0,wa:0,ra:0,we:false,ca:false,cb:false});
  suites.push({label,spec:{circuit_id:guard?d.guard_circuit.id:d.id,inputs:d.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
 };
 make('capture_55aa_alias_a',[85,170],0);make('capture_aa55_alias_b',[170,85],1);make('capture_cc33_alias_a',[204,51],0);make('capture_f00f_alias_b',[240,15],1);make('capture_same_word',[0,240],1,true);make('capture_parent_guard',[85,170],0,false,true);make('capture_final_clear',[0,0],0,false,false,true);
 return suites;
}

export async function checkDenseOperands(){
 const[{buildRegionSchema,buildPlanSchema},{circuitSchema},{testRunSchema}]=await Promise.all([import('../tools/minecraft-redstone/scripts/build-service.mjs'),import('../tools/minecraft-redstone/scripts/circuit-service.mjs'),import('../tools/minecraft-redstone/scripts/test-runner-service.mjs')]);
 const d=makeDenseOperands(),tests=makeDenseOperandTests(d),seen=new Map(d.parent_reference.blocks.map(v=>[key(v.position),v.block]));let supports=0,assertions=0,readbacks=0;
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);readbacks+=volume(t.region.box);assert(!d.parent_reference.blocks.some(v=>contains(t.region.box,v.position)));for(const o of t.plan.operations){assert.equal(o.op,'set');assert(contains(t.region.box,o.position));assert(!seen.has(key(o.position)),'overlap with parent/prior plan');if(o.block.id!==solid){const below=o.block.id==='minecraft:redstone_wall_torch'?{...o.position,z:o.position.z-1}:{...o.position,y:o.position.y-1};assert.equal(seen.get(key(below))?.id,solid,'support missing '+key(o.position));supports++;}seen.set(key(o.position),o.block);}}
 for(const v of d.blocks)assert.deepEqual(seen.get(key(v.position)),v.block);assert.equal(seen.size,d.blocks.length);
 for(const c of[d.circuit,d.guard_circuit]){circuitSchema.parse(c);assert.equal(c.signals.length,61);for(const s of c.signals)assert(seen.has(key(s.position)));}
 const pack=a=>a.reduce((n,v,i)=>n+v*2**i,0);
 for(const{spec}of tests){testRunSchema.parse(spec);const words=[null,null],operands=[null,null];let prev=null;
  for(const c of spec.cases){const s=c.inputs,di=Array.from({length:8},(_,i)=>+s['d'+i]),wa=+s.wa,ra=+s.ra,opens=[s.capture_a,s.capture_b];
   if(prev&&(prev.we||s.we)){assert.equal(s.wa,prev.wa);for(let i=0;i<8;i++)assert.equal(s['d'+i],prev['d'+i]);}
   if(prev&&(prev.ra!==s.ra||prev.we!==s.we)){assert(!prev.capture_a&&!prev.capture_b&&!s.capture_a&&!s.capture_b,'address/write edge with operand open');}
   if(s.we)words[wa]=[...di];const read=words[ra];for(let k=0;k<2;k++)if(opens[k])operands[k]=read===null?null:[...read];
   const e={...(operands[0]===null?{}:{a:pack(operands[0])}),...(operands[1]===null?{}:{b:pack(operands[1])}),locks_a:s.capture_a?0:255,locks_b:s.capture_b?0:255,...(read===null?{}:{read:pack(read)}),raw_we:+s.we,raw_wa:wa,raw_ra:ra,raw_capture_a:+s.capture_a,raw_capture_b:+s.capture_b};
   if(spec.circuit_id===d.guard_circuit.id){if(words[0]!==null)e.q0=pack(words[0]);if(words[1]!==null)e.q1=pack(words[1]);}else if(read!==null){e.local_a=pack(read);e.local_b=pack(read);}
   assert.deepEqual(c.expect,e);assertions+=Object.keys(e).length;prev=s;
  }
 }
 assert.equal(d.inputs.length,13);
 return{status:'offline_layout_schema_and_oracle_pass_native_unverified',...d.metrics,placement_support_checks:supports,readback_cells:readbacks,main_signals:61,guard_signals:61,max_set_operations:Math.max(...d.tiles.map(t=>t.plan.operations.length)),max_reserved_cells:Math.max(...d.tiles.map(t=>volume(t.region.box))),jobs:tests.length,phases:tests.reduce((n,t)=>n+t.spec.cases.length,0),expectations:assertions,phases_per_job:tests.map(t=>t.spec.cases.length),parent_blocks_unchanged:true,parent_tile_overlap:0,native_calls:0,service_constructors:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const check=await checkDenseOperands();if(process.argv[2]==='--out'){assert(process.argv[3]);const dir=resolve(process.argv[3]);mkdirSync(dir);const d=makeDenseOperands();for(const[n,v]of Object.entries({design:d,tests:makeDenseOperandTests(d),'offline-check':check}))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(check));}
