import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Four independently stored bits, with two addressed reads and one addressed write.
// All runtime logic is vanilla redstone. This file only emits candidate geometry/tests.
const facing={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
export function makeRegisterFilePrototype({origin={x:-8,y:-44,z:-20},id='gpu_rf_four'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer floor origin required');
  if(!/^gpu_rf_[a-zA-Z0-9_-]+$/.test(id)||id.length>29)throw Error('invalid register-file id');
  const map=new Map(),inputs=[],signals=[],ports={q:[],locks:[],clamps:[],write_match:[],rs_match:[],rt_match:[],qualified:[],top_inputs:[],rs_prefix:[],rt_prefix:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,y,z,name,properties,replaceWire=false)=>{
    const position=p(x,y,z),value={position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}},old=map.get(key(position));
    if(old&&JSON.stringify(old.block)!==JSON.stringify(value.block)&&!(replaceWire&&old.block.id==='minecraft:redstone_wire'))throw Error(`Geometry collision at ${key(position)}: ${old.block.id} versus ${name}`);
    map.set(key(position),value);
  };
  const solid=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const supported=(x,y,z,name,properties,replaceWire=false)=>{
    const below=map.get(key(p(x,y-1,z)));
    if(below&&!['minecraft:light_gray_concrete','minecraft:cyan_concrete'].includes(below.block.id))throw Error(`Unsupported ${name} above ${below.block.id}`);
    if(!below)solid(x,y-1,z);
    put(x,y,z,name,properties,replaceWire);
  };
  const wire=(x,y,z,properties)=>supported(x,y,z,'redstone_wire',properties);
  const rep=(x,y,z,travel,delay=1)=>supported(x,y,z,'repeater',{facing:facing[travel],delay:String(delay)},true);
  const comp=(x,y,z,travel)=>supported(x,y,z,'comparator',{facing:facing[travel],mode:'subtract'});
  const wallTorch=(x,y,z,face)=>put(x,y,z,'redstone_wall_torch',{facing:face});
  const line=(x1,z1,x2,z2,y)=>{
    if(x1!==x2&&z1!==z2)throw Error('axis-aligned wire required');
    const n=Math.abs(x2-x1)+Math.abs(z2-z1);
    for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);
  };
  const tower=(x,z,fromY,toY)=>{
    if((toY-fromY)%4)throw Error('noninverting towers rise a multiple of four');
    for(let y=fromY;y<=toY;y++){
      if((y-fromY)%2===0)solid(x,y,z);
      else supported(x,y,z,'redstone_torch');
    }
  };
  const inputColumn=(name,x,z)=>{
    tower(x,z,1,25);
    // Floor-lever adapters drive an ordinary repeater into the unchanged tower.
    // This makes the signal path start beside the lever rather than relying on
    // /setblock to reproduce a wall lever's attachment-neighbor notifications.
    const north=name==='d'||name==='reset',side=x===12?1:-1;
    const inputX=north?x:x+2*side,inputZ=north?z-2:z;
    rep(north?x:x+side,1,north?z-1:z,north?'south':side===1?'west':'east');
    supported(inputX,1,inputZ,'lever',{face:'floor',facing:'north',powered:'false'});
    const input={name,position:p(inputX,1,inputZ)};inputs.push(input);
    ports.top_inputs.push({name:`top_${name}`,position:p(x,24,z),property:'lit'});
    return input;
  };
  inputColumn('wa0',0,-8);inputColumn('wa1',12,-8);
  inputColumn('rs0',0,-24);inputColumn('rs1',12,-24);
  inputColumn('rt0',0,24);inputColumn('rt1',12,24);
  inputColumn('d',20,6);inputColumn('write_enable',6,-12);inputColumn('reset',17,1);
  // Side repeaters inject only into original-polarity solid levels of each OR tower.
  // An upper injection must not feed the lower words: that gets a dedicated live test.
  tower(38,-26,4,28);tower(38,22,4,28);

  function decoder(word,y,z,port,{write=false}={}){
    // Isolated dust between two solid blocks otherwise remains a nonconducting
    // horizontal dot after /setblock. A vanilla cross powers the inverter block.
    const cross={north:'side',east:'side',south:'side',west:'side'};
    wire(1,y,z,word&1?cross:undefined);wire(11,y,z,word&2?cross:undefined);
    if(word&1){solid(2,y,z);wallTorch(3,y,z,'east');wire(4,y,z);}
    else{rep(2,y,z,'east');wire(3,y,z);wire(4,y,z);}
    if(word&2){solid(10,y,z);wallTorch(9,y,z,'west');wire(8,y,z);}
    else{rep(10,y,z,'west');wire(9,y,z);wire(8,y,z);}
    rep(5,y,z,'east');rep(7,y,z,'west');solid(6,y,z);
    wallTorch(6,y,z+(write?1:-1),write?'south':'north');
    ports[port].push({name:`${port}${word}`,position:p(6,y,z+(write?1:-1)),property:'lit'});
    if(write){
      // The block holds mismatch; this separate output cannot back-power either address.
      rep(6,y,z-1,'north');line(6,z-2,8,z-2,y);rep(8,y,z-3,'north');
    }else{
      line(6,z-2,6,z-6,y);
      for(let n=1;n<=3;n++)wire(6+n,y+n,z-6);
      line(9,z-6,38,z-6,y+3);
      for(const x of [15,27,37])rep(x,y+3,z-6,'east');
      solid(39,y+3,z-6);wallTorch(40,y+3,z-6,'east');
      line(41,z-6,41,z-4,y+3);rep(41,y+3,z-3,'south');
    }
  }

  for(let word=0;word<4;word++){
    const y=1+word*8;
    decoder(word,y,-8,'write_match',{write:true});
    decoder(word,y,-24,'rs_match');decoder(word,y,24,'rt_match');
    // WE AND selected word: rear WE=15, side mismatch=15. RESET is ORed later.
    rep(7,y,-12,'east');comp(8,y,-12,'east');wire(9,y,-12);rep(10,y,-12,'east');wire(11,y,-12);
    ports.qualified.push({name:`qualified${word}`,position:p(10,y,-12),property:'powered'});
    for(let n=1;n<=3;n++)wire(11+n,y+n,-12);
    line(14,-12,32,-12,y+3);rep(22,y+3,-12,'east');
    line(32,-12,32,-5,y+3);rep(32,y+3,-10,'south');
    for(let n=1;n<=3;n++)wire(32,y+3-n,-5+n);
    rep(32,y,-1,'south');

    // Proven reset-latch topology, with the WE rail moved four blocks east to
    // leave a three-block-high Q crossing. Reset clamp remains local per word.
    rep(18,y,1,'east');line(19,1,30,1,y);rep(31,y,1,'east');
    line(32,0,32,10,y);rep(32,y,7,'south');
    line(17,2,17,9,y);rep(17,y,5,'south');
    wire(21,y,6);rep(22,y,6,'east');comp(23,y,6,'east');wire(24,y,6);rep(25,y,6,'east');wire(26,y,6);
    rep(23,y,7,'north',4);rep(23,y,8,'north',4);line(18,9,23,9,y);
    rep(25,y,7,'north');wire(25,y,8);solid(25,y,10);wallTorch(25,y,9,'north');line(26,10,31,10,y);
    ports.q.push({name:`q${word}`,position:p(25,y,6),property:'powered'});
    ports.locks.push({name:`lock${word}`,position:p(25,y,7),property:'powered'});
    ports.clamps.push({name:`clamp${word}`,position:p(23,y,7),property:'powered'});

    // Q escapes above the WE rail and feeds two independent subtract gates.
    for(let n=1;n<=3;n++)wire(26+n,y+n,6);
    line(29,6,43,6,y+3);rep(36,y+3,6,'east');
    line(43,-26,43,22,y+3);
    for(const z of [5,-7,-19])rep(43,y+3,z,'north');
    for(const z of [7,19])rep(43,y+3,z,'south');
    for(const z of [-26,22]){
      rep(42,y+3,z,'west');comp(41,y+3,z,'west');wire(40,y+3,z);rep(39,y+3,z,'west');
    }
  }
  for(const [name,z]of [['rs_read',-26],['rt_read',22]]){
    rep(37,28,z,'west');wire(36,28,z);supported(35,28,z,'redstone_lamp');
    signals.push({name,position:p(36,28,z),property:'power'});
    const prefix=name==='rs_read'?'rs_prefix':'rt_prefix';
    for(let word=0;word<3;word++)ports[prefix].push({name:`${prefix}${word}`,position:p(38,7+word*8,z),property:'lit'});
  }
  signals.push(...ports.q,...ports.locks,...ports.clamps,...ports.write_match,...ports.rs_match,...ports.rt_match,...ports.qualified,...ports.top_inputs,...ports.rs_prefix,...ports.rt_prefix);
  const blocks=[...map.values()],axes=['x','y','z'];
  const box={from:Object.fromEntries(axes.map(k=>[k,Math.min(...blocks.map(v=>v.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...blocks.map(v=>v.position[k]))]))};
  const tiles=[];
  function tile(box,contents){
    if(!contents.length)return;
    if(contents.length>127){
      const axis=axes.reduce((a,b)=>box.to[a]-box.from[a]>=box.to[b]-box.from[b]?a:b);
      const mid=Math.floor((box.from[axis]+box.to[axis])/2);
      if(mid===box.to[axis])throw Error('Unable to bound construction tile');
      tile({from:box.from,to:{...box.to,[axis]:mid}},contents.filter(v=>v.position[axis]<=mid));
      tile({from:{...box.from,[axis]:mid+1},to:box.to},contents.filter(v=>v.position[axis]>mid));return;
    }
    const tileId=`${id}_t${tiles.length}`;
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box,description:'Reserved stacked four-word register-file prototype'},plan:{id:tileId,region_id:tileId,label:'Two-read/one-write four-word file candidate',operations:[{op:'fill',box,block:{id:'minecraft:air'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(v=>({op:'set',...v}))]}});
  }
  // These are disjoint bounded reservations. Empty buckets are not cleared.
  for(let y=box.from.y;y<=box.to.y;y+=8)for(let z=box.from.z;z<=box.to.z;z+=16)for(let x=box.from.x;x<=box.to.x;x+=24){
    const b={from:{x,y,z},to:{x:Math.min(x+23,box.to.x),y:Math.min(y+7,box.to.y),z:Math.min(z+15,box.to.z)}};
    tile(b,blocks.filter(v=>axes.every(a=>v.position[a]>=b.from[a]&&v.position[a]<=b.to[a])));
  }
  return {status:'design_only_not_live_verified',id,origin,origin_means:'bottom support level',words:4,bits:1,box,blocks,ports,inputs,tiles,
    circuit:{id,dimension:'minecraft:overworld',description:'Four stacked stored bits with separately addressed Rs/Rt reads, one addressed write, and reset',signals,buses:[
      {name:'words',bits:ports.q.map(v=>v.name)},{name:'locks',bits:ports.locks.map(v=>v.name)},{name:'clamps',bits:ports.clamps.map(v=>v.name)},
      {name:'write_decode',bits:ports.write_match.map(v=>v.name)},{name:'rs_decode',bits:ports.rs_match.map(v=>v.name)},{name:'rt_decode',bits:ports.rt_match.map(v=>v.name)},
      {name:'qualified',bits:ports.qualified.map(v=>v.name)},{name:'rs',bits:['rs_read']},{name:'rt',bits:['rt_read']},
      {name:'top_controls',bits:ports.top_inputs.map(v=>v.name)},
      {name:'rs_prefix',bits:ports.rs_prefix.map(v=>v.name)},{name:'rt_prefix',bits:ports.rt_prefix.map(v=>v.name)},
    ]},timing:{settle_ticks:96,minimum_phase_ticks:'unmeasured; includes vertical distribution and read merging',hazard_free:false},
    integration:{operand_capture:'Separate Rs/Rt latches must capture in REQUEST before UPDATE; not part of this prototype',write_sequence:'WE=0: stage address and data, settle; WE=1: write, settle; WE=0: close and settle before changing address/data',reset:'Physical per-word data clamps and ORed write enables; shared clamp is deferred until controller sequencing is measured'},
    construction:'Support blocks are explicit. Only populated bounded tiles are cleared. Place lower tiles first, then verify the complete design after neighbor updates.'};
}

