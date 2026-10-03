// Additive offline read-mask loading. Parent header and all existing blocks stay unchanged.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactReadHeader} from './compact-read-header.mjs';

const axes=['x','y','z'],key=p=>axes.map(a=>p[a]).join(','),solid='minecraft:light_gray_concrete';
const sha=b=>createHash('sha256').update(b).digest('hex'),parentSha='e6fff98f00ceaa6f8b470945aaf65ee2f90d52a3e2d3a2d57f3dee0e68207ca1';
const contains=(b,p)=>axes.every(a=>p[a]>=b.from[a]&&p[a]<=b.to[a]);
const volume=b=>axes.reduce((n,a)=>n*(b.to[a]-b.from[a]+1),1);
const bounds=items=>({from:Object.fromEntries(axes.map(a=>[a,Math.min(...items.map(v=>v.position[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...items.map(v=>v.position[a]))]))});

export function makeCompactReadSkeleton({parent=makeCompactReadHeader(),id='compact_read_skeleton'}={}){
 assert(/^[a-z][a-z0-9_]{0,23}$/.test(id));
 assert.equal(sha(readFileSync(new URL('./compact-read-header.mjs',import.meta.url))),parentSha);
 assert.deepEqual(parent,makeCompactReadHeader({origin:parent.origin,id:parent.id}),'Unchanged exact parent required');
 const before=JSON.stringify(parent),map=new Map(),parentKeys=new Set(parent.blocks.map(v=>key(v.position)));
 const p=(x,y,z)=>Object.fromEntries(axes.map((a,i)=>[a,parent.origin[a]+[x,y,z][i]]));
 const put=(x,y,z,name,properties)=>{const position=p(x,y,z),block={id:'minecraft:'+name,...(properties?{properties}:{})};assert(!parentKeys.has(key(position)),'Would overwrite parent');assert(!map.has(key(position)),'Duplicate addition');map.set(key(position),{position,block});};
 const wire=(x,y,z)=>{put(x,y-1,z,'light_gray_concrete');put(x,y,z,'redstone_wire');};
 const rep=(x,y,z,travel)=>{put(x,y-1,z,'light_gray_concrete');put(x,y,z,'repeater',{facing:{west:'east',south:'north'}[travel],delay:'1'});};
 for(let w=1;w<15;w++){const y=1+8*w,ry=y+4;
  wire(20,y,-12);for(let n=1;n<=4;n++)wire(20-n,y+n,-12);wire(15,ry,-12);
  for(let z=-11;z<=18;z++)if([-7,5,17].includes(z))rep(15,ry,z,'south');else wire(15,ry,z);
  for(let b=0;b<8;b++){const x=b>=4?9:3,z=8*(b%4);for(let n=0;n<=4;n++)wire(x,ry-n,z-6+n);rep(x,y,z-1,'south');}
  for(const z of[-6,2,10,18]){rep(14,ry,z,'west');for(let x=3;x<=13;x++)if(x!==3&&x!==9){if(x===5)rep(x,ry,z,'west');else wire(x,ry,z);}}
 }
 const additions=[...map.values()],tiles=[];
 const tile=items=>{assert(items.length>0&&items.length<=128);const box=bounds(items);assert(volume(box)<=4096);assert(!parent.blocks.some(v=>contains(box,v.position)),'Tile includes parent');
  items.sort((a,b)=>a.position.y-b.position.y||Number(a.block.id!==solid)-Number(b.block.id!==solid)||a.position.z-b.position.z||a.position.x-b.position.x);
  const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:parent.circuit.dimension,box,description:'Additive read-mask region, empty in exact parent; fresh native inspection required'},plan:{id:tid,region_id:tid,label:'Set-only remaining read-mask routes; never clear or write parent',operations:items.map(v=>({op:'set',...v}))}});
 };
 // The thin rise strip is clear of the parent columns (Z-18/-6) and final
 // output repeater (X21). Two batches avoid fourteen tiny rise plans.
 for(const[first,last]of[[1,7],[8,14]])tile(additions.filter(v=>v.position.x>=p(16,0,0).x&&v.position.y>=p(0,8*first,0).y&&v.position.y<=p(0,8*last+5,0).y));
 // Bodies end atX15, strictly west of every parent header block. Two Z halves
 // per word fit the128-operation limit; no horizontal wall attachments exist.
 for(let w=1;w<15;w++)for(const[lo,hi]of[[-12,5],[6,23]])tile(additions.filter(v=>v.position.x<=p(15,0,0).x&&v.position.y>=p(0,8*w,0).y&&v.position.y<=p(0,8*w+5,0).y&&v.position.z>=p(0,0,lo).z&&v.position.z<=p(0,0,hi).z));
 assert.equal(tiles.length,30);
 const header=parent.circuit.signals.filter(v=>/^raw_a|^top_a|^mismatch/.test(v.name));assert.equal(header.length,24);
 const groups=[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,7,8,15]];
 const circuits=groups.map((rows,i)=>({id:i===0?id:id+(i===4?'_timing':'_g'+i),dimension:parent.circuit.dimension,description:`Full read-mask loading: actual eight endpoints for rows${rows.join(',')}, all16 header outputs and four raw/top address bits.`,signals:[...structuredClone(header),...rows.flatMap(w=>Array.from({length:8},(_,b)=>({name:`mask${w}_${b}`,position:p(b>=4?9:3,1+8*w,8*(b%4)-1),property:'powered'})))],buses:[...structuredClone(parent.circuit.buses.filter(v=>['raw_address','top_address','mismatches'].includes(v.name))),...rows.map(w=>({name:'mask'+w,bits:Array.from({length:8},(_,b)=>`mask${w}_${b}`)}))]}));
 const blocks=[...structuredClone(parent.blocks),...additions],histogram={};for(const v of additions)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 assert.equal(JSON.stringify(parent),before);
 return{status:'offline_additive_candidate_native_unverified',id,origin:structuredClone(parent.origin),origin_means:parent.origin_means,box:structuredClone(parent.box),full_file_box:structuredClone(parent.full_file_box),blocks,additions,tiles,inputs:structuredClone(parent.inputs),circuit:circuits[0],guard_circuit:circuits[1],circuits,view_rows:groups,crosses:structuredClone(parent.crosses),parent_reference:{id:parent.id,box:structuredClone(parent.box),blocks:structuredClone(parent.blocks),circuit:structuredClone(parent.circuit),guard_circuit:structuredClone(parent.guard_circuit)},
  metrics:{parent_blocks:parent.blocks.length,added_blocks:additions.length,total_blocks:blocks.length,loaded_words:16,actual_mask_receivers:128,added_histogram:histogram,controls:4,views:5,signals_per_view:56,plans:tiles.length,bounding_volume:volume(parent.box)},
  sources:{'hardware/compact-read-header.mjs':parentSha,...parent.sources},
  semantics:{scope:'Fully loaded RA/read-inhibit skeleton only. No write decoder, state, identity values, read-data gates/collector, operands or controller.',expansion:'All2036parent blocks unchanged,3472additions only, all5508positions remain in the final12872-block accounting.',clear:'Address0 has mismatch65534; word0 mask0 and every other mask255.',observations:'Four group views cover all128mask endpoints; timing view observes rows0/7/8/15 with every header output and raw/top controls in one trace. Different view jobs are not simultaneous.',construction:'No parent-coordinate writes or air fills. Register all five views; preserve parent circuit definitions. Verify combined design rather than expecting old parent air inside the expanded volume.'}};
}

