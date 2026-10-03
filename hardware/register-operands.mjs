import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRegisterFilePrototype} from './register-file.mjs';
import {makeResetRegister} from './register-reset.mjs';
const key=p=>`${p.x},${p.y},${p.z}`,facing={east:'west',west:'east',north:'south',south:'north'};
export function makeRegisterOperands({origin={x:0,y:64,z:0},id='gpu_rf_operands'}={}){
  if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('integer support origin required');
  if(!/^gpu_rf_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('invalid id');
  const rf=makeRegisterFilePrototype({origin,id}),map=new Map(rf.blocks.map(b=>[key(b.position),b])),inputs=[...rf.inputs],signals=[...rf.circuit.signals],ports={rf:rf.ports,operands:[],locks:[],clamps:[],data:[],enable:[],reset:[]};
  const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  const put=(x,y,z,name,properties,replace=false)=>{const position=p(x,y,z),v={position,block:{id:`minecraft:${name}`,...(properties?{properties}:{})}},old=map.get(key(position));if(old&&JSON.stringify(old.block)!==JSON.stringify(v.block)&&!replace)throw Error(`collision ${key(position)} ${old.block.id} vs ${name}`);map.set(key(position),v);};
  const stone=(x,y,z)=>put(x,y,z,'light_gray_concrete');
  const supported=(x,y,z,name,properties,replace=false)=>{const below=map.get(key(p(x,y-1,z)));if(below&&!below.block.id.endsWith('_concrete'))throw Error('non-solid support');if(!below)stone(x,y-1,z);put(x,y,z,name,properties,replace);};
  const wire=(x,y,z)=>supported(x,y,z,'redstone_wire');
  const rep=(x,y,z,travel,delay=1)=>supported(x,y,z,'repeater',{facing:facing[travel],delay:String(delay)},map.get(key(p(x,y,z)))?.block.id==='minecraft:redstone_wire');
  const line=(x1,z1,x2,z2,y)=>{if(x1!==x2&&z1!==z2)throw Error('axis-aligned line');const n=Math.abs(x2-x1)+Math.abs(z2-z1);for(let i=0;i<=n;i++)wire(x1+Math.sign(x2-x1)*i,y,z1+Math.sign(z2-z1)*i);};
  const probe=(name,x,y,z,property='powered',group)=>{const s={name,position:p(x,y,z),property};signals.push(s);if(group)ports[group].push(s);};
  // Two copies of the accepted reset latch. D/WE/RESET connectors become wires;
  // no new lever or external process can set an operand's data directly.
  for(const [name,z]of [['rs',-26],['rt',22]]){
    const cell=makeResetRegister({origin:p(56,27,z),bits:1,id:`gpu_register_operand_${name}`});
    for(const b of cell.blocks){assertFree(b.position);map.set(key(b.position),b);}
    for(const input of cell.inputs){const old=map.get(key(input.position));if(old.block.id!=='minecraft:lever')throw Error('expected latch lever');map.set(key(input.position),{position:input.position,block:{id:'minecraft:redstone_wire'}});}
    for(const b of cell.blocks){const actual=map.get(key(b.position)),id=actual.block.id;if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator'].includes(id)){const below={...b.position,y:b.position.y-1};if(!map.has(key(below)))map.set(key(below),{position:below,block:{id:'minecraft:light_gray_concrete'}});}}
    probe(`op_${name}`,61,28,z,'powered','operands');probe(`cap_lock_${name}`,61,28,z+1,'powered','locks');probe(`cap_clamp_${name}`,59,28,z+1,'powered','clamps');probe(`cap_masked_${name}`,60,28,z,'power');
    probe(`cap_data_${name}`,58,28,z,'powered','data');probe(`cap_enable_${name}`,64,28,z-7,'powered','enable');probe(`cap_reset_${name}`,53,28,z-5,'power','reset');
  }
  function assertFree(position){if(map.has(key(position)))throw Error(`source macro collision ${key(position)}`);}
  // Read bridges start with an isolating repeater beside the actual output wire.
  for(const [z,sign]of [[-26,-1],[22,1]]){
    rep(36,28,z+sign,sign<0?'north':'south');wire(36,28,z+2*sign);
    for(let n=1;n<=6;n++)wire(36,28+n,z+(2+n)*sign);
    const row=z+8*sign;line(36,row,56,row,34);rep(42,34,row,'east');rep(54,34,row,'east');
    rep(56,34,z+7*sign,sign<0?'south':'north');wire(56,34,z+6*sign);
    for(let n=1;n<=6;n++)wire(56,34-n,z+(6-n)*sign);
  }
  // Capture has its own control; its arrival can be observed at each latch.
  supported(70,28,-40,'lever',{face:'floor',facing:'west',powered:'false'});inputs.push({name:'capture',position:p(70,28,-40)});probe('capture',70,28,-40);
  line(70,-39,70,14,28);for(const z of [-38,-26,-14,-2,10])rep(70,28,z,'south');
  for(const z of [-34,14]){line(64,z,70,z,28);rep(65,28,z,'west');}
  // Existing RESET tower, highest same-polarity block. Cross Q3 at height31.
  rep(17,25,0,'north');wire(17,25,-1);probe('reset_tap',17,25,0);
  for(let n=1;n<=6;n++)wire(17,25+n,-1-n);
  line(17,-7,47,-7,31);for(const x of [22,34,46])rep(x,31,-7,'east');
  for(let n=1;n<=3;n++)wire(47,31-n,-7+n);
  line(47,-4,50,-4,28);line(50,-31,50,17,28);
  for(const z of [-6,-18,-30])rep(50,28,z,'north');for(const z of [-2,10])rep(50,28,z,'south');
  for(const z of [-31,17]){line(50,z,53,z,28);rep(52,28,z,'east');}
  const blocks=[...map.values()],axes=['x','y','z'],box={from:Object.fromEntries(axes.map(a=>[a,Math.min(...blocks.map(b=>b.position[a]))])),to:Object.fromEntries(axes.map(a=>[a,Math.max(...blocks.map(b=>b.position[a]))]))},tiles=[];
  function tile(bounds,contents){if(!contents.length)return;if(contents.length>127){const a=axes.reduce((a,b)=>bounds.to[a]-bounds.from[a]>=bounds.to[b]-bounds.from[b]?a:b),mid=Math.floor((bounds.from[a]+bounds.to[a])/2);if(mid===bounds.to[a])throw Error('unsplittable tile');tile({from:bounds.from,to:{...bounds.to,[a]:mid}},contents.filter(b=>b.position[a]<=mid));tile({from:{...bounds.from,[a]:mid+1},to:bounds.to},contents.filter(b=>b.position[a]>mid));return;}
    const tileId=`${id}_t${tiles.length}`,operations=[{op:'fill',box:bounds,block:{id:'minecraft:air'}},...contents.sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))];const volume=axes.reduce((n,a)=>n*(bounds.to[a]-bounds.from[a]+1),1);if(volume+contents.length>4096)throw Error('tile budget');tiles.push({region:{id:tileId,dimension:'minecraft:overworld',box:bounds,description:'Unbuilt separate RF and retained-operand prototype'},plan:{id:tileId,region_id:tileId,label:'Actual RF reads feeding retained operands',operations}});
  }
  for(let y=box.from.y;y<=box.to.y;y+=8)for(let z=box.from.z;z<=box.to.z;z+=16)for(let x=box.from.x;x<=box.to.x;x+=24){const bounds={from:{x,y,z},to:{x:Math.min(x+23,box.to.x),y:Math.min(y+7,box.to.y),z:Math.min(z+15,box.to.z)}};tile(bounds,blocks.filter(b=>axes.every(a=>b.position[a]>=bounds.from[a]&&b.position[a]<=bounds.to[a])));}
  // New z boundaries may separate a wall torch from its same-height support.
  // Order tiles by actual attachment dependencies, not merely coordinate order.
  const owners=new Map();tiles.forEach((t,i)=>t.plan.operations.filter(o=>o.op==='set').forEach(o=>owners.set(key(o.position),i)));
  const deps=tiles.map(()=>new Set()),dir={north:{x:0,z:1},south:{x:0,z:-1},east:{x:-1,z:0},west:{x:1,z:0}};
  tiles.forEach((t,i)=>t.plan.operations.filter(o=>o.op==='set').forEach(o=>{let support;if(o.block.id==='minecraft:redstone_wall_torch'){const v=dir[o.block.properties.facing];support={x:o.position.x+v.x,y:o.position.y,z:o.position.z+v.z};}else if(['minecraft:redstone_wire','minecraft:repeater','minecraft:comparator','minecraft:redstone_torch','minecraft:lever'].includes(o.block.id))support={...o.position,y:o.position.y-1};if(support){const owner=owners.get(key(support));if(owner===undefined)throw Error(`missing support ${key(support)}`);if(owner!==i)deps[i].add(owner);}}));
  const ordered=[],done=new Set();while(done.size<tiles.length){const next=tiles.findIndex((_,i)=>!done.has(i)&&[...deps[i]].every(v=>done.has(v)));if(next<0)throw Error('cyclic tile dependencies');done.add(next);ordered.push(tiles[next]);}
  return {status:'design_only_not_live_verified',id,origin,origin_means:'RF bottom support level',words:4,bits:1,box,blocks,tiles:ordered,inputs,ports,
    circuit:{...rf.circuit,description:'Separate v3 RF with two actual resettable retained operands',signals,buses:[...rf.circuit.buses,{name:'operands',bits:ports.operands.map(s=>s.name)},{name:'capture_locks',bits:ports.locks.map(s=>s.name)},{name:'capture_clamps',bits:ports.clamps.map(s=>s.name)}]},
    sources:Object.fromEntries(['register-file.mjs','register-reset.mjs'].map(f=>[f,createHash('sha256').update(readFileSync(new URL(`./${f}`,import.meta.url))).digest('hex')])),
    timing:{settle_ticks:160,minimum_phase_ticks:'unmeasured; capture must close before changing read addresses or enabling RF writes'},
    scope:'Four one-bit words; no full ISA, lane-enable mask, thirteen-byte file or automatic phase controller. Separate physical capture input demonstrates retention with a bounded external test sequence.',
    construction:'Fresh native player/region/chunk inspection required; preserve emitted dependency order; at most24regions per journal; no reservation implied'};
}

