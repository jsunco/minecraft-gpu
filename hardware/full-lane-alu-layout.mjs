// First whole-lane geometry increment. No standalone fixture, tests, or native entry.
// Three complete byte bank pairs and one physically connected serial ADD loop.
// Mode selectors, conditioned addend, control qualification remain explicit gaps.
import assert from 'node:assert/strict';
import {makeSerialBankCoupon} from './serial-bank-coupon.mjs';
import {makeCompactAdder} from './compact-adder.mjs';

const axes=['x','y','z'],key=p=>axes.map(k=>p[k]).join(','),pos=(x,y,z)=>({x,y,z});
const facing={east:'west',west:'east',north:'south',south:'north'};
const solid=b=>b&&b.id.endsWith('_concrete');
function expand(ws){const ps=[pos(...ws[0])];for(let i=1;i<ws.length;i++){const a=ws[i-1],b=ws[i],delta=b.map((x,k)=>x-a[k]),n=Math.abs(delta[0])+Math.abs(delta[2]);assert(n&&(!delta[0]||!delta[2])&&(delta[1]===0||Math.abs(delta[1])===n));for(let j=1;j<=n;j++)ps.push(pos(...a.map((x,k)=>x+Math.sign(delta[k])*j)));}return ps;}
export function makeFullLaneAluLayout({faFloor="required"}={}){
 assert(["full","required"].includes(faFloor));
 const map=new Map(),owner={},blocksByModule={},replacements=[],routes=[],ports={};
 function insert(v,who){const k=key(v.position);assert(!map.has(k),'Collision '+k+' '+who+'/'+owner[k]);map.set(k,structuredClone(v));owner[k]=who;}
 const banks={};for(const[bank,offset]of [['W',0],['M',48],['Q',96]]){
  const d=makeSerialBankCoupon({bits:8,id:'lane_'+bank.toLowerCase()});banks[bank]={d,offset};
  for(const v of d.blocks)insert({position:{...v.position,x:v.position.x+offset},block:v.block},bank);
  ports[bank]={inputs:Object.fromEntries(d.inputs.map(v=>[v.name,{...v.position,x:v.position.x+offset}])),current:Array.from({length:8},(_,b)=>pos(offset+2,1,12*b)),next:Array.from({length:8},(_,b)=>pos(offset+12,1,12*(b+1))),current_aux:pos(offset+18,1,0),next_aux:pos(offset+18,1,6)};
  blocksByModule[bank]=d.blocks.length;
 }
 const fa=makeCompactAdder({origin:pos(48,0,-40),id:'gpu_compact_lane_fa'});
 const requiredFloor=new Set(fa.blocks.filter(v=>v.position.y===1).map(v=>key({...v.position,y:0})));
 for(let x=48;x<=72;x++)for(let z=-43;z<=-22;z++)if(faFloor==='full'||requiredFloor.has(key(pos(x,0,z))))insert({position:pos(x,0,z),block:{id:'minecraft:lime_concrete'}},'full_adder');
 for(const v of fa.blocks){const k=key(v.position);if(map.has(k)){assert.equal(v.position.y,0);map.set(k,structuredClone(v));}else insert(v,'full_adder');}
 blocksByModule.full_adder=[...Object.values(owner)].filter(v=>v==='full_adder').length;
 function support(p,net){const q={...p,y:p.y-1},old=map.get(key(q));if(old){assert(solid(old.block),'Non-solid support '+key(q)+' '+net);return;}insert({position:q,block:{id:'minecraft:light_gray_concrete'}},net);}
 function component(p,id,props,net){support(p,net);insert({position:p,block:{id:'minecraft:'+id,...(props?{properties:props}:{})}},net);}
 function rep(p,d,net){component(p,'repeater',{facing:facing[d],delay:'1'},net);}
 function replace(p,b,why){const k=key(p),old=map.get(k);assert.equal(old?.block.id,'minecraft:lever',k);replacements.push({position:p,before:old.block,after:b,reason:why});map.set(k,{position:p,block:b});}
 function route(ws,net){const ps=expand(ws),candidates=[-1];for(let i=1;i<ps.length-1;i++){const a=ps[i-1],b=ps[i],c=ps[i+1];if(a.y===b.y&&b.y===c.y&&b.x-a.x===c.x-b.x&&b.z-a.z===c.z-b.z)candidates.push(i);}candidates.push(ps.length);
  const cost=new Map([[-1,0]]),prev=new Map();for(const b of candidates.slice(1))for(const a of candidates){if(a>=b)break;if(!cost.has(a)||b-a>13)continue;const n=cost.get(a)+(b===ps.length?0:1);if(n<(cost.get(b)??Infinity)){cost.set(b,n);prev.set(b,a);}}
  assert(prev.has(ps.length),'Unrefreshable '+net);let at=prev.get(ps.length),chosen=[];while(at!==-1){chosen.push(at);at=prev.get(at);}chosen.reverse();
  for(let i=0;i<ps.length;i++){const p=ps[i];if(chosen.includes(i)){const q=ps[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north',net);}else component(p,'redstone_wire',undefined,net);}
  routes.push({net,positions:ps,refresh_indices:chosen});
 }
 // Isolated taps leave the bank's pre-existing wrap and feedback consumers intact.
 rep(pos(3,1,-1),'north','W0_to_FA');
 route([[3,1,-2],[3,9,-10],[3,9,-13],[3,11,-15],[3,11,-40],[36,11,-40],[46,1,-40]],'W0_to_FA');
 rep(pos(47,1,-40),'east','W0_to_FA');replace(pos(48,1,-40),{id:'minecraft:redstone_wire'},'Physical W0 input; removed inherited diagnostic source.');
 rep(pos(51,1,-1),'north','M0_ADD_ONLY_to_FA');
 route([[51,1,-2],[51,9,-10],[51,9,-13],[51,15,-19],[51,15,-52],[29,15,-52],[29,15,-32],[37,7,-32],[40,7,-32],[46,1,-32]],'M0_ADD_ONLY_to_FA');
 rep(pos(47,1,-32),'east','M0_ADD_ONLY_to_FA');replace(pos(48,1,-32),{id:'minecraft:redstone_wire'},'ADD-only direct addend. Future enable/XOR conditioner must replace this route, not coexist with it.');
 rep(pos(19,1,-1),'north','C_to_FA');
 route([[19,1,-2],[19,9,-10],[19,9,-13],[19,17,-21],[19,17,-24],[19,19,-26],[19,19,-60],[37,19,-60],[37,19,-30],[45,11,-30],[48,11,-30],[56,3,-30],[59,3,-30],[60,2,-30]],'C_to_FA');
 rep(pos(60,2,-31),'north','C_to_FA');replace(pos(60,1,-32),{id:'minecraft:light_gray_concrete'},'Dust above strongly powers the old Cin source block; its original two consumers remain.');
 component(pos(60,2,-32),'redstone_wire',undefined,'C_to_FA');
 rep(pos(62,1,-21),'south','FA_carry_to_Cnext');
 route([[62,1,-20],[62,9,-12],[62,9,-9],[62,17,-1],[62,17,2],[62,23,8],[-14,23,8],[-14,23,6],[-6,15,6],[-3,15,6],[5,7,6],[8,7,6],[14,1,6]],'FA_carry_to_Cnext');
 rep(pos(15,1,6),'east','FA_carry_to_Cnext');replace(pos(16,1,6),{id:'minecraft:redstone_wire'},'ADD-only carry feedback. Seed0/seed1/carry selector still required here.');
 rep(pos(73,1,-36),'east','FA_sum_to_Wnext');
 route([[74,1,-36],[82,9,-36],[85,9,-36],[87,11,-36],[87,11,108],[30,11,108],[20,1,108]],'FA_sum_to_Wnext');
 rep(pos(20,1,109),'south','FA_sum_to_Wnext');replace(pos(20,1,110),{id:'minecraft:redstone_wire'},'Physical sum feeds W serial high-bit input.');
 const blocks=[...map.values()],box={from:Object.fromEntries(axes.map(k=>[k,Math.min(...blocks.map(v=>v.position[k]))])),to:Object.fromEntries(axes.map(k=>[k,Math.max(...blocks.map(v=>v.position[k]))]))};
 const hist={};for(const v of blocks)hist[v.block.id]=(hist[v.block.id]??0)+1;
 return{status:'whole_lane_geometry_increment_incomplete_not_buildable',fa_floor:{policy:faFloor,original_floor:550,required_positions:requiredFloor.size,removed_positions:faFloor==='full'?0:550-requiredFloor.size,rule:'Retain every old floor cell with any original Y1 block above it, including solid stair supports; all removed cells had air above. New derivative still requires electrical/native checks.'},scope:'Three real8-bit current/next banks+aux and physically routed ADD bit-loop; not autonomous and not a complete multi-mode ALU.',blocks,owner,box,ports,fa_ports:fa.ports,routes,replacements,metrics:{blocks:blocks.length,banks:blocksByModule,added_routes_and_adapters:blocks.length-Object.values(blocksByModule).reduce((a,b)=>a+b,0),state_bits_in_geometry:54,retained_manual_source_positions:blocks.filter(v=>v.block.id==='minecraft:lever').length,dimensions:Object.fromEntries(axes.map(k=>[k,box.to[k]-box.from[k]+1])),bounding_volume:axes.reduce((n,k)=>n*(box.to[k]-box.from[k]+1),1),histogram:hist},mapped_nets:['W/M/Q internal right-shift/rotate/load, next-to-current and auxiliary feedback','W0 -> full-adder A','M0 -> full-adder B (ADD-only bypass)','C -> full-adder Cin','sum -> W serial input','carry_out -> W auxiliary input (missing initialization selection)'],missing_geometry:['Replace diagnostic levers with source-bound receiving ports and root operand/control routes.','W/M/Q multi-mode parallel muxes: initialization, pass-init self-copy, left shifts, Q final result, CMP output.','M0 enable-before-XOR subtract conditioner; remove the direct ADD-only bypass.','Carry seed0/seed1/adder selection; NZ OR+clear; T8/take selection and OR.','Fixed W/Q rotate0 and M rotate1 without relying on host mode writes.','Divisor-zero detector, CMP packing and busy/ready/fault storage and qualification.','Physical phase controller, counters, reset/clear, per-lane enable/fault gating, final result/ack.','Ports carrying A/B from actual lane-register terminals, result to writeback/PC, and all control fanout.','Complete electrical contact/strength audit and dynamic/native gates for the combined map.'],native_calls:0,build_plans_emitted:false};
}
