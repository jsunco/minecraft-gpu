import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Candidate geometry only. This module never connects to Minecraft.
const facingForTravel={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
function validate(origin,id){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('origin must be integer x,y,z');
  if(!/^gpu_register_[a-zA-Z0-9_-]+$/.test(id)||id.length>29)throw Error('id must start gpu_register_ and contain at most 29 identifier characters');
}
function make({origin,id,bits,sharedEnable}){
  validate(origin,id);const map=new Map(),inputs=[],signals=[],ports={data:[],q:[],lock:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,y,z,name,properties)=>{const position=p(x,y,z);map.set(key(position),{position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}});};
  const wire=(x,z)=>put(x,1,z,'redstone_wire');
  const rep=(x,z,travel)=>put(x,1,z,'repeater',{facing:facingForTravel[travel],delay:'1'});
  const lever=(name,x,z)=>{put(x,1,z,'lever',{face:'floor',facing:'west',powered:'false'});const port={name,position:p(x,1,z)};inputs.push(port);return port;};
  for(let i=0;i<bits;i++){
    const z=i*6;
    ports.data.push(lever(`d${i}`,0,z));
    wire(1,z);rep(2,z,'east');wire(3,z);
    rep(2,z+1,'north');wire(2,z+2);
    put(2,1,z+4,'light_gray_concrete');put(2,1,z+3,'redstone_wall_torch',{facing:'north'});wire(1,z+4);
    if(sharedEnable){wire(0,z+4);wire(-1,z+4);}else ports.write_enable=lever('write_enable',0,z+4);
    ports.q.push({name:`q${i}`,position:p(2,1,z),property:'powered'});
    ports.lock.push({name:`lock${i}`,position:p(2,1,z+1),property:'powered'});
  }
  if(sharedEnable){
    for(let z=1;z<=(bits-1)*6+4;z++)wire(-2,z);
    for(let z=11;z<(bits-1)*6+4;z+=12)rep(-2,z,'south');
    ports.write_enable=lever('write_enable',-2,0);
  }
  signals.push(...ports.q,...ports.lock);
  const box={from:p(sharedEnable?-2:0,0,0),to:p(3,2,(bits-1)*6+4)};
  const blocks=[...map.values()];
  const tiles=[];
  for(let z=0;z<=(bits-1)*6+4;z+=24){
    const regionBox={from:p(sharedEnable?-2:0,0,z),to:p(3,2,Math.min(z+23,(bits-1)*6+4))};
    const tileId=`${id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...regionBox.from,y:origin.y+1},to:regionBox.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:regionBox.from,to:{...regionBox.to,y:origin.y}},block:{id:'minecraft:blue_concrete'}},
      ...blocks.filter(b=>b.position.z>=regionBox.from.z&&b.position.z<=regionBox.to.z).map(b=>({op:'set',...b})),
    ];
    if(operations.length>128)throw Error('Tile exceeds 128 operations');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:regionBox,description:'Reserved storage prototype; origin is the support floor'},plan:{id:tileId,region_id:tileId,label:'Locked-repeater storage candidate',operations}});
  }
  return {status:'design_only_not_live_verified',id,bits,origin,origin_means:'support floor',box,blocks,ports,inputs,
    circuit:{id,dimension:'minecraft:overworld',description:'Candidate level-sensitive write-enable storage; powered storage repeaters are Q',signals,buses:[{name:'q',bits:ports.q.map(v=>v.name)},{name:'locks',bits:ports.lock.map(v=>v.name)}]},
    timing:{settle_ticks:bits===1?16:32,write_enable_active:true,closed_write_enable:false,minimum_phase_ticks:'not yet measured; use conservative settling and verify natively'},
    tiles,initialization:'Explicit write of zero followed by closing write_enable; not an independent reset port.'};
}

export const makeRegisterCell=({origin={x:16,y:-60,z:16},id='gpu_register_cell'}={})=>make({origin,id,bits:1,sharedEnable:false});
export const makeRegisterBank=({origin={x:32,y:-60,z:16},id='gpu_register_byte'}={})=>make({origin,id,bits:8,sharedEnable:true});
export function makeRegister({origin,bits=1,id}={}){
  if(bits!==1&&bits!==8)throw Error('This stage supports a one-bit cell or eight-bit bank');
  return bits===1?makeRegisterCell({...(origin?{origin}:{}),...(id?{id}:{})}):makeRegisterBank({...(origin?{origin}:{}),...(id?{id}:{})});
}

/** Logical test oracle only: never supplies the circuit's output or bypasses Q reads. */
export function makeRegisterTests(design,{patterns,holdTicks=200}={}){
  const max=2**design.bits-1,settle=design.timing.settle_ticks;
  patterns??=design.bits===1?[1,0,1]:[0,255,85,170,1,2,4,8,16,32,64,128,129,126];
  if(patterns.some(x=>!Number.isInteger(x)||x<0||x>max))throw Error('Pattern outside register width');
  const values=(data,enabled)=>Object.fromEntries([...Array.from({length:design.bits},(_,i)=>[`d${i}`,!!(data&(1<<i))]),['write_enable',enabled]]);
  const cases=[];let stored=0;
  const add=(name,data,enabled,expected)=>cases.push({name,inputs:values(data,enabled),expect:{q:expected,locks:enabled?0:max}});
  // Do not assume a fresh cell starts cleared. First open with zero, then close it.
  add('initialize_zero_open',0,true,0);add('initialize_zero_close',0,false,0);
  for(const [i,data]of patterns.entries()){
    add(`p${i}_stage_data_closed`,data,false,stored);
    add(`p${i}_write_open`,data,true,data);stored=data;
    add(`p${i}_close_unchanged_data`,data,false,stored);
    add(`p${i}_hold_complement`,data^max,false,stored);
  }
  add('finish_stage_zero_closed',0,false,stored);add('finish_write_zero',0,true,0);add('finish_hold_zero',0,false,0);
  const base={circuit_id:design.id,inputs:design.inputs,settle_ticks:settle,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true};
  const hold={...base,cases:[
    {name:'hold_zero_against_all_ones',inputs:values(max,false),expect:{q:0,locks:max}},
    {name:'hold_zero_against_zero',inputs:values(0,false),expect:{q:0,locks:max}},
  ],settle_ticks:holdTicks};
  return {functional:{...base,cases},hold_zero_after_functional:hold,
    warning:'Input restoration does not restore stored Q. These sequences deliberately finish with Q=0. The long-hold spec requires the successful functional test first.'};
}
export const makeRegisterCases=(design,options)=>makeRegisterTests(design,options).functional;
export const makeRegisterHoldCases=(design,options)=>makeRegisterTests(design,options).hold_zero_after_functional;

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [mode,output,coordinate]=process.argv.slice(2);
  if(!['cell','byte'].includes(mode)||!output)throw Error('Usage: node hardware/register-cell.mjs cell|byte OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const override=coordinate?.split(',').map(Number);if(override&&override.length!==3)throw Error('Origin must be x,y,z');
  const options=override?{origin:{x:override[0],y:override[1],z:override[2]}}:{};
  const design=mode==='cell'?makeRegisterCell(options):makeRegisterBank(options),tests=makeRegisterTests(design);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,'functional-test':tests.functional,'hold-test':tests.hold_zero_after_functional}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,status:design.status,origin:design.origin,box:design.box,inputs:design.inputs,output_bus:'q',tiles:design.tiles.length,cases:tests.functional.cases.length,world_modified:false}));
}
