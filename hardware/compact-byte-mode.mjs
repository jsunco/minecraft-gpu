import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactByteAdder} from './compact-byte-adder.mjs';
const key=p=>`${p.x},${p.y},${p.z}`;
const facing={east:'west',west:'east',north:'south',south:'north'};
export function makeCompactByteMode({origin={x:0,y:112,z:-128},id='gpu_compact_mode8'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_compact_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid id');
  const core=makeCompactByteAdder({origin,id}),map=new Map(),inputs=core.inputs.filter(v=>v.name.startsWith('a')),signals=[];
  // Preserve the bare byte's complete floor; add only required supports outside it.
  for(let z=-3;z<=214;z++)for(let x=0;x<=27;x++){const position={x:origin.x+x,y:origin.y,z:origin.z+z};map.set(key(position),{position,block:{id:'minecraft:lime_concrete'}});}
  for(const b of core.blocks)map.set(key(b.position),b);
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+1+y,z:origin.z+z});
  const put=(x,y,z,name,properties,replace=false)=>{const position=p(x,y,z),v={position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}},old=map.get(key(position));if(old&&JSON.stringify(old.block)!==JSON.stringify(v.block)&&!replace)throw Error(`collision at ${key(position)}: ${old.block.id} vs ${name}`);map.set(key(position),v);};
  const stone=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const supported=(x,y,z,name,properties,replace=false)=>{const below=map.get(key(p(x,y-1,z)));if(below&&!below.block.id.endsWith('_concrete'))throw Error(`support collision at ${x},${y-1},${z}`);if(!below)stone(x,y-1,z);put(x,y,z,name,properties,replace);};
  const wire=(x,y,z)=>supported(x,y,z,'redstone_wire');
  const rep=(x,y,z,travel,replace=false)=>supported(x,y,z,'repeater',{facing:facing[travel],delay:'1'},replace||map.get(key(p(x,y,z)))?.block.id==='minecraft:redstone_wire');
  const comp=(x,y,z,travel)=>supported(x,y,z,'comparator',{facing:facing[travel],mode:'subtract'});
  const line=(x1,z1,x2,z2,y=0)=>{if(x1!==x2&&z1!==z2)throw Error('axis-aligned line');const n=Math.abs(x2-x1)+Math.abs(z2-z1);for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);};
  const probe=(name,x,y,z,property='powered')=>signals.push({name,position:p(x,y,z),property});
  const lever=(name,x,z)=>{supported(x,0,z,'lever',{face:'floor',facing:'west',powered:'false'},map.get(key(p(x,0,z)))?.block.id==='minecraft:redstone_wire');inputs.push({name,position:p(x,0,z)});};
  // Exact XOR portion of the proven first half-adder, without unused carry gate.
  for(let bit=0;bit<8;bit++){
    const x=-14,z0=4+28*bit;
    for(const z of [z0,z0+8]){line(x,z,x+3,z);rep(x+4,0,z,'east');comp(x+5,0,z,'east');wire(x+6,0,z);rep(x+7,0,z,'east');line(x+8,z,x+9,z);}
    line(x+1,z0+8,x+1,z0+2);line(x+1,z0+2,x+5,z0+2);rep(x+5,0,z0+1,'north');
    for(let k=1;k<=3;k++)wire(x+1,k,z0-k);
    line(x+1,z0-3,x+5,z0-3,3);line(x+5,z0-3,x+5,z0+3,3);rep(x+3,3,z0-3,'east');rep(x+5,3,z0,'south');
    for(let k=1;k<=3;k++)wire(x+5,3-k,z0+3+k);
    rep(x+5,0,z0+7,'south');line(x+9,z0,x+9,z0+8);wire(x+10,0,z0+4);
    lever(`b${bit}`,x,z0);rep(x,0,z0+8,'east');
    line(-4,z0+4,-1,z0+4);rep(-2,0,z0+4,'east');
    if(map.get(key(p(0,0,z0+4)))?.block.id!=='minecraft:lever')throw Error('expected coreB lever');
    rep(0,0,z0+4,'east',true);
    probe(`raw_b${bit}`,x,0,z0);probe(`mode_tap${bit}`,x,0,z0+8);probe(`conditioned_b${bit}`,0,0,z0+4);

  }
  lever('mode',-18,-6);line(-18,-5,-18,208);rep(-18,0,0,'south');for(let z=10;z<=202;z+=12)rep(-18,0,z,'south');
  for(let bit=0;bit<8;bit++)line(-18,12+28*bit,-15,12+28*bit);
  probe('mode',-18,0,-6);for(let bit=0;bit<8;bit++){probe(`raw_a${bit}`,0,0,28*bit);for(const name of [`bit${bit}_sum`,`bit${bit}_carry`,`cin${bit}`])signals.push(core.signals.find(s=>s.name===name));}
  // Separate mode-to-Cin0 bridge, clear of the XOR-to-second-half ground path.
  rep(-19,0,-4,'west');wire(-20,0,-4);for(let k=1;k<=6;k++)wire(-20-k,k,-4);
  line(-26,-4,-26,14,6);rep(-26,6,0,'south');rep(-26,6,12,'south');
  line(-26,14,11,14,6);for(const x of [-15,-3,9])rep(x,6,14,'east');
  for(let k=1;k<=6;k++)wire(11,6-k,14-k);
  if(map.get(key(p(12,0,8)))?.block.id!=='minecraft:lever')throw Error('expected Cin0 lever');rep(12,0,8,'east',true);
  probe('mode_bridge',9,6,14);
  // Isolate all eight sum outputs before the shared, southward nonzero collector.
  for(const z of Array.from({length:8},(_,i)=>4+28*i)){rep(25,0,z,'east');line(26,z,33,z);rep(32,0,z,'east');}
  line(33,4,33,227);for(let z=10;z<=226;z+=12)rep(33,0,z,'south');
  rep(33,0,228,'south');stone(33,0,229);put(34,0,229,'redstone_wall_torch',{facing:'east'});wire(35,0,229);rep(36,0,229,'east');wire(37,0,229);
  // C feeds a normalized inverter for N and a normalized subtract gate for P.
  line(14,214,14,220);rep(14,0,219,'south');line(14,220,19,220);rep(20,0,220,'east');comp(21,0,220,'east');wire(22,0,220);rep(23,0,220,'east');wire(24,0,220);
  rep(14,0,221,'south');stone(14,0,222);put(15,0,222,'redstone_wall_torch',{facing:'east'});wire(16,0,222);rep(17,0,222,'east');wire(18,0,222);
  // Z has its own southern return; it must not merge with C or NZ.
  line(35,229,35,232);rep(35,0,231,'south');line(35,232,21,232);rep(24,0,232,'west');line(21,232,21,222);rep(21,0,227,'north');rep(21,0,221,'north');
  probe('nz',33,0,226);probe('z',36,0,229);probe('n',17,0,222);probe('p',23,0,220);probe('flag_c',20,0,220);probe('flag_z_side',21,0,221);
  if(signals.length!==64||inputs.length!==17)throw Error('Interface budget mismatch');
  const all=[...map.values()],box={from:p(-26,-1,-6),to:p(37,7,232)},tiles=[],axes=['x','y','z'];
  function tile(bounds,contents){
    if(contents.length+1>128){const axis=bounds.to.x-bounds.from.x>=bounds.to.z-bounds.from.z?'x':'z',mid=Math.floor((bounds.from[axis]+bounds.to[axis])/2);if(mid>=bounds.to[axis])throw Error('unsplittable tile');tile({from:bounds.from,to:{...bounds.to,[axis]:mid}},contents.filter(b=>b.position[axis]<=mid));tile({from:{...bounds.from,[axis]:mid+1},to:bounds.to},contents.filter(b=>b.position[axis]>mid));return;}
    if(!contents.length)return;
    const tileId=`${id}_t${tiles.length}`,operations=[{op:'fill',box:bounds,block:{id:'minecraft:air'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))];
    const writes=operations.reduce((n,o)=>n+(o.op==='set'?1:axes.reduce((v,k)=>v*(o.box.to[k]-o.box.from[k]+1),1)),0);if(writes>4096)throw Error('write budget exceeded');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:bounds,description:'Unbuilt byte physical ADD SUB CMP mode conditioning'},plan:{id:tileId,region_id:tileId,label:'Byte ADD SUB CMP candidate',operations}});
  }
  for(let z=-6;z<=232;z+=8)for(let x=-26;x<=37;x+=8){const bounds={from:p(x,-1,z),to:p(Math.min(x+7,37),7,Math.min(z+7,232))};tile(bounds,all.filter(b=>axes.every(k=>b.position[k]>=bounds.from[k]&&b.position[k]<=bounds.to[k])));}
  const hash=url=>createHash('sha256').update(readFileSync(url)).digest('hex');
  const fixedMode=inputs.find(v=>v.name==='mode'),runnerInputs=inputs.filter(v=>v.name!=='mode');
  const buses=[{name:'sum',bits:Array.from({length:8},(_,i)=>`bit${i}_sum`)},{name:'carry',bits:['bit7_carry']},{name:'raw_flags',bits:['p','z','n']},{name:'conditioned_b',bits:Array.from({length:8},(_,i)=>`conditioned_b${i}`)},{name:'mode_taps',bits:Array.from({length:8},(_,i)=>`mode_tap${i}`)}];
  return {status:'design_only_not_live_verified',id,origin,origin_means:'support floor',bits:8,box,blocks:all,inputs:runnerInputs,physical_inputs:inputs,fixed_mode:fixedMode,signals,tiles,
    circuit:{id,dimension:'minecraft:overworld',description:'Eight-bit physical B XOR mode, mode carry-in and combinational unsigned CMP flags',signals,buses},
    ports:{inputs:runnerInputs,mode:fixedMode,sum:core.ports.sum,carry:core.ports.carry,flags:signals.filter(s=>['n','z','p'].includes(s.name)),cin0:p(12,0,8),conditioned_b:Array.from({length:8},(_,i)=>p(0,0,8+28*i))},
    planned_counts:{non_air_blocks:all.length,retained_core_floor_positions:28*218,bare_byte_non_air_blocks:core.planned_counts.non_air_blocks,new_non_air_blocks:all.length-core.planned_counts.non_air_blocks},
    source_hashes:{bare_byte:hash(new URL('./compact-byte-adder.mjs',import.meta.url)),mode_pair:hash(new URL('./compact-mode-adder.mjs',import.meta.url)),cell:core.source_hashes.cell,carry_chain:core.source_hashes.carry_chain},
    timing:{settle_ticks_per_phase:200,phases_per_vector:2,minimum_phase_ticks:'unmeasured; no native result'},
    flags_contract:'N=!carry, Z=!any(sum), P=carry&!Z. Raw flags continuously computed; unsigned comparison meaning only when mode=1. No architectural flag storage or CMP write enable.',
    acceptance:'Conditional on two-bit mode native acceptance. Physically run byte suites with all fixture chunks ticking; preserve saved pins and player body. Mode is held externally for 16-input A/B jobs, read before/after and observed throughout traces. No complemented B, carry or flags are host inputs.',
    construction:'Fresh region/player/ticking inspection required. Group at most24tiles per journal. Retain bare floor; new exterior paths get required supports only. Existing hardware and generators unchanged.'};
}

