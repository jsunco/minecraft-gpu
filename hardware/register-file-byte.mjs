import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Conditional candidate only: four byte words with shared physical controls.
// Extends reviewed two-slice v3; its native validation remains a prerequisite.
const sourceHash='36ee68055503a96221bb408b063a4302eaf5b30d65f2093519b0709a42f6a536';
const bitIndexes=Array.from({length:8},(_,i)=>i);
const facing={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
export function makeRegisterFileByte({origin={x:-528,y:-40,z:-128},id='gpu_rf_byte4'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer support origin required');
  if(!/^gpu_rf_[a-zA-Z0-9_-]+$/.test(id)||id.length>26)throw Error('invalid id');
  const map=new Map(),inputs=[],ports={q:[],locks:[],clamps:[],write_match:[],rs_match:[],rt_match:[],qualified:[],top_inputs:[],far_rs_inhibit:[],far_rt_inhibit:[],far_write:[],far_reset:[],read:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,y,z,name,properties,replaceWire=false)=>{
    const position=p(x,y,z),value={position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}},old=map.get(key(position));
    if(old&&JSON.stringify(old.block)!==JSON.stringify(value.block)&&!(replaceWire&&old.block.id==='minecraft:redstone_wire'))throw Error(`Collision at ${key(position)}: ${old.block.id} vs ${name}`);
    map.set(key(position),value);
  };
  const solid=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const supported=(x,y,z,name,properties,replaceWire=false)=>{
    const below=map.get(key(p(x,y-1,z)));
    if(below&&below.block.id!=='minecraft:light_gray_concrete')throw Error(`Unsupported ${name}: ${below.block.id} at ${x},${y-1},${z}`);
    if(!below)solid(x,y-1,z);
    put(x,y,z,name,properties,replaceWire);
  };
  const wire=(x,y,z,properties)=>supported(x,y,z,'redstone_wire',properties);
  const rep=(x,y,z,travel,delay=1)=>supported(x,y,z,'repeater',{facing:facing[travel],delay:String(delay)},true);
  const comp=(x,y,z,travel)=>supported(x,y,z,'comparator',{facing:facing[travel],mode:'subtract'});
  const torch=(x,y,z,face)=>put(x,y,z,'redstone_wall_torch',{facing:face});
  const line=(x1,z1,x2,z2,y)=>{
    if(x1!==x2&&z1!==z2)throw Error('axis-aligned line required');
    const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);
  };
  const tower=(x,z,fromY,toY)=>{
    if((toY-fromY)%4)throw Error('noninverting tower height must be multiple of four');
    for(let y=fromY;y<=toY;y++)if((y-fromY)%2===0)solid(x,y,z);else supported(x,y,z,'redstone_torch');
  };
  const inputColumn=(name,x,z)=>{
    tower(x,z,1,49);
    const north=name.startsWith('d'),side=x===12?1:-1;
    const inputX=north?x:x+2*side,inputZ=north?z-2:z;
    rep(north?x:x+side,1,north?z-1:z,north?'south':side===1?'west':'east');
    supported(inputX,1,inputZ,'lever',{face:'floor',facing:'north',powered:'false'});
    inputs.push({name,position:p(inputX,1,inputZ)});
    ports.top_inputs.push({name:`top_${name}`,position:p(x,48,z),property:'lit'});
  };
  for(const [name,x,z]of [['wa0',0,-8],['wa1',12,-8],['rs0',0,-24],['rs1',12,-24],['rt0',0,24],['rt1',12,24],...bitIndexes.map(bit=>[`d${bit}`,20+48*bit,6]),['write_enable',6,-12],['reset',17,1]])inputColumn(name,x,z);
  for(const bit of bitIndexes)for(const z of [-26,22])tower(38+bit*48,z,4,52);

  function decoder(word,y,z,port,write=false){
    const cross={north:'side',east:'side',south:'side',west:'side'};
    wire(1,y,z,word&1?cross:undefined);wire(11,y,z,word&2?cross:undefined);
    if(word&1){solid(2,y,z);torch(3,y,z,'east');wire(4,y,z);}else{rep(2,y,z,'east');wire(3,y,z);wire(4,y,z);}
    if(word&2){solid(10,y,z);torch(9,y,z,'west');wire(8,y,z);}else{rep(10,y,z,'west');wire(9,y,z);wire(8,y,z);}
    rep(5,y,z,'east');rep(7,y,z,'west');solid(6,y,z);torch(6,y,z+(write?1:-1),write?'south':'north');
    ports[port].push({name:`${port}${word}`,position:p(6,y,z+(write?1:-1)),property:'lit'});
    if(write){rep(6,y,z-1,'north');line(6,z-2,8,z-2,y);rep(8,y,z-3,'north');return;}
    // Shared inverted-select rail, three blocks above the unchanged read gates.
    const railZ=z-7;
    line(6,z-2,6,railZ,y);
    for(let n=1;n<=6;n++)wire(6+n,y+n,railZ);
    rep(13,y+6,railZ,'east');solid(14,y+6,railZ);torch(15,y+6,railZ,'east');
    line(16,railZ,377,railZ,y+6);for(let x=21;x<=369;x+=12)rep(x,y+6,railZ,'east');
    for(const bit of bitIndexes){
      const x=41+bit*48;
      for(let n=1;n<=3;n++)wire(x,y+6-n,railZ+n);
      rep(x,y+3,z-3,'south');
      ports[z<0?'far_rs_inhibit':'far_rt_inhibit'].push({name:`far_${z<0?'rs':'rt'}_inhibit${word}_${bit}`,position:p(x,y+3,z-3),property:'powered'});
    }
  }

  for(let word=0;word<4;word++){
    const y=1+word*16;
    decoder(word,y,-8,'write_match',true);decoder(word,y,-24,'rs_match');decoder(word,y,24,'rt_match');
    // One qualified-write result per word, fanned out with isolated local taps.
    rep(7,y,-12,'east');comp(8,y,-12,'east');wire(9,y,-12);rep(10,y,-12,'east');wire(11,y,-12);
    ports.qualified.push({name:`qualified${word}`,position:p(10,y,-12),property:'powered'});
    for(let n=1;n<=6;n++)wire(11+n,y+n,-12);
    line(17,-12,368,-12,y+6);for(let x=19;x<=367;x+=12)rep(x,y+6,-12,'east');
    for(const bit of bitIndexes){
      const x=32+bit*48;
      rep(x,y+6,-11,'south');wire(x,y+6,-10);
      for(let n=1;n<=6;n++)wire(x,y+6-n,-10+n);
      line(x,-4,x,-2,y);rep(x,y,-1,'south');
      ports.far_write.push({name:`far_write${word}_${bit}`,position:p(x,y,-1),property:'powered'});
    }
    // RESET taps the shared tower north; its base lever is west, leaving this free.
    wire(17,y,0);rep(17,y,-1,'north');wire(17,y,-2);
    for(let n=1;n<=6;n++)wire(17,y+n,-2-n);
    line(17,-8,20,-8,y+6);line(20,-8,20,-6,y+6);line(20,-6,60,-6,y+6);
    for(let x=21;x<=57;x+=12)rep(x,y+6,-6,'east');
    // Preserve the complete two-slice RESET path. Beyond its last tap, lift
    // RESET another two blocks and move north so WE's descending slopes
    // cannot connect upward into this rail at their z=-8 crossings.
    line(60,-6,60,-8,y+6);line(60,-8,65,-8,y+6);
    rep(65,y+6,-7,'south');wire(65,y+6,-6);
    for(let n=1;n<=6;n++)wire(65,y+6-n,-6+n);
    wire(65,y,1);
    rep(66,y+6,-8,'east');wire(67,y+7,-8);wire(68,y+8,-8);
    line(68,-8,68,-10,y+8);line(68,-10,353,-10,y+8);
    for(let x=69;x<=345;x+=12)rep(x,y+8,-10,'east');
    for(const bit of bitIndexes.slice(2)){
      const x=17+48*bit;
      rep(x,y+8,-9,'south');wire(x,y+8,-8);
      for(let n=1;n<=8;n++)wire(x,y+8-n,-8+n);
      wire(x,y,1);
    }

    for(const bit of bitIndexes){
      const dx=bit*48;
      rep(18+dx,y,1,'east');ports.far_reset.push({name:`far_reset${word}_${bit}`,position:p(18+dx,y,1),property:'powered'});line(19+dx,1,30+dx,1,y);rep(31+dx,y,1,'east');
      line(32+dx,0,32+dx,10,y);rep(32+dx,y,7,'south');
      line(17+dx,2,17+dx,9,y);rep(17+dx,y,5,'south');
      wire(21+dx,y,6);rep(22+dx,y,6,'east');comp(23+dx,y,6,'east');wire(24+dx,y,6);rep(25+dx,y,6,'east');wire(26+dx,y,6);
      rep(23+dx,y,7,'north',4);rep(23+dx,y,8,'north',4);line(18+dx,9,23+dx,9,y);
      rep(25+dx,y,7,'north');wire(25+dx,y,8);solid(25+dx,y,10);torch(25+dx,y,9,'north');line(26+dx,10,31+dx,10,y);
      for(const [group,x,z]of [['q',25,6],['locks',25,7],['clamps',23,7]])ports[group].push({name:`${group}${word}_${bit}`,position:p(x+dx,y,z),property:'powered'});
      for(let n=1;n<=3;n++)wire(26+dx+n,y+n,6);
      line(29+dx,6,43+dx,6,y+3);rep(36+dx,y+3,6,'east');line(43+dx,-26,43+dx,22,y+3);
      for(const z of [5,-7,-19])rep(43+dx,y+3,z,'north');for(const z of [7,19])rep(43+dx,y+3,z,'south');
      for(const z of [-26,22]){rep(42+dx,y+3,z,'west');comp(41+dx,y+3,z,'west');wire(40+dx,y+3,z);rep(39+dx,y+3,z,'west');}
    }
  }
  for(const bit of bitIndexes)for(const [name,z]of [['rs',-26],['rt',22]]){
    const dx=bit*48;rep(37+dx,52,z,'west');wire(36+dx,52,z);supported(35+dx,52,z,'redstone_lamp');
    ports.read.push({name:`${name}${bit}`,position:p(36+dx,52,z),property:'power'});
  }
  // Exactly64 functional probes:32 storage,16 reads,12 decode,4 qualified WE.
  const signals=[...ports.q,...ports.read,...ports.write_match,...ports.rs_match,...ports.rt_match,...ports.qualified];
  const bus=(name,list)=>({name,bits:list.map(s=>s.name)});
  const buses=[bus('words',ports.q),...Array.from({length:4},(_,w)=>bus(`word${w}`,ports.q.filter(s=>s.name.startsWith(`q${w}_`)))),
    bus('rs',ports.read.filter(s=>s.name.startsWith('rs'))),bus('rt',ports.read.filter(s=>s.name.startsWith('rt'))),
    bus('write_decode',ports.write_match),bus('rs_decode',ports.rs_match),bus('rt_decode',ports.rt_match),bus('qualified',ports.qualified)];
  const blocks=[...map.values()],axes=['x','y','z'],box={from:Object.fromEntries(axes.map(k=>[k,Math.min(...blocks.map(b=>b.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...blocks.map(b=>b.position[k]))]))},tiles=[];
  function tile(bounds,contents){
    if(!contents.length)return;
    if(contents.length>127){const axis=axes.reduce((a,b)=>bounds.to[a]-bounds.from[a]>=bounds.to[b]-bounds.from[b]?a:b),mid=Math.floor((bounds.from[axis]+bounds.to[axis])/2);if(mid===bounds.to[axis])throw Error('unsplittable tile');tile({from:bounds.from,to:{...bounds.to,[axis]:mid}},contents.filter(b=>b.position[axis]<=mid));tile({from:{...bounds.from,[axis]:mid+1},to:bounds.to},contents.filter(b=>b.position[axis]>mid));return;}
    const tileId=`${id}_t${tiles.length}`,operations=[{op:'fill',box:bounds,block:{id:'minecraft:air'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))];
    const volume=axes.reduce((n,k)=>n*(bounds.to[k]-bounds.from[k]+1),1);
    if(volume+contents.length>4096)throw Error('tile write cap exceeded');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:bounds,description:'Uninspected conditional byte shared-control RF candidate'},plan:{id:tileId,region_id:tileId,label:'Four words by eight bits; shared physical decoders',operations}});
  }
  for(let y=box.from.y;y<=box.to.y;y+=8)for(let z=box.from.z;z<=box.to.z;z+=16)for(let x=box.from.x;x<=box.to.x;x+=24){const bounds={from:{x,y,z},to:{x:Math.min(x+23,box.to.x),y:Math.min(y+7,box.to.y),z:Math.min(z+15,box.to.z)}};tile(bounds,blocks.filter(b=>axes.every(k=>b.position[k]>=bounds.from[k]&&b.position[k]<=bounds.to[k])));}
  // Four views cover every storage lock/clamp without exceeding64 signals.
  // Each view uses both data slices' Q/locks/clamps plus its farther controls.
  const diagnostic_circuits=Array.from({length:4},(_,pair)=>{
    const pairBits=[pair*2,pair*2+1],far=pairBits[1],selected=s=>pairBits.includes(Number(s.name.split('_').at(-1)));
    const diagnosticSignals=[...ports.q.filter(selected),...ports.locks.filter(selected),...ports.clamps.filter(selected),
      ...ports.read.filter(s=>pairBits.includes(Number(s.name.slice(2)))),
      ...ports.far_write.filter(s=>s.name.endsWith(`_${far}`)),...ports.far_reset.filter(s=>s.name.endsWith(`_${far}`)),
      ...ports.far_rs_inhibit.filter(s=>s.name.endsWith(`_${far}`)),...ports.far_rt_inhibit.filter(s=>s.name.endsWith(`_${far}`)),
      ...ports.top_inputs,...inputs.filter(s=>['write_enable','reset',...pairBits.map(b=>`d${b}`)].includes(s.name)).map(s=>({...s,name:`raw_${s.name}`,property:'powered'}))];
    if(diagnosticSignals.length!==64)throw Error('diagnostic probe budget');
    return {id:`${id}_diag${pair}`,dimension:'minecraft:overworld',description:`Conditional byte RF timing probes for slices ${pairBits.join(',')}`,signals:diagnosticSignals,buses:[]};
  });
  const currentSourceHash=createHash('sha256').update(readFileSync(new URL('./register-file-bits.mjs',import.meta.url))).digest('hex');
  if(currentSourceHash!==sourceHash)throw Error('Frozen two-slice source hash changed; new review required');
  return {status:'conditional_design_only_not_live_verified',id,origin,origin_means:'bottom support level',words:4,bits:8,word_pitch:16,bit_pitch:48,box,blocks,inputs,ports,tiles,
    based_on_two_slice_sha256:sourceHash,
    circuit:{id,dimension:'minecraft:overworld',description:'Four stored byte words with shared real decoders; conditional on two-slice acceptance',signals,buses},diagnostic_circuits,
    timing:{settle_ticks:200,minimum_phase_ticks:'unmeasured;200 is an initial candidate budget, not a verified maximum',hazard_free:false},
    prerequisites:['Native two-slice v3 acceptance including all12 functional jobs and both diagnostic/hold jobs','Fresh area/player/session and actively ticking chunk checks, then native build readback','All byte functional and diagnostic suites plus complete transition/hold trace analysis'],
    integration:{write_sequence:'WE low: stage data/address and settle; WE high: write; WE low: close with data/address unchanged; only then change inputs',operand_capture:'Separate REQUEST operand latches still required',reset:'Every local clamp and lock retained; native lock-before-clamp release timing remains pending'},
    construction:'Only populated disjoint tiles cleared; group <=24 tiles per journal; proposed location uninspected/unreserved; preserve other force-loaded chunks and user body'};
}

