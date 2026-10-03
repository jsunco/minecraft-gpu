// Pure offline block generator: all running predicates are literal vanilla gates.
import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{fileURLToPath}from'node:url';import{makeLiteralNetwork}from'./full-gpu-literal-network.mjs';
export const INPUTS=['ready','selected','admitted','phase_a','capture','owner','done','start0','reset0','start1','reset1'];
export const OUTPUTS=['select_next','admit_next','permit','cold','payload0_open','payload1_open','done_visible','start0_visible','reset0_visible','start1_visible','reset1_visible'];
export function startupTerms(){const out=[],term=(name,literals,bits)=>out.push({name,literals,bits}),permit={ready:1,selected:1,admitted:1};
 term('select_ready',{ready:1},[0]);term('admit_selected',{ready:1,selected:1},[1]);term('normal_permit',permit,[2]);
 for(const n of['ready','selected','admitted'])term('cold_'+n,{[n]:0},[3,8,10]);
 for(const n of['ready','selected','admitted'])term('capture_zero_'+n,{[n]:0,phase_a:1},[4,5]);
 for(let c=0;c<2;c++)term('capture_'+c,{...permit,phase_a:1,capture:1,owner:c},[4+c]);
 term('done_visible',{...permit,done:1},[6]);term('start0_visible',{...permit,start0:1},[7]);term('start1_visible',{...permit,start1:1},[9]);
 term('reset0_visible',{reset0:1},[8]);term('reset1_visible',{reset1:1},[10]);return out;
}
export function makeDispatchStartupLogic({dense=false}={}){return{...makeLiteralNetwork({inputs:INPUTS,outputs:OUTPUTS,terms:startupTerms(),dense}),status:'offline_dispatch_cold_admission_capture_and_boundary_gates',missing:['SELECT and ADMITTED are separate retained NEXT/CURRENT bits whose actual routes/phase delivery remain to be assembled.','Actual READY/phase/CAPTURE/owner/output sources, cold-clear outputs and core-boundary connections.','All dynamic phase/settle durations and physical cold-start behavior; this is finite settled logic only.']};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDispatchStartupLogic();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
