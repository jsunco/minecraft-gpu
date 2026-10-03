import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Gate geometry adapted from the physically tested minecraft-redstone
// examples/ripple-adder.mjs. New eight-bit routing and SUB/CMP circuitry are
// candidates until independently tested in Minecraft; no game connection here.
function makeCore({origin,bits,features,id}) {
  const combined=features==='add_sub_cmp';
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('origin must have integer x,y,z');
  const blocks=new Map(), inputs=[], signals=[];
  const at=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const place=(x,y,z,id,properties)=>{const p=at(x,y,z);blocks.set(`${p.x},${p.y},${p.z}`,{position:p,block:{id:`minecraft:${id}`,...(properties?{properties}:{})}});};
  const stone=(x,y,z)=>place(x,y,z,'light_gray_concrete');
  const wire=(x,y,z)=>place(x,y,z,'redstone_wire');
  const line=(x1,z1,x2,z2,y=0)=>{if(x1!==x2&&z1!==z2)throw Error('axis aligned paths only');const n=Math.abs(x2-x1)+Math.abs(z2-z1);for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);};
  // Repeater block-state facing names its input side, opposite the signal's travel.
  const repeater=(x,y,z,travel)=>place(x,y,z,'repeater',{facing:{east:'west',west:'east',north:'south',south:'north'}[travel],delay:'1'});
  const torch=(x,y,z,facing='east')=>place(x,y,z,'redstone_wall_torch',{facing});
  const lever=(name,x,z)=>{place(x,0,z,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name,position:at(x,0,z)});};
  const xor=(x,z)=>{
    line(x,z,x+9,z);line(x,z+8,x+9,z+8);
    line(x+2,z,x+2,z+2);wire(x+3,0,z+2);
    line(x+2,z+8,x+2,z+6);wire(x+3,0,z+6);
    stone(x+4,0,z+2);stone(x+4,0,z+6);torch(x+5,0,z+2);torch(x+5,0,z+6);
    line(x+6,z+2,x+6,z+6);line(x+6,z+4,x+9,z+4);
    stone(x+10,0,z);stone(x+10,0,z+4);stone(x+10,0,z+8);
    torch(x+11,0,z);torch(x+11,0,z+8);torch(x+10,0,z+3,'north');torch(x+10,0,z+5,'south');
    wire(x+10,0,z+2);wire(x+10,0,z+6);repeater(x+11,0,z+2,'east');repeater(x+11,0,z+6,'east');
    line(x+12,z,x+12,z+2);line(x+12,z+6,x+12,z+8);
    line(x+12,z+1,x+15,z+1);line(x+12,z+7,x+15,z+7);
    stone(x+16,0,z+1);stone(x+16,0,z+7);torch(x+17,0,z+1);torch(x+17,0,z+7);
    line(x+18,z+1,x+18,z+7);wire(x+19,0,z+4);
  };
  const carryTap=(x,z)=>{
    place(x+10,1,z+4,'redstone_torch');
    for(let k=1;k<=3;k++){stone(x+10+k,k-1,z+4);wire(x+10+k,k,z+4);}
    line(x+13,z+4,x+13,z-4,3);
    for(let zz=z-4;zz<=z+4;zz++)stone(x+13,2,zz);
    repeater(x+13,3,z-3,'north');
  };
  for(let bit=0;bit<bits;bit++){
    const z=bit*18;
    xor(0,z);lever(`a${bit}`,0,z);
    if(combined){
      xor(-24,z+4);lever(`b${bit}`,-24,z+4);
      line(-5,z+8,0,z+8);repeater(-1,0,z+8,'east');
      line(-28,z+12,-24,z+12);repeater(-25,0,z+12,'east');
    }else lever(`b${bit}`,0,z+8);
    line(19,z+4,21,z+4);repeater(20,0,z+4,'east');line(21,z+4,21,z);line(21,z,24,z);repeater(23,0,z,'east');
    xor(24,z);
    if(bit===0&&!combined)lever('cin',24,z+8);
    carryTap(0,z);carryTap(24,z);
    line(13,z-4,48,z-4,3);
    for(let xx=13;xx<=48;xx++)stone(xx,2,z-4);
    repeater(24,3,z-4,'east');repeater(36,3,z-4,'east');repeater(47,3,z-4,'east');
    place(44,0,z+4,'redstone_lamp');
    signals.push({name:`s${bit}`,position:at(44,0,z+4),property:'lit'});
    if(combined){line(42,z+7,48,z+7);repeater(44,0,z+7,'east');}
    if(bit<bits-1){
      // Separate columns and a second elevation prevent neighboring carries merging.
      const column=53+3*bit;
      line(48,z-4,column-3,z-4,3);for(let xx=48;xx<=column-3;xx++)stone(xx,2,z-4);
      // Refresh before attenuation can reach zero, not only at the far ramp.
      for(let previous=47;column-previous>12;){previous=Math.min(previous+12,column-4);repeater(previous,3,z-4,'east');}
      for(let k=1;k<=3;k++){stone(column-3+k,2+k,z-4);wire(column-3+k,3+k,z-4);}
      line(column,z-4,column,z+32,6);for(let zz=z-4;zz<=z+32;zz++)stone(column,5,zz);
      for(const dz of [-2,10,22,31])repeater(column,6,z+dz,'south');
      line(column,z+32,24,z+32,6);for(let xx=24;xx<=column;xx++)stone(xx,5,z+32);
      for(let xx=column-11;xx>25;xx-=12)repeater(xx,6,z+32,'west');
      repeater(25,6,z+32,'west');
      for(let k=0;k<=6;k++){stone(24,5-k,z+32-k);wire(24,6-k,z+32-k);}
    }else{
      if(combined)repeater(49,3,z-4,'east');else place(49,3,z-4,'redstone_lamp');
      signals.push({name:`s${bits}`,position:at(49,3,z-4),property:combined?'powered':'lit'});
    }
  }
  // Restore the next XOR's carry input after the six-block descent.
  for(let bit=combined?0:1;bit<bits;bit++)repeater(25,0,bit*18+8,'east');
  const arithmeticSignals=[...signals],last=(bits-1)*18;
  if(combined){
    // Shared subtraction mode changes B to NOT B and physically supplies Cin=1.
    line(-28,-7,-28,Math.max(last+12,15));repeater(-28,0,-4,'south');
    for(let bit=0;bit<bits;bit++){repeater(-28,0,bit*18+8,'south');if(bit<bits-1)repeater(-28,0,bit*18+16,'south');}
    lever('subtract',-28,-8);
    line(-28,15,24,15);for(let x=-26;x<=22;x+=12)repeater(x,0,15,'east');
    line(24,15,24,8);
    // OR the eight result bits through isolated inputs and a southbound rail.
    line(48,7,48,last+11);
    for(let bit=0;bit<bits-1;bit++){repeater(48,0,bit*18+12,'south');repeater(48,0,bit*18+20,'south');}
    repeater(48,0,last+12,'south');stone(48,0,last+13);torch(48,0,last+14,'south');
    // Bring final carry down, then form N=NOT carry, Z=zero, P=NOT(N OR Z).
    line(49,last-4,52,last-4,3);repeater(49,3,last-4,'east');
    line(52,last-4,52,last+13,3);
    for(let x=49;x<=52;x++)stone(x,2,last-4);
    for(let z=last-4;z<=last+13;z++)stone(52,2,z);
    repeater(52,3,last,'south');repeater(52,3,last+12,'south');
    for(let k=1;k<=3;k++){stone(52,2-k,last+13+k);wire(52,3-k,last+13+k);}
    repeater(52,0,last+17,'south');stone(52,0,last+18);torch(52,0,last+19,'south');
    line(48,last+15,48,last+20);line(48,last+20,52,last+20);
    repeater(52,0,last+21,'south');stone(52,0,last+22);torch(52,0,last+23,'south');
    signals.push({name:'negative',position:at(52,0,last+19),property:'lit'},
      {name:'zero',position:at(48,0,last+14),property:'lit'},
      {name:'positive',position:at(52,0,last+23),property:'lit'},
      {name:'control_pin',position:at(-28,0,-8),property:'powered'});
  }else signals.push({name:'control_pin',position:at(24,0,8),property:'powered'});
  const maxX=Math.max(bits===1?49:53+3*(bits-2),combined?52:0),maxZ=last+(combined?23:bits>1?14:8);
  return {component_origin:origin,bits,features,blocks:[...blocks.values()],inputs,signals,
    box:{from:at(combined?-28:0,-1,combined?-8:-4),to:at(maxX,bits>1?7:4,maxZ)},
    circuit:{id,dimension:'minecraft:overworld',description:'Candidate vanilla ripple arithmetic; unsigned CMP flags are valid only in subtract mode',signals,buses:[{name:'sum',bits:arithmeticSignals.map(s=>s.name)},{name:'result',bits:arithmeticSignals.slice(0,bits).map(s=>s.name)},{name:'carry',bits:[`s${bits}`]},...(combined?[{name:'nzp',bits:['positive','zero','negative']}]:[])]},
    materials:Object.fromEntries([...blocks.values()].reduce((m,v)=>m.set(v.block.id,(m.get(v.block.id)||0)+1),new Map()))};
}