/** Independent settled-state oracle, not a Minecraft runtime backend. */
export function makeRegisterFileTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be in 1..200');
  const encode=(d,we,reset,wa,rs,rt)=>({wa0:!!(wa&1),wa1:!!(wa&2),rs0:!!(rs&1),rs1:!!(rs&2),rt0:!!(rt&1),rt1:!!(rt&2),d:!!d,write_enable:!!we,reset:!!reset});
  const makeJob=(name,body)=>{
    let stored=0;const cases=[];
    const add=(label,d,we,reset,wa=0,rs=0,rt=0)=>{
      const inputs=encode(d,we,reset,wa,rs,rt);
      if(reset)stored=0;else if(we)stored=(stored&~(1<<wa))|((+!!d)<<wa);
      const qualified=we?(1<<wa):0,locks=reset?0:(15^qualified);
      const top=design.inputs.reduce((n,p,i)=>n|((+inputs[p.name])<<i),0);
      const rsValue=(stored>>rs)&1,rtValue=(stored>>rt)&1;
      cases.push({name:label,inputs,expect:{words:stored,rs:rsValue,rt:rtValue,locks,clamps:reset?15:0,write_decode:1<<wa,rs_decode:1<<rs,rt_decode:1<<rt,qualified,top_controls:top,rs_prefix:rsValue*((7<<rs)&7),rt_prefix:rtValue*((7<<rt)&7)}});
    };
    const reset=()=>{add('reset_high',1,0,1);add('reset_release_high_d',1,0,0);};
    const write=(word,value,tag)=>{add(`${tag}_prepare`,value,0,0,word,word,(word+1)%4);add(`${tag}_write`,value,1,0,word,word,(word+1)%4);add(`${tag}_close`,value,0,0,word,word,(word+1)%4);};
    reset();body({add,write});
    add('finish_reset',0,0,1);add('finish_release',0,0,0);
    if(cases.length>32)throw Error('Keep each native job at most32 cases');
    return {name,spec:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}};
  };
  const jobs=[];
  jobs.push(makeJob('routing_decode',({add})=>{
    for(let rs=0;rs<4;rs++)for(let rt=0;rt<4;rt++)add(`decode_${rs}_${rt}`,(rs+rt)&1,0,0,(rs+rt)%4,rs,rt);
  }));
  for(const pattern of [3,5])jobs.push(makeJob(`addressing_${pattern}`,({add,write})=>{
    for(let word=0;word<4;word++)write(word,(pattern>>word)&1,`preload_${word}`);
    for(let rs=0;rs<4;rs++)for(let rt=0;rt<4;rt++)add(`read_${rs}_${rt}`,(rs+rt)&1,0,0,(rs+rt)%4,rs,rt);
  }));
  jobs.push(makeJob('write_protection',({add,write})=>{
    for(let word=0;word<4;word++)write(word,1,`set_${word}`);
    for(let word=0;word<4;word++)write(word,0,`clear_${word}`);
    add('reset_overrides_open_write',1,1,1,3,3,0);add('close_while_reset',1,0,1,3,3,0);
    add('release_reset_no_write',1,0,0,3,3,0);
  }));
  jobs.push(makeJob('vertical_read_isolation',({add,write})=>{
    // Highest-word-only assertion exercises upward collection without lower-state feedback.
    write(3,1,'top_only');
    for(let word=0;word<4;word++)add(`read_top_pair_${word}`,0,0,0,0,word,3);
    write(3,0,'clear_top');write(0,1,'bottom_only');
    for(let word=0;word<4;word++)add(`read_bottom_pair_${word}`,1,0,0,3,0,word);
    add('reset_with_write_open',1,1,1,2,0,2);add('release_reset_write_open',1,1,0,2,0,2);add('close_after_reset_release',1,0,0,2,0,2);
  }));
  return {jobs,warning:'Builder must verify initial WE=0 and RESET=0. Each job resets/preloads independently and finishes cleared. Input restoration does not restore stored words. Checks are settled-state behavior, not hazard-free addressing or captured operands.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/register-file.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeRegisterFilePrototype(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeRegisterFileTests(design);
  mkdirSync(output,{recursive:true});const files={design,'build-tiles':design.tiles,circuit:design.circuit,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))};
  for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,status:design.status,box:design.box,blocks:design.blocks.length,tiles:design.tiles.length,jobs:tests.jobs.map(j=>({name:j.name,cases:j.spec.cases.length})),world_modified:false}));
}
