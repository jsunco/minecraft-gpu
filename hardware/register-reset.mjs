import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Geometry only: native repeaters/comparators perform all live storage and gating.
const facing={east:'west',west:'east',north:'south',south:'north'};
const posKey=p=>`${p.x},${p.y},${p.z}`;
export function makeResetRegister({origin={x:32,y:-60,z:80},bits=1,id=bits===1?'gpu_register_reset1':'gpu_register_reset8'}={}){
  if(![1,8].includes(bits))throw Error('bits must be 1 or 8');
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_register_[a-zA-Z0-9_-]+$/.test(id)||id.length>29)throw Error('invalid register id');
  const blocks=new Map(),inputs=[],ports={data:[],q:[],lock:[],masked:[],clamp:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,z,name,properties)=>{const position=p(x,1,z);blocks.set(posKey(position),{position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}});};
  const wire=(x,z)=>put(x,z,'redstone_wire');
  const repeater=(x,z,travel,delay=1)=>put(x,z,'repeater',{facing:facing[travel],delay:String(delay)});
  const lever=(name,x,z)=>{put(x,z,'lever',{face:'floor',facing:'west',powered:'false'});const input={name,position:p(x,1,z)};inputs.push(input);return input;};
  // Isolated header OR: the reset input drives its own rail and feeds WE through
  // two one-tick repeaters. The WE input cannot back-power the RESET rail.
  ports.reset=lever('reset',-3,-5);
  repeater(-2,-5,'east');for(let x=-1;x<=6;x++)wire(x,-5);repeater(7,-5,'east');
  ports.write_enable=lever('write_enable',8,-8);repeater(8,-7,'south');
  const end=(bits-1)*8;
  for(let z=-6;z<=end+4;z++)wire(8,z);
  for(let z=-4;z<=end+3;z++)wire(-3,z);
  for(let i=0;i<bits;i++){
    const z=i*8;
    repeater(-3,z-1,'south');repeater(8,z+1,'south');
    ports.data.push(lever(`d${i}`,0,z));wire(1,z);repeater(2,z,'east');
    put(3,z,'comparator',{facing:facing.east,mode:'subtract',powered:'false'});
    wire(4,z);repeater(5,z,'east');wire(6,z);
    // Long clamp-control delay is intentional. On RESET release the WE path
    // closes the storage latch before D is unmasked, even when D remains one.
    repeater(3,z+1,'north',4);repeater(3,z+2,'north',4);
    for(let x=-2;x<=3;x++)wire(x,z+3);
    repeater(5,z+1,'north');wire(5,z+2);
    put(5,z+4,'light_gray_concrete');put(5,z+3,'redstone_wall_torch',{facing:'north'});
    wire(6,z+4);wire(7,z+4);
    ports.q.push({name:`q${i}`,position:p(5,1,z),property:'powered'});
    ports.lock.push({name:`lock${i}`,position:p(5,1,z+1),property:'powered'});
    ports.masked.push({name:`masked${i}`,position:p(4,1,z),property:'power'});
    ports.clamp.push({name:`clamp${i}`,position:p(3,1,z+1),property:'powered'});
  }
  const box={from:p(-3,0,-8),to:p(8,2,end+4)},all=[...blocks.values()],tiles=[];
  for(let z=-8;z<=end+4;z+=16){
    const tileBox={from:p(-3,0,z),to:p(8,2,Math.min(z+15,end+4))},tileId=`${id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...tileBox.from,y:origin.y+1},to:tileBox.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:tileBox.from,to:{...tileBox.to,y:origin.y}},block:{id:'minecraft:cyan_concrete'}},
      ...all.filter(b=>b.position.z>=tileBox.from.z&&b.position.z<=tileBox.to.z).map(b=>({op:'set',...b})),
    ];
    if(operations.length>128)throw Error('Build tile exceeds operation limit');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:tileBox,description:'Resettable storage candidate; floor origin'},plan:{id:tileId,region_id:tileId,label:'Physical reset-priority storage',operations}});
  }
  return {status:'design_only_not_live_verified',id,bits,origin,origin_means:'support floor',box,blocks:all,ports,inputs,tiles,
    circuit:{id,dimension:'minecraft:overworld',description:'Reset-priority level-sensitive register; physical D clamp and WE OR RESET',signals:[...ports.q,...ports.lock,...ports.masked,...ports.clamp],buses:[{name:'q',bits:ports.q.map(p=>p.name)},{name:'locks',bits:ports.lock.map(p=>p.name)},{name:'clamps',bits:ports.clamp.map(p=>p.name)}]},
    timing:{settle_ticks:64,reset_type:'asynchronous level, sampled only after settling',release_guard:'Two delay4 repeaters on reset clamp; native release tests required'},
    semantics:{reset:'Q=0 regardless of D and WE after settling',write:'If RESET=0 and WE=1 then Q=D',hold:'If RESET=0 and WE=0 then Q retains its value',integration:'Original RTL synchronous positive-edge semantics remain a controller integration task.'}};
}

export function makeResetRegisterCases(design,{patterns}={}){
  const max=2**design.bits-1;
  patterns??=design.bits===1?[1,0,1]:[255,85,170,129];
  if(patterns.length>4)throw Error('Use at most four patterns per reset job to keep the native job under its deadline');
  if(patterns.some(v=>!Number.isInteger(v)||v<0||v>max))throw Error('invalid pattern');
  const values=(d,we,reset)=>Object.fromEntries([...Array.from({length:design.bits},(_,i)=>[`d${i}`,!!(d&(1<<i))]),['write_enable',we],['reset',reset]]);
  const cases=[];let stored=0;
  const add=(name,d,we,r,q)=>cases.push({name,inputs:values(d,we,r),expect:{q,locks:(we||r)?0:max,clamps:r?max:0}});
  add('reset_assert_data_high_we_low',max,false,true,0);
  add('reset_release_data_high_we_low',max,false,false,0);
  for(const [i,d]of patterns.entries()){
    add(`p${i}_stage_closed`,d,false,false,stored);add(`p${i}_write`,d,true,false,d);stored=d;
    add(`p${i}_close`,d,false,false,stored);add(`p${i}_hold_inverted_data`,d^max,false,false,stored);
  }
  add('reset_assert_from_stored_value',max,false,true,0);
  add('reset_blocks_write_enable',max,true,true,0);
  add('reset_blocks_zero_data',0,true,true,0);
  add('reset_blocks_all_ones_again',max,true,true,0);
  add('release_reset_we_stays_high',max,true,false,max);
  add('close_after_open_reset_release',max,false,false,max);
  add('reassert_reset_we_closed',max,false,true,0);
  add('release_reset_while_data_high',max,false,false,0);
  add('write_after_reset',max,true,false,max);
  add('close_written_ones',max,false,false,max);
  add('hold_ones_against_zero',0,false,false,max);
  add('reset_clears_held_ones',max,false,true,0);
  add('release_reset_holds_zero',max,false,false,0);
  add('finish_inputs_zero',0,false,false,0);
  const base={circuit_id:design.id,inputs:design.inputs,settle_ticks:design.timing.settle_ticks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true};
  return {...base,cases};
}

export function makeResetRegisterHoldCases(design,{holdTicks=200}={}){
  const max=2**design.bits-1;
  const inputs=(d,we,reset)=>Object.fromEntries([...Array.from({length:design.bits},(_,i)=>[`d${i}`,!!(d&(1<<i))]),['write_enable',we],['reset',reset]]);
  return {circuit_id:design.id,inputs:design.inputs,settle_ticks:holdTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true,cases:[
    {name:'initialize_reset',inputs:inputs(0,false,true),expect:{q:0,locks:0,clamps:max}},
    {name:'release_initial_reset',inputs:inputs(0,false,false),expect:{q:0,locks:max,clamps:0}},
    {name:'stage_ones_closed',inputs:inputs(max,false,false),expect:{q:0,locks:max,clamps:0}},
    {name:'initialize_ones',inputs:inputs(max,true,false),expect:{q:max,locks:0}},
    {name:'close_ones',inputs:inputs(max,false,false),expect:{q:max,locks:max}},
    {name:'long_hold_ones_against_zero',inputs:inputs(0,false,false),expect:{q:max,locks:max}},
    {name:'independent_reset',inputs:inputs(max,false,true),expect:{q:0,locks:0}},
    {name:'release_holds_zero_against_ones',inputs:inputs(max,false,false),expect:{q:0,locks:max}},
    {name:'finish_zero',inputs:inputs(0,false,false),expect:{q:0,locks:max}},
  ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [width,output,coordinates]=process.argv.slice(2);if(!['1','8'].includes(width)||!output)throw Error('Usage: node hardware/register-reset.mjs 1|8 OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeResetRegister({bits:Number(width),...(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{})});
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,'functional-test':makeResetRegisterCases(design),'hold-test':makeResetRegisterHoldCases(design)}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,bits:design.bits,box:design.box,tiles:design.tiles.length,cases:makeResetRegisterCases(design).cases.length}));
}
