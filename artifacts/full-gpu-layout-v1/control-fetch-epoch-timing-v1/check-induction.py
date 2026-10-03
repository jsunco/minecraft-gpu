"""Compose actual port arcs into monotonic normal FETCH/IR epoch inequalities.

This is a conditional circuit argument, not Minecraft event simulation. Each
zero predicate is proved before it is used to break the physical feedback SCC.
The cold base case and staged-reset admission are deliberately separate gates.
"""
from pathlib import Path
import copy,hashlib,json
H=Path(__file__).resolve().parent; B=H.parent; ROOT=H.parents[2]
read=lambda p:json.loads(p.read_text())
arcs=read(H/'arcs.json');seq=read(H/'sequence.json');cuts=read(H/'front-mode-checks.json')
paths=read(H/'front-state-checks.json');phase=read(B/'compact-core-fault-timing-v1/phase-checks.json')
for report in [arcs,seq,cuts,paths,phase]:
 for p,h in report['source_sha256'].items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
assert arcs['matched_fetch_IR_cells']==7430 and len(arcs['rows'])==210
assert not any(r['unbounded'] for r in arcs['rows'])
assert len(cuts['modes'])==5 and all(r['positive_device_sccs']==0 for r in cuts['modes'])
assert paths['unbounded_rows']==paths['nonpositive_finite_rows']==0
assert paths['minimum_finite_margin']==822
assert seq['operation_path']==[2,3,4,5,6,1]
rows={(r['source'],r['target']):r for r in arcs['rows']}
def delay(a,b):
 r=rows[a,b];assert r['nominal_min']==r['nominal_max'];return r['nominal_max']
def locktime(p,ph):return next(r for r in phase['phase_paths'] if r['storage']==p and r['phase']==ph)
fi=locktime([-38,1,90],'A');op=locktime([-38,5,90],'A')
fg=locktime([82,5,-120],'B');dg=locktime([82,9,-120],'B')
assert fi['nominal_min_ticks']==390 and fi['nominal_max_ticks']==512
assert op['nominal_min_ticks']==394 and op['nominal_max_ticks']==516
period=3160;awidth=544;bstart=1584;bwidth=540;device=2;store=2
data={f'{a}/{b}':r['nominal_max'] for (a,b),r in rows.items()}

