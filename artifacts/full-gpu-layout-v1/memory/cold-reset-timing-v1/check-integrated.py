"""Conditional, source-bound cold/scanner timing. No host delay or native call.

This uses the project's fixed scheduled-component arithmetic and functioning
oscillator premise. It is not a bound on Minecraft scheduling or torch burnout.
"""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;B=H.parents[1];ROOT=H.parents[3];pins={}
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):pins[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
s=read(H/'scanner-admission-paths.json')['reports'];st=s['stores'];assert len(st)==16
global_paths=read(B/'global-complete-timing-v1/checks.json')
global_windows=read(B/'global-complete-timing-v1/window-checks.json');assert global_windows['minimum_nominal_setup_margin']==388
clock=read(B/'core-phase-source/design.json')['nominal_component_sums'];T=clock['cycle_ticks'];wa=clock['phase_a_width_ticks'];wb=clock['phase_b_width_ticks'];bstart=clock['half_cycle_ticks']+clock['direct_to_b_extra_ticks'];late=4
assert(T,wa,wb,bstart)==(3160,544,540,1584)
P={(v['address_bit'],v['data_bit']):v for v in s['paths']};val=lambda a,b:P[a,b]['potential_dependency_nominal_max_ticks']
clocks={i:val(1 if q['phase']=='A'else 2,16+i)for i,q in enumerate(st)}
deps=[]
for v in s['paths']:
 a,b=v['address_bit']-3,v['data_bit']
 if a<0 or b>=16:continue
 assert st[a]['phase']!=st[b]['phase'],('Same phase must not be silently cut',a,b)
 gap=clock['a_to_b_gap_ticks'if st[a]['phase']=='A'else'b_to_a_gap_ticks']+clocks[b]-clocks[a]
 margin=gap-late-v['potential_dependency_nominal_max_ticks'];assert margin>0
 deps.append({'source':a,'target':b,'margin':margin})
assert len(deps)==36
# Relative origin is INIT arrival at each physical scanner pad. Wait up to one
# FULL period for a suitable NEXT opening after every selected D has settled.
# Then use actual source-epoch B/A arrival difference, not nominal half alone.
zero_bounds=[]
for i in range(0,16,2):
 data=val(0,i);to_current=val(3+i,i+1);assert to_current==6
 next_to_current=bstart+clocks[i+1]-clocks[i]
 assert next_to_current>wa+late+to_current
 export=2 if i==14 else 0
 qzero=data+late+T+next_to_current+late+export
 closed=data+late+T+next_to_current+wb+late
 zero_bounds.append({'next_store':i,'current_store':i+1,'init_to_next_D':data,'next_to_current_open':next_to_current,'current_Q_export_zero_by':qzero,'current_lock_closed_zero_by':closed})
assert max(q['current_lock_closed_zero_by']for q in zero_bounds)==5922
held_cold_clock=next(p['nominal_max_ticks']for p in global_paths['paths']if p['source']==28 and p['target']=={'kind':'lock','store':8,'position':[442,1,1]})
assert held_cold_clock==146
# Source-derived FSM COLD_FIRST0 -> SECOND1 -> HOLD2 -> CONDITIONING3:
# three held-command A captures, with the latest initial rise and earliest fall.
cold_high=3*T-wa-late;assert cold_high==8932
cold_last_rise=held_cold_clock+wa+late+2
assert cold_high>max(q['current_lock_closed_zero_by']for q in zero_bounds)
routes=lambda p:{v['name']:v for v in read(p)['nominal_timing']['routes']}
outward=routes(B/'master-core-conditioning-routes-v1/checks.json');back=routes(B/'master-core-admission-routes-v1/checks.json')
stale=[]
for core in range(2):
 sample=24+core
 bclock=next(p['nominal_min_ticks']for p in global_paths['paths']if p['source']==29 and p['target']['kind']=='lock'and p['target']['store']==sample)
 close=2*T+bstart+bclock+wb
 incoming=outward['core_cold_initialize_'+str(core)]['nominal_max_ticks'];returning=back['global_rf_admitted'+str(core)]['nominal_max_ticks']
 fresh_zero=cold_last_rise+incoming+zero_bounds[-1]['current_Q_export_zero_by']+returning+2
 margin=close-fresh_zero-late;assert margin>0
 stale.append({'core':core,'INIT_cable':incoming,'RF_admission_return':returning,'global_B2_sample_close':close,'zero_at_sample_D_by':fresh_zero,'nominal_setup_margin':margin})
assert [v['nominal_setup_margin']for v in stale]==[786,314]
# Exhaust all16 retained scanner/READY/admission bits and both initial phases.
# INIT clamps every NEXT and the visible READY. One full ordered transfer scrubs
# all cells; no assumed default block state or requested lever value is used.
arbitrary=0
for bits in range(1<<16):
 for first in ['A','B']:
  state=[bool(bits>>i&1)for i in range(16)]
  for phase in [first,'A','B']:
   old=state.copy()
   if phase=='A':
    for i in range(0,16,2):state[i]=False
   else:
    for i in range(1,16,2):state[i]=old[i-1]
  assert not any(state);arbitrary+=1
# Fresh Q5 requires32 CURRENT increments from both banks zero. Even permitting
# the first increment at the withdrawal instant, the remaining31 periods are
# mandatory. READY and the two retained admission stages only increase it.
count=0;visited=[]
for k in range(32):visited.append(count);count+=1
assert visited==list(range(32))and count==32
fresh_scan=31*T;assert fresh_scan==97960
local=read(H/'paths.json')['reports'];cable=read(H/'reset-cables.json')['reports']
ext=read(H.parent/'cold-extender-removal-v1/checks.json');assert ext['changed_sources']==6 and ext['owner_payload_bits_changed']==0
read(H.parent/'cold-extender-removal-v1/source-manifest.json')
owner_mask=read(H.parent/'program-cold-mask-repair-v1/checks.json');assert owner_mask['repaired_owner_mask_nominal_ticks']==106
read(B/'master-memory-cold-routes-v1/checks.json')
pins[str((B/'master-memory-cold-routes-v1/README.md').relative_to(ROOT))]=sha(B/'master-memory-cold-routes-v1/README.md')
mx=lambda n:local[n]['max_nominal_dependency_ticks']
cx=lambda n:cable[n]['max_nominal_dependency_ticks']
# Known-state forcing while the continuous raw cold mask is high. SR clear is
# dominant over SET;20 accounts for the two actual10-tick feedback arms, not an
# instantaneous Boolean update. Actual rise/fall/closure remain native gates.
master_active_zero=cx('master_raw_reset_to_ACTIVE_clear_support_and_SET_mask')+20
channel_active_zero=mx('global/raw_reset_to_blocked')+mx('global/blocked_to_all_active_supports_and_set_masks')+20
backend_zero=mx('global/raw_reset_to_blocked')+mx('global/blocked_to_backend_fanout_tap')+cx('channel-backend-v1')+mx('backend/blocked_to_SR_clear_supports_and_set_inputs')+20
bank_zero=cx('four-bank-service-v1')+mx('bank/raw_reset_to_blocked')+mx('bank/blocked_to_active_support_and_set_mask')+20
program_zero=mx('program/raw_reset_to_blocked')+mx('program/blocked_to_active_support_and_set_mask')+20
far_locks=max(mx('global/raw_reset_to_all_snapshot_owner_payload_locks'),mx('global/raw_reset_to_blocked')+mx('global/blocked_to_backend_fanout_tap')+cx('channel-backend-v1')+mx('backend/blocked_to_response_locks_and_outputs'),cx('four-bank-service-v1')+mx('bank/raw_reset_to_blocked')+mx('bank/blocked_to_all_store_locks'))
normal_settle={'program':program_zero+mx('program/ACTIVE_to_lock_and_ready_outputs'),'banks':bank_zero+mx('bank/ACTIVE_to_lock_and_ready_outputs'),'global_capture_commit':master_active_zero+mx('global/ACTIVE_to_capture_and_commit_endpoints'),'global_tail':master_active_zero+mx('global/ACTIVE_to_normal_tail')}
assert max(master_active_zero,channel_active_zero,backend_zero,bank_zero,program_zero,far_locks)<cold_high
assert max(normal_settle.values())<cold_high
tail={n:local[n+'/RESET_F_to_reset_tail']['max_nominal_dependency_ticks'] for n in ['program','bank','global']}
# Literal F0 removes the feedback source. Conservatively allow two whole old
# path lengths plus 2*tail-to-BLOCKED for residual scheduled state. This exceeds
# the fixed-transport DAG flush; physical bounded scheduling is still a premise.
flush={n:2*(tail[n]+local[n+'/reset_tail_to_blocked']['max_nominal_dependency_ticks']) for n in tail}
assert max(flush.values())==24984
memory_cold=max(842,690); earliest_scan_cold=min(v['INIT_cable']for v in stale)
# Compare at the SAME held-global-COLD source origin. Memory gets the latest
# withdrawal, scanner the earliest. Deliberately omit all final return/capture
# delays on permission, yielding a conservative early enable estimate.
latest_residual=memory_cold+max(flush.values());earliest_permission=earliest_scan_cold+fresh_scan
assert earliest_permission>latest_residual
negatives=0
def require_gate(cold,zero,stale_margins,period,transfers,flushbound,memcable,scancable):
 assert cold>zero and min(stale_margins)>0 and period>0 and transfers==32
 assert scancable+(transfers-1)*period>memcable+flushbound
require_gate(cold_high,5922,[786,314],T,32,max(flush.values()),842,918)
for args in [(5922,5922,[786,314],T,32,24984,842,918),(8932,5922,[786,0],T,32,24984,842,918),(8932,5922,[786,314],T,1,24984,842,918),(8932,5922,[786,314],700,32,24984,842,918),(8932,5922,[786,314],T,32,100000,842,918)]:
 try:require_gate(*args)
 except AssertionError:negatives+=1
 else:raise AssertionError('Unsafe gate survived')
for p in [Path(__file__).resolve(),ROOT/'hardware/full-gpu-global-control-logic-v3.mjs',ROOT/'hardware/full-gpu-startup-scan-control.mjs',ROOT/'hardware/full-gpu-startup-scan-counter.mjs']:pins[str(p.relative_to(ROOT))]=sha(p)
report={'status':'conditional_integrated_cold_and_fresh_RF_scan_nominal_certificate','scanner_stores':16,'actual_cross_phase_dependencies':len(deps),'minimum_scanner_dependency_setup':min(v['margin']for v in deps),'arbitrary_scanner_initial_state_phase_cases':arbitrary,'cold_high_min_nominal':cold_high,'scanner_zero_and_closed_max_nominal':5922,'cold_hold_margin':cold_high-5922,'memory_forced_zero_bounds':{'master_active':master_active_zero,'channel_active':channel_active_zero,'backend_C_R':backend_zero,'bank_active':bank_zero,'program_active':program_zero,'far_lock_closure':far_locks},'normal_control_settled_before_cold_withdrawal':normal_settle,'minimum_normal_tail_cold_margin':cold_high-max(normal_settle.values()),'per_pair_zero_bounds':zero_bounds,'stale_admission_clear':stale,'fresh_scan_current_transfers':32,'fresh_scan_lower_bound':fresh_scan,'removed_extender_tail_flush_allowance':flush,'latest_memory_residual_from_global_cold_withdrawal':latest_residual,'earliest_permission_from_global_cold_withdrawal':earliest_permission,'post_withdrawal_nominal_margin':earliest_permission-latest_residual,'negative_refusals':negatives,'source_sha256':pins,'premises':['Selected global controller has first been forced to its real COLD_FIRST state through actual BOOT/closed A/B transfers. Arbitrary global state without BOOT is not accepted.','The actual3160 oscillator runs with A544/B540, correct polarity, complete local pulse delivery, no torch burnout, bounded component scheduling and four-tick late-store allowance.','Actual raw cold level is continuously held; no short-pulse-only reset contract survives the six extender source removals.','Both selected cores and all reset consumers retain the counted interfaces/routes; phase gating/reset clamps and all downstream latch closures work under the same nominal model.','Global normal permission and memory admission block remain in their cold/conditioning values until freshly cleared RF admission rises AND all other actual core/memory drain predicates qualify.'],'strict_admission_scope':['The physical cold mask closes capture/commit/READY producers during cold; old tail contents cannot authorize START or a new external request while the held global admission block is asserted.','The actual owner/payload/commit flush witness and bank/program quiet predicates remain mandatory. Endpoint-low or elapsed time never substitutes for them.','This report does not declare that every internal wire remains glitch-free during arbitrary initial settling. Its stable-enable claim starts after the bounded flush and fresh scanner sequence.'],'limits':['All numbers are nominal fixed-component arithmetic; they are not measured maximum/minimum Minecraft event timing.','No host timer or software counter drives the machine. The finite model checks only the already routed physical scan sequencing.','The remaining six reset negative torch halves and all old tails remain in the map; they no longer have a positive F feedback source.','The complete actual memory owner/READY and full master initialization behavior still needs native observation before physical acceptance.'],'native_acceptance':False,'numeric_physical_bounds_established':False,'complete_physical_cold_acceptance':False}
(H/'integrated-cold.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if not isinstance(v,(list,dict))}))
