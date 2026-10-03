import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactAdder} from './compact-adder.mjs';

// Two cells only. The original cell generator and all live hardware stay untouched.
const key=p=>`${p.x},${p.y},${p.z}`;
const facing={east:'west',west:'east',north:'south',south:'north'};
export function makeCompactAdderChain({origin={x:64,y:-24,z:-96},id='gpu_compact_chain2'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_compact_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid compact chain id');
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+1+y,z:origin.z+z}),blocks=new Map(),inputs=[],signals=[],cells=[];
  for(let bit=0;bit<2;bit++){
    const cell=makeCompactAdder({origin:{...origin,z:origin.z+bit*28},id:`gpu_compact_chain_bit${bit}`});cells.push(cell);
    for(const b of cell.blocks){if(blocks.has(key(b.position)))throw Error('cell overlap');blocks.set(key(b.position),b);}
    for(const input of cell.inputs){if(input.name==='cin'){if(bit===0)inputs.push({...input,name:'cin'});}else inputs.push({...input,name:`${input.name}${bit}`});}
    for(const signal of cell.signals)signals.push({...signal,name:`bit${bit}_${signal.name}`});
  }
  const put=(x,y,z,name,properties)=>{const position=p(x,y,z);blocks.set(key(position),{position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}});};
  const wire=(x,y,z)=>put(x,y,z,'redstone_wire');
  const stone=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const rep=(x,y,z,travel)=>put(x,y,z,'repeater',{facing:facing[travel],delay:'1'});
  const line=(x1,z1,x2,z2,y=0)=>{
    if(x1!==x2&&z1!==z2)throw Error('axis-aligned line required');
    const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);
  };
  const supportedLine=(x1,z1,x2,z2,y)=>{
    line(x1,z1,x2,z2,y);const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)stone(x1+Math.sign(x2-x1)*i,y-1,z1+Math.sign(z2-z1)*i);
  };
  // Leave the first cell below its active wiring, and climb outside both cells.
  line(14,18,14,20);line(14,20,27,20);rep(22,0,20,'east');
  for(let k=1;k<=6;k++){stone(27,k-1,20+k);wire(27,k,20+k);}
  supportedLine(27,26,27,42,6);rep(27,6,28,'south');rep(27,6,39,'south');
  supportedLine(27,42,11,42,6);rep(20,6,42,'west');rep(13,6,42,'west');
  for(let k=1;k<=6;k++){stone(11,5-k,42-k);wire(11,6-k,42-k);}
  // Replace, rather than retain, the upper Cin lever. Its output is normalized
  // before the cell's Cin side-control branch and comparator rear input split.
  rep(12,0,36,'east');
  signals.push({name:'cin0',position:cells[0].ports.cin.position,property:'powered'},
    {name:'cin1',position:cells[1].ports.cin.position,property:'powered'},
    {name:'carry_bridge',position:p(13,6,42),property:'powered'});
  const box={from:p(0,-1,-3),to:p(27,7,46)},all=[...blocks.values()],tiles=[];
  for(let z=-3;z<=46;z+=10)for(let x=0;x<=27;x+=8){
    const tileBox={from:p(x,-1,z),to:p(Math.min(x+7,27),7,Math.min(z+9,46))},tileId=`${id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...tileBox.from,y:origin.y+1},to:tileBox.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:tileBox.from,to:{...tileBox.to,y:origin.y}},block:{id:'minecraft:lime_concrete'}},
      ...all.filter(b=>b.position.x>=tileBox.from.x&&b.position.x<=tileBox.to.x&&b.position.z>=tileBox.from.z&&b.position.z<=tileBox.to.z).sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b})),
    ];
    if(operations.length>128)throw Error('tile exceeds operation limit');
    const writes=operations.reduce((n,o)=>n+(o.op==='set'?1:(o.box.to.x-o.box.from.x+1)*(o.box.to.y-o.box.from.y+1)*(o.box.to.z-o.box.from.z+1)),0);
    if(writes>4096)throw Error('tile exceeds write-volume limit');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:tileBox,description:'Two-bit compact carry-chain candidate; floor origin'},plan:{id:tileId,region_id:tileId,label:'Two compact adders with physical carry',operations}});
  }
  const floorPositions=28*50,floorOverrides=all.filter(b=>b.position.y===origin.y).length;
  return {status:'design_only_not_live_verified',id,bits:2,origin,origin_means:'support floor',box,blocks:all,inputs,signals,tiles,
    source_cell_sha256:createHash('sha256').update(readFileSync(new URL('./compact-adder.mjs',import.meta.url))).digest('hex'),
    circuit:{id,dimension:'minecraft:overworld',description:'Two-bit compact adder; higher Cin is a physically driven repeater',signals,buses:[{name:'result',bits:['bit0_sum','bit1_sum','bit1_carry']},{name:'sum',bits:['bit0_sum','bit1_sum']},{name:'carry',bits:['bit1_carry']}]},
    ports:{inputs,cin0:cells[0].ports.cin.position,cin1:cells[1].ports.cin.position,carry_link_source:cells[0].ports.carry_output_wire,carry_link_landing:p(11,0,36),sum:[cells[0].ports.sum,cells[1].ports.sum],carry:cells[1].ports.carry,carry_output_wire:cells[1].ports.carry_output_wire},
    timing:{settle_ticks:100,minimum_ticks:'unmeasured for this two-cell chain; no speed claim'},
    planned_counts:{floor_positions:floorPositions,component_positions:all.length,floor_overrides:floorOverrides,non_air_blocks:floorPositions+all.length-floorOverrides},
    scope:'Exactly two bits; no byte-scale routing or timing validation is implied.'};
}

function caseFor(name,a,b,cin){
  const inputs={a0:!!(a&1),a1:!!(a&2),b0:!!(b&1),b1:!!(b&2),cin:!!cin},total=a+b+cin;
  const carry0=((a&1)+(b&1)+cin)>>1;
  const expect={result:total,sum:total&3,carry:total>>2,cin0:cin,cin1:carry0,carry_bridge:carry0};
  for(let bit=0;bit<2;bit++){
    const av=(a>>bit)&1,bv=(b>>bit)&1,cv=bit?carry0:cin,p=av^bv,result=av+bv+cv;
    const values={sum:result&1,carry:result>>1,partial:p,carry_ab:av&bv,carry_pc:p&cv,
      ab_x_minus_y:av&!bv,ab_y_minus_x:bv&!av,ab_side_y:bv,ab_side_x:av,
      pc_x_minus_y:p&!cv,pc_y_minus_x:cv&!p,pc_side_y:cv,pc_side_x:p};
    for(const [signal,value]of Object.entries(values))expect[`bit${bit}_${signal}`]=value;
  }
  return {name,inputs,expect};
}

export function makeCompactAdderChainTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be an integer from 1 through 200');
  const base={circuit_id:design.id,inputs:design.inputs,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true};
  const truth=[];for(let a=0;a<4;a++)for(let b=0;b<4;b++)for(let cin=0;cin<2;cin++)truth.push(caseFor(`truth_a${a}_b${b}_c${cin}`,a,b,cin));
  const transitions=[
    ['zero',0,0,0],['carry_lower',1,1,0],['carry_into_full_word',3,1,0],['all_high',3,3,1],
    ['fall_all_zero',0,0,0],['carry_from_cin',3,0,1],['carry_chain_low',3,0,0],
    ['swap_operands',0,3,1],['a_alternating',1,2,0],['b_alternating',2,1,1],
    ['upper_only',2,2,0],['finish_zero',0,0,0],
  ].map(row=>caseFor(...row));
  const truthJobs=[];for(let i=0;i<truth.length;i+=16)truthJobs.push({...base,cases:truth.slice(i,i+16)});
  return {truth_jobs:truthJobs,transition_job:{...base,cases:transitions},truth_cases:32,transition_cases:transitions.length,
    warning:'Each truth job covers16 arithmetic vectors. Run both jobs for all32 input combinations. Native input writes are sequential; these are settled-output tests, not simultaneous bus-edge claims.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/compact-adder-chain.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeCompactAdderChain(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeCompactAdderChainTests(design);
  const files={design,'build-tiles':design.tiles,circuit:design.circuit,'transitions-test':tests.transition_job};
  tests.truth_jobs.forEach((spec,i)=>files[`truth-test-${i+1}`]=spec);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,box:design.box,tiles:design.tiles.length,planned_counts:design.planned_counts,truth_cases:tests.truth_cases,transition_cases:tests.transition_cases,source_cell_sha256:design.source_cell_sha256}));
}