def prove(v,operation_commits=5,fi_latest=None,tail_mask=True,capture_mask=True):
 d=lambda a,b:v[f'{a}/{b}']; out={}
 require=lambda condition,name:condition or (_ for _ in ()).throw(AssertionError(name))
 require(tail_mask,'IR tail mask is a required physical guard')
 require(capture_mask,'captured side is a required physical transition guard')
 # Sources here are comparator-center transitions, except FI/R/captured are
 # actual retained repeater outputs. Target input diodes include their delay.
 a_to_hold_close=d('effective_request','captured_hold_rear')+device+d('captured_hold','captured_lock')
 a_to_data=d('effective_request','captured_D')
 out['capture_start_lock_before_data']=a_to_data-a_to_hold_close
 require(out['capture_start_lock_before_data']>0,'captured may become1 before response')
 q_earliest=d('effective_request','memory_valid_rear')+device+d('memory_valid','response_present_rear')+device
 pulse_on=d('response_present','ir_capture_request_rear')+device
 pulse_off=d('response_present','ir_capture_request_side')+device
 ir_close=pulse_off+d('ir_capture_request','IR_open_rear')+device+max(d('IR_open',f'IR_lock_{i}') for i in range(16))
 capture_unlock=d('response_present','captured_hold_side')+device+d('captured_hold','captured_lock')
 capture_q=capture_unlock+store
 out['captured_data_setup_before_unlock']=q_earliest+capture_unlock-a_to_data
 require(out['captured_data_setup_before_unlock']>0,'captured D not stable before unlock')
 valid_low=capture_q+d('captured','memory_valid_side')+device
 q_low=valid_low+d('memory_valid','response_present_rear')+device
 out['IR_lock_close_before_local_VALID_pad_low']=valid_low+2-ir_close
 require(out['IR_lock_close_before_local_VALID_pad_low']>0,'VALID may withdraw before IR closes')
 out['capture_pulse_width']=pulse_off-pulse_on
 out['Q_high_through_close_tail']=q_low-d('response_present','captured_hold_side')
 require(out['Q_high_through_close_tail']>0,'Q may withdraw before capture tail fully arrives')
 out['IR_fetch_mask_low_before_captured_Q']=capture_q-(pulse_off+d('ir_capture_request','IR_admit_side'))
 require(out['IR_fetch_mask_low_before_captured_Q']>0,'R may rise while old F side remains high')

 # DECODE handoff. captured=1 gives VALID=0 while R can rise before FI falls.
 # The R-caused tail cannot clear effective A/captured until FI0 is at J.
 fi0=(awidth+fi['nominal_max_ticks']+store if fi_latest is None else fi_latest)+d('FI','fetch_tail_gate_rear')
 tail1=op['nominal_min_ticks']+store+d('R','IR_admit_rear')+device+d('IR_admit','fetch_tail_gate_side')
 out['FI_zero_arrives_before_R_tail_can_withdraw_A']=tail1-fi0
 require(out['FI_zero_arrives_before_R_tail_can_withdraw_A']>0,'captured transition guard can clear before FI0 takes over')
 # If FI itself causes A0, FI0 is by definition already at the constant-zero
 # comparator. Reset-caused A0 is excluded from normal ownership and handled
 # by the separate reset predicate/admission boundary below.

 fi_to_a0=d('FI','fetch_tail_gate_rear')+device+d('fetch_tail_gate','effective_request_rear')+device
 a_to_v0=d('effective_request','memory_valid_rear')+device
 a_to_q0=a_to_v0+d('memory_valid','response_present_rear')+device
 a_to_cap0=max(a_to_data,a_to_hold_close)+store
 a_to_comp0=a_to_cap0+d('captured','fetch_complete_rear')+device
 # Every actual delay cell was characterized, not only visible endpoints.
 pipeline={}
 for (s,t),r in rows.items():
  if not t.startswith('pipeline_'):continue
  prefix={'effective_request':0,'response_present':a_to_q0,'IR_admit':0}[s]
  pipeline[t]={'origin':s,'latest_after_origin_forced_zero':prefix+r['nominal_max']}
 require(len(pipeline)==168,'all 104 FETCH and64 IR delay cells required')
 fetch_delay_max=max(r['latest_after_origin_forced_zero'] for n,r in pipeline.items() if not n.startswith('pipeline_IR'))
 fetch_front_flush=max(fetch_delay_max,a_to_q0+d('response_present','captured_hold_side'),a_to_comp0,
  a_to_q0+pulse_on+d('ir_capture_request','IR_open_rear')+device+max(d('IR_open',f'IR_lock_{i}') for i in range(16)))
 out['FETCH_full_flush_after_FI_Q_zero']=fi_to_a0+fetch_front_flush
 operation_low=operation_commits*period+fi['nominal_min_ticks']+store-(awidth+fi['nominal_max_ticks']+store)
 operation_high=operation_commits*period+op['nominal_min_ticks']+store-(awidth+op['nominal_max_ticks']+store)
 out['minimum_FI_low_during_completed_operation']=operation_low
 out['minimum_R_high_during_completed_operation']=operation_high
 out['FETCH_flush_before_reuse']=operation_low-out['FETCH_full_flush_after_FI_Q_zero']
 require(out['FETCH_flush_before_reuse']>0,'old FETCH pipeline not flushed before next request')
 out['IR_tail_high_before_R_can_fall']=operation_high-(d('R','IR_admit_rear')+device+d('IR_admit','fetch_tail_gate_side'))
 require(out['IR_tail_high_before_R_can_fall']>0,'new FETCH may lack a settled high old-tail guard')

 # Operation→FETCH. Old tail1 makes J=0 even if FI rises first. Its fall is
 # causally downstream of R0→G0. Therefore the R0 constant-zero guard has
 # already arrived before J can admit a new response/capture request.
 g0_to_a1=d('IR_admit','fetch_tail_gate_side')+device+d('fetch_tail_gate','effective_request_rear')+device
 a1_to_open=q_earliest+pulse_on+d('ir_capture_request','IR_open_rear')+device
 out['old_IR_T_mask_clear_before_new_OPEN']=g0_to_a1+a1_to_open-d('IR_admit','IR_open_side_T')
 require(out['old_IR_T_mask_clear_before_new_OPEN']>0,'new F may reopen before old IR tail clears')
 out['old_IR_R_mask_clear_before_new_OPEN']=d('R','IR_admit_rear')+device+g0_to_a1+a1_to_open-d('R','IR_open_side_R')
 require(out['old_IR_R_mask_clear_before_new_OPEN']>0,'new F may reopen before R side clears')
 # Actual B-held completion samplers must not carry stale prior-epoch true.
 latest_fi0=awidth+fi['nominal_max_ticks']+store
 latest_r0=awidth+op['nominal_max_ticks']+store
 comp_guard0=latest_fi0+fi_to_a0+a_to_comp0+d('fetch_complete','fetch_complete_guard_D')
 decode_guard0=latest_r0+d('R','IR_admit_rear')+device+d('IR_admit','IR_valid_side')+device+d('IR_valid','decode_valid_guard_D')
 out['old_FETCH_complete_zero_before_next_B_sample']=bstart+fg['nominal_min_ticks']-comp_guard0
 out['old_DECODE_valid_zero_before_next_B_sample']=bstart+dg['nominal_min_ticks']-decode_guard0
 require(out['old_FETCH_complete_zero_before_next_B_sample']>0,'stale fetch complete reaches later guard')
 require(out['old_DECODE_valid_zero_before_next_B_sample']>0,'stale decode valid reaches later guard')
 # Known FI=R=0 is sufficient to flush the local front, even with arbitrary
 # old values in linear delay cells. This is a requirement on a real cold
 # producer, not evidence that the integrated initializer supplied it.
 ir_flush=d('R','IR_admit_rear')+device+max(d('IR_admit','fetch_tail_gate_side'),d('IR_admit','IR_open_side_T'),d('IR_admit','IR_valid_rear'))
 out['required_front_flush_after_both_intent_Q_zero']=max(out['FETCH_full_flush_after_FI_Q_zero'],ir_flush)
 return out,{'capture_from_Q_rise':{'IR_last_lock_closed':ir_close,'captured_unlock':capture_unlock,'captured_Q1':capture_q,'local_VALID_center0':valid_low,'local_VALID_pad0':valid_low+2,'Q_fall_no_earlier_than':q_low},'pipeline_cells':pipeline}