// Expected values are an oracle only: none of these intermediate signals are
// controls. The actual conditioned data and flags are produced by placed blocks.
export function expectedByteMode(a,b,mode){
  if(!Number.isInteger(a)||a<0||a>255||!Number.isInteger(b)||b<0||b>255||![0,1].includes(mode))throw Error('byte operands and binary mode required');
  const conditioned=b^(mode?255:0),total=a+conditioned+mode,sum=total&255,carry=total>>8;
  const expect={sum,carry,raw_flags:4*(1-carry)+2*+(sum===0)+ +(carry&&sum!==0),conditioned_b:conditioned,mode_taps:mode?255:0,mode,mode_bridge:mode,nz:+(sum!==0),z:+(sum===0),n:1-carry,p:+!!(carry&&sum!==0),flag_c:carry,flag_z_side:+(sum===0)};
  let c=mode;
  for(let bit=0;bit<8;bit++){
    const av=(a>>bit)&1,raw=(b>>bit)&1,bv=(conditioned>>bit)&1,v=av+bv+c;
    Object.assign(expect,{[`raw_a${bit}`]:av,[`raw_b${bit}`]:raw,[`mode_tap${bit}`]:mode,[`conditioned_b${bit}`]:bv,[`cin${bit}`]:c,[`bit${bit}_sum`]:v&1,[`bit${bit}_carry`]:v>>1});c=v>>1;
  }
  return expect;
}

