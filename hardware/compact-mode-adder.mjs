import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactAdderChain} from './compact-adder-chain.mjs';
const key=p=>`${p.x},${p.y},${p.z}`;
const facing={east:'west',west:'east',north:'south',south:'north'};
export function makeCompactModeAdder({origin={x:0,y:32,z:16},id='gpu_compact_mode2'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_compact_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid id');
  const core=makeCompactAdderChain({origin,id}),map=new Map(core.blocks.map(b=>[key(b.position),b])),inputs=core.inputs.filter(v=>v.name.startsWith('a')),signals=[...core.signals];
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
  for(let bit=0;bit<2;bit++){
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
    probe(`front_b_minus_mode${bit}`,x+6,0,z0,'power');probe(`front_mode_minus_b${bit}`,x+6,0,z0+8,'power');
  }
  lever('mode',-18,-6);line(-18,-5,-18,40);for(const z of [0,10,22,34])rep(-18,0,z,'south');
  for(const z of [12,40])line(-18,z,-15,z);
  probe('mode',-18,0,-6);for(let bit=0;bit<2;bit++)probe(`raw_a${bit}`,0,0,28*bit);
  // Separate mode-to-Cin0 bridge, clear of the XOR-to-second-half ground path.
  rep(-19,0,-4,'west');wire(-20,0,-4);for(let k=1;k<=6;k++)wire(-20-k,k,-4);
  line(-26,-4,-26,14,6);rep(-26,6,0,'south');rep(-26,6,12,'south');
  line(-26,14,11,14,6);for(const x of [-15,-3,9])rep(x,6,14,'east');
  for(let k=1;k<=6;k++)wire(11,6-k,14-k);
  if(map.get(key(p(12,0,8)))?.block.id!=='minecraft:lever')throw Error('expected Cin0 lever');rep(12,0,8,'east',true);
  probe('mode_bridge',9,6,14);
  // Isolate both sum outputs before the shared, southward nonzero collector.
  for(const z of [4,32]){rep(25,0,z,'east');line(26,z,33,z);}
  line(33,4,33,59);for(const z of [10,22,34,46,58])rep(33,0,z,'south');
  rep(33,0,60,'south');stone(33,0,61);put(34,0,61,'redstone_wall_torch',{facing:'east'});wire(35,0,61);rep(36,0,61,'east');wire(37,0,61);
  // C feeds a normalized inverter for N and a normalized subtract gate for P.
  line(14,46,14,52);rep(14,0,51,'south');line(14,52,19,52);rep(20,0,52,'east');comp(21,0,52,'east');wire(22,0,52);rep(23,0,52,'east');wire(24,0,52);
  rep(14,0,53,'south');stone(14,0,54);put(15,0,54,'redstone_wall_torch',{facing:'east'});wire(16,0,54);rep(17,0,54,'east');wire(18,0,54);
  // Z has its own southern return; it must not merge with C or NZ.
  line(35,61,35,64);rep(35,0,63,'south');line(35,64,21,64);rep(24,0,64,'west');line(21,64,21,54);rep(21,0,59,'north');rep(21,0,53,'north');
  probe('nz',33,0,58);probe('z',36,0,61);probe('n',17,0,54);probe('p',23,0,52);probe('flag_c',20,0,52);probe('flag_z_side',21,0,53);
  const all=[...map.values()],box={from:p(-26,-1,-6),to:p(37,7,64)},tiles=[],axes=['x','y','z'];
  function tile(bounds,contents){
    if(contents.length+2>128){const axis=bounds.to.x-bounds.from.x>=bounds.to.z-bounds.from.z?'x':'z',mid=Math.floor((bounds.from[axis]+bounds.to[axis])/2);tile({from:bounds.from,to:{...bounds.to,[axis]:mid}},contents.filter(b=>b.position[axis]<=mid));tile({from:{...bounds.from,[axis]:mid+1},to:bounds.to},contents.filter(b=>b.position[axis]>mid));return;}
    const tileId=`${id}_t${tiles.length}`,operations=[{op:'fill',box:{from:{...bounds.from,y:origin.y+1},to:bounds.to},block:{id:'minecraft:air'}},{op:'fill',box:{from:bounds.from,to:{...bounds.to,y:origin.y}},block:{id:'minecraft:lime_concrete'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))];
    const writes=operations.reduce((n,o)=>n+(o.op==='set'?1:axes.reduce((v,k)=>v*(o.box.to[k]-o.box.from[k]+1),1)),0);if(writes>4096)throw Error('write budget exceeded');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:bounds,description:'Unbuilt two-bit physical mode-conditioning and flags candidate'},plan:{id:tileId,region_id:tileId,label:'Two-bit ADD SUB CMP candidate',operations}});
  }
  for(let z=-6;z<=64;z+=8)for(let x=-26;x<=37;x+=8){const bounds={from:p(x,-1,z),to:p(Math.min(x+7,37),7,Math.min(z+7,64))};tile(bounds,all.filter(b=>axes.every(k=>b.position[k]>=bounds.from[k]&&b.position[k]<=bounds.to[k])));}
  const floor=64*71,overrides=all.filter(b=>b.position.y===origin.y).length;
  return {status:'design_only_not_live_verified',id,origin,origin_means:'support floor',bits:2,box,blocks:all,inputs,signals,tiles,
    circuit:{id,dimension:'minecraft:overworld',description:'Physical B XOR mode, mode carry-in, two-bit arithmetic and combinational unsigned CMP flags',signals,buses:[{name:'sum',bits:['bit0_sum','bit1_sum']},{name:'carry',bits:['bit1_carry']},{name:'raw_flags',bits:['p','z','n']},{name:'conditioned_b',bits:['conditioned_b0','conditioned_b1']},{name:'mode_taps',bits:['mode_tap0','mode_tap1']}]},
    ports:{inputs,sum:core.ports.sum,carry:core.ports.carry,flags:signals.filter(s=>['n','z','p'].includes(s.name)),cin0:p(12,0,8),cin1:p(12,0,36),conditioned_b:[p(0,0,8),p(0,0,36)]},
    planned_counts:{component_positions:all.length,floor_positions:floor,floor_overrides:overrides,non_air_blocks:floor+all.length-overrides},
    source_chain_sha256:createHash('sha256').update(readFileSync(new URL('./compact-adder-chain.mjs',import.meta.url))).digest('hex'),
    source_cell_sha256:core.source_cell_sha256,timing:{settle_ticks:200,minimum_phase_ticks:'unmeasured; no native result'},
    flags_contract:'N=!carry, Z=!(sum0|sum1), P=carry&!Z. Raw flags continuously computed; unsigned comparison meaning only when mode=1. No architectural flag storage or CMP write enable yet.',
    construction:'Fresh region/player/chunk inspection required. Group at most24tiles per journal. Existing hardware and generators unchanged.'};
}