const encodeByte=(d,we,reset,wa,rs,rt)=>({wa0:!!(wa&1),wa1:!!(wa&2),rs0:!!(rs&1),rs1:!!(rs&2),rt0:!!(rt&1),rt1:!!(rt&2),...Object.fromEntries(bitIndexes.map(bit=>[`d${bit}`,!!(d&(2**bit))])),write_enable:!!we,reset:!!reset});

export function makeRegisterFileByteTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be1..200');
  const jobs=[];
  function job(name,body,diagnosticPair=null){
    const stored=[0,0,0,0],cases=[],circuit=diagnosticPair===null?design.circuit:design.diagnostic_circuits[diagnosticPair];
    const add=(label,d,we,reset,wa=0,rs=0,rt=0)=>{
      if(!Number.isInteger(d)||d<0||d>255||![wa,rs,rt].every(a=>Number.isInteger(a)&&a>=0&&a<4))throw Error('test operand range');
      const inputs=encodeByte(d,we,reset,wa,rs,rt);if(reset)stored.fill(0);else if(we)stored[wa]=d;
      // Arithmetic packing avoids signed bit31 coercion for the32-bit Q bus.
      const functional={words:stored.reduce((n,v,w)=>n+v*256**w,0),...Object.fromEntries(stored.map((v,w)=>[`word${w}`,v])),rs:stored[rs],rt:stored[rt],write_decode:2**wa,rs_decode:2**rs,rt_decode:2**rt,qualified:we?2**wa:0};
      const state={};
      for(let word=0;word<4;word++)for(const bit of bitIndexes){
        state[`q${word}_${bit}`]=(stored[word]>>bit)&1;state[`locks${word}_${bit}`]=+(reset?false:!(we&&wa===word));state[`clamps${word}_${bit}`]=+!!reset;
        state[`far_write${word}_${bit}`]=+(!!we&&wa===word);state[`far_reset${word}_${bit}`]=+!!reset;
        state[`far_rs_inhibit${word}_${bit}`]=+(rs!==word);state[`far_rt_inhibit${word}_${bit}`]=+(rt!==word);
      }
      for(const bit of bitIndexes){state[`rs${bit}`]=(stored[rs]>>bit)&1;state[`rt${bit}`]=(stored[rt]>>bit)&1;}
      for(const {name}of design.inputs){state[`top_${name}`]=+inputs[name];state[`raw_${name}`]=+inputs[name];}
      const expect=diagnosticPair===null?functional:Object.fromEntries(circuit.signals.map(s=>{if(state[s.name]===undefined)throw Error(`Missing expectation ${s.name}`);return[s.name,state[s.name]];}));
      cases.push({name:label,inputs,expect});
    };
    const write=(word,value,tag)=>{add(`${tag}_prepare`,value,0,0,word,word,word);add(`${tag}_write`,value,1,0,word,word,word);add(`${tag}_close`,value,0,0,word,word,word);};
    add('reset_initial_high_data',255,0,1);add('release_initial_high_data',255,0,0);body({add,write});add('finish_reset',0,0,1);add('finish_release',0,0,0);
    if(cases.length>20||cases.length*settleTicks>4000)throw Error('Require <=20cases / <=4000ticks, leaving wall-time overhead below300s');
    const value={name,view:diagnosticPair===null?'functional':`diagnostic_pair${diagnosticPair}`,spec:{circuit_id:circuit.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}};
    jobs.push(value);return value;
  }
  job('routing_decode',({add})=>{for(let rs=0;rs<4;rs++)for(let rt=0;rt<4;rt++)add(`decode_${rs}_${rt}`,((rs+rt)&1)?170:85,0,0,(rs+rt)&3,rs,rt);});
  for(let word=0;word<4;word++)for(let half=0;half<2;half++)job(`walking_word${word}_half${half}`,({write})=>{
    for(let bit=half*4;bit<half*4+4;bit++)write(word,2**bit,`bit${bit}`);
  });
  for(const [name,pattern]of [['low',[1,2,4,8]],['high',[16,32,64,128]]])for(let quarter=0;quarter<4;quarter++)job(`read_pairs_${name}_${quarter}`,({add,write})=>{
    pattern.forEach((value,word)=>write(word,value,`preload_${word}`));
    for(let n=quarter*4;n<quarter*4+4;n++)add(`read_${n>>2}_${n&3}`,(n&1)?85:170,0,0,n&3,n>>2,n&3);
  });
  for(let word=0;word<4;word++)job(`protected_opposite_word${word}`,({add,write})=>{
    for(const [i,value]of [255,0,85,170].entries()){write(word,value,`pattern${i}`);add(`hold_opposite${i}`,255-value,0,0,(word+1)&3,word,word);}
  });
  for(const value of [1,128])for(let half=0;half<2;half++)job(`top_only_${value}_${half}`,({add,write})=>{
    write(3,value,'top');for(let n=half*8;n<half*8+8;n++)add(`read_${n>>2}_${n&3}`,255-value,0,0,n&3,n>>2,n&3);
  });
  const resetBody=({add,write})=>{
    write(0,85,'dirty_near');write(3,170,'dirty_far');
    add('reset_closed_high',255,0,1,3,0,3);add('reset_closed_change_data',0,0,1,3,0,3);add('release_closed_high',255,0,0,3,0,3);add('hold_closed_zero',0,0,0,3,0,3);
    add('reset_open_high',255,1,1,2,2,2);add('release_open_high',255,1,0,2,2,2);add('close_after_open_release',255,0,0,2,2,2);add('hold_after_open_release',0,0,0,0,2,2);
  };
  job('reset_priority_release',resetBody);
  for(let pair=0;pair<4;pair++){
    job(`diagnostic_reset_pair${pair}`,resetBody,pair);
    job(`diagnostic_hold_pair${pair}`,({add,write})=>{
      [85,170,85,170].forEach((value,word)=>write(word,value,`preload_${word}`));
      add('hold_d55_200',85,0,0,0,0,3);add('hold_daa_200',170,0,0,3,3,0);
    },pair);
  }
  return {status:'conditional_prepared_not_run',jobs,
    timing:'200ticks is an unmeasured candidate phase. Every job has <=20cases/4000ticks; actual native wall time must remain below300s. Do not interpret a timing failure as Boolean correctness evidence or silently shorten the budget.',
    coverage:'All8 walking-one values at each of4write addresses; every Rs/Rt pair with two distinct preloads; zero/full/checkerboard writes and opposite-data holds; all32Q bits asserted in every functional phase. Four diagnostic views collectively cover every Q/lock/clamp.',
    trace_acceptance:{required:true,baseline:'Each job resets then releases with WE0,D255; all jobs explicitly finish reset/release and restore levers. Final native Q/read0, all32locks1, all32clamps0 and all16inputs off are required.',
      closed_release:'For every stored bit, during release_closed_high lock must reach true strictly before its clamp falls; reject same-tick ambiguity, gaps, incomplete trace or Q pulses. Observe both diagnostic pair bits in all four words.',
      next_write:'Each write closes with unchanged data and write/read addresses. Require local lock high before the following prepare/write interval changes data or WA, and Q retained throughout the closed interval. Qualified rails are asynchronous; no hazard-free claim.',
      held_state:'Across each full200tick hold window, Q remains at its preloaded bit value while real D55 then DAA gives every cell opposite data in one interval. Read-address transitions may change reads but must not change Q.',
      gate_strength:'Native inspection must separately confirm comparator side/rear normalization at near/far slices; Boolean probe true does not imply analogue15. Inspect storage/read comparator inputs under high/high inhibit cases.',
      scope:'Settled assertions do not establish transient timing. End-of-tick traces cannot rule out within-tick pulses. Higher-word rawD/WE/RESET tower delay is visible but exact sequential input-write ticks are not recorded.',
      prerequisites:'All native two-slice functional and diagnostic gates must pass before any byte placement; native active-fixture chunk pinning and readback are separate prerequisites.'},
    warning:'No physical pass or full13-register lane claim. The reference oracle supplies expected assertions only; all native retained/read values must come from vanilla circuitry.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/register-file-byte.mjs NEW_OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeRegisterFileByte(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeRegisterFileByteTests(design);
  mkdirSync(output,{recursive:false});const files={design,'build-tiles':design.tiles,circuit:design.circuit,'test-manifest':tests,'trace-acceptance':tests.trace_acceptance,
    ...Object.fromEntries(design.diagnostic_circuits.map((c,i)=>[`diagnostic-circuit-${i}`,c])),...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))};
  for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  const source_sha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
  const provenance={status:design.status,source_sha256,based_on_two_slice_sha256:sourceHash,world_modified:false,files:Object.fromEntries(Object.keys(files).map(name=>[`${name}.json`,createHash('sha256').update(readFileSync(join(output,`${name}.json`))).digest('hex')]))};
  writeFileSync(join(output,'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:design.status,world_modified:false,source_sha256,box:design.box,blocks:design.blocks.length,tiles:design.tiles.length,inputs:design.inputs.length,signals:design.circuit.signals.length,diagnostics:design.diagnostic_circuits.map(c=>c.signals.length),jobs:tests.jobs.length,cases:tests.jobs.reduce((n,j)=>n+j.spec.cases.length,0)}));
}