export function makeCompactByteModeTests(design){
  const add={
    smoke:[[0,0],[1,1],[255,1],[255,255],[85,170],[127,1],[128,128],[0,0]],
    walking_a:Array.from({length:8},(_,i)=>[1<<i,0]),
    walking_b:Array.from({length:8},(_,i)=>[0,1<<i]),
    carry_prefix:Array.from({length:8},(_,i)=>[(1<<(i+1))-1,1]),
    carry_prefix_swapped:Array.from({length:8},(_,i)=>[1,(1<<(i+1))-1]),
    transitions:[[255,255],[0,0],[255,0],[0,255],[170,85],[170,170],[85,85],[0,0]]
  };
  const sub={
    ordering:[[0,0],[0,1],[1,0],[255,255],[255,0],[0,255],[127,128],[128,127]],
    walking_a:Array.from({length:8},(_,i)=>[1<<i,0]),
    walking_b:Array.from({length:8},(_,i)=>[0,1<<i]),
    borrow_prefix:Array.from({length:8},(_,i)=>[1<<i,1]),
    borrow_prefix_swapped:Array.from({length:8},(_,i)=>[1,1<<i]),
    equal_and_transitions:[[1,1],[127,127],[128,128],[85,85],[170,170],[170,85],[85,170],[0,0]]
  };
  const jobs=[],modeControl=design.physical_inputs.find(i=>i.name==='mode');
  const makeJob=(name,vectors,controls,fixed)=>{
    const cases=vectors.flatMap(([a,b,mode],index)=>{
      const values=Object.fromEntries(controls.map(v=>[v.name,v.name==='mode'?!!mode:!!(((v.name[0]==='a'?a:b)>>Number(v.name.slice(1)))&1)]));
      const heldControls={mode};for(let i=0;i<8;i++){heldControls[`raw_a${i}`]=(a>>i)&1;heldControls[`raw_b${i}`]=(b>>i)&1;}
      return [{name:`v${index}_a${a}_b${b}_m${mode}_propagate`,inputs:values,expect:heldControls},{name:`v${index}_a${a}_b${b}_m${mode}_assert`,inputs:values,expect:expectedByteMode(a,b,mode)}];
    });
    jobs.push({name,fixed_inputs:fixed,before_after_native_read:fixed.map(v=>({name:v.name,position:v.position,powered:v.powered})),spec:{circuit_id:design.id,inputs:controls,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true,cases}});
  };
  for(const [mode,vectors]of [[0,add],[1,sub]])for(const [name,pairs]of Object.entries(vectors))makeJob(`${mode?'sub_cmp':'add'}_${name}`,pairs.map(([a,b])=>[a,b,mode]),design.inputs,[{...modeControl,powered:!!mode}]);
  // A7 is held externally for each diagnostic, freeing the sixteenth runner
  // input for physical mode transitions without altering any internal wire.
  const a7=design.inputs.find(i=>i.name==='a7'),diagnosticInputs=[...design.inputs.filter(i=>i.name!=='a7'),modeControl];
  for(const [high,pairs]of [[0,[[0,0],[0,255],[127,128]]],[1,[[255,255],[255,0],[128,128]]]])makeJob(`mode_transitions_a7_${high}`,pairs.flatMap(([a,b])=>[0,1,0].map(mode=>[a,b,mode])),diagnosticInputs,[{...a7,powered:!!high}]);
  return {jobs,warning:'All fixed_inputs must be physically set, allowed to settle and natively verified before/after each job, and held during its complete trace. restore_inputs only covers that job controls. No automatic restoration of fixed mode or A7; explicitly clear all17 physical controls at the end. Propagate phases assert only raw controls. Arithmetic and flags accepted on second unchanged-input phase only. This is directed coverage, not exhaustive byte physical validation.',timing:{ticks_per_phase:200,phases_per_vector:2,maximum_job_ticks:3600,minimum_clock:'unmeasured'}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/compact-byte-mode.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');const design=makeCompactByteMode(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeCompactByteModeTests(design);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,'test-manifest':tests,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,box:design.box,counts:design.planned_counts,tiles:design.tiles.length,physical_inputs:design.physical_inputs.length,runner_inputs:design.inputs.length,signals:design.signals.length,jobs:tests.jobs.map(j=>({name:j.name,cases:j.spec.cases.length}))}));
}
