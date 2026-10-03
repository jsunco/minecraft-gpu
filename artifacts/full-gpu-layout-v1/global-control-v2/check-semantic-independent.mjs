// Bounded independent settled-state and integration review. No native activity.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluate as loader} from '../initial-loader-warm-drain-v3/logic/terms.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),read=p=>readFileSync(resolve(root,p)),json=p=>JSON.parse(read(p)),sha=p=>createHash('sha256').update(read(p)).digest('hex');
const prefix='artifacts/full-gpu-layout-v1/',manifests={
 [prefix+'global-control-v2/source-manifest.json']:'27b804b8188a65e34dc41719d88b6a29bf6f60b5898d4efbfd7e78723153a891',
 [prefix+'global-command-assembly-v2/source-manifest.json']:'25fc5ad4626e81018f2e61b260afda8cb2ebadc9238e10dd5d55fb0f75a4e4a9',
 [prefix+'initial-loader-warm-drain-v3/source-manifest.json']:'ac5d5ebc936a17d58673c508abd5a7e5f580571ac50b491437349a42b91f3f27',
};
let pins={};for(const[p,h]of Object.entries(manifests)){assert.equal(sha(p),h);const m=json(p);for(const[f,v]of Object.entries(m.files??m.source_sha256)){if(pins[f])assert.equal(pins[f],v);pins[f]=v;}}
for(const[p,h]of Object.entries(pins))assert.equal(sha(p),h,p);
const d=json(prefix+'global-control-v2/logic/design.json');
const names=['q0','q1','q2','q3','boot','raw_reset','raw_load','core_ack0','core_ack1','program_quiet','global_channels_quiet','bank0_quiet','bank1_quiet','bank2_quiet','bank3_quiet','dispatch_admitted','rf_admitted0','rf_admitted1','alu_admitted0','alu_admitted1'];
const towers=new Map(d.towers.map(t=>[t.name,t]));
const products=d.rows.map(r=>{let care=0,wanted=0,result=0;for(const g of r.gates){const b=names.indexOf(g.name),t=towers.get(g.name),inversions=(r.y-t.first_y)/2;assert(b>=0&&Number.isInteger(inversions));care|=1<<b;if(g.wanted^(inversions%2))wanted|=1<<b;}for(const b of r.bits)result|=1<<b;return{care,wanted,result};});
const packed=mask=>{let y=0;for(const p of products)if((mask&p.care)===p.wanted)y|=p.result;return y;};
function expected(mask){
 const q=mask&15,boot=!!(mask&16),reset=!!(mask&32),load=!!(mask&64),cores=(mask&384)===384,drain=(mask&32640)===32640,ready=(mask&1048448)===1048448;let n=0;
 if(!boot)switch(q){case 0:n=1;break;case 1:n=2;break;case 2:n=reset?2:3;break;case 3:n=reset?0:ready?4:3;break;case 4:n=reset?5:load?7:4;break;case 5:n=cores?6:5;break;case 6:n=drain?0:6;break;case 7:n=reset?5:cores?8:7;break;case 8:n=reset?6:drain?9:8;break;case 9:n=reset?6:load||!drain?9:4;break;}
 const cold=boot||q<3||q>9,force=boot||q!==4,initialized=!boot&&q>=4&&q<=9,launch=!boot&&!reset&&!load&&q===4,block=boot||!(q===4||q===5||q===7);
 return n|Number(cold)<<4|Number(force)<<5|Number(initialized)<<6|Number(launch)<<7|Number(block)<<8;
}
let cases=0;for(let m=0;m<1<<20;m++){assert.equal(packed(m),expected(m),'drawn global truth '+m);cases++;}
const input=(q,extra=0,missing=0)=>q|1048448|extra&~missing;
const readyBase=q=>q|1048448;
const next=(q,extra=0,missing=0)=>packed((readyBase(q)|extra)&~missing)&15;
let bootTraces=0;for(let c0=0;c0<16;c0++)for(let n0=0;n0<16;n0++)for(const firstB of[false,true]){let c=c0,n=n0;for(const phase of[...(firstB?['B']:[]),'A','B','A','B']){if(phase==='A')n=next(c,16);else c=n;}assert.equal(c,0);assert.equal(n,0);bootTraces++;}
let integration=0;for(const marker of[false,true])for(const raw of['load','reset']){
 const extra=raw==='load'?64:32,coreState=raw==='load'?7:5,memoryState=raw==='load'?8:6;
 assert.equal(next(4,extra),coreState);for(const missing of[128,256]){const y=packed((readyBase(coreState)|extra)&~missing);assert.equal(y&15,coreState);assert(y&64);assert(!(y&256));const l=loader({load_request:raw==='load',raw_reset:raw==='reset',image_verified:marker,cold_initialized:true,memory_admission_block:false});assert(l.core_reset_request&&!l.runtime_block&&!l.start_admitted);integration++;}
 assert.equal(next(coreState,extra),memoryState);for(let b=7;b<=14;b++)assert.equal(next(memoryState,extra,1<<b),memoryState);
 assert.equal(next(memoryState,extra),raw==='load'?9:0);integration++;
}
for(let t=0;t<16;t++)assert.equal(next(9,64),9);assert.equal(next(9),4);
// Counterexample, not a simulated native waveform: all partial 7->8 updates
// are legal under unconstrained independent CURRENT-bit skew.
const skew=[];for(let subset=0;subset<16;subset++){const q=7^subset,y=packed(readyBase(q)|64);if(y&16||!(y&64))skew.push(q);}assert(skew.includes(0)&&skew.includes(15));
const assembly=json(prefix+'global-command-assembly-v2/design.json');assert.deepEqual(assembly.ports.normal_permit.bits,assembly.ports.cold_initialized.bits);assert.equal(assembly.connections.length,2);
const r={status:'independent_settled_semantics_passed_dynamic_command_hazard_not_cleared',source_pins_checked:Object.keys(pins).length,drawn_truth_cases:cases,arbitrary_boot_state_traces:bootTraces,loader_integration_cases:integration,load_hold_cycles:16,known_hazard:{transition:'LOAD_CORE_DRAIN7_to_LOAD_MEMORY_DRAIN8',possible_skew_states_with_cold_or_initialized_hazard:skew,reason:'Unretained binary-state decode can briefly assert cold_initialize or drop cold_initialized during B. Settled truth is insufficient.'},native_calls:0,native_acceptance:false};
console.log(JSON.stringify(r));
