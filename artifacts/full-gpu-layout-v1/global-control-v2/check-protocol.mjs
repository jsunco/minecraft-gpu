// Ordered transfers only: no assumed elapsed Minecraft time or pulse capture.
import assert from 'node:assert/strict';import{writeFileSync}from'node:fs';
import{evaluateGlobalControl,GLOBAL_READY_INPUTS,GLOBAL_DRAIN_INPUTS}from'../../../hardware/full-gpu-global-control-logic-v2.mjs';
const inputs=(q,extra={})=>({...Object.fromEntries(GLOBAL_READY_INPUTS.map(n=>[n,1])),...Object.fromEntries([0,1,2,3].map(b=>['q'+b,(q>>b)&1])),boot:0,raw_reset:0,raw_load:0,...extra}),E=(q,v={})=>evaluateGlobalControl(inputs(q,v)),N=(q,v={})=>E(q,v).slice(0,4).reduce((n,b,i)=>n|(b<<i),0);
let bootTraces=0,bootEdges=0;
for(let current=0;current<16;current++)for(let pending=0;pending<16;pending++)for(const firstB of[false,true]){let c=current,n=pending;for(const phase of[...(firstB?['B']:[]),'A','B','A','B']){assert.deepEqual(E(c,{boot:1}).slice(4),[1,1,0,0,1]);if(phase==='A')n=N(c,{boot:1});else c=n;bootEdges++;}assert.equal(c,0);assert.equal(n,0);for(const expected of[1,2,3,4]){c=N(c);assert.equal(c,expected);}bootTraces++;}
let coreWaits=0,memoryWaits=0,loadHolds=0;
for(const kind of ['reset','load'])for(const dropRawEarly of[false,true]){
 const raw=kind==='reset'?'raw_reset':'raw_load',first=kind==='reset'?5:7,second=kind==='reset'?6:8;
 assert.equal(N(4,{[raw]:1}),first);
 for(const ack of ['core_ack0','core_ack1']){let q=first;for(let t=0;t<4;t++){const v={[raw]:Number(!dropRawEarly),[ack]:0,global_channels_quiet:0},y=E(q,v);assert.deepEqual(y.slice(4),[0,1,1,0,0]);q=N(q,v);assert.equal(q,first);coreWaits++;}}
 assert.equal(N(first,{global_channels_quiet:0}),second);assert.equal(E(second)[8],1);
 for(const missing of GLOBAL_DRAIN_INPUTS){let q=second;for(let t=0;t<4;t++){const v={[raw]:Number(!dropRawEarly),[missing]:0},y=E(q,v);assert.deepEqual(y.slice(4),[0,1,1,0,1]);q=N(q,v);assert.equal(q,second);memoryWaits++;}}
 assert.equal(N(second),kind==='reset'?0:9);
}
for(let t=0;t<16;t++){assert.equal(N(9,{raw_load:1}),9);assert.deepEqual(E(9,{raw_load:1}).slice(4),[0,1,1,0,1]);loadHolds++;}
assert.equal(N(9),4);assert.equal(N(7,{raw_reset:1}),5);assert.equal(N(8,{raw_reset:1}),6);assert.equal(N(9,{raw_reset:1}),6);
for(const missing of GLOBAL_DRAIN_INPUTS)assert.equal(N(9,{[missing]:0}),9);
for(const missing of GLOBAL_READY_INPUTS)assert.equal(N(3,{[missing]:0}),3);
for(let q=10;q<16;q++){assert.equal(N(q),0);assert.deepEqual(E(q).slice(4),[1,1,0,0,1]);}
for(const raw of['raw_reset','raw_load'])assert.equal(E(4,{[raw]:1})[7],0);
assert.equal(N(2,{raw_reset:1}),2);assert.equal(N(3,{raw_reset:1}),0);
// Regression: previously, raw LOAD blocked admissions while an accepted LSU/fetch
// still awaited allocation, so final core ACK could never appear.
assert.equal(E(7,{core_ack0:0,global_channels_quiet:0,raw_load:1})[8],0);
// LOAD released early still completes the retained drain path; RESET is destructive only later.
assert.equal(N(7,{raw_load:0}),8);assert.equal(N(8,{raw_load:0}),9);assert.equal(N(6,{raw_reset:0}),0);
const r={status:'global_reset_and_load_ordered_phase_protocol_pass',arbitrary_boot_initial_state_traces:bootTraces,boot_edges:bootEdges,blocked_core_retirement_cycles:coreWaits,blocked_memory_closure_cycles:memoryWaits,nondestructive_held_load_cycles:loadHolds,independent_not_ready_holds:GLOBAL_READY_INPUTS.length,checked_properties:['BOOT overrides all256 NEXT/CURRENT state pairs, even if a B phase occurs first; two complete pairs leave both banks zero.','Both final core ACKs precede admission blocking. Accepted core memory work remains admitted during core drain.','Explicit admission block then requires real program/global/bank quiet before destructive RESET cold clear.','LOAD is nondestructive: initialized stays true and held LOAD never repeats cold initialization.','Early request withdrawal retains the drain reason; RESET supersedes LOAD.','IMAGE_VERIFIED is not an input here and may gate only new START in the loader.'],native_calls:0,native_acceptance:false,numeric_physical_bounds_established:false,limits:['Settled equations and ordered nonoverlapping NEXT/CURRENT transfers only, not scheduled Minecraft block execution.','BOOT/RESET/LOAD held-level interface; no claim of capturing sub-cycle pulses.','Actual closure producers must clear on mask withdrawal and establish a fresh traversal, not reuse stale idle snapshots.','Actual shared clock, far routes, initialization duration and all max/min bounds remain required.']};writeFileSync(new URL('protocol-checks.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
