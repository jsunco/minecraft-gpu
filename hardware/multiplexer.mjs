import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Candidate geometry only: this module creates plans and never connects to Minecraft.
const facingForTravel={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
function make({origin,id,bits}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('origin must be integer x,y,z');
  if(!/^gpu_mux_[a-zA-Z0-9_-]+$/.test(id)||id.length>29)throw Error('id must start gpu_mux_ and contain at most 29 identifier characters');
  const map=new Map(),inputs=[],signals=[],ports={a:[],b:[],y:[],lamps:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,z,name,properties)=>{
    const position=p(x,1,z);
    map.set(key(position),{position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}});
  };
  const wire=(x,z)=>put(x,z,'redstone_wire');
  const line=(x1,z1,x2,z2)=>{
    if(x1!==x2&&z1!==z2)throw Error('wire paths must be axis-aligned');
    const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,z1+Math.sign(z2-z1)*i);
  };
  const rep=(x,z,travel)=>put(x,z,'repeater',{facing:facingForTravel[travel],delay:'1'});
  const lever=(name,x,z)=>{
    put(x,z,'lever',{face:'floor',facing:'west',powered:'false'});
    const port={name,position:p(x,1,z)};inputs.push(port);return port;
  };

  // A single southbound select rail drives every bit. Refresh only in inter-cell gaps.
  const lastZ=(bits-1)*14+12;
  line(0,1,0,(bits-1)*14+10);
  for(let bit=0;bit<bits-1;bit++)rep(0,bit*14+14,'south');
  ports.select=lever('select',0,0);

  for(let bit=0;bit<bits;bit++){
    const z=bit*14+2;
    ports.a.push(lever(`a${bit}`,3,z+2));
    ports.b.push(lever(`b${bit}`,3,z+10));
    for(const row of [z+2,z+10]){
      wire(4,row);rep(5,row,'east');
      // Both rear data and side control are refreshed to 15. Subtraction clamps
      // the unselected input to zero; its output cannot feed back through a repeater.
      put(6,row,'comparator',{facing:'west',mode:'subtract'});
      wire(7,row);rep(8,row,'east');
    }
    line(0,z,6,z);rep(6,z+1,'south'); // S blocks A when select=1.
    wire(1,z+8);put(2,z+8,'light_gray_concrete');
    put(3,z+8,'redstone_wall_torch',{facing:'east'});
    line(4,z+8,6,z+8);rep(6,z+9,'south'); // NOT S blocks B when select=0.
    line(9,z+2,9,z+10);wire(10,z+6);put(11,z+6,'redstone_lamp');
    ports.y.push({name:`y${bit}`,position:p(10,1,z+6),property:'power'});
    ports.lamps.push({name:`lamp${bit}`,position:p(11,1,z+6),property:'lit'});
  }
  signals.push(...ports.y,...ports.lamps);
  const blocks=[...map.values()],box={from:p(0,0,0),to:p(11,2,lastZ)},tiles=[];
  for(let z=0;z<=lastZ;z+=14){
    const regionBox={from:p(0,0,z),to:p(11,2,Math.min(z+13,lastZ))};
    const tileId=`${id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...regionBox.from,y:origin.y+1},to:regionBox.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:regionBox.from,to:{...regionBox.to,y:origin.y}},block:{id:'minecraft:cyan_concrete'}},
      ...blocks.filter(b=>b.position.z>=regionBox.from.z&&b.position.z<=regionBox.to.z).map(b=>({op:'set',...b})),
    ];
    if(operations.length>128)throw Error('Tile exceeds 128 operations');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:regionBox,description:'Reserved combinational selector prototype; origin is the support floor'},plan:{id:tileId,region_id:tileId,label:'Comparator 2:1 multiplexer candidate',operations}});
  }
  return {status:'design_only_not_live_verified',id,bits,origin,origin_means:'support floor',box,blocks,ports,inputs,
    circuit:{id,dimension:'minecraft:overworld',description:'Combinational selector: select=0 passes A, select=1 passes B; no retained output state',signals,buses:[{name:'y',bits:ports.y.map(v=>v.name)},{name:'lamps',bits:ports.lamps.map(v=>v.name)}]},
    timing:{settle_ticks:bits===1?24:48,selection:'0 selects A; 1 selects B',minimum_phase_ticks:'not yet measured; conservative test waits only',hazard_free:false},
    tiles,runner:{input_count:inputs.length,within_16_input_limit:inputs.length<=16,byte_test_policy:bits===8?'17 physical inputs require a grouped/staged harness with explicit baselines; do not submit all inputs to the existing 16-input runner':'Use the supplied exhaustive and transition cases'},
    initialization:'No stored state; explicitly drive all inputs and wait for propagation. Construction may momentarily produce other outputs.'};
}

export const makeMultiplexerCell=({origin={x:64,y:-60,z:16},id='gpu_mux_cell'}={})=>make({origin,id,bits:1});
export const makeMultiplexerBank=({origin={x:80,y:-60,z:16},id='gpu_mux_byte'}={})=>make({origin,id,bits:8});
export function makeMultiplexer({origin,bits=1,id}={}){
  if(bits!==1&&bits!==8)throw Error('This stage supports a one-bit selector or eight-bit bank');
  const options={...(origin?{origin}:{}),...(id?{id}:{})};
  return bits===1?makeMultiplexerCell(options):makeMultiplexerBank(options);
}

/** Independent Boolean oracle for expected results; never provides live block outputs. */
export function multiplexerExpected(a,b,select,{bits=1}={}){
  if(bits!==1&&bits!==8)throw Error('bits must be 1 or 8');
  const max=2**bits-1;
  if(![a,b].every(v=>Number.isInteger(v)&&v>=0&&v<=max))throw Error('data outside selector width');
  if(typeof select!=='boolean'&&select!==0&&select!==1)throw Error('select must be Boolean or 0/1');
  return select?b:a;
}

export function makeMultiplexerTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(design.bits!==1)throw Error('The eight-bit design has 17 inputs; use an explicit grouped/staged harness, not the 16-input runner');
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>12000)throw Error('settleTicks must be an integer in 1..12000');
  const cases=[];
  const add=(name,a,b,select)=>{
    const expected=multiplexerExpected(a,b,select);
    cases.push({name,inputs:{a0:!!a,b0:!!b,select:!!select},expect:{y:expected,lamps:expected}});
  };
  // Gray-code order visits all eight states while changing only one input per case.
  for(let n=0;n<8;n++){
    const value=n^(n>>1),a=(value>>2)&1,b=(value>>1)&1,select=value&1;
    add(`truth_a${a}_b${b}_s${select}`,a,b,select);
  }
  const transitions=[
    ['reset_inputs',0,0,0],['a_selected_rises',1,0,0],['a_selected_falls',0,0,0],
    ['a_selected_rises_again',1,0,0],['b_unselected_changes',1,1,0],
    ['select_b_both_high',1,1,1],['b_selected_falls',1,0,1],['b_selected_rises',1,1,1],
    ['a_unselected_changes',0,1,1],['select_low_a',0,1,0],
    ['b_unselected_falls',0,0,0],['a_selected_changes',1,0,0],
    ['select_low_b',1,0,1],['a_unselected_falls',0,0,1],
    ['b_selected_changes',0,1,1],['select_low_a_again',0,1,0],['finish_all_zero',0,0,0],
  ];
  for(const row of transitions)add(...row);
  return {functional:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true},
    truth_table_count:8,transition_count:transitions.length,
    warning:'Checks settled outputs only. Selector/comparator paths can glitch during changes; traces must not be presented as a hazard-free guarantee. Input restoration returns the combinational output to the restored inputs after settling.'};
}
export const makeMultiplexerCases=(design,options)=>makeMultiplexerTests(design,options).functional;

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [mode,output,coordinate]=process.argv.slice(2);
  if(!['cell','byte'].includes(mode)||!output)throw Error('Usage: node hardware/multiplexer.mjs cell|byte OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinate?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('Origin must be x,y,z');
  const options=xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{};
  const design=mode==='cell'?makeMultiplexerCell(options):makeMultiplexerBank(options);
  const files={design,'build-tiles':design.tiles,circuit:design.circuit};
  if(design.bits===1)files['functional-test']=makeMultiplexerCases(design);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,status:design.status,origin:design.origin,box:design.box,inputs:design.inputs.length,output_bus:'y',tiles:design.tiles.length,cases:design.bits===1?25:0,world_modified:false,output,runner:design.runner}));
}
