import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Offline geometry and test stimuli only. No bridge imports or runtime answers.
const SOURCE_SHA256='c4174d61234089e61a51dae39cf81e991bba3011d3162b0c9339d6dbe8aeca90';
const axes=['x','y','z'],key=p=>`${p.x},${p.y},${p.z}`;
const facing={east:'west',west:'east',north:'south',south:'north'};
const cross={north:'side',east:'side',south:'side',west:'side'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(p,b)=>axes.every(a=>p[a]>=b.from[a]&&p[a]<=b.to[a]);
const volume=b=>axes.reduce((n,a)=>n*(b.to[a]-b.from[a]+1),1);
const bounds=blocks=>({from:Object.fromEntries(axes.map(a=>[a,Math.min(...blocks.map(b=>b.position[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...blocks.map(b=>b.position[a]))]))});

export function makeAddressDecoder4({origin={x:96,y:64,z:32},id='gpu_decode4'}={}){
  if(!axes.every(a=>Number.isSafeInteger(origin[a])))throw Error('Integer floor origin required');
  if(origin.y < -64 || origin.y+121 > 319 || Math.abs(origin.x)>29999960 || Math.abs(origin.z)>29999960)throw Error('Candidate must fit the Java Overworld coordinate bounds');
  if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(id))throw Error('Invalid circuit id');
  const sourceHash=sha(readFileSync(new URL('./register-file.mjs',import.meta.url)));
  if(sourceHash!==SOURCE_SHA256)throw Error('Proven mismatch source changed; review before regeneration');
  const map=new Map(),inputs=[],ports={raw:[],top:[],low_mismatch:[],high_mismatch:[],match:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,y,z,name,properties)=>{
    const position=p(x,y,z),next={position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}},old=map.get(key(position));
    if(old&&JSON.stringify(old.block)!==JSON.stringify(next.block))throw Error(`Geometry collision at ${key(position)}`);
    map.set(key(position),next);
  };
  const solid=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const supported=(x,y,z,name,properties)=>{
    const below=map.get(key(p(x,y-1,z)));
    if(below&&below.block.id!=='minecraft:light_gray_concrete')throw Error(`Non-solid support at ${key(p(x,y-1,z))}`);
    if(!below)solid(x,y-1,z);put(x,y,z,name,properties);
  };
  const wire=(x,y,z,properties)=>supported(x,y,z,'redstone_wire',properties);
  const rep=(x,y,z,travel)=>supported(x,y,z,'repeater',{facing:facing[travel],delay:'1'});
  const torch=(x,y,z,face)=>put(x,y,z,'redstone_wall_torch',{facing:face});
  const probe=(group,name,x,y,z,property)=>ports[group].push({name,position:p(x,y,z),property});

  // Original-polarity solid taps occur every four levels; pitch eight retains
  // that polarity and leaves seven levels between independent word planes.
  for(const [bit,x,z]of [[0,0,0],[1,12,0],[2,0,12],[3,12,12]]){
    for(let y=1;y<=121;y++)if(y%2)solid(x,y,z);else supported(x,y,z,'redstone_torch');
    const sign=x===0?-1:1;
    rep(x+sign,1,z,sign<0?'east':'west');
    supported(x+2*sign,1,z,'lever',{face:'floor',facing:'north',powered:'false'});
    const name=`a${bit}`;inputs.push({name,position:p(x+2*sign,1,z)});
    probe('raw',`raw_a${bit}`,x+2*sign,1,z,'powered');
    probe('top',`top_a${bit}`,x,120,z,'lit');
  }

  function pairMismatch(target,y,z,toward,group,word){
    // These arms copy the accepted two-bit RF mismatch topology. An isolated
    // target-one inverter feed must be a CROSS, not /setblock's dust DOT.
    wire(1,y,z,target&1?cross:undefined);wire(11,y,z,target&2?cross:undefined);
    if(target&1){solid(2,y,z);torch(3,y,z,'east');wire(4,y,z);}
    else{rep(2,y,z,'east');wire(3,y,z);wire(4,y,z);}
    if(target&2){solid(10,y,z);torch(9,y,z,'west');wire(8,y,z);}
    else{rep(10,y,z,'west');wire(9,y,z);wire(8,y,z);}
    rep(5,y,z,'east');rep(7,y,z,'west');solid(6,y,z);
    const step=toward==='south'?1:-1;
    rep(6,y,z+step,toward);
    probe(group,`${group}${word}`,6,y,z+step,'powered');
    for(let distance=2;distance<=4;distance++)wire(6,y,z+step*distance);
    rep(6,y,z+step*5,toward);
  }
  for(let word=0;word<16;word++){
    const y=1+8*word;
    pairMismatch(word&3,y,0,'south','low_mismatch',word);
    pairMismatch(word>>2,y,12,'north','high_mismatch',word);
    // Both refreshed repeaters feed only this solid block. The final inversion
    // computes NOT(low mismatch OR high mismatch), i.e. full address equality.
    solid(6,y,6);torch(7,y,6,'east');wire(8,y,6);rep(9,y,6,'east');
    probe('match',`match${word}`,9,y,6,'powered');
  }

  const blocks=[...map.values()],box=bounds(blocks),tiles=[];
  function tile(contents,coarse){
    if(!contents.length)return;
    if(contents.length>127){
      const axis=axes.reduce((a,b)=>coarse.to[a]-coarse.from[a]>=coarse.to[b]-coarse.from[b]?a:b),mid=Math.floor((coarse.from[axis]+coarse.to[axis])/2);
      if(mid===coarse.to[axis])throw Error('Cannot split construction tile');
      tile(contents.filter(b=>b.position[axis]<=mid),{from:coarse.from,to:{...coarse.to,[axis]:mid}});
      tile(contents.filter(b=>b.position[axis]>mid),{from:{...coarse.from,[axis]:mid+1},to:coarse.to});return;
    }
    // Tight boxes preserve each bucket's set membership and avoid clearing its
    // unused margins. They remain disjoint and contain all explicit supports.
    const regionBox=bounds(contents),tileId=`${id}_t${tiles.length}`;
    if(volume(regionBox)+contents.length>4096)throw Error('Construction write budget exceeded');
    // At one height, all solids precede devices so attachment order is explicit.
    contents.sort((a,b)=>a.position.y-b.position.y || Number(a.block.id!=='minecraft:light_gray_concrete')-Number(b.block.id!=='minecraft:light_gray_concrete'));
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:regionBox,description:'Unbuilt 16-way address decoder; no reservation implied'},plan:{id:tileId,region_id:tileId,label:'Four shared input columns and sixteen one-hot match planes',operations:[{op:'fill',box:regionBox,block:{id:'minecraft:air'}},...contents.map(b=>({op:'set',...b}))]}});
  }
  for(let y=box.from.y;y<=box.to.y;y+=8){const coarse={from:{...box.from,y},to:{...box.to,y:Math.min(y+7,box.to.y)}};tile(blocks.filter(b=>inside(b.position,coarse)),coarse);}
  const owners=new Map();tiles.forEach((t,i)=>t.plan.operations.slice(1).forEach(o=>owners.set(key(o.position),i)));
  const attachments={east:{x:-1,z:0},west:{x:1,z:0},north:{x:0,z:1},south:{x:0,z:-1}},dependencies=tiles.map(()=>new Set());
  for(const [i,t]of tiles.entries())for(const op of t.plan.operations.slice(1)){
    let support;
    if(op.block.id==='minecraft:redstone_wall_torch'){const d=attachments[op.block.properties.facing];support={...op.position,x:op.position.x+d.x,z:op.position.z+d.z};}
    else if(op.block.id!=='minecraft:light_gray_concrete')support={...op.position,y:op.position.y-1};
    if(support){if(map.get(key(support))?.block.id!=='minecraft:light_gray_concrete')throw Error('Missing solid support');const owner=owners.get(key(support));if(owner!==i)dependencies[i].add(owner);}
  }
  const ordered=[],done=new Set();while(done.size<tiles.length){const i=tiles.findIndex((_,i)=>!done.has(i)&&[...dependencies[i]].every(j=>done.has(j)));if(i<0)throw Error('Cyclic tile support dependencies');done.add(i);ordered.push(tiles[i]);}
  const signals=[...ports.raw,...ports.top,...ports.low_mismatch,...ports.high_mismatch,...ports.match];
  return {status:'design_only_not_live_verified',id,origin,origin_means:'bottom support level',address_bits:4,outputs:16,word_pitch:8,box,blocks,inputs,ports,tiles:ordered,
    circuit:{id,dimension:'minecraft:overworld',description:'Resetless four-bit address to sixteen one-hot matches; independent low/high pair mismatch probes',signals,buses:[{name:'raw_address',bits:ports.raw.map(s=>s.name)},{name:'top_address',bits:ports.top.map(s=>s.name)},{name:'low_mismatches',bits:ports.low_mismatch.map(s=>s.name)},{name:'high_mismatches',bits:ports.high_mismatch.map(s=>s.name)},{name:'matches',bits:ports.match.map(s=>s.name)}]},
    sources:{'hardware/register-file.mjs':sourceHash},
    timing:{phase_ticks:200,phases_per_vector:2,total_wait_ticks:400,measured:false,hazard_free:false,comment:'Raw-input-only wait, then unchanged-input full assertion. Tall distribution and extra gate depth need native traces; no minimum clock claim.'},
    scope:'Address selection only. No writable state, write enable, reset, retained operands, instruction control or lane-enable mask. Addresses13-15 still decode; write protection and identity read values belong to later integration.',
    construction:'Offline proposal only. Fresh native empty-region/body/ticking inspection required. Preserve dependency order and group at most24tiles per journal. Initial placement must never be replayed after construction.'};
}