/** Floor-origin public contract; all component coordinates are one block higher. */
export function makeArithmetic({origin={x:-96,y:-60,z:-64},bits=8,features='add',id=`gpu_alu_${features==='add'?'add':'asc'}${bits}`}={}){
  if(!Number.isInteger(bits)||bits<1||bits>8)throw Error('bits must be 1..8');
  if(!['add','add_sub_cmp'].includes(features))throw Error('unknown feature set');
  if(!/^gpu_alu_[a-zA-Z0-9_-]+$/.test(id)||id.length>26)throw Error('invalid arithmetic id');
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  const d=makeCore({origin:{...origin,y:origin.y+1},bits,features,id});
  const tiles=makeArithmeticTiles(d);
  const floorPositions=(d.box.to.x-d.box.from.x+1)*(d.box.to.z-d.box.from.z+1);
  const floorOverrides=d.blocks.filter(b=>b.position.y===origin.y).length;
  return {...d,id,origin,origin_means:'support floor',status:'design_only_not_live_verified',tiles,
    planned_counts:{component_positions:d.blocks.length,floor_positions:floorPositions,floor_overrides:floorOverrides,non_air_blocks:floorPositions+d.blocks.length-floorOverrides},
    ports:{a:d.inputs.filter(p=>p.name.startsWith('a')),b:d.inputs.filter(p=>p.name.startsWith('b')),control:d.inputs.find(p=>p.name===(features==='add'?'cin':'subtract'))},
    timing:{settle_ticks:bits<=2?128:200,settle_phases:bits>4?2:1,minimum_ticks:'unmeasured; eight-bit tests use two unchanged-input phases within the native 200-tick limit'},
    construction:{region_groups_required:Math.ceil(tiles.length/24),max_regions_per_journal:24,policy:'Keep tiles flat; apply each group using a distinct persistent BuildService journal. Preserve all backups.'},
    harness:{physical_inputs:d.inputs.length,max_runner_inputs:16,fixed_control_required:d.inputs.length>16,policy:'Set and verify the omitted control before each job; probe control_pin in every case; capture and restore its previous value separately.'}};
}

