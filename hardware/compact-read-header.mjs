// Offline construction and expected values only. No live bridge or running GPU logic.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeAddressDecoder4} from './address-decoder4.mjs';

const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(',');
const solid='minecraft:light_gray_concrete',sha=b=>createHash('sha256').update(b).digest('hex');
const expectedDecoder='b0872a2188089f10494cfa89f531c38d0e7328b84460533bcd24db936c993776';
const expectedAccounting='ec0ee693139eab8b6b724664a8184074fc8fe60704a3e9cdc66f89c8fa4a4651';
const contains=(box,p)=>axes.every(a=>p[a]>=box.from[a]&&p[a]<=box.to[a]);
const volume=box=>axes.reduce((n,a)=>n*(box.to[a]-box.from[a]+1),1);
const bounds=blocks=>({from:Object.fromEntries(axes.map(a=>[a,Math.min(...blocks.map(b=>b.position[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...blocks.map(b=>b.position[a]))]))});
const attachment={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]};
function support(v){if(v.block.id===solid)return null;const p=v.position;if(v.block.id==='minecraft:redstone_wall_torch'){const[dx,dz]=attachment[v.block.properties.facing];return{...p,x:p.x+dx,z:p.z+dz};}return{...p,y:p.y-1};}

export function makeCompactReadHeader({origin={x:85,y:-60,z:19},id='compact_read_header'}={}){
 assert(/^[a-z][a-z0-9_]{0,22}$/.test(id),'Short circuit id required');
 assert(axes.every(a=>Number.isSafeInteger(origin[a])));
 // Reserve a valid coordinate envelope for the complete later file, not only this subset.
 assert(origin.y>=-64&&origin.y+132<=319);
 assert(Math.abs(origin.x)+33<29999984&&Math.abs(origin.z)+27<29999984);
 assert.equal(sha(readFileSync(new URL('./address-decoder4.mjs',import.meta.url))),expectedDecoder);
 assert.equal(sha(readFileSync(new URL('../artifacts/compact-full-register-plan-v1/count-layout.mjs',import.meta.url))),expectedAccounting);
 const source=makeAddressDecoder4({origin:{x:0,y:0,z:0},id:'source_decode'}),map=new Map(),decoderKeys=new Set();
 const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
 const put=(x,y,z,name,properties)=>{const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})};assert(!map.has(key(position)),'Duplicate position '+key(position));map.set(key(position),{position,block});};
 const block=(x,y,z)=>put(x,y,z,'light_gray_concrete');
 const wire=(x,y,z)=>{block(x,y-1,z);put(x,y,z,'redstone_wire');};
 const rep=(x,y,z,travel)=>{block(x,y-1,z);put(x,y,z,'repeater',{facing:{west:'east',south:'north'}[travel],delay:'1'});};
 const mirror=pos=>p(30-pos.x,pos.y,pos.z-18);
 for(const v of source.blocks){const{x,y,z}=v.position;let name=v.block.id.slice(10);const props={...v.block.properties};
  if(x===7&&z===6&&name==='redstone_wall_torch'){name='repeater';props.facing='west';props.delay='1';}
  if(props.facing)props.facing=({east:'west',west:'east'})[props.facing]??props.facing;
  put(30-x,y,z-18,name,Object.keys(props).length?props:undefined);
 }
 for(let word=0;word<16;word++)block(23,8*word,-12);
 for(const k of map.keys())decoderKeys.add(k);
 // These are the complete final eight-bit read-inhibit routes for words0/15.
 // Other fourteen route rows remain absent. No shortened tower or temporary load.
 for(const word of[0,15]){const y=1+8*word,ry=y+4;
  wire(20,y,-12);for(let n=1;n<=4;n++)wire(20-n,y+n,-12);wire(15,ry,-12);
  for(let z=-11;z<=18;z++)if([-7,5,17].includes(z))rep(15,ry,z,'south');else wire(15,ry,z);
  for(let bit=0;bit<8;bit++){const gate=bit>=4?9:3,z=8*(bit%4);for(let n=0;n<=4;n++)wire(gate,ry-n,z-6+n);rep(gate,y,z-1,'south');}
  for(const z of[-6,2,10,18]){rep(14,ry,z,'west');for(let x=3;x<=13;x++)if(x!==3&&x!==9){if(x===5)rep(x,ry,z,'west');else wire(x,ry,z);}}
 }
 const inputs=source.inputs.map(v=>({...v,position:mirror(v.position)}));
 const translate=v=>({...v,position:mirror(v.position)});
 const raw=source.ports.raw.map(translate),top=source.ports.top.map(translate);
 const mismatch=source.ports.match.map((v,w)=>({...translate(v),name:'mismatch'+w}));
 const low=source.ports.low_mismatch.map(translate),high=source.ports.high_mismatch.map(translate);
 const mask=[0,15].flatMap(w=>Array.from({length:8},(_,b)=>({name:`mask${w}_${b}`,position:p(b>=4?9:3,1+8*w,8*(b%4)-1),property:'powered'})));
 const byte=w=>({name:'mask'+w,bits:Array.from({length:8},(_,b)=>`mask${w}_${b}`)});
 const baseBuses=[{name:'raw_address',bits:raw.map(v=>v.name)},{name:'top_address',bits:top.map(v=>v.name)},{name:'mismatches',bits:mismatch.map(v=>v.name)}];
 const circuit={id,dimension:'minecraft:overworld',description:'Full-height four-bit mismatch decoder with final-coordinate near/far eight-bit read-mask routes; no register data yet.',signals:[...raw,...top,...mismatch,...mask],buses:[...baseBuses,byte(0),byte(15)]};
 const guardCircuit={id:id+'_diag',dimension:circuit.dimension,description:'Same four inputs and all16 decoder pair/final mismatch stages; separate view from near/far load timing.',signals:[...raw,...top,...low,...high,...mismatch],buses:[...baseBuses,{name:'low_mismatches',bits:low.map(v=>v.name)},{name:'high_mismatches',bits:high.map(v=>v.name)}]};
 const blocks=[...map.values()],box=bounds(blocks),tiles=[];
 function tile(items){if(!items.length)return;const b=bounds(items);if(items.length>127||volume(b)>4096){
   const axis=axes.reduce((a,c)=>b.to[a]-b.from[a]>=b.to[c]-b.from[c]?a:c),mid=Math.floor((b.from[axis]+b.to[axis])/2);
   assert(mid<b.to[axis]);tile(items.filter(v=>v.position[axis]<=mid));tile(items.filter(v=>v.position[axis]>mid));return;
  }
  items.sort((a,c)=>a.position.y-c.position.y||Number(a.block.id!==solid)-Number(c.block.id!==solid)||a.position.z-c.position.z||a.position.x-c.position.x);
  const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:circuit.dimension,box:b,description:'New final-coordinate RA skeleton: fresh empty-region inspection required'},plan:{id:tid,region_id:tid,label:'Set-only reusable read-header skeleton; supports before devices',operations:items.map(v=>({op:'set',...v}))}});
 }
 for(let y=box.from.y;y<=box.to.y;y+=8)tile(blocks.filter(v=>v.position.y>=y&&v.position.y<=y+7));
 const owners=new Map();tiles.forEach((t,i)=>t.plan.operations.forEach(o=>owners.set(key(o.position),i)));
 const deps=tiles.map(()=>new Set());for(const[i,t]of tiles.entries())for(const o of t.plan.operations){const s=support(o);if(s){assert.equal(map.get(key(s))?.block.id,solid,'Missing support');const j=owners.get(key(s));if(j!==i)deps[i].add(j);}}
 const ordered=[],done=new Set();while(done.size<tiles.length){const i=tiles.findIndex((_,i)=>!done.has(i)&&[...deps[i]].every(j=>done.has(j)));assert(i>=0,'Cyclic tile dependencies');done.add(i);ordered.push(tiles[i]);}
 assert(ordered.length<=32,'Workshop driver region limit: redesign tiles or explicitly review grouped build');
 const histogram={};for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 const fullBox={from:p(-20,0,-18),to:p(32,132,26)};
 const crosses=blocks.filter(v=>v.block.id==='minecraft:redstone_wire'&&['north','east','south','west'].every(d=>v.block.properties?.[d]==='side')).map(v=>v.position);
 assert.equal(crosses.length,32);assert(blocks.every(v=>contains(fullBox,v.position)));
 return{status:'offline_candidate_native_unverified',id,origin,origin_means:'Raw drawing-coordinate translation shared with the proposed complete file; not this subset minimum.',box,full_file_box:fullBox,blocks,tiles:ordered,inputs,circuit,guard_circuit:guardCircuit,crosses,
  metrics:{blocks:blocks.length,header_blocks:decoderKeys.size,loaded_words:[0,15],loaded_mask_receivers:16,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),bounding_volume:volume(box),histogram,controls:inputs.length,main_signals:circuit.signals.length,diagnostic_signals:guardCircuit.signals.length,plans:ordered.length},
  sources:{'hardware/address-decoder4.mjs':expectedDecoder,'artifacts/compact-full-register-plan-v1/count-layout.mjs':expectedAccounting},
  semantics:{inhibit:'Mismatch1 inhibits this word; selected word is0. This has inverted output polarity compared with the old match decoder.',clear:'All four controls off means address0, mismatch mask65534, near mask0 and far mask255.',loading:'All16 header planes exist; only the complete word0 andword15 read-mask routes exist. No full16-row load/timing claim.',scope:'No state, read-data gates/collector, WE, reset, R13 identity value, operands or controller. Addresses13-15 decode but protection/value behavior is not tested.',expansion:'This is an exact coordinate subset of the12,872-block proposal. Keep these blocks; remaining control/data/state blocks must be additive and separately reviewed.'}};
}

