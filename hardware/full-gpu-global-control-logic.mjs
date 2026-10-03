// Drawn global BOOT / staged warm-reset / conditioning state equations.
import{makeLiteralNetwork}from'./full-gpu-literal-network.mjs';
export const GLOBAL_STATES={COLD_FIRST:0,COLD_SECOND:1,COLD_HOLD:2,CONDITIONING:3,READY:4,DRAIN:5};
export const GLOBAL_DRAIN_INPUTS=['core_ack0','core_ack1','program_quiet','global_channels_quiet','bank0_quiet','bank1_quiet','bank2_quiet','bank3_quiet'];
export const GLOBAL_READY_INPUTS=[...GLOBAL_DRAIN_INPUTS,'dispatch_admitted','rf_admitted0','rf_admitted1','alu_admitted0','alu_admitted1'];
export const GLOBAL_INPUTS=['q0','q1','q2','boot','raw_reset',...GLOBAL_READY_INPUTS];
export const GLOBAL_OUTPUTS=['next0','next1','next2','cold_initialize','core_reset_force','cold_initialized','launch_permit'];
const state=s=>({q0:s&1,q1:(s>>1)&1,q2:(s>>2)&1}),setBits=n=>[0,1,2].filter(b=>(n>>b)&1);
export function globalControlTerms(){const out=[];const add=(name,literals,bits)=>out.push({name,literals,bits});const advance=(name,s,extra,next)=>add(name,{...state(s),boot:0,...extra},setBits(next));
 advance('first_hold',0,{},1);advance('second_hold',1,{},2);advance('hold_request',2,{raw_reset:1},2);advance('release_cold',2,{raw_reset:0},3);
 advance('conditioned',3,{raw_reset:0,...Object.fromEntries(GLOBAL_READY_INPUTS.map(n=>[n,1]))},4);for(const n of GLOBAL_READY_INPUTS)advance('condition_wait_'+n,3,{raw_reset:0,[n]:0},3);
 advance('ready_hold',4,{raw_reset:0},4);advance('warm_request',4,{raw_reset:1},5);for(const n of GLOBAL_DRAIN_INPUTS)advance('drain_wait_'+n,5,{[n]:0},5);
 add('boot_cold',{boot:1},[3]);for(const s of[0,1,2,6,7])add('cold_state_'+s,state(s),[3]);
 add('boot_force',{boot:1},[4]);add('low_states_force',{q2:0},[4]);add('odd_states_force',{q0:1},[4]);add('high_invalid_force',{q1:1},[4]);
 add('initialized_during_run_and_drain',{q2:1,q1:0,boot:0},[5]);add('launch_ready',{...state(4),boot:0,raw_reset:0},[6]);return out;}
export function makeGlobalControlLogic({dense=false}={}){return makeLiteralNetwork({inputs:GLOBAL_INPUTS,outputs:GLOBAL_OUTPUTS,terms:globalControlTerms(),dense});}
export function evaluateGlobalControl(v){const q=v.q0+2*v.q1+4*v.q2,drain=GLOBAL_DRAIN_INPUTS.every(n=>v[n]),ready=GLOBAL_READY_INPUTS.every(n=>v[n]);let next=0;if(!v.boot){if(q===0)next=1;else if(q===1)next=2;else if(q===2)next=v.raw_reset?2:3;else if(q===3)next=v.raw_reset?0:ready?4:3;else if(q===4)next=v.raw_reset?5:4;else if(q===5)next=drain?0:5;}return [next&1,(next>>1)&1,(next>>2)&1,Number(v.boot||[0,1,2,6,7].includes(q)),Number(v.boot||q!==4),Number(!v.boot&&[4,5].includes(q)),Number(!v.boot&&!v.raw_reset&&q===4)];}