/** Independent integer oracle, never supplied to the running circuit. */
export function arithmeticExpected(a,b,{bits=8,operation='add',carryIn=0}={}){
  const n=2**bits,max=n-1;
  if(!Number.isInteger(bits)||bits<1||bits>8||![a,b].every(v=>Number.isInteger(v)&&v>=0&&v<=max))throw Error('invalid operands');
  if(!['add','sub','cmp'].includes(operation)||![0,1].includes(carryIn))throw Error('invalid arithmetic operation');
  const sum=operation==='add'?a+b+carryIn:n+a-b;
  return {sum,result:sum&max,carry:Math.floor(sum/n),...(operation!=='add'?{nzp:a<b?4:a===b?2:1}:{})};
}

export function makeArithmeticTests(design,{operation='add',pairs,carryIn=0,settleTicks=design.timing.settle_ticks,settlePhases=design.timing.settle_phases}={}){
  if(design.features==='add'&&operation!=='add')throw Error('bare adder does not implement SUB/CMP');
  if(design.features!=='add'&&carryIn!==0)throw Error('combined control is mode, not independent carry-in');
  const max=2**design.bits-1;
  pairs??=[[0,0],[0,max],[max,0],[1,1],[max,1],[1,max],[max,max],[max>>1,1]].slice(0,8);
  if(pairs.length>8)throw Error('use at most eight vectors per bounded arithmetic job');
  if(![1,2].includes(settlePhases))throw Error('settle phases must be 1 or 2');
  const controlValue=design.features==='add'?!!carryIn:operation!=='add';
  const cases=[];
  for(const [[a,b],i]of pairs.map((pair,i)=>[pair,i])){
    const inputs=Object.fromEntries(Array.from({length:design.bits},(_,bit)=>[[`a${bit}`,!!(a&(1<<bit))],[`b${bit}`,!!(b&(1<<bit))]]).flat());
    if(settlePhases===2)cases.push({name:`v${i}_propagate`,inputs,expect:{control_pin:Number(controlValue)}});
    cases.push({name:`v${i}_a${a}_b${b}`,inputs,expect:{...arithmeticExpected(a,b,{bits:design.bits,operation,carryIn}),control_pin:Number(controlValue)}});
  }
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200||settleTicks*cases.length>4800)throw Error('invalid settling budget; use bounded jobs');
  return {required_fixed_controls:[{...design.ports.control,value:controlValue}],
    spec:{circuit_id:design.id,inputs:design.inputs.filter(p=>p.name!==design.ports.control.name),cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true},
    setup:'Capture the control baseline, drive the required fixed value, wait for propagation and verify its actual block state before starting. No baseline change may overlap a job.',
    cleanup:'The runner restores only its listed operand inputs. Separately restore the saved control, settle, and verify final native output. Preserve session identity.'};
}

