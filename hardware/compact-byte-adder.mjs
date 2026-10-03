import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeCompactAdder} from './compact-adder.mjs';
import {makeCompactAdderChain} from './compact-adder-chain.mjs';
const key=p=>`${p.x},${p.y},${p.z}`,hash=url=>createHash('sha256').update(readFileSync(url)).digest('hex');

// Compose unchanged verified cells and the exact two-bit carry geometry. No
// byte-scale native correctness is inferred from that composition.
export function makeCompactByteAdder({origin={x:112,y:-44,z:-128},id='gpu_compact_add8'}={}){
 if(!['x','y','z'].every(k=>Number.isSafeInteger(origin[k])))throw Error('Integer floor origin required');
 if(!/^gpu_compact_[a-zA-Z0-9_-]+$/.test(id)||id.length>27)throw Error('Invalid circuit id');
 const p=(x,y,z)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
 const blocks=new Map(),inputs=[],signals=[],cells=[];
 for(let bit=0;bit<8;bit++){
  const cell=makeCompactAdder({origin:p(0,0,bit*28),id:`gpu_compact_byte_bit${bit}`});cells.push(cell);
  for(const b of cell.blocks){if(blocks.has(key(b.position)))throw Error('Cell overlap');blocks.set(key(b.position),b);}
  for(const input of cell.inputs)if(input.name!=='cin')inputs.push({...input,name:`${input.name}${bit}`});
  for(const name of ['sum','carry','partial'])signals.push({...cell.signals.find(s=>s.name===name),name:`bit${bit}_${name}`});
  signals.push({name:`cin${bit}`,position:cell.ports.cin.position,property:'powered'});
  for(const input of cell.inputs)if(input.name!=='cin')signals.push({name:`${input.name}${bit}`,position:input.position,property:'powered'});
 }
 // Derive carry-route additions and the higher Cin replacement from the frozen
 // two-bit generator, rather than transcribing its coordinates a second time.
 for(let lower=0;lower<7;lower++){
  const pair=makeCompactAdderChain({origin:p(0,0,lower*28),id:`gpu_compact_pair${lower}`});
  const sourceCells=new Map([...cells[lower].blocks,...cells[lower+1].blocks].map(b=>[key(b.position),b]));
  let replacements=0;
  for(const b of pair.blocks){
   const base=sourceCells.get(key(b.position));
   if(base&&JSON.stringify(base.block)===JSON.stringify(b.block))continue;
   const current=blocks.get(key(b.position));
   if(current){
    if(key(b.position)!==key(cells[lower+1].ports.cin.position)||current.block.id!=='minecraft:lever'||b.block.id!=='minecraft:repeater')throw Error('Unexpected link overlap');
    replacements++;
   }
   blocks.set(key(b.position),b);
  }
  if(replacements!==1)throw Error('Carry input replacement missing');
  signals.push({...pair.signals.find(s=>s.name==='carry_bridge'),name:`bridge${lower}`});
 }
 const box={from:p(0,0,-3),to:p(27,8,214)},all=[...blocks.values()],tiles=[];
 for(let z=-3;z<=214;z+=10)for(let x=0;x<=27;x+=8){
  const tileBox={from:p(x,0,z),to:p(Math.min(x+7,27),8,Math.min(z+9,214))};
  const tileId=`${id}_t${tiles.length}`;
  const operations=[
   {op:'fill',box:{from:{...tileBox.from,y:origin.y+1},to:tileBox.to},block:{id:'minecraft:air'}},
   {op:'fill',box:{from:tileBox.from,to:{...tileBox.to,y:origin.y}},block:{id:'minecraft:lime_concrete'}},
   ...all.filter(b=>b.position.x>=tileBox.from.x&&b.position.x<=tileBox.to.x&&b.position.z>=tileBox.from.z&&b.position.z<=tileBox.to.z).sort((a,b)=>a.position.y-b.position.y).map(b=>({op:'set',...b}))
  ];
  const writes=operations.reduce((n,o)=>n+(o.op==='set'?1:['x','y','z'].reduce((v,k)=>v*(o.box.to[k]-o.box.from[k]+1),1)),0);
  if(operations.length>128||writes>4096)throw Error('Native tile limit exceeded');
  tiles.push({box:tileBox,operations});
 }
 if(signals.length!==55||inputs.length!==16)throw Error('Interface mismatch');
 const floor=28*218,overrides=all.filter(b=>b.position.y===origin.y).length;
 return {status:'design_only_not_live_verified',id,origin,box,blocks:all,inputs,signals,tiles,
  circuit:{id,dimension:'minecraft:overworld',description:'Compact physical eight-bit ripple ADD; Cin0 fixed low',signals,buses:[
   {name:'sum',bits:Array.from({length:8},(_,i)=>`bit${i}_sum`)},
   {name:'result',bits:[...Array.from({length:8},(_,i)=>`bit${i}_sum`),'bit7_carry']},
   {name:'carry',bits:['bit7_carry']}]},
  ports:{fixed_cin:cells[0].ports.cin.position,inputs,sum:cells.map(c=>c.ports.sum),carry:cells[7].ports.carry},
  planned_counts:{floor_positions:floor,component_positions:all.length,floor_overrides:overrides,non_air_blocks:floor+all.length-overrides},
  source_hashes:{cell:hash(new URL('./compact-adder.mjs',import.meta.url)),carry_chain:hash(new URL('./compact-adder-chain.mjs',import.meta.url))},
  timing:{settle_ticks_per_phase:200,phases_per_vector:2,minimum_ticks:'unmeasured for eight cells'},
  scope:'ADD only. Byte routing, timing and signal correctness require native tests. No SUB/CMP hardware yet.'};
}

