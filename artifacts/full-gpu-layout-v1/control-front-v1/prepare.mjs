// Connected local instruction front end. Offline layout, no service or runtime.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {makeQualifiedCore} from '../control-core-v2/prepare.mjs';
import {makeFetchControl} from '../control-fetch-v1/prepare.mjs';
import {makeHeldIR} from '../control-held-ir-v1/prepare.mjs';
import {makeStateBank} from '../../../hardware/full-gpu-state-bank.mjs';
import {makeSignalDescent} from '../../../hardware/full-gpu-signal-descent.mjs';
import {materializeInstance} from '../../../hardware/gpu-layout-assembly.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'},V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]};
export function makeFront(){const map=new Map(),parents={},edges=[],routes=[],columns=[],connections=[];let part='';
 const at=p=>map.get(K(p));
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+part+' '+K(p)+' existing '+at(p)?.part);map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid(P(p.x,p.y-1,p.z));put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d,delay='1')=>dev(p,'repeater',{facing:F[d],delay}),cmp=p=>dev(p,'comparator',{facing:'west',mode:'subtract'}),edge=(a,b)=>edges.push({from:a,to:b});
 function insert(name,d,translation){const moved=materializeInstance(d,{id:name,translation});for(const v of moved.blocks){assert(!at(v.position),'Parent overlap '+name+' '+K(v.position)+' '+at(v.position)?.part);map.set(K(v.position),{...v,part:name});}parents[name]={source:d,placed:moved,translation};return moved;}
 const baseCore=makeQualifiedCore(),baseFetch=makeFetchControl(),baseIR=makeHeldIR();
 for(const[n,d]of [['control-core-v2',baseCore],['control-fetch-v1',baseFetch],['control-held-ir-v1',baseIR]])assert.deepEqual(d,JSON.parse(readFileSync(new URL('../'+n+'/design.json',import.meta.url))),'Frozen parent drift '+n);
 const core=insert('core',baseCore,P(0,0,0)),fetch=insert('fetch',baseFetch,P(80,0,170)),ir=insert('ir',baseIR,P(120,0,80)),intents=insert('intents',makeStateBank({width:2,pair:false}),P(-40,0,90));
 function route(name,ws,{branches=[]}={}){part=name;const path=[P(...ws[0])];for(let n=1;n<ws.length;n++){const a=ws[n-1],b=ws[n],delta=b.map((v,i)=>v-a[i]),steps=Math.abs(delta[0])+Math.abs(delta[2]);assert(steps&&(!delta[0]||!delta[2])&&(!delta[1]||Math.abs(delta[1])===steps),'Invalid segment '+name);for(let i=1;i<=steps;i++)path.push(P(...a.map((v,k)=>v+Math.sign(delta[k])*i)));}
 const forbidden=new Set(branches.map(K)),candidates=[-1];for(let i=1;i<path.length-1;i++){const a=path[i-1],p=path[i],b=path[i+1];if(!at(p)&&!forbidden.has(K(p))&&a.y===p.y&&b.y===p.y&&p.x-a.x===b.x-p.x&&p.z-a.z===b.z-p.z)candidates.push(i);}candidates.push(path.length);const costs=new Map([[-1,0]]),prev=new Map();for(const end of candidates.slice(1))for(const start of candidates){if(start>=end)break;if(!costs.has(start)||end-start>12)continue;const cost=costs.get(start)+(end===path.length?0:1);if(cost<(costs.get(end)??Infinity)){costs.set(end,cost);prev.set(end,start);}}assert(prev.has(path.length),'Unrefreshable '+name+' reachableEnd '+Math.max(...costs.keys())+' of '+path.length+' '+JSON.stringify(path.slice(Math.max(0,Math.max(...costs.keys())-2),Math.max(...costs.keys())+20)));const refresh=[];for(let x=prev.get(path.length);x!==-1;x=prev.get(x))refresh.push(x);
 for(let i=0;i<path.length;i++){const p=path[i];if(at(p)){assert(i===0||i===path.length-1,'Internal overlap '+name+' '+K(p));assert.equal(at(p).block.id,'minecraft:redstone_wire');}else if(refresh.includes(i)){const q=path[i+1];rep(p,q.x>p.x?'east':q.x<p.x?'west':q.z>p.z?'south':'north');}else wire(p);if(i)edge(path[i-1],p);}routes.push({name,path,refresh_indices:refresh.sort((a,b)=>a-b)});return path;}
 function tower(name,x,z,bottom,top,{wireTop=false}={}){part=name;assert((top-bottom)%2===1);for(let y=bottom;y<top;y++)if((y-bottom)%2===0)solid(P(x,y,z));else put(P(x,y,z),'redstone_torch');put(P(x,top,z),wireTop?'redstone_wire':'redstone_torch');columns.push({name,x,z,bottom,top,wire_top:wireTop});}
 const fd=insert('fetch_decode_descent',makeSignalDescent({drop:12}),P(48,13,0));
 // Sample stable CURRENT decode during A. The raw onehot is never the
 // memory-valid source. Actual current storage is closed throughout this phase.
 for(let s=1;s<=6;s++){const y=1+8*s;part='state_tap_'+s;rep(P(14,y,5),'north');wire(P(14,y,4));edge(P(14,y,6),P(14,y,5));edge(P(14,y,5),P(14,y,4));
  route('state_escape_'+s,[[14,y,4],[14,y+4,0],[s===1?48:60,y+4,0]]);
 }
 // One physically routed OR of DECODE through UPDATE. Every stage injects
 // into a positive block, with two inversions between 4Y-spaced positives.
 tower('operation_held_or',64,0,21,56);for(let s=2;s<=6;s++){const y=5+8*s;part='operation_injection_'+s;rep(P(61,y,0),'east');wire(P(62,y,0));rep(P(63,y,0),'east');for(let x=60;x<64;x++)edge(P(x,y,0),P(x+1,y,0));}
 part='operation_export';rep(P(65,56,0),'east');wire(P(66,56,0));edge(P(64,56,0),P(65,56,0));edge(P(65,56,0),P(66,56,0));
 const od=insert('operation_descent',makeSignalDescent({drop:55}),P(68,56,0));route('operation_to_descent',[[66,56,0],[68,56,0]]);
 // Two normalized clear masks before the two real intent D receivers.
 for(const y of[1,5]){part='intent_data_clamp_'+y;wire(P(-46,y,90));rep(P(-45,y,90),'east');cmp(P(-44,y,90));wire(P(-43,y,90));rep(P(-42,y,90),'east');wire(P(-41,y,90));for(let x=-46;x<-40;x++)edge(P(x,y,90),P(x+1,y,90));wire(P(-44,y,88));rep(P(-44,y,89),'south');for(let z=87;z<90;z++)edge(P(-44,y,z),P(-44,y,z+1));}
 tower('intent_initialize',-44,87,-2,5);part='intent_initialize_entry';rep(P(-44,-2,86),'south');wire(P(-44,-2,85));edge(P(-44,-2,85),P(-44,-2,86));edge(P(-44,-2,86),P(-44,-2,87));
 // Descent exports are isolated at their parent terminal before long returns.
 route('fetch_state_to_intent',[[48,1,-3],[48,1,-12],[48,1,-16],[48,-7,-24],[40,-7,-24],[-60,-7,-24],[-60,-7,80],[-52,1,80],[-52,1,90],[-46,1,90]]);
 route('operation_state_to_intent',[[67,1,6],[64,1,6],[64,1,72],[-54,1,72],[-54,5,76],[-54,5,86],[-50,5,86],[-50,5,90],[-46,5,90]]);
 // Existing qualified NEXT-open branches to the intent bank. Initialization
 // enables this phase even when ordinary work is stopped.
 part='intent_open_branch';rep(P(-74,5,15),'north');wire(P(-74,5,14));edge(P(-74,5,16),P(-74,5,15));edge(P(-74,5,15),P(-74,5,14));
 route('qualified_intent_open',[[-74,5,14],[-114,5,14],[-114,5,115],[-114,0,120],[-46,0,120],[-46,0,93],[-40,0,93]]);
 // Initializer fanout must arrive before the complete initialization transfer.
 part='initialize_branch';rep(P(-100,1,-9),'north');wire(P(-100,1,-10));edge(P(-100,1,-8),P(-100,1,-9));edge(P(-100,1,-9),P(-100,1,-10));
 route('initialize_intent_clear',[[-100,1,-10],[-108,1,-10],[-108,-2,-13],[-122,-2,-13],[-122,-2,85],[-44,-2,85]]);
 // Fetch starts only after the prior operation's long IR-valid tail is low.
 part='fetch_tail_gate';wire(P(-28,1,90));rep(P(-27,1,90),'east');cmp(P(-26,1,90));wire(P(-25,1,90));rep(P(-24,1,90),'east');wire(P(-23,1,90));for(let x=-28;x<-23;x++)edge(P(x,1,90),P(x+1,1,90));wire(P(-26,1,88));rep(P(-26,1,89),'south');edge(P(-26,1,88),P(-26,1,89));edge(P(-26,1,89),P(-26,1,90));
 route('fetch_intent_to_gate',[[-35,1,90],[-28,1,90]]);
 route('fetch_request_connection',[[-23,1,90],[-18,1,90],[-18,1,114],[70,1,114],[70,1,170],[78,1,170]]);
 route('held_operation_connection',[[-35,5,90],[-31,5,90],[-31,1,94],[-31,1,102],[-31,-7,110],[254,-7,110],[254,-7,-74],[160,-7,-74],[160,-7,-72],[160,1,-64],[160,1,-60]]);
 route('fetch_to_ir_open',[[122,1,180],[122,1,186],[274,1,186],[274,1,-84],[160,1,-84],[160,1,-68]]);
 route('ir_tail_to_fetch_gate',[[264,1,-52],[268,1,-52],[268,1,-56],[268,-5,-62],[276,-5,-62],[276,-11,-68],[284,-11,-68],[284,-11,122],[-4,-11,122],[-4,-11,100],[-4,-5,94],[4,-5,94],[4,1,88],[4,1,84],[-26,1,84],[-26,1,88]]);
 // The held opcode RET terminal is returned to the core's actual UPDATE
 // selector. It remains combinational from locked IR, not a second flag store.
 const rd=insert('ret_descent',makeSignalDescent({drop:75}),P(184,124,72));
 route('ret_to_descent',[[174,124,82],[174,124,76],[184,124,76],[184,124,72]]);
 route('ret_to_core',[[193,49,72],[196,49,72],[196,49,78],[54,49,78],[54,49,28],[18,49,28]]);
 // RESET physically reaches both core qualification and fetch effective request.
 part='reset_branch';rep(P(-140,1,-3),'north');wire(P(-140,1,-4));edge(P(-140,1,-2),P(-140,1,-3));edge(P(-140,1,-3),P(-140,1,-4));
 route('reset_to_fetch',[[-140,1,-4],[-148,1,-4],[-148,-7,4],[-148,-7,156],[80,-7,156],[80,1,164],[80,1,168]]);
 // Fetch-complete and held-IR valid are the two internally generated advances.
 route('fetch_complete_return',[[152,1,150],[156,1,150],[156,-3,154],[40,-3,154],[40,-3,-24],[22,-3,-24],[22,0,-21],[22,0,-14]]);
 tower('fetch_complete_rise',22,-12,0,9,{wireTop:true});part='fetch_complete_rise_entry';rep(P(22,0,-13),'south');edge(P(22,0,-14),P(22,0,-13));edge(P(22,0,-13),P(22,0,-12));
 route('fetch_complete_advance',[[22,9,-12],[22,9,-4]]);
 // Valid returns from the west-facing parent output. One explicit preserved
 // branch point below the parent map supplies both completion and qualification.
 route('decode_valid_return',[[208,1,-20],[202,1,-20],[202,-5,-26],[194,-5,-26],[194,-11,-32],[50,-11,-32],[50,-11,-19],[50,-12,-18]],{branches:[P(150,-11,-32)]});
 tower('decode_complete_rise',50,-16,-12,17,{wireTop:true});part='decode_complete_entry';rep(P(50,-12,-17),'south');edge(P(50,-12,-18),P(50,-12,-17));edge(P(50,-12,-17),P(50,-12,-16));
 route('decode_complete_advance',[[50,17,-16],[22,17,-16],[22,17,-4]]);
 // Core action qualification sees the same positive valid signal via an
 // isolated branch, rather than treating complete and valid as synonyms.
 part='valid_action_branch';rep(P(150,-11,-33),'north');wire(P(150,-11,-34));edge(P(150,-11,-32),P(150,-11,-33));edge(P(150,-11,-33),P(150,-11,-34));
 route('decode_valid_action',[[150,-11,-34],[150,-11,-44],[-72,-11,-44],[-72,-11,10],[-72,-5,16],[-66,-5,16],[-66,1,22],[-66,1,28],[-60,1,28]]);
 connections.push(...[ ['core.stable_onehot_FETCH','intents.fetch','state_escape_1 + fetch_decode_descent + fetch_state_to_intent'],['core.stable_onehot_DECODE_to_UPDATE','intents.decode_hold','state_escape_2..6 + operation_held_or + operation_descent + operation_state_to_intent'],['core.qualified_next_open','intents.open','qualified_intent_open'],['core.initialize','intents.clear','initialize_intent_clear'],['intents.fetch','fetch.fetch_request','fetch_intent_to_gate + fetch_tail_gate + fetch_request_connection'],['ir.request_tail','fetch_tail_gate.mask','ir_tail_to_fetch_gate'],['intents.decode_hold','ir.decode_request','held_operation_connection'],['fetch.ir_open_request','ir.fetch_open_request','fetch_to_ir_open'],['core.reset_request','fetch.reset_request','reset_to_fetch'],['fetch.fetch_complete','core.advance_FETCH','fetch_complete_return + fetch_complete_rise + fetch_complete_advance'],['ir.decode_valid','core.advance_DECODE','decode_valid_return + decode_complete_rise + decode_complete_advance'],['ir.decode_valid','core.action_valid','decode_valid_return + decode_valid_action'],['ir.controls.RET','core.ret','ret_to_descent + ret_descent + ret_to_core'] ].map(([from,to,route])=>({from,to,route,geometry_status:'connected_local_native_unverified'})));
 const ports={};for(const[n,p]of Object.entries(core.ports))if(!['decode_valid','advance_conditions','ret'].includes(n))ports[n]=p;ports.advance_external={...core.ports.advance_conditions,width:6,bits:core.ports.advance_conditions.bits.filter(v=>![1,2].includes(v.bit)).map((v,i)=>({...v,state_index:v.bit,bit:i})),meaning:'Only IDLE/REQUEST/WAIT/EXECUTE/UPDATE/DONE conditions remain external. Original state indices retained in bit metadata.'};ports.program_ready=fetch.ports.memory_ready;ports.program_valid=fetch.ports.memory_valid;ports.program_data=ir.ports.instruction_data;for(const n of['controls','rd','rs','rt','branch_mask','immediate','decode_valid','ir_open','request_tail'])ports[n]=ir.ports[n];ports.fetch_complete=fetch.ports.fetch_complete;ports.intent_state=intents.ports.state;
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_connected_core_fetch_ir_frontend_native_unverified',blocks,box,ports,parents:Object.fromEntries(Object.entries(parents).map(([n,p])=>[n,{blocks:p.source.blocks.length,translation:p.translation}])),routes,edges,columns,connections,metrics:{blocks:blocks.length,stored_bits:25,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},native_acceptance:false,complete_gpu_layout:false,missing:['PC held-address connection and PC/NZP update; external instruction data and owned memory ready/valid routes.','IDLE/RF/ALU/LSU/UPDATE completion producers, shared phase producer/fanout, initialize/reset-ack producer and actual full-tail flush admission.','Native initialization, measured local lock closure, distributed request/valid and all propagation timing.']};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeFront();if(process.argv.includes('--check'))assert.deepEqual(d,JSON.parse(readFileSync(new URL('design.json',import.meta.url))));else writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