export function compactReadSkeletonExpected(address,rows){
 assert(Number.isInteger(address)&&address>=0&&address<16);const e={};
 for(let b=0;b<4;b++)e['raw_a'+b]=e['top_a'+b]=(address>>b)&1;
 for(let w=0;w<16;w++)e['mismatch'+w]=+(w!==address);
 e.raw_address=e.top_address=address;e.mismatches=65535-2**address;
 for(const w of rows){for(let b=0;b<8;b++)e[`mask${w}_${b}`]=+(w!==address);e['mask'+w]=w===address?0:255;}
 return e;
}

export function makeCompactReadSkeletonTests(d){
 const jobs=[];const add=(label,view,values)=>{const addresses=[15,0,...values,0],cases=[];
  for(const[i,address]of addresses.entries()){const inputs=Object.fromEntries(d.inputs.map((p,b)=>[p.name,!!(address&(1<<b))])),e=compactReadSkeletonExpected(address,d.view_rows[view]);
   cases.push({name:`v${i}_a${address}_propagate`,inputs,expect:Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_')))},{name:`v${i}_a${address}_assert`,inputs:{...inputs},expect:e});
  }
  jobs.push({label,view,rows:d.view_rows[view],addresses,spec:{circuit_id:d.circuits[view].id,inputs:d.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
 };
 add('loaded_near_mid_far',4,[0,15,7,8,15,0,8,7]);
 for(let g=0;g<4;g++){add('rows'+g+'_mapping_low',g,Array.from({length:8},(_,i)=>i));add('rows'+g+'_mapping_high',g,Array.from({length:8},(_,i)=>i+8));}
 return jobs;
}

export async function checkCompactReadSkeleton(){
 const[{buildRegionSchema,buildPlanSchema},{circuitSchema},{testRunSchema}]=await Promise.all([import('../tools/minecraft-redstone/scripts/build-service.mjs'),import('../tools/minecraft-redstone/scripts/circuit-service.mjs'),import('../tools/minecraft-redstone/scripts/test-runner-service.mjs')]);
 const d=makeCompactReadSkeleton(),tests=makeCompactReadSkeletonTests(d),placed=new Map(d.parent_reference.blocks.map(v=>[key(v.position),v.block]));let supports=0,readbacks=0;
 for(let i=0;i<d.tiles.length;i++)for(let j=0;j<i;j++)assert(!axes.every(a=>d.tiles[i].region.box.from[a]<=d.tiles[j].region.box.to[a]&&d.tiles[j].region.box.from[a]<=d.tiles[i].region.box.to[a]),'Overlapping tile regions');
 for(const t of d.tiles){buildRegionSchema.parse(t.region);buildPlanSchema.parse(t.plan);assert(!d.parent_reference.blocks.some(v=>contains(t.region.box,v.position)));readbacks+=volume(t.region.box);
  for(const o of t.plan.operations){assert.equal(o.op,'set');assert(contains(t.region.box,o.position));assert(!placed.has(key(o.position)),'Parent/prior write');if(o.block.id!==solid){assert.equal(placed.get(key({...o.position,y:o.position.y-1}))?.id,solid,'Support not yet placed');supports++;}placed.set(key(o.position),o.block);}
 }
 assert.equal(placed.size,5508);assert.equal(d.additions.length,3472);for(const v of d.blocks)assert.deepEqual(placed.get(key(v.position)),v.block);
 // The frozen parent checker already uses this unchanged accounting recipe.
 const source=readFileSync(new URL('../artifacts/compact-full-register-plan-v1/count-layout.mjs',import.meta.url),'utf8');assert.equal(sha(source),d.sources['artifacts/compact-full-register-plan-v1/count-layout.mjs']);
 const[{makeAddressDecoder4},{makeDenseOperands}]=await Promise.all([import('./address-decoder4.mjs'),import('./dense-operand-capture.mjs')]);
 const full=new Function('assert','makeAddressDecoder4','makeDenseOperands','createHash','readFileSync','console',source.replace(/^import .*;\n/gm,'')+'\nreturn cells;')(assert,makeAddressDecoder4,makeDenseOperands,createHash,readFileSync,{log(){}});
 assert.equal(full.size,12872);for(const v of d.blocks){const p=Object.fromEntries(axes.map(a=>[a,v.position[a]-d.origin[a]]));assert.deepEqual(v.block,full.get(key(p))?.block,'Full-file subset differs');}
 const parentMap=new Map(d.parent_reference.blocks.map(v=>[key(v.position),v.block])),contacts=[];
 for(const v of d.additions.filter(v=>v.block.id!==solid))for(const[a,sign]of axes.flatMap(a=>[[a,-1],[a,1]])){const p={...v.position,[a]:v.position[a]+sign},other=parentMap.get(key(p));if(other&&other.id!==solid)contacts.push({load:v.position,parent:p});}
 assert.equal(contacts.length,14);for(const c of contacts){const w=(c.load.y-d.origin.y-1)/8;assert(Number.isInteger(w)&&w>=1&&w<=14);assert.deepEqual(c.load,{x:d.origin.x+20,y:d.origin.y+1+8*w,z:d.origin.z-12});assert.deepEqual(c.parent,{...c.load,x:c.load.x+1});}
 for(const c of d.circuits){circuitSchema.parse(c);assert.equal(c.signals.length,56);for(const s of c.signals)assert(placed.has(key(s.position)));}
 let expectations=0;const coverage=new Map(Array.from({length:16},(_,w)=>[w,new Set()]));
 for(const j of tests){testRunSchema.parse(j.spec);assert.equal(j.spec.cases.length,22);assert(j.spec.cases.length*200<=6000);
  for(let i=0;i<j.spec.cases.length;i+=2){const a=j.spec.cases[i],b=j.spec.cases[i+1];assert.deepEqual(a.inputs,b.inputs);const bits=d.inputs.map(p=>+a.inputs[p.name]),value=bits.reduce((n,bit,k)=>n+bit*2**k,0),e={};
   for(let bit=0;bit<4;bit++)e['raw_a'+bit]=e['top_a'+bit]=bits[bit];const mismatch=Array.from({length:16},(_,w)=>+bits.some((bit,k)=>bit!==((w>>k)&1)));
   for(let w=0;w<16;w++)e['mismatch'+w]=mismatch[w];e.raw_address=e.top_address=value;e.mismatches=mismatch.reduce((n,v,k)=>n+v*2**k,0);
   for(const w of j.rows){coverage.get(w).add(value);for(let bit=0;bit<8;bit++)e[`mask${w}_${bit}`]=mismatch[w];e['mask'+w]=Array(8).fill(mismatch[w]).reduce((n,v,k)=>n+v*2**k,0);}
   assert.deepEqual(b.expect,e);assert.deepEqual(a.expect,Object.fromEntries(Object.entries(e).filter(([n])=>n.startsWith('raw_'))));expectations+=Object.keys(a.expect).length+Object.keys(b.expect).length;
  }
 }
 assert([...coverage.values()].every(s=>s.size===16));
 return{status:'offline_additive_schema_support_subset_oracle_pass_native_unverified',...d.metrics,placement_support_checks:supports,parent_blocks_unchanged:true,parent_rectangle_overlap:0,full_candidate_subset:5508,expected_parent_load_contacts:contacts.length,readback_cells:readbacks,max_operations:Math.max(...d.tiles.map(t=>t.plan.operations.length)),max_tile_cells:Math.max(...d.tiles.map(t=>volume(t.region.box))),jobs:tests.length,phases:tests.reduce((n,j)=>n+j.spec.cases.length,0),address_vectors:tests.reduce((n,j)=>n+j.addresses.length,0),expectations,distinct_addresses_per_mask_row:Object.fromEntries([...coverage].map(([w,s])=>[w,s.size])),requested_ticks_per_job:tests.map(j=>j.spec.cases.length*200),native_calls:0,service_constructors:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await checkCompactReadSkeleton();if(process.argv[2]==='--out'){assert(process.argv[3]);const dir=resolve(process.argv[3]);mkdirSync(dir);const design=makeCompactReadSkeleton(),tests=makeCompactReadSkeletonTests(design),files={design,tests,'offline-check':result,...Object.fromEntries(tests.map((j,i)=>['test-'+i,j.spec]))};
 for(const[n,v]of Object.entries(files))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 writeFileSync(join(dir,'provenance.json'),JSON.stringify({source:'hardware/compact-read-skeleton.mjs',source_sha256:sha(readFileSync(new URL(import.meta.url))),dependencies:design.sources,files:Object.fromEntries(Object.keys(files).map(n=>[n+'.json',sha(readFileSync(join(dir,n+'.json')))])),native:false},null,2)+'\n',{flag:'wx'});
 }else assert(process.argv.length===2||process.argv[2]==='--check');console.log(JSON.stringify(result));}
