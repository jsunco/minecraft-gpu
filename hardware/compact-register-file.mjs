// Offline full-byte assembly from the frozen coordinate accounting. No native services.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactReadSkeleton} from './compact-read-skeleton.mjs';
import {makeCompactReadHeader} from './compact-read-header.mjs';
import {makeAddressDecoder4} from './address-decoder4.mjs';
import {makeDenseOperands} from './dense-operand-capture.mjs';

const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(','),solid='minecraft:light_gray_concrete';
const sha=b=>createHash('sha256').update(b).digest('hex'),parentSha='c1118c7e10a118a7e2ac24e4334154993b01351dbce9a679d3873cfcc3b2d347';
const accountingSha='ec0ee693139eab8b6b724664a8184074fc8fe60704a3e9cdc66f89c8fa4a4651';
const sourcePins={'hardware/address-decoder4.mjs':'b0872a2188089f10494cfa89f531c38d0e7328b84460533bcd24db936c993776','hardware/dense-register-pair.mjs':'933b9006dcc894aed256eed57e777a08ac29cdfc3f32ca6e349b36b10f5c0a4b','hardware/dense-operand-capture.mjs':'0206103404f706a44a2f99f6210db46f299252db8423979e0874e18ee5256700'};
const contains=(box,p)=>axes.every(a=>p[a]>=box.from[a]&&p[a]<=box.to[a]);
const volume=box=>axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1);
const bounds=items=>({from:Object.fromEntries(axes.map(a=>[a,Math.min(...items.map(v=>v.position[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...items.map(v=>v.position[a]))]))});
const rootRead=(p,...rest)=>readFileSync(typeof p==='string'&&!p.startsWith('/')?new URL('../'+p,import.meta.url):p,...rest);
const attachment={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]};
function support(v){if([solid,'minecraft:redstone_block'].includes(v.block.id))return null;const p=v.position;if(v.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=attachment[v.block.properties.facing];return{...p,x:p.x+dx,z:p.z+dz};}return{...p,y:p.y-1};}
function accountingMap(){
 for(const[p,h]of Object.entries(sourcePins))assert.equal(sha(rootRead(p)),h,'Accounting dependency changed');
 const source=rootRead('artifacts/compact-full-register-plan-v1/count-layout.mjs','utf8');assert.equal(sha(source),accountingSha);
 return new Function('assert','makeAddressDecoder4','makeDenseOperands','createHash','readFileSync','console',source.replace(/^import .*;\n/gm,'')+'\nreturn cells;')(assert,makeAddressDecoder4,makeDenseOperands,createHash,rootRead,{log(){}});
}

export function makeCompactRegisterFile({parent=makeCompactReadSkeleton(),id='compact_register_file',lane=1}={}){
 assert(/^[a-z][a-z0-9_]{0,20}$/.test(id));assert(Number.isInteger(lane)&&lane>=0&&lane<4);
 assert.equal(sha(readFileSync(new URL('./compact-read-skeleton.mjs',import.meta.url))),parentSha);
 assert.deepEqual(parent,makeCompactReadSkeleton({parent:makeCompactReadHeader({origin:parent.origin,id:parent.parent_reference.id}),id:parent.id}),'Exact unchanged skeleton required');
 const original=JSON.stringify(parent),full=accountingMap();assert.equal(full.size,12872);
 const p=(x,y,z)=>Object.fromEntries(axes.map((a,i)=>[a,parent.origin[a]+[x,y,z][i]]));
 const blocks=[...full.values()].map(v=>({position:p(v.position.x,v.position.y,v.position.z),block:structuredClone(v.block)}));
 // R15 is a physical lane constant. Lane1 exactly reproduces the frozen map.
 for(let b=0;b<8;b++){const at=p(b>=4?10:2,121,8*(b%4)),v=blocks.find(v=>key(v.position)===key(at));assert(v);v.block={id:lane&(1<<b)?'minecraft:redstone_block':solid};}
 const all=new Map(blocks.map(v=>[key(v.position),v])),parentMap=new Map(parent.blocks.map(v=>[key(v.position),v.block]));
 for(const v of parent.blocks)assert.deepEqual(all.get(key(v.position))?.block,v.block,'Parent changed');
 const additions=blocks.filter(v=>!parentMap.has(key(v.position))),sources=additions.filter(v=>v.block.id==='minecraft:redstone_block'),ordinary=additions.filter(v=>v.block.id!=='minecraft:redstone_block'),tiles=[];
 function tile(items){if(!items.length)return;const box=bounds(items),foreign=[...parent.blocks,...sources].filter(v=>contains(box,v.position));
  if(items.length>127||volume(box)>4096||foreign.length){
   const axis=axes.reduce((a,b)=>box.to[a]-box.from[a]>=box.to[b]-box.from[b]?a:b),mid=Math.floor((box.from[axis]+box.to[axis])/2);
   assert(mid<box.to[axis],'Cannot split parent-intersecting tile');tile(items.filter(v=>v.position[axis]<=mid));tile(items.filter(v=>v.position[axis]>mid));return;
  }
  items.sort((a,b)=>a.position.y-b.position.y||Number(a.block.id!==solid)-Number(b.block.id!==solid)||a.position.z-b.position.z||a.position.x-b.position.x);
  const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:parent.circuit.dimension,box,description:'Additive full-byte register tile; exact parent-empty, fresh native check required'},plan:{id:tid,region_id:tid,label:'Set-only full-byte state/control additions; sources placed last',operations:items.map(v=>({op:'set',...v}))}});
 }
 // Two-wide Z bands separate the dense data/HOLD rows from the parent's
 // mask stairs. This avoids hundreds of tiny tiles caused by horizontal slabs.
 const box=bounds(blocks);for(let z=box.from.z;z<=box.to.z;z+=2)tile(ordinary.filter(v=>v.position.z>=z&&v.position.z<=z+1));
 const owners=new Map();tiles.forEach((t,i)=>t.plan.operations.forEach(o=>owners.set(key(o.position),i)));
 const deps=tiles.map(()=>new Set());for(const[i,t]of tiles.entries())for(const o of t.plan.operations){const s=support(o);if(s){assert.equal(all.get(key(s))?.block.id,solid,'Missing final support');if(!parentMap.has(key(s))){const j=owners.get(key(s));assert(j!==undefined,'Powered source is required before final placement');if(j!==i)deps[i].add(j);}}}
 const ordered=[],done=new Set();while(done.size<tiles.length){const i=tiles.findIndex((_,i)=>!done.has(i)&&[...deps[i]].every(j=>done.has(j)));assert(i>=0,'Cyclic support dependencies');done.add(i);ordered.push(tiles[i]);}
 for(const v of sources){const tid=id+'_power'+ordered.length;ordered.push({region:{id:tid,dimension:parent.circuit.dimension,box:{from:v.position,to:v.position},description:'Final constant source; all routes must already be placed'},plan:{id:tid,region_id:tid,label:'Install final R14/R15 constant source',operations:[{op:'set',...v}]}});}
 const inputs=[];const input=(name,x,y,z)=>inputs.push({name,position:p(x,y,z)});
 for(let b=0;b<8;b++)input('d'+b,b>=4?14:-2,1,8*(b%4));
 for(let b=0;b<4;b++)input('wa'+b,b%2?-4:-20,1,b<2?-18:-6);
 for(const[b,v]of parent.inputs.entries())inputs.push({name:'ra'+b,position:structuredClone(v.position)});
 input('we',6,1,-16);
 for(let b=0;b<8;b++)input('block'+b,b>=4?14:-2,105,8*(b%4));
 input('assign',6,105,-16);input('capture_a',6,128,-7);input('capture_b',6,132,-7);
 const raw=inputs.map(v=>({name:'raw_'+v.name,position:v.position,property:'powered'})),rawBy=n=>raw.find(v=>v.name==='raw_'+n);
 const sig=(name,x,y,z,property='powered')=>({name,position:p(x,y,z),property});
 const byte=(name,prefix)=>({name,bits:Array.from({length:8},(_,b)=>prefix+b)});
 const read=Array.from({length:8},(_,b)=>sig('read'+b,b>=4?9:3,124,8*(b%4)));
 const operands=which=>Array.from({length:8},(_,b)=>sig(which+b,b>=4?12:0,which==='a'?128:132,8*(b%4)-2));
 const q=w=>Array.from({length:8},(_,b)=>sig(`q${w}_${b}`,b>=4?10:2,1+8*w,8*(b%4)));
 const local=w=>Array.from({length:8},(_,b)=>sig(`local${w}_${b}`,b>=4?11:1,1+8*w,8*(b%4)));
 const locks=w=>Array.from({length:8},(_,b)=>sig(`lock${w}_${b}`,b>=4?10:2,1+8*w,8*(b%4)+1));
 const qualified=w=>sig('qualified'+w,6,1+8*w,-12);
 const controlNames=['wa0','wa1','wa2','wa3','ra0','ra1','ra2','ra3','we','assign','capture_a','capture_b'];
 const rawControlBuses=[{name:'wa',bits:Array.from({length:4},(_,b)=>'raw_wa'+b)},{name:'ra',bits:Array.from({length:4},(_,b)=>'raw_ra'+b)},{name:'controls',bits:['raw_we','raw_assign','raw_capture_a','raw_capture_b']}];
 const view=(suffix,description,signals,buses)=>({id:id+suffix,dimension:parent.circuit.dimension,description,signals,buses});
 const circuits=[];
 circuits.push(view('','Functional full-byte read, retained R13, physical operands and all28 actual source controls.',[...read,...operands('a'),...operands('b'),...q(13),...raw],[byte('read','read'),byte('a','a'),byte('b','b'),byte('r13','q13_'),byte('data','raw_d'),byte('block_id','raw_block'),...rawControlBuses]));
 const operandSignals=[...read,...operands('a'),...operands('b')];
 for(const[w,y]of[['a',128],['b',132]])for(let b=0;b<8;b++)operandSignals.push(sig('local_'+w+b,b>=4?11:1,y,8*(b%4)-2),sig('lock_'+w+b,b>=4?12:0,y,8*(b%4)-1));
 operandSignals.push(...['ra0','ra1','ra2','ra3','we','assign','capture_a','capture_b'].map(rawBy));
 circuits.push(view('_operands','Actual A/B Q, normalized local D and lock drivers for continuous retention; read bus and source-address/control context.',operandSignals,[byte('read','read'),byte('a','a'),byte('b','b'),byte('local_a','local_a'),byte('local_b','local_b'),byte('locks_a','lock_a'),byte('locks_b','lock_b'),...rawControlBuses.filter(v=>v.name!=='wa')]));
 for(const[suffix,words]of[['_near_far',[0,12]],['_protected',[12,13]]])circuits.push(view(suffix,'Two-word actual stored Q/local D/locks plus source addresses and write/capture controls.',[...words.flatMap(w=>[...q(w),...local(w),...locks(w),qualified(w)]),...controlNames.map(rawBy)],[...words.flatMap(w=>[byte('q'+w,'q'+w+'_'),byte('local'+w,'local'+w+'_'),byte('locks'+w,'lock'+w+'_')]),{name:'qualified',bits:words.map(w=>'qualified'+w)},...rawControlBuses]));
 for(const[i,words]of[[0,[0,1,2,3]],[1,[4,5,6,7]],[2,[8,9,10,11]],[3,[12,13]]])circuits.push(view('_words'+i,'Direct stored bytes for address/write-isolation coverage; no local-D hold claim from this view.',[...words.flatMap(w=>[...q(w),qualified(w)]),...controlNames.map(rawBy),...Array.from({length:8},(_,b)=>rawBy('d'+b)),...read],[...words.map(w=>byte('q'+w,'q'+w+'_')),{name:'qualified',bits:words.map(w=>'qualified'+w)},byte('data','raw_d'),byte('read','read'),...rawControlBuses]));
 const histogram={};for(const v of additions)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const crosses=blocks.filter(v=>v.block.id==='minecraft:redstone_wire'&&['north','east','south','west'].every(k=>v.block.properties?.[k]==='side')).map(v=>v.position);
 const batches=[];for(let i=0;i<ordered.length;i+=24)batches.push({index:batches.length,first_tile:i,tile_count:Math.min(24,ordered.length-i)});
 assert.equal(JSON.stringify(parent),original);assert.equal(inputs.length,28);assert.equal(crosses.length,64);
 return{status:'offline_full_byte_candidate_native_unverified',id,lane,origin:structuredClone(parent.origin),origin_means:parent.origin_means,box,blocks,additions,tiles:ordered,build_batches:batches,inputs,circuit:circuits[0],guard_circuit:circuits[1],circuits,crosses,constant_sources:sources.map(v=>v.position),parent_reference:{id:parent.id,box:parent.box,blocks:structuredClone(parent.blocks),circuits:structuredClone(parent.circuits)},
  metrics:{parent_blocks:parent.blocks.length,added_blocks:additions.length,total_blocks:blocks.length,added_histogram:histogram,dimensions:{x:53,y:133,z:45},bounding_volume:volume(box),controls:inputs.length,views:circuits.length,signals_per_view:circuits.map(v=>v.signals.length),plans:ordered.length,batches:batches.length,ordinary_bytes:13,retained_block_id_bytes:1,operand_bytes:2,constant_bytes:2},
  sources:{'hardware/compact-read-skeleton.mjs':parentSha,'artifacts/compact-full-register-plan-v1/count-layout.mjs':accountingSha,...sourcePins},
  semantics:{ordinary:'D/WA/WE write onlyR0-R12; lowWE means closed. Stage addresses/data while closed.',r13:'Separate block_id/ASSIGN writes retainedR13. Ordinary writes13-15 are physically disconnected.',identities:`R14=4;R15=${lane}. Constants are final placed source blocks, never test-controlled.`,operands:'Capture A/B from the actual one-address read bus, close before RA or UPDATE. Defer ASSIGN until both have captured oldR13.',initialization:'Execution remains disabled. Visit everyRA source address, condition actualD/block_id, initialize all ordinary words/R13 and operands through their real controls. Never force internal states.',reset:'Sequential real writes clear all13ordinary words,R13 and A/B; constants remain. No automatic controller yet.',scope:'One complete byte file interface and operands for one lane. No phase/reset/address mux controller, ALU, memories, instruction execution or otherlanes.',construction:'Continuous shared lock across simple24-plan BuildService batches; separate state directory per batch. Every new rectangle must be inspected empty; poweredconstants are last. Register all eight views.',harness:'28declared inputs exceed public16-input schema. A separately reviewed exact-spec28-input harness is required; do not widen installed limits.'}};
}

