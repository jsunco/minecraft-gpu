// Conditional causal order proof for normal completed fetch/IR epochs.
// No waveform simulation, services, native calls, or assumed cold convergence.
import assert from'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{resolve,relative}from'node:path';
import{nextCoreState}from'../control-core-v1/prepare.mjs';
const H=fileURLToPath(new URL('.',import.meta.url)),R=resolve(H,'../../..'),read=p=>JSON.parse(readFileSync(p));
const paths=read(resolve(H,'front-state-checks.json')),modes=read(resolve(H,'front-mode-checks.json')),local=read(resolve(H,'../program-interface-timing-v1/frontend-paths.json'));
assert.equal(paths.unbounded_rows,0);assert(paths.minimum_finite_margin>0);assert.equal(modes.exact_preserved_frontend_timing_cells,1446);
const closeMargin=Math.min(...local.per_bit.map(x=>x.lock_close_to_local_valid_withdrawal));assert.equal(closeMargin,80);
const intent=s=>({fetch:s===1,operation:s>=2&&s<=6});let stateCases=0;
for(let s=0;s<8;s++)for(let advance of[false,true])for(let ret of[false,true])for(let initialize of[false,true]){
 const n=initialize?0:!advance||s===7?s:s===6?(ret?7:1):s+1;assert.equal(nextCoreState(s,advance,ret,initialize),n);assert(!(intent(s).fetch&&intent(s).operation));stateCases++;
}
// Enumerate every causal interleaving of the two source arrivals and the
// actual positive tail/request chain, including FI-rise BEFORE R-fall.
function orders(deps){const out=[];function visit(done){if(done.length===Object.keys(deps).length){out.push(done);return;}for(const e of Object.keys(deps))if(!done.includes(e)&&deps[e].every(x=>done.includes(x)))visit([...done,e]);}visit([]);return out;}
const transition={FI_at_gate:[],R_low_at_IR:[],admitted_fall:['R_low_at_IR'],tail_fall:['admitted_fall'],tail_low_at_gate:['tail_fall'],fetch_request_rise:['FI_at_gate','tail_low_at_gate'],F_rise:['fetch_request_rise']};
const normalOrders=orders(transition);for(const o of normalOrders){assert(o.indexOf('R_low_at_IR')<o.indexOf('F_rise'));assert(o.indexOf('tail_low_at_gate')<o.indexOf('fetch_request_rise'));}
assert(normalOrders.some(o=>o.indexOf('FI_at_gate')<o.indexOf('R_low_at_IR')),'Do not invent instantaneous FI/R exclusivity.');
const bad=orders({...transition,fetch_request_rise:['FI_at_gate']}).find(o=>o.indexOf('F_rise')<o.indexOf('R_low_at_IR'));assert(bad,'Removing the real tail mask must admit a counterexample.');
const decodeChain=['IR_locks_closed','captured_set','VALID_low','owner_READY_low','complete_high','held_B_advance','NEXT_A_DECODE','CURRENT_B_DECODE','A_operation_intent','R_high_at_IR'];
const r={status:'conditional_normal_frontend_epoch_argument',coreStateCases:stateCases,normalReleaseInterleavings:normalOrders.length,transient_FI_R_overlap_allowed:true,normal_release_orders:normalOrders,missing_tail_mask_counterexample:bad,fetch_to_decode_causal_chain:decodeChain,nominal_IR_close_before_local_VALID_low:closeMargin,retained_decode_and_guard_path_minimum:paths.minimum_finite_margin,actual_mode_cut_points:modes.modes.map(x=>({mode:x.mode,position:x.position,premise:x.premise})),assumptions:[
 'Known prior admitted epoch: held operation R=1, fetch capture F=0 and IR tail has completed its monotonic rise. The previous fetch READY/data owner fully obeyed its hold/return protocol.',
 'At UPDATE completion the actual core state selects FETCH or DONE, and its A-held intents change only after the verified B→A decoder setup. FI may rise before far R falls; the tail mask prevents real fetch admission until the R-caused tail fall returns.',
 'At fetch completion, memory holds READY until source VALID falls. The actual1446-cell timing subset puts all IR locks closed at least80 nominal ticks before source VALID-low. Captured/complete then pass real B-guard→NEXT-A→CURRENT-B→intent-A storage; no direct raw-complete→R shortcut.',
 'These causal arrows require the functioning complete phase cadence, source levels held through their epoch and the nominal component model. This checker does not simulate arbitrary pending block events.'
 ],warm_reset:{source:'control-reset-retire-v1',rule:'Raw reset does not directly clear FI/R or PC/operands. Existing retirement barrier holds accepted work and masks a new FETCH at IDLE/UPDATE; local clearing begins only after the retained parked/drain service gate.',status:'Source protocol retained; full physical reset/epoch closure still delegated to the separate final-reset and timing certificates.'},cold:{status:'unresolved_without_integrated_cold_certificate',reason:'Known monotonic prior tail is essential. Arbitrary stale delay patterns cannot be discarded by choosing a mode label or by the visible endpoint being low. Full initializer/phase/flush evidence is required before this normal induction starts.'},source_sha256:{},native_acceptance:false,full_timing_acceptance:false};
for(const p of[fileURLToPath(import.meta.url),resolve(H,'front-state-checks.json'),resolve(H,'front-mode-checks.json'),resolve(H,'../program-interface-timing-v1/frontend-paths.json'),resolve(H,'../control-core-v1/prepare.mjs'),resolve(H,'../control-front-v1/prepare.mjs'),resolve(H,'../control-reset-retire-v1/README.md')])r.source_sha256[relative(R,p)]=createHash('sha256').update(readFileSync(p)).digest('hex');
writeFileSync(resolve(H,'front-epoch-checks.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({stateCases,normalReleaseInterleavings:normalOrders.length,missingTailMaskCounterexample:true,closeMargin,full_timing_acceptance:false}));