export function makeArithmeticPrototypeCases(design,{settleTicks=design.timing.settle_ticks}={}){
  if(design.bits!==1)throw Error('exhaustive prototype suite is deliberately one bit');
  const cases=[];
  for(const control of [0,1])for(const a of [0,1])for(const b of [0,1]){
    const operation=design.features==='add'?'add':control?'sub':'add';
    cases.push({name:`a${a}_b${b}_control${control}`,inputs:{a0:!!a,b0:!!b,[design.ports.control.name]:!!control},expect:{...arithmeticExpected(a,b,{bits:1,operation,carryIn:design.features==='add'?control:0}),control_pin:control}});
  }
  cases.push({name:'finish_zero',inputs:{a0:false,b0:false,[design.ports.control.name]:false},expect:{sum:0,result:0,carry:0,control_pin:0}});
  return {circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true};
}

/** Each tile is independently bounded; no construction region is implicitly authorized. */
export function makeArithmeticTiles(design){
  const tiles=[];
  const emit=box=>{
    const components=design.blocks.filter(b=>b.position.x>=box.from.x&&b.position.x<=box.to.x&&b.position.z>=box.from.z&&b.position.z<=box.to.z).sort((a,b)=>a.position.y-b.position.y);
    const volume=(box.to.x-box.from.x+1)*(box.to.y-box.from.y+1)*(box.to.z-box.from.z+1);
    if(components.length+2>128||volume+components.length>4096){
      const axis=box.to.z-box.from.z>=box.to.x-box.from.x?'z':'x';
      if(box.from[axis]===box.to[axis])throw Error('cannot split tile to legal size');
      const mid=Math.floor((box.from[axis]+box.to[axis])/2);
      emit({from:{...box.from},to:{...box.to,[axis]:mid}});emit({from:{...box.from,[axis]:mid+1},to:{...box.to}});return;
    }
    const id=`${design.circuit.id}_t${tiles.length}`;
    const operations=[
      {op:'fill',box:{from:{...box.from,y:box.from.y+1},to:box.to},block:{id:'minecraft:air'}},
      {op:'fill',box:{from:box.from,to:{...box.to,y:box.from.y}},block:{id:'minecraft:blue_concrete'}},
      ...components.map(b=>({op:'set',...b})),
    ];
    tiles.push({region:{id,dimension:'minecraft:overworld',box,description:'Reserved arithmetic candidate tile'},plan:{id,region_id:id,label:'Vanilla arithmetic candidate',operations}});
  };
  for(let z=design.box.from.z;z<=design.box.to.z;z+=18)for(let x=design.box.from.x;x<=design.box.to.x;x+=10)emit({from:{x,y:design.box.from.y,z},to:{x:Math.min(x+9,design.box.to.x),y:design.box.to.y,z:Math.min(z+17,design.box.to.z)}});
  return tiles;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [width,features,output,coordinates]=process.argv.slice(2);
  if(!output)throw Error('Usage: node hardware/arithmetic.mjs BITS add|add_sub_cmp OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeArithmetic({bits:Number(width),features,...(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{})});
  const files={design,'build-tiles':design.tiles,circuit:design.circuit,'add-test':makeArithmeticTests(design)};
  if(features==='add_sub_cmp'){files['sub-test']=makeArithmeticTests(design,{operation:'sub'});files['cmp-test']=makeArithmeticTests(design,{operation:'cmp'});}
  if(design.bits===1)files['prototype-test']=makeArithmeticPrototypeCases(design);
  mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,bits:design.bits,features,box:design.box,tiles:design.tiles.length,construction:design.construction,harness:design.harness}));
}