export function addressDecoder4Expected(address){
  if(!Number.isInteger(address)||address<0||address>15)throw Error('Address must be0..15');
  const values={};for(let bit=0;bit<4;bit++){values[`raw_a${bit}`]=(address>>bit)&1;values[`top_a${bit}`]=(address>>bit)&1;}
  for(let word=0;word<16;word++){values[`low_mismatch${word}`]=Number((address&3)!==(word&3));values[`high_mismatch${word}`]=Number((address>>2)!==(word>>2));values[`match${word}`]=Number(address===word);}
  values.raw_address=address;values.top_address=address;
  values.low_mismatches=Array.from({length:16},(_,w)=>values[`low_mismatch${w}`]*2**w).reduce((a,b)=>a+b,0);
  values.high_mismatches=Array.from({length:16},(_,w)=>values[`high_mismatch${w}`]*2**w).reduce((a,b)=>a+b,0);
  values.matches=2**address;return values;
}

export function makeAddressDecoder4Tests(design){
  const jobs=[];
  const job=(name,addresses)=>{
    const vectors=[0,...addresses,0],cases=[];
    for(const [index,address]of vectors.entries()){
      const inputs=Object.fromEntries(design.inputs.map((p,bit)=>[p.name,Boolean(address&(1<<bit))]));
      const expect=addressDecoder4Expected(address),tag=`v${index}_a${address}`;
      cases.push({name:`${tag}_propagate`,inputs,expect:Object.fromEntries(Object.entries(expect).filter(([n])=>n.startsWith('raw_')))});
      cases.push({name:`${tag}_assert`,inputs:{...inputs},expect});
    }
    if(cases.length>20)throw Error('Keep each job at most4000 native wait ticks');
    jobs.push({name,addresses:vectors,spec:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
  };
  job('truth_low',Array.from({length:8},(_,i)=>i));job('truth_high',Array.from({length:8},(_,i)=>i+8));
  // Gray-code paths change one source bit between consecutive non-bookend
  // vectors; complement paths deliberately change all four sequentially.
  const gray=Array.from({length:16},(_,i)=>i^(i>>1));
  job('gray_low',gray.slice(0,8));job('gray_high',gray.slice(8));
  job('full_complements',[15,0,15,0,5,10,5,10]);
  job('single_input_roundtrip',[1,0,2,0,4,0,8,0]);
  return {jobs,trace_acceptance:{continuity:'Require complete gap-free native end-of-tick recording, successful stop/drain/discard and restored controls. Every paired interval must retain all four target raw inputs; propagation and assertion phases may not rewrite inputs.',settling:'Reconstruct all56 signals and five buses. Measure the beginning of the final continuously correct tail through assertion, retaining transiently-correct-then-wrong events. Report offsets from the post-input checkpoint, not exact lever interaction time.',one_hot:'At each full settled assertion exactly one of16 match bits is1. Address transitions may transiently select zero or multiple outputs; no hazard-free write-enable claim.',crosses:'Separately re-read all32 explicitly specified inverter-feed crosses after native transitions; a normal output pass alone does not establish their persisted shape.',clear:'No reset input exists. Final address0 means matches=1, low_mismatches=61166 and high_mismatches=65520; it is not an all-zero output state.'},warning:'Six proposed jobs are120 phases/60 full decoding checks, not120 independent results. Sixteen distinct input states are exhaustive for this combinational decoder, but native timing/glitch behavior and integrated write gating remain unverified.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/address-decoder4.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('Origin must be x,y,z');
  const design=makeAddressDecoder4(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeAddressDecoder4Tests(design);
  mkdirSync(output,{recursive:true});const files={design,'build-tiles':design.tiles,circuit:design.circuit,'test-manifest':tests,'trace-acceptance':tests.trace_acceptance,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))};
  for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const sourceHash=sha(readFileSync(new URL(import.meta.url))),manifest={status:'offline_candidate_unbuilt',source:'hardware/address-decoder4.mjs',source_sha256:sourceHash,inherited_sources:design.sources,files:Object.fromEntries(Object.keys(files).map(n=>[n+'.json',sha(readFileSync(join(output,n+'.json')))])),world_modified:false};
  writeFileSync(join(output,'provenance.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({source_sha256:sourceHash,box:design.box,blocks:design.blocks.length,tiles:design.tiles.length,inputs:design.inputs.length,signals:design.circuit.signals.length,jobs:tests.jobs.length,phases:tests.jobs.reduce((n,j)=>n+j.spec.cases.length,0),world_modified:false}));
}
