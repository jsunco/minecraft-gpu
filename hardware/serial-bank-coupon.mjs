// Proposed current/next serial bank. Offline generator; no world/service imports.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const key=p=>[p.x,p.y,p.z].join(',');
const pos=(x,y,z)=>({x,y,z}),axes=['x','y','z'];
const F={east:'west',west:'east',north:'south',south:'north'};
const solid=b=>b&&b.id==='minecraft:light_gray_concrete';
const direction=(a,b)=>{const dx=b.x-a.x,dz=b.z-a.z;assert.equal(a.y,b.y);return dx===1?'east':dx===-1?'west':dz===1?'south':'north';};
function expand(ws){const ps=[pos(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],d=b.map((v,j)=>v-a[j]),n=Math.abs(d[0])+Math.abs(d[2]);assert(n&&(!d[0]||!d[2])&&(d[1]===0||Math.abs(d[1])===n));for(let j=1;j<=n;j++)ps.push(pos(...a.map((v,k)=>v+Math.sign(d[k])*j)));}return ps;}
export function makeSerialBankCoupon({bits=2,id='serial_bank2'}={}){
 assert(Number.isSafeInteger(bits)&&bits>=2&&bits<=8);assert(/^[a-z][a-z0-9_]{0,20}$/.test(id));
 const map=new Map(),wiring={},inputs=[],signals=[],paths=[],L=12*bits;
 function put(p,b,net,role){const k=key(p),old=map.get(k);if(old){assert.deepEqual(old.block,b,'Collision '+k+' '+role);assert.equal(wiring[k]?.net,net,'Foreign overlap '+k);return p;}map.set(k,{position:p,block:b});wiring[k]={net,role};return p;}
 function support(p){const b=pos(p.x,p.y-1,p.z),old=map.get(key(b));if(old){assert(solid(old.block),'Non-solid support '+key(b));return;}map.set(key(b),{position:b,block:{id:'minecraft:light_gray_concrete'}});wiring[key(b)]={net:null,role:'support'};}
 function component(x,y,z,name,properties,net,role=name){const p=pos(x,y,z);support(p);return put(p,{id:'minecraft:'+name,...(properties?{properties}:{})},net,role);}
 const wire=(x,y,z,net)=>component(x,y,z,'redstone_wire',undefined,net);
 const rep=(x,y,z,travel,net,role='repeater')=>component(x,y,z,'repeater',{facing:F[travel],delay:'1'},net,role);
 function lever(name,x,y,z){const p=component(x,y,z,'lever',{face:'floor',facing:'west',powered:'false'},name,'fixture_source');inputs.push({name,position:p});return p;}
 function probe(name,p,property='powered'){signals.push({name,position:p,property});}
 function invertedControl(name,x,y,z,travel,outX,net){lever(name,x,y,z);const dx=travel==='east'?1:-1;rep(x+dx,y,z,travel,name);const block=pos(x+2*dx,y,z);support(block);put(block,{id:'minecraft:light_gray_concrete'},name,'inverter_block');put(pos(x+3*dx,y,z),{id:'minecraft:redstone_wall_torch',properties:{facing:travel}},net,'default_closed_inverter');wire(outX,y,z,net);}
 function route(ws,net){const ps=expand(ws),candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1];if(a.y===b.y&&b.y===c.y&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z&&!map.has(key(b)))candidates.push(i);}candidates.push(ps.length);
  const count=new Map([[-1,0]]),prev=new Map();for(const b of candidates.slice(1))for(const a of candidates){if(a>=b)break;if(!count.has(a)||b-a>13)continue;const n=count.get(a)+(b===ps.length?0:1);if(n<(count.get(b)??Infinity)){count.set(b,n);prev.set(b,a);}}
  assert(prev.has(ps.length),'Unrefreshable route '+net);let at=prev.get(ps.length),chosen=[];while(at!==-1){chosen.push(at);at=prev.get(at);}chosen.reverse();
  ps.forEach((p,i)=>chosen.includes(i)?rep(p.x,p.y,p.z,direction(p,ps[i+1]),net,'route_refresh'):wire(p.x,p.y,p.z,net));paths.push({net,waypoints:ws,positions:ps,refresh_indices:chosen});return ps;
 }
 function latch(name,x,z,net){rep(x-1,1,z,'east',net,'normalized_local_D');const q=rep(x,1,z,'east',name,'storage');wire(x+1,1,z,name);const lock=rep(x,1,z+1,'north',name.startsWith('next')?'HOLD_N':'HOLD_C','side_lock');probe(name,q);probe('d_'+name,pos(x-1,1,z));probe('lock_'+name,lock);}
 // Repeated accepted locked-repeater motif, new integration/routing unproved.
 for(let b=0;b<bits;b++){latch('current'+b,2,12*b,'next'+b);latch('next'+b,12,12*(b+1),'selected'+b);}
 latch('carry',18,0,'next_carry');latch('next_carry',18,6,'carry_in');lever('carry_in',16,1,6);
 // Default low OPEN means high HOLD. Two-phase interlock is not implemented.
 invertedControl('open_current',-8,1,-6,'east',-4,'HOLD_C');
 for(let z=-5;z<=12*(bits-1)+2;z++)z%12===5?rep(-4,1,z,'south','HOLD_C'):wire(-4,1,z,'HOLD_C');
 for(let b=0;b<bits;b++){const z=12*b+2;rep(-3,1,z,'east','HOLD_C');for(let x=-2;x<=2;x++)wire(x,1,z,'HOLD_C');}
 for(let x=3;x<=18;x++)[7,15].includes(x)?rep(x,1,2,'east','HOLD_C'):wire(x,1,2,'HOLD_C');
 invertedControl('open_next',26,4,-6,'west',22,'HOLD_N');
 for(let z=-5;z<=L+2;z++)z%12===5?rep(22,4,z,'south','HOLD_N'):wire(22,4,z,'HOLD_N');
 for(let b=0;b<bits;b++){const z=12*(b+1)+2;rep(21,4,z,'west','HOLD_N');for(let x=20;x>=16;x--)wire(x,4,z,'HOLD_N');wire(15,3,z,'HOLD_N');wire(14,2,z,'HOLD_N');wire(13,1,z,'HOLD_N');wire(12,1,z,'HOLD_N');}
 rep(21,4,8,'west','HOLD_N');route([[20,4,8],[20,1,11],[18,1,11],[18,1,8]],'HOLD_N');
 // Next-to-current feedback: a locked next bank supplies current throughout commit.
 for(let b=0;b<bits;b++){const z=12*(b+1),c=12*b;route([[13,1,z],[13,5,z-4],[-4,5,z-4],[-4,5,c],[0,1,c]],'next'+b);}
 route([[19,1,6],[19,5,2],[12,5,2],[12,5,-4],[8,1,-4],[8,1,0],[16,1,0]],'next_carry');
 // One shared LOAD rail; each selector has its own physical !LOAD inverter.
 lever('load',16,1,8);rep(16,1,9,'south','load');for(let z=10;z<=L+6;z++)z%12===7?rep(16,1,z,'south','load'):wire(16,1,z,'load');
 for(let b=0;b<bits;b++){
  const z=12*(b+1),step=b<bits-1?'current'+(b+1):'top_selected';
  if(b<bits-1)route([[3,1,z],[4,1,z],[4,1,z-2]],step);
  lever('p'+b,4,1,z+2);
  for(const[row,net,mask]of[[z-2,step,'load'],[z+2,'p'+b,'NOT_LOAD'+b]]){rep(5,1,row,'east',net);wire(6,1,row,net);component(7,1,row,'comparator',{facing:'west',mode:'subtract'},'pass_'+net,'selector');rep(8,1,row,'east','pass_'+net,'isolated_branch');}
  for(let row=z-2;row<=z+2;row++)wire(9,1,row,'selected'+b);rep(10,1,z,'east','selected'+b);
  rep(15,1,z-4,'west','load');for(let x=14;x>=7;x--)wire(x,1,z-4,'load');rep(7,1,z-3,'south','load','selector_mask');
  rep(15,1,z+6,'west','load');wire(14,1,z+6,'load');rep(13,1,z+6,'west','load');const p=pos(12,1,z+6);support(p);put(p,{id:'minecraft:light_gray_concrete'},'load','inverter_block');put(pos(11,1,z+6),{id:'minecraft:redstone_wall_torch',properties:{facing:'west'}},'NOT_LOAD'+b,'load_inverter');for(let x=10;x>=7;x--)wire(x,1,z+6,'NOT_LOAD'+b);wire(7,1,z+5,'NOT_LOAD'+b);wire(7,1,z+4,'NOT_LOAD'+b);rep(7,1,z+3,'north','NOT_LOAD'+b,'selector_mask');
 }
 // Real C0 wrap wire plus serial-in selector. Neither is a software-maintained bit.
 rep(4,1,0,'east','current0');route([[5,1,0],[12,8,0],[12,8,L+3],[20,8,L+3],[20,1,L+10]],'current0');
 lever('serial_in',20,1,L+14);
 const center=L+12;
 for(const[row,net]of[[center-2,'current0'],[center+2,'serial_in']]){rep(19,1,row,'west',net);wire(18,1,row,net);component(17,1,row,'comparator',{facing:'east',mode:'subtract'},'top_pass_'+net,'selector');rep(16,1,row,'west','top_pass_'+net,'isolated_branch');}
 for(let z=center-2;z<=center+2;z++)wire(15,1,z,'top_selected');rep(14,1,center,'west','top_selected');route([[13,1,center],[-2,1,center],[-2,1,L-2],[4,1,L-2]],'top_selected');
 // ROTATE=1 selects wrap; ROTATE=0 selects external serial_in.
 lever('rotate',24,1,center+6);rep(23,1,center+6,'west','rotate');for(let x=22;x>=17;x--)wire(x,1,center+6,'rotate');wire(17,1,center+5,'rotate');wire(17,1,center+4,'rotate');rep(17,1,center+3,'north','rotate','selector_mask');
 rep(24,1,center+5,'north','rotate');const rb=pos(24,1,center+4);support(rb);put(rb,{id:'minecraft:light_gray_concrete'},'rotate','inverter_block');put(pos(24,1,center+3),{id:'minecraft:redstone_wall_torch',properties:{facing:'north'}},'NOT_ROTATE','rotate_inverter');route([[24,1,center+2],[24,1,center-5],[17,1,center-5],[17,1,center-4]],'NOT_ROTATE');rep(17,1,center-3,'south','NOT_ROTATE','selector_mask');
 for(const i of inputs.filter(v=>!v.name.startsWith('p')))probe('raw_'+i.name,i.position);
 const baseSignals=structuredClone(signals);const allSignals=[...signals,...inputs.filter(v=>v.name.startsWith('p')).map(v=>({name:'raw_'+v.name,position:v.position,property:'powered'}))];
 const buses=[{name:'current',bits:Array.from({length:bits},(_,b)=>'current'+b)},{name:'next',bits:Array.from({length:bits},(_,b)=>'next'+b)}];
 const circuit={id,dimension:'minecraft:overworld',description:'Proposed two-phase retained current/next shift/load bank plus independent carry. No ALU, phase controller or physical interlock.',signals:allSignals.length<=64?allSignals:baseSignals,buses};
 const portsCircuit={id:id+'_ports',dimension:'minecraft:overworld',description:'Actual fixture data and mode sources; separate observation scope for wide cost derivative.',signals:inputs.map(v=>({name:'raw_'+v.name,position:v.position,property:'powered'})),buses:[{name:'parallel',bits:Array.from({length:bits},(_,b)=>'raw_p'+b)}]};
 const blocks=[...map.values()],box={from:Object.fromEntries(axes.map(k=>[k,Math.min(...blocks.map(v=>v.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...blocks.map(v=>v.position[k]))]))};
 const tiles=[];for(let y=box.from.y;y<=box.to.y;y+=2){let z=box.from.z;while(z<=box.to.z){let best;for(let end=z;end<=box.to.z;end++){const b={from:pos(box.from.x,y,z),to:pos(box.to.x,Math.min(y+1,box.to.y),end)},items=blocks.filter(v=>axes.every(k=>v.position[k]>=b.from[k]&&v.position[k]<=b.to[k]));if(items.length>128||axes.reduce((n,k)=>n*(b.to[k]-b.from[k]+1),1)>4096)break;best={b,items,end};}assert(best);z=best.end+1;if(!best.items.length)continue;best.items.sort((a,b)=>a.position.y-b.position.y||Number(!solid(a.block))-Number(!solid(b.block))||a.position.z-b.position.z||a.position.x-b.position.x);const tid=id+'_t'+tiles.length;tiles.push({region:{id:tid,dimension:'minecraft:overworld',box:best.b,description:'Unplaced current/next bank; sparse supported vanilla components'},plan:{id:tid,region_id:tid,label:'Current/next feedback coupon',operations:best.items.map(v=>({op:'set',...v}))}});}}
 const histogram={};for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return{status:'draft_offline_routed_candidate_unverified',bits,id,box,blocks,tiles,inputs,circuit,ports_circuit:portsCircuit,wiring,paths,metrics:{blocks:blocks.length,tiles:tiles.length,storage_bits:2*(bits+1),inputs:inputs.length,signals:circuit.signals.length,histogram,dimensions:Object.fromEntries(axes.map(k=>[k,box.to[k]-box.from[k]+1])),volume:axes.reduce((n,k)=>n*(box.to[k]-box.from[k]+1),1)},semantics:{next:'OPEN_NEXT captures LOAD?parallel:((current>>1)|((ROTATE?current0:serial_in)<<(bits-1))); next_carry captures carry_in.',current:'OPEN_CURRENT commits held next and next_carry through physical feedback.',hold:'Both OPEN controls false closes all stores after propagation.',forbidden:'Both OPEN controls high is unsafe; no physical interlock is implemented.',initialize:'LOAD plus zero parallel/carry, capture NEXT, close NEXT, commit CURRENT, close CURRENT. No independent asynchronous reset.',scope:'External parallel/serial/carry sources are diagnostic/future ALU ports, not software running the GPU.'}};
}
export function makeSerialBankTests(design){
 assert.equal(design.bits,2,'Only the bounded two-bit physical proposal has stimuli');
 const zero=Object.fromEntries(design.inputs.map(i=>[i.name,false])),cases=[];
 let input={...zero},current=null,next=null,carry=null,nextCarry=null;
 function expected(){const o={};
  const d=next,selected=input.load?Number(input.p0)+2*Number(input.p1):(current===null?null:(current>>1)|((input.rotate?(current&1):Number(input.serial_in))<<1));
  for(let b=0;b<2;b++)for(const[n,v]of [['current',current],['next',next],['d_current',d],['d_next',selected]])if(v!==null)o[n+b]=(v>>b)&1;
  if(carry!==null)o.carry=carry;if(nextCarry!==null){o.next_carry=nextCarry;o.d_carry=nextCarry;}o.d_next_carry=Number(input.carry_in);
  for(const name of ['current0','current1','carry'])o['lock_'+name]=Number(!input.open_current);
  for(const name of ['next0','next1','next_carry'])o['lock_'+name]=Number(!input.open_next);
  for(const[n,v]of Object.entries(input))o['raw_'+n]=Number(v);
  if(current!==null)o.current=current;if(next!==null)o.next=next;return o;
 }
 function add(name,change={},scope={}){input={...input,...change};assert(!(input.open_current&&input.open_next));
  if(input.open_next){next=input.load?Number(input.p0)+2*Number(input.p1):(current>>1)|((input.rotate?(current&1):Number(input.serial_in))<<1);nextCarry=Number(input.carry_in);}
  if(input.open_current){assert(next!==null&&nextCarry!==null);current=next;carry=nextCarry;}
  cases.push({name,inputs:{...input},expect:expected(),scope});
 }
 function initialize(data=0,c=0){current=next=carry=nextCarry=null;input={...zero};add('both_closed_parallel_sources',{load:true,p0:!!(data&1),p1:!!(data&2),carry_in:!!c});add('initialize_next',{open_next:true});add('close_initialized_next',{open_next:false});add('initialize_current',{open_current:true});add('close_initialized_current',{open_current:false});}
 function op(label,changes){add(label+'_prepare_closed',changes);add(label+'_capture_next',{open_next:true});add(label+'_close_next',{open_next:false});add(label+'_commit_current',{open_current:true});add(label+'_close_current',{open_current:false});}
 const jobs=[];function finish(label){const rows=cases.splice(0);assert(rows.length<=20);const exit={current,next,carry,next_carry:nextCarry};jobs.push({index:jobs.length,label,entry:'Unknown retained state; first five phases close/init next then current.',exit,phases:rows.map(({name,scope})=>({name,...scope})),spec:{circuit_id:design.id,inputs:design.inputs,cases:rows.map(({scope,...c})=>c),settle_ticks:200,timeout_ms:65000,stop_on_failure:true,restore_inputs:true,trace:true}});}
 initialize(1,1);op('rotate_once',{load:false,rotate:true});op('rotate_twice',{carry_in:false});op('clear',{load:true,p0:false,p1:false,carry_in:false});finish('parallel_load_and_two_rotations');
 initialize(2,0);op('shift_in_one',{load:false,rotate:false,serial_in:true,carry_in:true});op('shift_in_zero',{serial_in:false,carry_in:false});op('clear',{load:true,p0:false,p1:false,carry_in:false});finish('serial_injection_edges');
 initialize(3,1);
 add('prepare_next_opposite_local_D',{p0:false,p1:false,carry_in:false});add('hold_next_opposite_200',{}, {continuous_hold:{bank:'next',actual_local_D:0,stored:3,carry_D:0,stored_carry:1,minimum_ticks_after_prior_checkpoint:200}});
 add('capture_opposite_next',{open_next:true});add('close_opposite_next',{open_next:false});add('hold_current_opposite_200',{}, {continuous_hold:{bank:'current',actual_local_D:0,stored:3,carry_D:0,stored_carry:1,minimum_ticks_after_prior_checkpoint:200}});
 add('commit_zero',{open_current:true});add('unchanged_open_current_200',{}, {stable_zero_open_current:true,no_repeat_feedback_proof:false});add('close_current_zero',{open_current:false});finish('both_banks_opposite_D_hold_and_clear');
 return jobs;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const bits=Number(process.argv[2]??2),out=process.argv[3];const d=makeSerialBankCoupon({bits,id:'serial_bank'+bits});if(out){mkdirSync(out,{recursive:true});writeFileSync(join(out,'design.json'),JSON.stringify(d,null,2)+'\n');if(bits===2)writeFileSync(join(out,'tests.json'),JSON.stringify(makeSerialBankTests(d),null,2)+'\n');}console.log(JSON.stringify(d.metrics));}
