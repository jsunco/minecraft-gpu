// Bounded source-derived timing/capture audit. No native execution or event simulation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeDataOwner} from '../../../../hardware/memory-layout-data-owner.mjs';
import {makeLiteralNetwork} from '../../../../hardware/full-gpu-literal-network.mjs';
import {makeSignalDescent} from '../../../../hardware/full-gpu-signal-descent.mjs';
import {INPUTS,OUTPUTS,FLAGS,terms} from '../admission-close-v1/logic.mjs';
const root=new URL('../../../../',import.meta.url),H=p=>createHash('sha256').update(readFileSync(new URL(p,root))).digest('hex');
const read=p=>JSON.parse(readFileSync(new URL(p,root))),P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`;
const sourceFiles=['hardware/memory-layout-data-owner.mjs','hardware/memory-layout-data-channel.mjs','hardware/memory-layout-data-sequencer.mjs','hardware/memory-layout-program-controller.mjs','hardware/memory-layout-program-capture.mjs','hardware/memory-layout-channel-retention.mjs','hardware/memory-layout-channel-admission.mjs','hardware/memory-layout-channel-backend-control.mjs','hardware/memory-layout-admission-close.mjs','hardware/full-gpu-literal-network.mjs','hardware/full-gpu-signal-descent.mjs','artifacts/full-gpu-layout-v1/memory/admission-close-v1/source-manifest.json','artifacts/full-gpu-layout-v1/memory/admission-close-v1/controller.json','artifacts/full-gpu-layout-v1/memory/admission-close-v1/joined-checks.json'];
const owner=makeDataOwner(),om=new Map(owner.blocks.map(v=>[K(v.position),v.block]));
const delay=(m,p)=>{const b=m.get(K(p));assert(b,'missing path cell '+K(p));return b.id.endsWith('repeater')?2*Number(b.properties.delay):/torch|comparator/.test(b.id)?2:0;};
const sum=(m,path)=>path.reduce((n,p)=>n+delay(m,p),0);
const ownerPaths=[];
for(let i=0;i<8;i++){
 const y=1+4*i;
 // E0 rise either enables product0 or suppresses a lower-priority product.
 const data=[P(0,1,-6),...Array.from({length:4*i},(_,j)=>P(0,j+2,-5)),P(0,y,-4),...(i===0?[P(1,y,-3)]:[]),P(2,y,-1),...Array.from({length:42},(_,j)=>P(j+2,y,0))];
 const lock=[P(51,1,10),P(49,1,10),P(48,1,9),P(48,1,5),...Array.from({length:4*i},(_,j)=>P(48,j+2,4)),P(48,y,3),P(47,y,2),P(44,y,1)];
 ownerPaths.push({owner:i,source:P(0,1,-7),storage:owner.stores[i].storage,lock:owner.stores[i].lock,eligibility_to_normalized_driver_ticks:sum(om,data),storage_update_ticks:2,open_fall_to_lock_ticks:sum(om,lock),data_path:data,lock_path:lock});
}
// Transport-only nominal counterexample, not a Minecraft timing reproduction.
// Initially E1=1, E0=0. E0 rises 11 ticks before OPEN falls; valid is never withdrawn.
const late=-11,events=ownerPaths.slice(0,2).map(v=>({owner:v.owner,new_value:v.owner===0?1:0,data_update_at:late+v.eligibility_to_normalized_driver_ticks+v.storage_update_ticks,lock_at:v.open_fall_to_lock_ticks}));
const captured=events.map(v=>v.data_update_at<v.lock_at?v.new_value:1-v.new_value);
assert.deepEqual(captured,[1,1]);
// If eligibility is captured first and the complete priority result settles before
// any owner opens, every possible stable sampled mask produces zero/one owner.
let masks=0;
for(let bits=0;bits<256;bits++){const q=Array.from({length:8},(_,i)=>+(!!(bits>>i&1)&&!(bits&((1<<i)-1))));assert(q.reduce((a,b)=>a+b,0)<=1);if(bits)assert.equal(q.indexOf(1),Math.log2(bits&-bits));masks++;}
const d=read('artifacts/full-gpu-layout-v1/memory/admission-close-v1/controller.json'),m=new Map(d.blocks.map(v=>[K(v.position),v.block]));
const logic=makeLiteralNetwork({inputs:INPUTS,outputs:OUTPUTS,terms:terms()}),clear=logic.ports.next_values.bits[7].position;
const route=n=>{const r=d.routes.find(v=>v.name===n);assert(r,n);return r.path;};
const range=(x,z,lo,hi)=>Array.from({length:hi-lo+1},(_,i)=>P(x,lo+i,z));
const matrixPaths=[];
for(let i=0;i<9;i++){
 const name=i<8?'mask'+i:'initialize',row=logic.rows.find(v=>v.name===(i<8?'mask_withdrawal'+i:'cold_initialize_witness'));
 const tower=logic.towers.find(v=>v.name===name),g=row.gates[0],c=logic.or_columns[7],x=tower.x,y=row.y;
 const path=[logic.ports[name].bits[0].receiver,...range(x,-5,tower.first_y,y),P(x,y,-4),P(x,y,-3),P(x,y,-2),P(x+1,y,-2),g.mask,...row.path.slice(row.path.findIndex(p=>K(p)===K(g.comparator))),P(c.x,y,1),P(c.x,y,2),...range(c.x,3,y,c.output_y),P(c.x,c.output_y,4),clear];
 matrixPaths.push({input:name,input_pad:logic.ports[name].bits[0].position,clear_product_y:y,clear_output:clear,nominal_component_ticks:sum(m,path)});
}
const flags=[];
for(const l of d.latches){
 const{x,y,z}=l.origin,col=d.columns.find(v=>v.name==='clear_spine'),spine=route('clear_spine'),end=spine.findIndex(p=>p.z===z+12);assert(end>=0);
 const path=[P(clear.x,y,6),...route('clear_to_rise'),P(col.x-1,y,7),...range(col.x,7,col.lo,col.hi),P(col.x,col.hi,8),...spine.slice(0,end+1),P(col.x+1,col.hi,z+12),...route('clear_'+l.name),P(x-3,y,z),P(x-2,y,z),P(x-1,y,z),P(x,y,z),P(x+1,y,z),l.q];
 const feedbackCol=d.columns.find(v=>v.name===l.name+'_positive'),desc=d.descents.find(v=>v.name===l.name),canon=makeSignalDescent({drop:desc.drop});
 const translate=p=>P(p.x+desc.origin.x,p.y+desc.origin.y,p.z+desc.origin.z),dst=logic.ports[l.name].bits[0].position;
 const feedback=[P(x+3,y,z),...range(feedbackCol.x,z,feedbackCol.lo,feedbackCol.hi),P(feedbackCol.x-1,feedbackCol.hi,z),...route(l.name+'_feedback_high'),P(desc.origin.x,desc.origin.y,desc.origin.z-1),...canon.path.map(translate),desc.normalizer,...route(l.name+'_feedback_low'),P(dst.x,dst.y,-8),dst];
 const loop=[P(x+2,y,z-1),...route(l.name+'_positive_feedback'),P(x+12,y,z-3),P(x+12,y,z-2),P(x+12,y,z-1),P(x+12,y,z),P(x+11,y,z),P(x+10,y,z),P(x+10,y,z+1),...route(l.name+'_negative_feedback'),P(x,y,z+3),P(x,y,z+2),P(x,y,z+1),P(x,y,z)];
 flags.push({name:l.name,local_origin:l.origin,world_origin:P(x+680,y,z-380),local_clear:l.clear,local_Q:l.q,clear_output_to_Q_nominal_ticks:sum(m,path),Q_to_literal_feedback_nominal_ticks:sum(m,feedback),one_feedback_loop_nominal_ticks:sum(m,loop),clear_path: path,feedback_path:feedback});
}
const sourceSums=read('artifacts/full-gpu-layout-v1/memory/admission-close-v1/joined-checks.json').nominal_source_path_sums;
const nominal=matrixPaths.map(v=>({input:v.input,source_return_ticks:sourceSums[v.input].nominal_component_game_ticks,matrix_ticks:v.nominal_component_ticks,largest_clear_and_feedback_prefix_ticks:Math.max(...flags.map(f=>sourceSums[v.input].nominal_component_game_ticks+v.nominal_component_ticks+f.clear_output_to_Q_nominal_ticks+f.one_feedback_loop_nominal_ticks+f.Q_to_literal_feedback_nominal_ticks))}));
const report={status:'source_bound_offline_admission_capture_risk_audit',source_sha256:Object.fromEntries(sourceFiles.map(p=>[p,H(p)])),bank_owner:{has_eligibility_snapshots:false,owner_paths:ownerPaths,late_request_counterexample:{assumptions:'Transport-only nominal diode/torch counts, dust zero, per-store lock arrival; not event simulation or measured Java schedule.',initial_eligible:[0,1,0,0,0,0,0,0],higher_priority_rise_at:late,open_fall_at:0,events,captured_owner_bits:captured,consequence:'Two retained owners can OR distinct payloads and qualify two recipients; no exact-one-owner gate exists.'},stable_snapshot_masks:masks},clear:{matrix_paths:matrixPaths,flags,nominal_source_to_clear_loop_feedback_prefix:nominal,minimum_low_requirement:'Hold actual mask-low until all clear inputs have reached their SRs, all seven Q/feedback flags are low, stale SET products have deasserted, and the complete SR loops have settled. Counted prefixes are not a sufficient minimum or bound: global-to-mask delivery, matrix SET fall, event scheduling and margin are additional.',global_loop_comparison:'Root reports 1580 nominal half/3160 full local global cycle, with two CURRENT transitions before renewed memory block. No timing clearance follows until the complete global-mask-return/clear/feedback/reassert paths are bounded.',optional_rearmed_output:'No new output drawn. A direct all-Q-low gate alone could glitch during asynchronous clear; if explicit acknowledgement is used, it must follow actual held clear and complete feedback/SET-fall clearance.'},native_acceptance:false};
console.log(JSON.stringify({status:report.status,owner_counterexample:events,captured,stable_snapshot_masks:masks,clear_prefixes:nominal}));
if(process.argv.includes('--save'))writeFileSync(new URL('checks.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
