import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Candidate only: four words, two independent data slices, shared address control.
// Based on v3 register-file.mjs, which this module neither imports nor modifies.
const sourceHash='c4174d61234089e61a51dae39cf81e991bba3011d3162b0c9339d6dbe8aeca90';
const facing={east:'west',west:'east',north:'south',south:'north'};
const key=p=>`${p.x},${p.y},${p.z}`;
export function makeRegisterFileBits({origin={x:-112,y:-40,z:-64},id='gpu_rf_bits2'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer support origin required');
  if(!/^gpu_rf_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid id');
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
  for(const [name,x,z]of [['wa0',0,-8],['wa1',12,-8],['rs0',0,-24],['rs1',12,-24],['rt0',0,24],['rt1',12,24],['d0',20,6],['d1',68,6],['write_enable',6,-12],['reset',17,1]])inputColumn(name,x,z);
  for(const bit of [0,1])for(const z of [-26,22])tower(38+bit*48,z,4,52);

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
    line(16,railZ,89,railZ,y+6);for(let x=21;x<=81;x+=12)rep(x,y+6,railZ,'east');
    for(const bit of [0,1]){
      const x=41+bit*48;
      for(let n=1;n<=3;n++)wire(x,y+6-n,railZ+n);
      rep(x,y+3,z-3,'south');
      if(bit)ports[z<0?'far_rs_inhibit':'far_rt_inhibit'].push({name:`far_${z<0?'rs':'rt'}_inhibit${word}`,position:p(x,y+3,z-3),property:'powered'});
    }
  }

  for(let word=0;word<4;word++){
    const y=1+word*16;
    decoder(word,y,-8,'write_match',true);decoder(word,y,-24,'rs_match');decoder(word,y,24,'rt_match');
    // One qualified-write result per word, fanned out with isolated local taps.
    rep(7,y,-12,'east');comp(8,y,-12,'east');wire(9,y,-12);rep(10,y,-12,'east');wire(11,y,-12);
    ports.qualified.push({name:`qualified${word}`,position:p(10,y,-12),property:'powered'});
    for(let n=1;n<=6;n++)wire(11+n,y+n,-12);
    line(17,-12,80,-12,y+6);for(let x=19;x<=79;x+=12)rep(x,y+6,-12,'east');
    for(const bit of [0,1]){
      const x=32+bit*48;
      rep(x,y+6,-11,'south');wire(x,y+6,-10);
      for(let n=1;n<=6;n++)wire(x,y+6-n,-10+n);
      line(x,-4,x,-2,y);rep(x,y,-1,'south');
      if(bit)ports.far_write.push({name:`far_write${word}`,position:p(x,y,-1),property:'powered'});
    }
    // RESET taps the shared tower north; its base lever is west, leaving this free.
    wire(17,y,0);rep(17,y,-1,'north');wire(17,y,-2);
    for(let n=1;n<=6;n++)wire(17,y+n,-2-n);
    line(17,-8,20,-8,y+6);line(20,-8,20,-6,y+6);line(20,-6,60,-6,y+6);
    for(let x=21;x<=57;x+=12)rep(x,y+6,-6,'east');
    line(60,-6,60,-8,y+6);line(60,-8,65,-8,y+6);rep(65,y+6,-7,'south');wire(65,y+6,-6);
    for(let n=1;n<=6;n++)wire(65,y+6-n,-6+n);
    wire(65,y,1);ports.far_reset.push({name:`far_reset${word}`,position:p(65,y,1),property:'power'});

    for(const bit of [0,1]){
      const dx=bit*48;
      rep(18+dx,y,1,'east');line(19+dx,1,30+dx,1,y);rep(31+dx,y,1,'east');
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
  for(const bit of [0,1])for(const [name,z]of [['rs',-26],['rt',22]]){
    const dx=bit*48;rep(37+dx,52,z,'west');wire(36+dx,52,z);supported(35+dx,52,z,'redstone_lamp');
    ports.read.push({name:`${name}${bit}`,position:p(36+dx,52,z),property:'power'});
  }
  const signals=[...ports.q,...ports.locks,...ports.clamps,...ports.read,...ports.write_match,...ports.rs_match,...ports.rt_match,...ports.qualified,...ports.top_inputs,...ports.far_rs_inhibit,...ports.far_rt_inhibit];
  const buses=[['words',ports.q],['locks',ports.locks],['clamps',ports.clamps],['rs',ports.read.filter(s=>s.name.startsWith('rs'))],['rt',ports.read.filter(s=>s.name.startsWith('rt'))],['write_decode',ports.write_match],['rs_decode',ports.rs_match],['rt_decode',ports.rt_match],['qualified',ports.qualified],['top_controls',ports.top_inputs],['far_rs_inhibit',ports.far_rs_inhibit],['far_rt_inhibit',ports.far_rt_inhibit]].map(([name,list])=>({name,bits:list.map(s=>s.name)}));
  const blocks=[...map.values()],axes=['x','y','z'],box={from:Object.fromEntries(axes.map(k=>[k,Math.min(...blocks.map(b=>b.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...blocks.map(b=>b.position[k]))]))},tiles=[];
  function tile(bounds,contents){
    if(!contents.length)return;
    if(contents.length>127){const axis=axes.reduce((a,b)=>bounds.to[a]-bounds.from[a]>=bounds.to[b]-bounds.from[b]?a:b),mid=Math.floor((bounds.from[axis]+bounds.to[axis])/2);if(mid===bounds.to[axis])throw Error('unsplittable tile');tile({from:bounds.from,to:{...bounds.to,[axis]:mid}},contents.filter(b=>b.position[axis]<=mid));tile({from:{...bounds.from,[axis]:mid+1},to:bounds.to},contents.filter(b=>b.position[axis]>mid));return;}
    const tileId=`${id}_t${tiles.length}`,operations=[{op:'fill',box:bounds,block:{id:'minecraft:air'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))];
    const volume=axes.reduce((n,k)=>n*(bounds.to[k]-bounds.from[k]+1),1);
    if(volume+contents.length>4096)throw Error('tile write cap exceeded');
    tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:bounds,description:'Uninspected two-slice shared-control RF candidate'},plan:{id:tileId,region_id:tileId,label:'Four words by two bits; shared physical decoders',operations}});
  }
  for(let y=box.from.y;y<=box.to.y;y+=8)for(let z=box.from.z;z<=box.to.z;z+=16)for(let x=box.from.x;x<=box.to.x;x+=24){const bounds={from:{x,y,z},to:{x:Math.min(x+23,box.to.x),y:Math.min(y+7,box.to.y),z:Math.min(z+15,box.to.z)}};tile(bounds,blocks.filter(b=>axes.every(k=>b.position[k]>=bounds.from[k]&&b.position[k]<=bounds.to[k])));}
  const diagnostics=[...ports.q,...ports.locks,...ports.clamps,...ports.read,...ports.far_write,...ports.far_reset,...ports.far_rs_inhibit,...ports.far_rt_inhibit,...ports.top_inputs];
  return {status:'design_only_not_live_verified',id,origin,origin_means:'bottom support level',words:4,bits:2,word_pitch:16,bit_pitch:48,box,blocks,inputs,ports,tiles,
    based_on_rf_sha256:sourceHash,current_source_rf_sha256:createHash('sha256').update(readFileSync(new URL('./register-file.mjs',import.meta.url))).digest('hex'),
    circuit:{id,dimension:'minecraft:overworld',description:'Four stored two-bit words with shared real decoders',signals,buses},
    diagnostic_circuit:{id:`${id}_diag`,dimension:'minecraft:overworld',description:'RF two-slice far-control and storage timing probes',signals:diagnostics,buses:[]},
    timing:{settle_ticks:160,minimum_phase_ticks:'unmeasured; candidate only',hazard_free:false},
    integration:{write_sequence:'WE low: stage data/address and settle; WE high: write; WE low: close with data/address unchanged; only then change inputs',operand_capture:'Still requires separate REQUEST operand latches',reset:'Per-bit clamps retained; new shared distribution must be measured for release ordering'},
    construction:'Only populated disjoint tiles cleared; group <=24 tiles per journal; fresh world/player/chunk inspection mandatory; no body movement or reservation implied'};
}

export function makeRegisterFileBitsTests(design,{settleTicks=design.timing.settle_ticks}={}){
  if(!Number.isInteger(settleTicks)||settleTicks<1||settleTicks>200)throw Error('settleTicks must be1..200');
  const encode=(d,we,reset,wa,rs,rt)=>({wa0:!!(wa&1),wa1:!!(wa&2),rs0:!!(rs&1),rs1:!!(rs&2),rt0:!!(rt&1),rt1:!!(rt&2),d0:!!(d&1),d1:!!(d&2),write_enable:!!we,reset:!!reset});
  const job=(name,body)=>{
    const stored=[0,0,0,0],cases=[];
    const add=(label,d,we,reset,wa=0,rs=0,rt=0)=>{
      const inputs=encode(d,we,reset,wa,rs,rt);if(reset)stored.fill(0);else if(we)stored[wa]=d;
      const qualified=we?1<<wa:0,words=stored.reduce((n,v,i)=>n|(v<<(2*i)),0),locks=reset?0:255^(we?3<<(2*wa):0),top=design.inputs.reduce((n,p,i)=>n|((+inputs[p.name])<<i),0);
      cases.push({name:label,inputs,expect:{words,locks,clamps:reset?255:0,rs:stored[rs],rt:stored[rt],write_decode:1<<wa,rs_decode:1<<rs,rt_decode:1<<rt,qualified,top_controls:top,far_rs_inhibit:15^(1<<rs),far_rt_inhibit:15^(1<<rt)}});
    };
    const write=(word,value,tag)=>{add(`${tag}_prepare`,value,0,0,word,word,word);add(`${tag}_write`,value,1,0,word,word,word);add(`${tag}_close`,value,0,0,word,word,word);};
    add('reset_high',3,0,1);add('release_high_data',3,0,0);body({add,write});add('finish_reset',0,0,1);add('finish_release',0,0,0);
    if(cases.length>24||cases.length*settleTicks>6000)throw Error('bounded jobs require <=24cases and <=6000ticks');
    return {name,spec:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}};
  };
  const jobs=[];
  jobs.push(job('routing_decode',({add})=>{for(let rs=0;rs<4;rs++)for(let rt=0;rt<4;rt++)add(`decode_${rs}_${rt}`,(rs+rt)&3,0,0,(rs+rt)&3,rs,rt);}));
  for(const [name,pattern]of [['ascending',[0,1,2,3]],['descending',[3,2,1,0]]])for(let half=0;half<2;half++)jobs.push(job(`read_${name}_${half}`,({add,write})=>{
    pattern.forEach((value,word)=>write(word,value,`preload_${word}`));for(let n=half*8;n<half*8+8;n++)add(`read_${n>>2}_${n&3}`,n&3,0,0,n&3,n>>2,n&3);
  }));
  for(let word=0;word<4;word++)jobs.push(job(`opposite_slice_word${word}`,({add,write})=>{
    for(const [i,value]of [1,2,3,0].entries()){write(word,value,`value_${i}`);add(`hold_opposite_${i}`,3^value,0,0,(word+1)&3,word,word);}
  }));
  for(const value of [1,2])jobs.push(job(`top_only_${value}`,({add,write})=>{
    write(3,value,'top');for(let rs=0;rs<4;rs++)for(let rt=0;rt<4;rt++)add(`read_${rs}_${rt}`,3^value,0,0,0,rs,rt);
  }));
  jobs.push(job('reset_priority_release',({add,write})=>{
    write(0,1,'near');write(3,2,'far');add('reset_closed',3,0,1,3,0,3);add('reset_change_d',0,0,1,3,0,3);add('release_closed_d3',3,0,0,3,0,3);add('hold_closed_d0',0,0,0,3,0,3);
    add('reset_write_open',3,1,1,2,2,2);add('release_write_open',3,1,0,2,2,2);add('close_after_release',3,0,0,2,2,2);add('hold_after_release',0,0,0,0,2,2);
  }));
  return {jobs,warning:'No physical pass. Every job initializes and clears retained state; restoring inputs alone does not restore stored words. Sequential lever writes, settled assertions only; no simultaneous or hazard-free guarantee.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/register-file-bits.mjs OUTPUT_DIRECTORY [floor_x,floor_y,floor_z]');
  const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');
  const design=makeRegisterFileBits(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeRegisterFileBitsTests(design);
  mkdirSync(output,{recursive:true});const files={design,'build-tiles':design.tiles,circuit:design.circuit,'diagnostic-circuit':design.diagnostic_circuit,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))};
  for(const [name,value]of Object.entries(files))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');
  console.log(JSON.stringify({generated:true,world_modified:false,box:design.box,blocks:design.blocks.length,tiles:design.tiles.length,inputs:design.inputs.length,signals:design.circuit.signals.length,jobs:tests.jobs.map(j=>({name:j.name,cases:j.spec.cases.length}))}));
}