export async function checkCompactRegisterFile(){
 const[{buildRegionSchema,buildPlanSchema},{circuitSchema}]=await Promise.all([import('../tools/minecraft-redstone/scripts/build-service.mjs'),import('../tools/minecraft-redstone/scripts/circuit-service.mjs')]);
 const d=makeCompactRegisterFile(),seen=new Map(d.parent_reference.blocks.map(v=>[key(v.position),v.block]));let supports=0,readbacks=0,poweredStarted=false;
 for(let i=0;i<d.tiles.length;i++)for(let j=0;j<i;j++)assert(!axes.every(a=>d.tiles[i].region.box.from[a]<=d.tiles[j].region.box.to[a]&&d.tiles[j].region.box.from[a]<=d.tiles[i].region.box.to[a]),'Overlapping new regions');
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);assert(!d.parent_reference.blocks.some(v=>contains(t.region.box,v.position)));readbacks+=volume(t.region.box);
  for(const o of t.plan.operations){assert.equal(o.op,'set');assert(contains(t.region.box,o.position));assert(!seen.has(key(o.position)),'Parent/duplicate write');const s=support(o);if(s){assert.equal(seen.get(key(s))?.id,solid,'Missing placement support');supports++;}if(o.block.id==='minecraft:redstone_block')poweredStarted=true;else assert(!poweredStarted,'Non-source after constant placement');seen.set(key(o.position),o.block);}
 }
 assert.equal(seen.size,12872);for(const v of d.blocks)assert.deepEqual(seen.get(key(v.position)),v.block);
 assert.equal(d.additions.length,7364);assert(d.build_batches.every(b=>b.tile_count<=24));
 for(const c of d.circuits){circuitSchema.parse(c);assert.equal(new Set(c.signals.map(v=>key(v.position))).size,c.signals.length,'Probe positions alias');for(const s of c.signals)assert(seen.has(key(s.position)));}
 for(const i of d.inputs){assert.equal(seen.get(key(i.position)).id,'minecraft:lever');assert.equal(seen.get(key(i.position)).properties.powered,'false');}
 for(let lane=0;lane<4;lane++){const q=makeCompactRegisterFile({lane});assert.equal(q.blocks.length,12872);for(let b=0;b<8;b++){const p={x:q.origin.x+(b>=4?10:2),y:q.origin.y+121,z:q.origin.z+8*(b%4)};assert.equal(q.blocks.find(v=>key(v.position)===key(p)).block.id,lane&(1<<b)?'minecraft:redstone_block':solid);}}
 return{status:'offline_schema_support_parent_and_identity_pass_native_unverified',...d.metrics,placement_support_checks:supports,readback_cells:readbacks,parent_positions_unchanged:5508,max_operations:Math.max(...d.tiles.map(t=>t.plan.operations.length)),max_tile_cells:Math.max(...d.tiles.map(t=>volume(t.region.box))),final_constant_plans:d.constant_sources.length,explicit_crosses:d.crosses.length,public_input_schema_supported:false,native_calls:0,service_constructors:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await checkCompactRegisterFile();if(process.argv[2]==='--out'){assert(process.argv[3]);const dir=resolve(process.argv[3]);mkdirSync(dir);const design=makeCompactRegisterFile(),files={design,'offline-check':result};for(const[n,v]of Object.entries(files))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});writeFileSync(join(dir,'provenance.json'),JSON.stringify({source:'hardware/compact-register-file.mjs',source_sha256:sha(readFileSync(new URL(import.meta.url))),dependencies:design.sources,files:Object.fromEntries(Object.keys(files).map(n=>[n+'.json',sha(readFileSync(join(dir,n+'.json')))])),native:false},null,2)+'\n',{flag:'wx'});}else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(result));}
