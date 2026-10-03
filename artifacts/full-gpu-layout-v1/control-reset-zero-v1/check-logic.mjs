import assert from 'node:assert/strict';
import {definition,clampDefinition} from './logic.mjs';
import {equation} from '../control-lsu-v2/logic.mjs';
export function checkLogic(){
 const def=definition();let truth=0;
 for(let bits=0;bits<2**def.inputs.length;bits++){
  const v=Object.fromEntries(def.inputs.map((n,i)=>[n,!!(bits&(2**i))]));
  const expected={active_D:(v.scratch_complete||v.active)&&!v.release&&!v.initialize&&!v.fault,
   prepared_D:v.active&&v.clamps_high&&!v.release&&!v.initialize,
   transferred_D:v.active&&v.prepared&&!v.release&&!v.initialize,
   stop_D:v.active&&v.transferred&&!v.release&&!v.initialize,
   next_open:v.phase_a&&v.active&&v.prepared&&!v.stop&&!v.initialize&&!v.fault,
   current_open:v.phase_b&&v.active&&v.next_captured&&!v.stop&&!v.initialize&&!v.fault,
   rf_reset:v.active&&!v.withdraw&&!v.initialize&&!v.fault,clamp:v.active};
  for(const[n,value]of Object.entries(expected))assert.equal(!!equation(def,v)[n],value,n);truth++;
 }
 const all=Object.fromEntries(clampDefinition().inputs.map(n=>[n,true]));assert(equation(clampDefinition(),all).all_clamps_high);
 for(const n of Object.keys(all))assert(!equation(clampDefinition(),{...all,[n]:false}).all_clamps_high);
 // Conditional event model: full A-close then full B-close with stable source
 // data. It tests ordering; no Minecraft propagation delay is simulated.
 let traces=0;const examples=[];
 for(let arrival=0;arrival<8;arrival++)for(let initialPC of[0,1,85,170,255])for(let initialFlags of[0,1,0x555,0xaaa,0xfff]){
  let state={active:false,prepared:false,transferred:false,stop:false},next={...state},pc=initialPC,pcNext=255^initialPC,flags=initialFlags,fullA=false,fullB=false;const events=[];
  for(let cycle=0;cycle<12;cycle++){
   const common={...state,next_captured:next.transferred,scratch_complete:true,clamps_high:cycle>=arrival,initialize:false,fault:false,release:false,withdraw:false};
   const a=equation(def,{...common,phase_a:true,phase_b:false});
   if(a.next_open){assert(common.clamps_high);pcNext=0;flags=0;fullA=true;events.push('A_ZERO');}
   for(const n of['active','prepared','transferred'])next[n]=!!a[n+'_D'];state.stop=!!a.stop_D;
   // Let CURRENT change at the beginning of B as the adverse ordering: the
   // next_captured qualifier still excludes the first prepared-only B.
   for(const n of['active','prepared','transferred'])state[n]=next[n];
   const b=equation(def,{...common,...state,next_captured:next.transferred,phase_a:false,phase_b:true});
   if(b.current_open){assert(fullA,'CURRENT must follow a completed zero NEXT phase');pc=pcNext;fullB=true;events.push('B_ZERO');}
   if(state.stop){assert(fullA&&fullB);assert.equal(pc,0);assert.equal(flags,0);}
  }
  assert(state.stop);assert.equal(pc,0);assert.equal(flags,0);if(examples.length<1)examples.push(events);traces++;
 }
 // A concrete failure of the rejected predicate: prepared.C rises during B
 // one phase before NEXT has ever opened. An A-held N witness remains zero.
 const firstPreparedB={active:true,prepared:true,next_captured:false,stop:false,phase_b:true,phase_a:false,initialize:false,fault:false};
 assert(firstPreparedB.phase_b&&firstPreparedB.active&&firstPreparedB.prepared&&!firstPreparedB.stop);
 assert(!equation(def,firstPreparedB).current_open);
 let cold=0;for(let initial=0;initial<128;initial++){
  const state={active:!!(initial&1),prepared:!!(initial&2),transferred:!!(initial&4),stop:!!(initial&8)},next={active:!!(initial&16),prepared:!!(initial&32),transferred:!!(initial&64)};
  const a=equation(def,{...state,next_captured:next.transferred,scratch_complete:true,clamps_high:true,initialize:true,release:false,fault:false,phase_a:true,phase_b:false,withdraw:false});
  assert(!a.next_open&&!a.current_open&&!a.rf_reset);for(const n of['active','prepared','transferred'])next[n]=!!a[n+'_D'];state.stop=!!a.stop_D;
  for(const n of['active','prepared','transferred'])state[n]=next[n];assert(Object.values({...state,...next}).every(v=>!v));cold++;
 }
 return{settled_truth_cases:truth,clamp_return_cases:21,conditional_ordered_phase_traces:traces,arbitrary_cold_pipeline_states:cold,rejected_direct_prepared_B_counterexample:true,example:examples[0],dynamic_timing_proof:false};
}
if(process.argv[1]?.endsWith('/check-logic.mjs'))console.log(JSON.stringify(checkLogic()));