export function makeCompactModeAdderTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be1..200');
  const makeCase=(name,a,b,mode)=>{
    const conditioned=b^(mode?3:0),total=a+conditioned+mode,sum=total&3,carry=total>>2,carry0=((a&1)+(conditioned&1)+mode)>>1;
    const expect={sum,carry,raw_flags:4*(1-carry)+2*+(sum===0)+(carry&&sum!==0?1:0),conditioned_b:conditioned,mode_taps:mode?3:0,
      cin0:mode,cin1:carry0,carry_bridge:carry0,mode,mode_bridge:mode,nz:+(sum!==0),z:+(sum===0),n:1-carry,p:+!!(carry&&sum!==0),flag_c:carry,flag_z_side:+(sum===0)};
    for(let bit=0;bit<2;bit++){
      const av=(a>>bit)&1,raw=(b>>bit)&1,bv=(conditioned>>bit)&1,cv=bit?carry0:mode,partial=av^bv,v=av+bv+cv;
      expect[`raw_a${bit}`]=av;expect[`raw_b${bit}`]=raw;expect[`mode_tap${bit}`]=mode;expect[`conditioned_b${bit}`]=bv;expect[`front_b_minus_mode${bit}`]=raw&!mode;expect[`front_mode_minus_b${bit}`]=mode&!raw;
      for(const [signal,value]of Object.entries({sum:v&1,carry:v>>1,partial,carry_ab:av&bv,carry_pc:partial&cv,ab_x_minus_y:av&!bv,ab_y_minus_x:bv&!av,ab_side_y:bv,ab_side_x:av,pc_x_minus_y:partial&!cv,pc_y_minus_x:cv&!partial,pc_side_y:cv,pc_side_x:partial}))expect[`bit${bit}_${signal}`]=value;
    }
    return {name,inputs:{a0:!!(a&1),a1:!!(a&2),b0:!!(b&1),b1:!!(b&2),mode:!!mode},expect};
  };
  const base={circuit_id:design.id,inputs:design.inputs,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true},jobs=[];
  for(let mode=0;mode<2;mode++){const cases=[];for(let a=0;a<4;a++)for(let b=0;b<4;b++)cases.push(makeCase(`truth_m${mode}_a${a}_b${b}`,a,b,mode));jobs.push({name:mode?'sub_cmp_truth':'add_truth',spec:{...base,cases}});}
  const transitions=[];for(const [a,b]of [[0,0],[3,3],[0,3],[3,0],[1,2],[2,1]])for(const mode of [0,1,0])transitions.push(makeCase(`mode_a${a}_b${b}_step${transitions.length}`,a,b,mode));
  transitions.push(makeCase('finish_zero_add',0,0,0));jobs.push({name:'mode_transitions',spec:{...base,cases:transitions}});
  return {jobs,truth_states:32,transition_cases:transitions.length,warning:'Raw B remains the real operand; internal complements/carries/flags are never test inputs. CMP flags valid onlymode1; mode0 raw flags are checked as circuitry, not architectural comparisons. Input writes sequential, settled assertions only.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/compact-mode-adder.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');const design=makeCompactModeAdder(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeCompactModeAdderTests(design);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,box:design.box,counts:design.planned_counts,tiles:design.tiles.length,inputs:design.inputs.length,signals:design.signals.length,jobs:tests.jobs.map(j=>({name:j.name,cases:j.spec.cases.length}))}));
}