function expected(a,b){
 const e={sum:(a+b)&255,result:a+b,carry:(a+b)>>8};let carry=0;
 for(let bit=0;bit<8;bit++){
  const av=(a>>bit)&1,bv=(b>>bit)&1,total=av+bv+carry;
  Object.assign(e,{[`a${bit}`]:av,[`b${bit}`]:bv,[`cin${bit}`]:carry,[`bit${bit}_sum`]:total&1,[`bit${bit}_carry`]:total>>1,[`bit${bit}_partial`]:av^bv});
  carry=total>>1;if(bit<7)e[`bridge${bit}`]=carry;
 }
 return e;
}
export function makeCompactByteTests(d){
 const vectors={
  smoke:[[0,0],[1,1],[255,1],[255,255],[85,170],[127,1],[128,128],[0,0]],
  walking_a:[...Array.from({length:7},(_,i)=>[1<<i,0]),[128,0]],
  walking_b:[...Array.from({length:7},(_,i)=>[0,1<<i]),[0,128]],
  carry_prefix:[...Array.from({length:8},(_,i)=>[(1<<(i+1))-1,1])],
  carry_prefix_swapped:[...Array.from({length:8},(_,i)=>[1,(1<<(i+1))-1])],
  transitions:[[255,255],[0,0],[255,0],[0,255],[170,85],[170,170],[85,85],[0,0]]
 };
 return Object.fromEntries(Object.entries(vectors).map(([name,pairs])=>[name,{
  circuit_id:d.id,inputs:d.inputs,settle_ticks:200,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true,
  cases:pairs.flatMap(([a,b],i)=>{
   const inputs=Object.fromEntries(d.inputs.map(x=>[x.name,!!((x.name[0]==='a'?a:b)&(1<<Number(x.name.slice(1))))]));
   return [{name:`v${i}_a${a}_b${b}_propagate`,inputs,expect:{cin0:0}},{name:`v${i}_a${a}_b${b}_assert`,inputs,expect:expected(a,b)}];
  })
 }]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir=process.argv[2];if(!dir)throw Error('Usage: node hardware/compact-byte-adder.mjs OUTPUT_DIRECTORY');
 const d=makeCompactByteAdder(),tests=makeCompactByteTests(d),files={design:d,box:d.box,circuit:d.circuit,'input-positions':d.inputs.map(x=>x.position),'fixed-cin-position':[d.ports.fixed_cin],...Object.fromEntries(Object.entries(tests).map(([n,s])=>[n+'-test',s]))};
 mkdirSync(dir,{recursive:true});for(const[n,v]of Object.entries(files))writeFileSync(join(dir,n+'.json'),JSON.stringify(v,null,2)+'\n');
 console.log(JSON.stringify({world_modified:false,box:d.box,tiles:d.tiles.length,planned_counts:d.planned_counts,inputs:d.inputs.length,probes:d.signals.length,suites:Object.keys(tests),arithmetic_executions:Object.values(tests).reduce((n,s)=>n+s.cases.length/2,0)}));
}