metrics,witness=prove(data,seq['minimum_completed_operation_commits'])
negatives=[]
def rejects(name,**kw):
 try:prove(**kw)
 except AssertionError as e:negatives.append({'name':name,'rejection':str(e)});return
 raise AssertionError('corruption accepted: '+name)
v=copy.deepcopy(data);v['effective_request/captured_D']=0;rejects('remove_captured_data_guard',v=v)
v=copy.deepcopy(data);v['response_present/captured_hold_side']=600;rejects('shorten_post_IR_close_capture_guard',v=v)
rejects('remove_actual_IR_tail_mask',v=data,tail_mask=False)
rejects('remove_actual_captured_VALID_mask',v=data,capture_mask=False)
rejects('delay_FI_zero_past_first_R_tail',v=data,fi_latest=1200)
rejects('permit_zero_cycle_operation_bypass',v=data,operation_commits=0)
v=copy.deepcopy(data);v['IR_admit/IR_open_side_T']=1000;rejects('slow_IR_tail_at_open_without_slowing_FETCH_mask',v=v)
v=copy.deepcopy(data);v['fetch_complete/fetch_complete_guard_D']=1000;rejects('stale_complete_B_sample',v=v)
assert len(negatives)==8
report={'status':'normal_FETCH_IR_transition_and_return_to_zero_certificate_with_explicit_entry_gates',
 'basis':'exact compact-core-fault-v1 f61eb16a geometry; actual2,781,296-node dependency graph',
 'actual_characterized_cells':7430,'actual_arcs':len(rows),'actual_pipeline_cells':168,'normal_state_cases':seq['state_cases'],
 'nominal_metrics':metrics,'witness':witness,'negative_cases':negatives,
 'induction':[
  {'stage':'base','earned_here':False,'requires':'Real held FI/R zero plus full local flush, READY0, no owned program request, and qualified normal phase cadence before first FETCH. Cold/admission paths are separate unresolved bindings.'},
  {'stage':'FETCH','earned_here':True,'argument':'R0 fixes IR_admit0. A rise first locks captured0, then supplies D1. Owner-held READY raises Q once. Delayed Q closes all IR locks before captured commits1 and VALID withdraws.'},
  {'stage':'FETCH_to_DECODE','earned_here':True,'argument':'Captured1 fixes memory_VALID0 until FI0 reaches J. R may rise before FI falls; the earliest returning R tail still reaches J after the latest FI-zero rear. No instantaneous FI/R exclusion is used.'},
  {'stage':'operation','earned_here':True,'argument':'FI0 fixes J0. Actual successor graph requires five full CURRENT commits before another FETCH; all168 real delay cells have finite linear zero-flush bounds. Stalls only extend the hold.'},
  {'stage':'operation_to_FETCH','earned_here':True,'argument':'Previously settled IR tail1 fixes J0 while FI may rise before R falls. Tail fall is downstream of actual R0 at IR_admit, handing off to its R0 zero predicate before a new fetch is possible.'}],
 'warm_reset':{'status':'logical_owner_preservation_checked_physical_service_admission_not_closed',
  'safe_cases':'RESET accepted while masks stop IDLE/UPDATE; late admission may finish one more normal instruction. Pending reset alone does not clear FI/R or PC.',
  'required':'Actual candidate/parked sample must follow both delivered stop masks and stable boundary, and local reset/zero clear must follow true program/RF/LSU ownership drain. The two stored observations do not by themselves establish far arrival timing.',
  'fault':'No warm ACK on sticky fault. Explicit destructive BOOT/image reload is the separate policy.'},
 'unresolved_boundaries':[
  'Bind physical cold/epoch intent-clamp delivery and full A capture/closure to the stated FI/R-zero entry condition; scanner READY alone does not prove this.',
  'Close actual staged-reset stop-mask→sample→park→program-quiet→local-clear paths for late reset, including any accepted FETCH before masks arrive.',
  'Bind normal-permit and local action initialization so held intents cannot truncate during an accepted program transaction.',
  'Complete all remaining core same-phase/enable/handshake groups and new compact guard geometry timing separately.'
 ],
 'model_assumptions':['Directed physical graph semantics and normalized 0/15 inputs; same material/source set as pinned geometry.',
  'Nominal repeater2*delay and torch/comparator2 scheduling with complete loaded/ticking circuits and no burnout/pulse rejection. These are component-time assumptions, not measured event maxima.',
  'Positive program READY/payload ownership persists through real VALID withdrawal; memory ready does not drop early.',
  'Stable completed normal epoch, no mid-operation cold/architectural clear, proper qualified A→close→B→settle cadence. The complete machine has not yet earned every entry premise.'
 ],'unconditional_SCC_removal':False,'native_acceptance':False,'full_core_timing_acceptance':False,'source_sha256':{}}
sources=[Path(__file__).resolve(),H/'arcs.json',H/'sequence.json',H/'front-mode-checks.json',H/'front-state-checks.json',B/'compact-core-fault-timing-v1/phase-checks.json',B/'control-fetch-v1/prepare.mjs',B/'control-held-ir-v1/prepare.mjs',B/'control-front-v1/prepare.mjs',B/'control-reset-retire-v1/logic.mjs',B/'control-reset-retire-v1/README.md']
report['source_sha256']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
(H/'induction.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'metrics':metrics,'negative_cases':len(negatives),'full_core_timing_acceptance':False}))