export function compactReadHeaderExpected(address,diagnostic=false){
 assert(Number.isInteger(address)&&address>=0&&address<16);const e={};
 for(let b=0;b<4;b++)e['raw_a'+b]=e['top_a'+b]=(address>>b)&1;
 for(let w=0;w<16;w++)e['mismatch'+w]=Number(w!==address);
 e.raw_address=e.top_address=address;e.mismatches=65535-2**address;
 if(diagnostic){let lo=0,hi=0;for(let w=0;w<16;w++){e['low_mismatch'+w]=+((address&3)!==(w&3));e['high_mismatch'+w]=+((address>>2)!==(w>>2));lo+=e['low_mismatch'+w]*2**w;hi+=e['high_mismatch'+w]*2**w;}e.low_mismatches=lo;e.high_mismatches=hi;}
 else for(const w of[0,15]){for(let b=0;b<8;b++)e[`mask${w}_${b}`]=+(address!==w);e['mask'+w]=address===w?0:255;}
 return e;
}

export function makeCompactReadHeaderTests(d){
 const jobs=[];const add=(label,values,diagnostic=false)=>{const cases=[],addresses=[15,0,...values,0];
  for(const[i,a]of addresses.entries()){const inputs=Object.fromEntries(d.inputs.map((v,b)=>[v.name,!!(a&(1<<b))])),full=compactReadHeaderExpected(a,diagnostic);
   const raw=Object.fromEntries(Object.entries(full).filter(([n])=>n.startsWith('raw_')));
   cases.push({name:`v${i}_a${a}_propagate`,inputs,expect:raw},{name:`v${i}_a${a}_assert`,inputs:{...inputs},expect:full});
  }
  jobs.push({label,addresses,spec:{circuit_id:diagnostic?d.guard_circuit.id:d.id,inputs:d.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
 };
 add('mapping_low',Array.from({length:8},(_,i)=>i));add('mapping_high',Array.from({length:8},(_,i)=>i+8));
 add('near_far_transitions',[15,0,5,10,0,15,8,7]);
 add('decoder_low',Array.from({length:8},(_,i)=>i),true);add('decoder_high',Array.from({length:8},(_,i)=>i+8),true);
 return jobs;
}

export async function checkCompactReadHeader(){
 const[{buildRegionSchema,buildPlanSchema},{circuitSchema},{testRunSchema}]=await Promise.all([import('../tools/minecraft-redstone/scripts/build-service.mjs'),import('../tools/minecraft-redstone/scripts/circuit-service.mjs'),import('../tools/minecraft-redstone/scripts/test-runner-service.mjs')]);
 const d=makeCompactReadHeader(),tests=makeCompactReadHeaderTests(d),placed=new Map();let supports=0,readbacks=0;
 for(let i=0;i<d.tiles.length;i++)for(let j=0;j<i;j++)assert(!axes.every(a=>d.tiles[i].region.box.from[a]<=d.tiles[j].region.box.to[a]&&d.tiles[j].region.box.from[a]<=d.tiles[i].region.box.to[a]),'Overlapping tile rectangles');
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);readbacks+=volume(t.region.box);
  assert([...placed.keys()].every(k=>!contains(t.region.box,Object.fromEntries(k.split(',').map((n,i)=>[axes[i],+n])))),'New tile would intersect earlier geometry');
  for(const o of t.plan.operations){assert.equal(o.op,'set');assert(contains(t.region.box,o.position));assert(!placed.has(key(o.position)));const s=support(o);if(s){assert.equal(placed.get(key(s))?.id,solid,'Placement-time support missing');supports++;}placed.set(key(o.position),o.block);}
 }
 assert.equal(placed.size,d.blocks.length);for(const v of d.blocks)assert.deepEqual(placed.get(key(v.position)),v.block);
 for(const c of[d.circuit,d.guard_circuit]){circuitSchema.parse(c);for(const s of c.signals)assert(placed.has(key(s.position)));}
 // Replay the exact frozen full-accounting recipe in memory. Only its import
 // bindings and output sink are supplied; its source bytes stay unchanged.
 const accounting=readFileSync(new URL('../artifacts/compact-full-register-plan-v1/count-layout.mjs',import.meta.url),'utf8');assert.equal(sha(accounting),expectedAccounting);
 const{makeDenseOperands}=await import('./dense-operand-capture.mjs');
 const replay=new Function('assert','makeAddressDecoder4','makeDenseOperands','createHash','readFileSync','console',accounting.replace(/^import .*;\n/gm,'')+'\nreturn cells;');
 const full=replay(assert,makeAddressDecoder4,makeDenseOperands,createHash,readFileSync,{log(){}});
 assert.equal(full.size,12872);for(const v of d.blocks){const q=Object.fromEntries(axes.map(a=>[a,v.position[a]-d.origin[a]]));assert.deepEqual(v.block,full.get(key(q))?.block,'Not an exact final-file subset');}
 // The only non-support six-face boundary contacts are the two intended
 // decoder output repeater -> first load wire connections.
 const decoder=makeAddressDecoder4({origin:{x:0,y:0,z:0},id:'reference'}),header=new Set(decoder.blocks.map(v=>key({x:d.origin.x+30-v.position.x,y:d.origin.y+v.position.y,z:d.origin.z+v.position.z-18})));
 for(let w=0;w<16;w++)header.add(key({x:d.origin.x+23,y:d.origin.y+8*w,z:d.origin.z-12}));
 const contacts=[];for(const v of d.blocks.filter(v=>!header.has(key(v.position))&&v.block.id!==solid))for(const[a,s]of axes.flatMap(a=>[[a,-1],[a,1]])){const q={...v.position,[a]:v.position[a]+s},other=placed.get(key(q));if(header.has(key(q))&&other?.id!==solid)contacts.push({load:v.position,header:q});}
 assert.equal(contacts.length,2);for(const[c,w]of contacts.map(c=>[c,c.load.y-d.origin.y===1?0:15])){assert.deepEqual(c.load,{x:d.origin.x+20,y:d.origin.y+1+8*w,z:d.origin.z-12});assert.deepEqual(c.header,{...c.load,x:c.load.x+1});}
 let expectations=0;const covered=new Set();
 for(const j of tests){testRunSchema.parse(j.spec);assert(j.spec.cases.length*200<=6000);const diag=j.spec.circuit_id===d.guard_circuit.id;
  for(let i=0;i<j.spec.cases.length;i+=2){const a=j.spec.cases[i],b=j.spec.cases[i+1];assert.deepEqual(a.inputs,b.inputs);const bits=d.inputs.map(v=>+a.inputs[v.name]),value=bits.reduce((n,v,k)=>n+v*2**k,0);covered.add(value);
   const e={};for(let k=0;k<4;k++)e['raw_a'+k]=e['top_a'+k]=bits[k];
   const lo=[],hi=[],miss=[];for(let w=0;w<16;w++){lo[w]=+(bits[0]!==((w>>0)&1)||bits[1]!==((w>>1)&1));hi[w]=+(bits[2]!==((w>>2)&1)||bits[3]!==((w>>3)&1));miss[w]=+(lo[w]||hi[w]);e['mismatch'+w]=miss[w];}
   const pack=xs=>xs.reduce((n,v,k)=>n+v*2**k,0);e.raw_address=e.top_address=pack(bits);e.mismatches=pack(miss);
   if(diag){for(let w=0;w<16;w++){e['low_mismatch'+w]=lo[w];e['high_mismatch'+w]=hi[w];}e.low_mismatches=pack(lo);e.high_mismatches=pack(hi);}
   else for(const w of[0,15]){for(let bit=0;bit<8;bit++)e[`mask${w}_${bit}`]=miss[w];e['mask'+w]=pack(Array(8).fill(miss[w]));}
   assert.deepEqual(b.expect,e);assert.deepEqual(a.expect,Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_'))));expectations+=Object.keys(a.expect).length+Object.keys(b.expect).length;
  }
 }
 assert.equal(covered.size,16);assert.equal(d.blocks.length,2036);
 return{status:'offline_schema_subset_support_oracle_pass_native_unverified',...d.metrics,placement_support_checks:supports,final_subset_blocks:d.blocks.length,full_candidate_blocks:full.size,unintended_direct_header_load_contacts:0,readback_cells:readbacks,max_operations:Math.max(...d.tiles.map(t=>t.plan.operations.length)),max_tile_cells:Math.max(...d.tiles.map(t=>volume(t.region.box))),jobs:tests.length,phases:tests.reduce((n,j)=>n+j.spec.cases.length,0),address_vectors:tests.reduce((n,j)=>n+j.addresses.length,0),expectations,phase_wait_ticks:200,requested_ticks_per_job:tests.map(j=>200*j.spec.cases.length),native_calls:0,service_constructors:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await checkCompactReadHeader();if(process.argv[2]==='--out'){assert(process.argv[3]);const dir=resolve(process.argv[3]);mkdirSync(dir);const design=makeCompactReadHeader(),tests=makeCompactReadHeaderTests(design),files={design,tests,'offline-check':result,...Object.fromEntries(tests.map((j,i)=>['test-'+i,j.spec]))};
  for(const[n,v]of Object.entries(files))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
  writeFileSync(join(dir,'provenance.json'),JSON.stringify({source:'hardware/compact-read-header.mjs',source_sha256:sha(readFileSync(new URL(import.meta.url))),dependencies:design.sources,files:Object.fromEntries(Object.keys(files).map(n=>[n+'.json',sha(readFileSync(join(dir,n+'.json')))])),native:false},null,2)+'\n',{flag:'wx'});
 }else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(result));
}