export function makeRegisterOperandsTests(design){
  const jobs=[];
  const job=(name,body,settleTicks=160)=>{
    let q=[0,0,0,0],operands=[0,0];const cases=[];
    const add=(label,d,we,reset,wa,rs,rt,capture=0)=>{
      if(we&&capture&&!reset)throw Error('normal protocol forbids simultaneous write and capture');
      const inputs={wa0:!!(wa&1),wa1:!!(wa&2),rs0:!!(rs&1),rs1:!!(rs&2),rt0:!!(rt&1),rt1:!!(rt&2),d:!!d,write_enable:!!we,reset:!!reset,capture:!!capture};
      if(reset){q.fill(0);operands=[0,0];}else{if(we)q[wa]=+!!d;if(capture)operands=[q[rs],q[rt]];}
      const top=design.inputs.filter(i=>i.name!=='capture').reduce((n,i,bit)=>n+Number(inputs[i.name])*2**bit,0),qual=we?1<<wa:0;
      const expect={words:q.reduce((n,v,i)=>n+v*2**i,0),locks:reset?0:15^qual,clamps:reset?15:0,write_decode:1<<wa,rs_decode:1<<rs,rt_decode:1<<rt,qualified:qual,rs:q[rs],rt:q[rt],top_controls:top,rs_prefix:q[rs]*((7<<rs)&7),rt_prefix:q[rt]*((7<<rt)&7),operands:operands[0]+2*operands[1],capture_locks:reset||capture?0:3,capture_clamps:reset?3:0,capture,reset_tap:reset};
      for(const [port,addr]of [['rs',rs],['rt',rt]]){expect[`cap_masked_${port}`]=reset?0:q[addr];expect[`cap_enable_${port}`]=capture;expect[`cap_reset_${port}`]=reset;expect[`cap_data_${port}`]=q[addr];}
      cases.push({name:label,inputs,expect});
    };
    const write=(word,value,rs,rt,tag)=>{add(`${tag}_prepare`,value,0,0,word,rs,rt);add(`${tag}_write`,value,1,0,word,rs,rt);add(`${tag}_close`,value,0,0,word,rs,rt);};
    const capture=(rs,rt,tag)=>{add(`${tag}_select`,0,0,0,0,rs,rt,0);add(`${tag}_open`,0,0,0,0,rs,rt,1);add(`${tag}_close`,0,0,0,0,rs,rt,0);};
    add('initial_reset',1,0,1,0,0,0);add('initial_release',1,0,0,0,0,0);body({add,write,capture});add('finish_reset',0,0,1,0,0,0);add('finish_release',0,0,0,0,0,0);
    if(cases.length>24||cases.length*settleTicks>6000)throw Error('bounded job exceeds limits');jobs.push({name,spec:{circuit_id:design.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}});
  };
  job('disabled_capture',({add,write})=>{[1,0,1,0].forEach((v,w)=>write(w,v,w,(w+1)%4,`preload${w}`));for(let rs=0;rs<4;rs++)add(`closed_address_${rs}`,rs&1,0,0,3-rs,rs,3-rs);});
  for(const alias of ['rs','rt'])job(`alias_rd_${alias}`,({add,write,capture})=>{const first=alias==='rs'?1:0;write(0,first,0,1,'source0');write(1,1-first,0,1,'source1');capture(0,1,'request1');write(alias==='rs'?0:1,0,0,1,'overwrite_source');add('closed_address_change',1,0,0,3,2,3);capture(0,1,'request2');write(alias==='rs'?1:0,1,0,1,'overwrite_other');});
  job('all_addresses_equal',({add,write,capture})=>{write(2,1,2,2,'source');capture(2,2,'request1');write(2,0,2,2,'overwrite_zero');capture(2,2,'request2');write(2,1,2,2,'overwrite_one');add('closed_read_changes',0,0,0,0,0,3);});
  job('sequential_cycles',({write,capture})=>{for(let i=0;i<3;i++){write(0,(i+1)%2,0,0,`cycle${i}_update`);capture(0,0,`cycle${i}_request`);}});
  job('top_read_release',({write,capture})=>{write(3,1,3,3,'top_source');capture(3,3,'both_high');capture(0,0,'both_low');capture(3,0,'rs_high');capture(0,3,'rt_high');write(3,0,0,3,'clear_top');});
  job('reset_and_recapture',({add,write,capture})=>{write(0,1,0,0,'dirty_source');capture(0,0,'dirty_operands');add('reset_closed',1,0,1,0,0,0);add('reset_capture_open',1,0,1,0,0,0,1);add('release_capture_open',1,0,0,0,0,0,1);add('close_after_release',1,0,0,0,0,0,0);write(3,1,3,0,'new_source');capture(3,0,'new_request');});
  job('held_operands_200',({add,write,capture})=>{write(0,1,0,1,'source0');write(1,0,0,1,'source1');capture(0,1,'request');write(0,0,0,1,'overwrite0');write(1,1,0,1,'overwrite1');add('long_hold_changed_reads',0,0,0,3,0,1);},200);
  return {jobs,trace_acceptance:{capture_close:'After each capture close, require both lock inputs high before any read address changes or RF write starts. Verify each captured Q remains unchanged throughout subsequent source overwrite and long hold.',reset:'Observe both operandQ reset, local clamps and locks; on closed reset release require local locks high before clamps fall. Complete end-of-tick traces do not exclude within-tick pulses.',disabled:'CAPTURE=0 is physically held closed; this fixture does not implement the final lane-enable qualification.'},warning:'External tests stage phases, but all data retention and read paths are physical. Automatic REQUEST/UPDATE controller remains separate. Input restoration alone does not reset stored registers or operands.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [output,coordinates]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/register-operands.mjs OUTPUT_DIRECTORY [x,y,z]');const xyz=coordinates?.split(',').map(Number);if(xyz&&xyz.length!==3)throw Error('origin must be x,y,z');const design=makeRegisterOperands(xyz?{origin:{x:xyz[0],y:xyz[1],z:xyz[2]}}:{}),tests=makeRegisterOperandsTests(design);mkdirSync(output,{recursive:true});for(const [name,value]of Object.entries({design,'build-tiles':design.tiles,circuit:design.circuit,'trace-acceptance':tests.trace_acceptance,...Object.fromEntries(tests.jobs.map(j=>[`test-${j.name}`,j.spec]))}))writeFileSync(join(output,`${name}.json`),JSON.stringify(value,null,2)+'\n');console.log(JSON.stringify({world_modified:false,box:design.box,blocks:design.blocks.length,tiles:design.tiles.length,signals:design.circuit.signals.length,inputs:design.inputs.length,jobs:tests.jobs.map(j=>({name:j.name,cases:j.spec.cases.length}))}));}
