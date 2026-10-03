// Reduced global FSM. Requests and individual predicate inputs must be B-sampled; three explicit physical conjunctions supply the predicate ports.
import {makeLiteralNetwork} from './full-gpu-literal-network.mjs';
export const GLOBAL_STATES={COLD_FIRST:0,COLD_SECOND:1,COLD_HOLD:2,CONDITIONING:3,READY:4,RESET_CORE_DRAIN:5,RESET_MEMORY_DRAIN:6,LOAD_CORE_DRAIN:7,LOAD_MEMORY_DRAIN:8,QUIET_LOAD_HOLD:9};
export const GLOBAL_DRAIN_INPUTS=['both_core_acks','drain_ready'];
export const GLOBAL_READY_INPUTS=[...GLOBAL_DRAIN_INPUTS,'conditioning_ready'];
export const GLOBAL_INPUTS=['q0','q1','q2','q3','boot','raw_reset','raw_load',...GLOBAL_READY_INPUTS];
export const GLOBAL_OUTPUTS=['next0','next1','next2','next3','cold_initialize','core_reset_force','cold_initialized','launch_permit','memory_admission_block'];
const state=s=>Object.fromEntries([0,1,2,3].map(b=>['q'+b,(s>>b)&1])),setBits=n=>[0,1,2,3].filter(b=>(n>>b)&1);
export function globalControlTerms(){
 const out=[],add=(name,literals,bits)=>out.push({name,literals,bits}),advance=(name,s,extra,next)=>add(name,{...state(s),boot:0,...extra},setBits(next)),all=names=>Object.fromEntries(names.map(n=>[n,1]));
 const waitEach=(prefix,s,names,extra,next)=>{for(const n of names)advance(prefix+n,s,{...extra,[n]:0},next);};
 advance('first_hold',0,{},1);advance('second_hold',1,{},2);
 advance('cold_hold_request',2,{raw_reset:1},2);advance('release_cold',2,{raw_reset:0},3);
 advance('conditioned',3,{raw_reset:0,...all(GLOBAL_READY_INPUTS)},4);waitEach('condition_wait_',3,GLOBAL_READY_INPUTS,{raw_reset:0},3);
 advance('ready_hold',4,{raw_reset:0,raw_load:0},4);advance('warm_reset_request',4,{raw_reset:1},5);advance('load_request',4,{raw_reset:0,raw_load:1},7);
 advance('reset_cores_drained',5,all(['both_core_acks']),6);waitEach('reset_core_wait_',5,['both_core_acks'],{},5);
 waitEach('reset_memory_wait_',6,GLOBAL_DRAIN_INPUTS,{},6);
 advance('load_upgraded_to_reset',7,{raw_reset:1},5);advance('load_cores_drained',7,{raw_reset:0,...all(['both_core_acks'])},8);waitEach('load_core_wait_',7,['both_core_acks'],{raw_reset:0},7);
 advance('load_memory_upgraded_to_reset',8,{raw_reset:1},6);advance('load_memory_drained',8,{raw_reset:0,...all(GLOBAL_DRAIN_INPUTS)},9);waitEach('load_memory_wait_',8,GLOBAL_DRAIN_INPUTS,{raw_reset:0},8);
 advance('held_load_upgraded_to_reset',9,{raw_reset:1},6);advance('held_load',9,{raw_reset:0,raw_load:1},9);advance('release_load',9,{raw_reset:0,raw_load:0,...all(GLOBAL_DRAIN_INPUTS)},4);waitEach('release_load_wait_',9,GLOBAL_DRAIN_INPUTS,{raw_reset:0,raw_load:0},9);
 add('boot_override',{boot:1},[4,5,8]);
 add('cold_first_pair',{q3:0,q2:0,q1:0},[4]);add('cold_hold',state(2),[4]);add('invalid_cold_high',{q3:1,q2:1},[4]);add('invalid_cold_mid',{q3:1,q1:1},[4]);
 for(const [n,w]of[['q3',1],['q2',0],['q1',1],['q0',1]])add('force_'+n,{[n]:w},[5]);
 add('initialized_run_drain',{q3:0,q2:1,boot:0},[6]);add('initialized_load_hold',{q3:1,q2:0,q1:0,boot:0},[6]);
 add('launch_ready',{...state(4),boot:0,raw_reset:0,raw_load:0},[7]);
 add('block_high_states',{q3:1},[8]);add('block_low_states',{q2:0},[8]);add('block_reset_memory',{q1:1,q0:0},[8]);
 return out;
}
export function makeGlobalControlLogic({dense=false}={}){return makeLiteralNetwork({inputs:GLOBAL_INPUTS,outputs:GLOBAL_OUTPUTS,terms:globalControlTerms(),dense});}
export function evaluateGlobalControl(v){
 const q=v.q0+2*v.q1+4*v.q2+8*v.q3,cores=v.both_core_acks,drain=GLOBAL_DRAIN_INPUTS.every(n=>v[n]),ready=GLOBAL_READY_INPUTS.every(n=>v[n]);let next=0;
 if(!v.boot){if(q===0)next=1;else if(q===1)next=2;else if(q===2)next=v.raw_reset?2:3;else if(q===3)next=v.raw_reset?0:ready?4:3;else if(q===4)next=v.raw_reset?5:v.raw_load?7:4;else if(q===5)next=cores?6:5;else if(q===6)next=drain?0:6;else if(q===7)next=v.raw_reset?5:cores?8:7;else if(q===8)next=v.raw_reset?6:drain?9:8;else if(q===9)next=v.raw_reset?6:v.raw_load||!drain?9:4;}
 return[...setBitsArray(next),Number(v.boot||[0,1,2,10,11,12,13,14,15].includes(q)),Number(v.boot||q!==4),Number(!v.boot&&q>=4&&q<=9),Number(!v.boot&&!v.raw_reset&&!v.raw_load&&q===4),Number(v.boot||![4,5,7].includes(q))];
}
const setBitsArray=n=>[0,1,2,3].map(b=>(n>>b)&1);
