import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Candidate only: digital subtract comparators compute the half-adder functions.
// This module generates plans and tests; it never connects to Minecraft.
const facing={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
export function makeCompactAdder({origin={x:64,y:-60,z:-64},id='gpu_compact_adder1'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_compact_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid compact adder id');
  const blocks=new Map(),inputs=[];
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+1+y,z:origin.z+z});
  const put=(x,y,z,name,properties)=>{const position=p(x,y,z);blocks.set(key(position),{position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}});};
  const wire=(x,y,z)=>put(x,y,z,'redstone_wire');
  const stone=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const rep=(x,y,z,travel)=>put(x,y,z,'repeater',{facing:facing[travel],delay:'1'});
  const cmp=(x,z)=>put(x,0,z,'comparator',{facing:'west',mode:'subtract'});
  const line=(x1,z1,x2,z2,y=0)=>{
    if(x1!==x2&&z1!==z2)throw Error('axis-aligned line required');
    const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);
  };
  const supportedLine=(x1,z1,x2,z2,y)=>{
    line(x1,z1,x2,z2,y);const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)stone(x1+Math.sign(x2-x1)*i,y-1,z1+Math.sign(z2-z1)*i);
  };
  const lever=(name,x,z)=>{put(x,0,z,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name,position:p(x,0,z)});};
  const half=x=>{
    for(const z of [0,8]){
      line(x,z,x+3,z);rep(x+4,0,z,'east');cmp(x+5,z);
      wire(x+6,0,z);rep(x+7,0,z,'east');line(x+8,z,x+9,z);
    }
    // B reaches A−B's side at ground level; the A route crosses above it.
    line(x+1,8,x+1,2);line(x+1,2,x+5,2);rep(x+5,0,1,'north');
    for(let k=1;k<=3;k++){stone(x+1,k-1,-k);wire(x+1,k,-k);}
    supportedLine(x+1,-3,x+5,-3,3);supportedLine(x+5,-3,x+5,3,3);
    rep(x+3,3,-3,'east');rep(x+5,3,0,'south');
    for(let k=1;k<=3;k++){stone(x+5,2-k,3+k);wire(x+5,3-k,3+k);}
    rep(x+5,0,7,'south');
    // The output repeaters isolate the two subtraction branches before OR.
    line(x+9,0,x+9,8);wire(x+10,0,4);
    // B−(B−A) is A AND B when all comparator inputs are normalized to 15/0.
    line(x+1,8,x+1,12);line(x+1,12,x+3,12);
    rep(x+4,0,12,'east');cmp(x+5,12);wire(x+6,0,12);rep(x+7,0,12,'east');wire(x+8,0,12);
    line(x+6,8,x+6,10);wire(x+5,0,10);rep(x+5,0,11,'south');
  };
  half(0);half(12);
  lever('a',0,0);lever('b',0,8);lever('cin',12,8);
  // First XOR P drives the second half-adder's A input through an isolated gap.
  line(10,4,11,4);line(11,4,11,0);rep(11,0,1,'north');wire(12,0,0);
  // The independent half-carry output repeaters isolate the final OR bus.
  line(8,12,8,16);line(20,12,20,16);line(8,16,20,16);
  rep(14,0,17,'south');wire(14,0,18);
  rep(23,0,4,'east');wire(24,0,4);
  const signals=[
    {name:'sum',position:p(23,0,4),property:'powered'},
    {name:'carry',position:p(14,0,17),property:'powered'},
    {name:'partial',position:p(10,0,4),property:'power'},
    {name:'carry_ab',position:p(7,0,12),property:'powered'},
    {name:'carry_pc',position:p(19,0,12),property:'powered'},
  ];
  for(const [prefix,x]of [['ab',0],['pc',12]])signals.push(
    {name:`${prefix}_x_minus_y`,position:p(x+6,0,0),property:'power'},
    {name:`${prefix}_y_minus_x`,position:p(x+6,0,8),property:'power'},
    {name:`${prefix}_side_y`,position:p(x+5,0,1),property:'powered'},
    {name:`${prefix}_side_x`,position:p(x+5,0,7),property:'powered'},
  );
  const box={from:p(0,-1,-3),to:p(24,4,18)},all=[...blocks.values()],tiles=[];
  for(let z=-3;z<=18;z+=11)for(let x=0;x<=24;x+=8){
    const tileBox={from:p(x,-1,z),to:p(Math.min(x+7,24),4,Math.min(z+10,18))},tileId=`${id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...tileBox.from,y:origin.y+1},to:tileBox.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:tileBox.from,to:{...tileBox.to,y:origin.y}},block:{id:'minecraft:lime_concrete'}},
      ...all.filter(b=>b.position.x>=tileBox.from.x&&b.position.x<=tileBox.to.x&&b.position.z>=tileBox.from.z&&b.position.z<=tileBox.to.z).sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b})),
    ];
    if(operations.length>128)throw Error('tile exceeds operation limit');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:tileBox,description:'Compact full-adder candidate; floor origin'},plan:{id:tileId,region_id:tileId,label:'Comparator full-adder candidate',operations}});
  }
  const floorPositions=25*22,floorOverrides=all.filter(b=>b.position.y===origin.y).length;
  return {status:'design_only_not_live_verified',id,origin,origin_means:'support floor',box,blocks:all,inputs,signals,tiles,
    ports:{a:inputs.find(v=>v.name==='a'),b:inputs.find(v=>v.name==='b'),cin:inputs.find(v=>v.name==='cin'),sum:signals[0],carry:signals[1],sum_output_wire:p(24,0,4),carry_output_wire:p(14,0,18),carry_direction:'south',sum_direction:'east'},
    circuit:{id,dimension:'minecraft:overworld',description:'Candidate full adder using two comparator half-adders',signals,buses:[{name:'result',bits:['sum','carry']}]},
    timing:{settle_ticks:64,minimum_ticks:'unmeasured; no speed claim',transition_policy:'settled outputs; hazards during changes are not excluded'},
    planned_counts:{floor_positions:floorPositions,component_positions:all.length,floor_overrides:floorOverrides,non_air_blocks:floorPositions+all.length-floorOverrides},
    materials:Object.fromEntries(all.reduce((m,b)=>m.set(b.block.id,(m.get(b.block.id)||0)+1),new Map())),
    tiling_status:'one-bit candidate only; eight-bit carry routing and timing are not designed or verified'};
}

export function makeCompactAdderCases(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be an integer from 1 through 200');
  const cases=[];
  const add=(name,a,b,cin)=>{const result=a+b+cin,p=a^b;cases.push({name,inputs:{a:!!a,b:!!b,cin:!!cin},expect:{result,sum:result&1,carry:result>>1,partial:p,carry_ab:a&b,carry_pc:p&cin,ab_x_minus_y:a&!b,ab_y_minus_x:b&!a,ab_side_y:b,ab_side_x:a,pc_x_minus_y:p&!cin,pc_y_minus_x:cin&!p,pc_side_y:cin,pc_side_x:p}});};
  for(let i=0;i<8;i++){const g=i^(i>>1);add(`truth_${g.toString(2).padStart(3,'0')}`,(g>>2)&1,(g>>1)&1,g&1);}
  for(const row of [
    ['transition_zero',0,0,0],['transition_a',1,0,0],['transition_ac',1,0,1],
    ['transition_all',1,1,1],['transition_ab',1,1,0],['transition_b',0,1,0],
    ['transition_bc',0,1,1],['transition_c',0,0,1],['transition_a_again',1,0,0],
    ['transition_bc_again',0,1,1],['finish_zero',0,0,0],
  ])add(...row);
  return {circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/compact-adder.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeCompactAdder(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{});
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,'functional-test':makeCompactAdderCases(design)}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,box:design.box,tiles:design.tiles.length,cases:makeCompactAdderCases(design).cases.length,planned_counts:design.planned_counts}));
}
