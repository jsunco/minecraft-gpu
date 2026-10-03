"""Conditional actual-cell four-channel normal return ordering.

This is fixed scheduled-component arithmetic under held-source and stable-state
premises. It is not event simulation, physical delay bounds or native acceptance.
"""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];pins={}
def read(p):
 pins[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.load(open(p))
def extrema(r):return min(x['potential_dependency_nominal_min_ticks']for x in r['paths']),max(x['potential_dependency_nominal_max_ticks']for x in r['paths'])
def at(r,src,dst,latest=True):
 a=r['source_positions'].index(list(src));b=r['target_positions'].index(list(dst));q=next(x for x in r['paths']if x['address_bit']==a and x['data_bit']==b);return q['potential_dependency_nominal_max_ticks'if latest else'potential_dependency_nominal_min_ticks']
def val(p,n):return extrema(p[n])[1]
local=[read(H/'local-paths.json')['paths']]+[read(H/'legacy-local-paths.json')['paths']]*3
bounds=read(H/'boundary-paths.json')['paths'];bank=read(M/'internal-runtime-timing-v1/bank-combined.json');bankQ=read(H/'bank-ownership-paths.json')['paths'];transport=read(H/'transport-paths.json')['paths'];outputs=read(H/'return-output-paths.json');regrant=read(H/'regrant-paths.json')['paths'];ret=read(H/'retirement-transport-paths.json');cc=read(M/'channel-colocation-v1/control-cables.json');capture0=read(M/'channel-colocation-v1/runtime-combined.json');captureOld=read(M/'internal-runtime-timing-v1/runtime-combined.json');bind=read(H/'binding-checks.json');cold=read(M/'cold-reset-timing-v1/integrated-cold.json');coldpaths=read(M/'cold-reset-timing-v1/paths.json')['reports'];read(M/'feedback-composition-review-v2/source-manifest.json')
assert bind['composition_manifest_sha256']=='273b4b23e6014bedaf8a61ca1c5861616d58407d631a9fb6194c00404b5b50f4'
new=cc['new_transport'];nc={v['name']:v for v in new['connections']}
def newcost(name):
 i=next(i for i,v in enumerate(new['connections'])if v['name']==name);return next(v['potential_dependency_nominal_max_ticks']for v in new['paths']if v['address_bit']==i and v['data_bit']==i)
old_ret=ret['paths']['raw_backend_return_to_global_receiver'];old_mask=ret['paths']['actual_bank_collector_to_qualified_return'];rb=ret['bindings']
def oldcost(ch,name):
 i=next(i for i,v in enumerate(rb)if v['channel']==ch and v['name']==name);return next(v['potential_dependency_nominal_max_ticks']for v in old_ret['paths']if v['address_bit']==i and v['data_bit']==i)
def maskcost(ch,name):
 i=next(i for i,v in enumerate(rb)if v['channel']==ch and v['name']==name);return next(v['potential_dependency_nominal_max_ticks']for v in old_mask['paths']if v['address_bit']==ch-1 and v['data_bit']==i)
srset=val(bounds,'retiring_set_to_negative')+val(bounds,'retiring_negative_to_positive');srclear=val(bounds,'retiring_clear_to_positive');assert srset==14 and srclear==6
activeclear=val(bounds,'RETIRE_to_ACTIVE_low');qexport=val(local[0],'response_Q_to_output');assert activeclear==8 and qexport==2
retireCable=[newcost('retire')]+[oldcost(ch,'retire')for ch in range(1,4)]
busyCable=[newcost('backend_busy')+val(bounds,'backend_BUSY_arrival_to_live_BUSY')]+[oldcost(ch,'backend_busy')for ch in range(1,4)]
ownerCable=[newcost('owner_valid')]+[oldcost(ch,'owner_valid')for ch in range(1,4)]
activeCable=[]
for ch in range(4):
 r=cc['paths']['ACTIVE_Q_to_backend_ACTIVE'];activeCable.append(next(v['potential_dependency_nominal_max_ticks']for v in r['paths']if v['address_bit']==ch and v['data_bit']==ch))
assert activeCable[0]==newcost('active')+val(bounds,'ACTIVE_to_relocated_pickup')
rows=[];maskrows=[];consumerrows=[];cold_rebind={}
for ch in range(4):
 L=local[ch];taps=L['RETIRING_Q_to_three_taps']['paths'];t1=taps[0]['potential_dependency_nominal_max_ticks'];t3=taps[2]['potential_dependency_nominal_max_ticks']
 # Earliest release assumes bank tail already low and global barrier already open.
 # A later real mask withdrawal delays release; it cannot shorten this path.
 release=t3+val(L,'retiring_t3_to_RETIRE')+retireCable[ch]+activeclear
 qlow_after_release=activeCable[ch]+val(L,'ACTIVE_fall_to_RETIRING_clear')+srclear
 qlow=release+qlow_after_release
 capped=[r for r in (capture0 if ch==0 else captureOld)['global_response']if r['channel']==ch]
 assert len(capped)==32
 close_to_capture=min(v['close_to_CAPTURED_set_min']for v in capped)
 raw=cc['paths']['backend_request_to_raw_bank_VALID'];requestmin=min(v['potential_dependency_nominal_min_ticks']for v in raw['paths']if v['address_bit']==ch)
 # Matching bank BUSY must reach both qualified retire and live-BUSY before any
 # operation's earliest READY. Taking the entire return suffix is conservative.
 bankm=[];tailm=[]
 for b,(ox,oz)in enumerate([(148,1078),(580,1078),(148,1700),(580,1700)]):
  bo=(ox,26,oz);owner=(ox+100,-26+4*ch,oz+[-114,-111,-108,-102][ch]);active=(ox+8,-15,oz-454);owned=(ox+243+4*ch,65,oz-115);collector=transport['owned_BUSY_to_channel_collector']['target_positions'][ch]
  ownerQ=bank['details']['owner'][ch]['lock_close_latest']+2
  ident=val(bankQ,'owner_Q_to_busy_identity_'+str(ch))
  br=transport['bank_state_to_owned_BUSY'];cr=transport['owned_BUSY_to_channel_collector']
  base=max(ownerQ+ident+at(br,owner,owned),val(bankQ,'common_epoch_to_bank_ACTIVE')+at(br,active,owned))+at(cr,owned,collector)
  pathsuffix=newcost('downstream_bank_busy')+val(L,'downstream_BANK_BUSY_to_retire')if ch==0 else maskcost(ch,'retire')
  busysuffix=newcost('downstream_bank_busy')+val(L,'downstream_BANK_BUSY_to_backend_busy')+busyCable[ch]if ch==0 else maskcost(ch,'backend_busy')
  ready=min(v['earliest']for v in bank['ready']if v['name'] in ['read_ready_'+str(ch),'write_ready_'+str(ch)])
  m=ready-max(base+pathsuffix,base+busysuffix)
  tail=(ox+10,-15,oz-454);tail_margin=ready+at(br,active,owned,False)-(val(bankQ,'common_epoch_to_bank_tail_export')+at(br,tail,owned));tailm.append(tail_margin)
  maskrows.append({'bank_ACTIVE_to_tail_BUSY_overlap_margin':tail_margin,'channel':ch,'bank':b,'owner_acquired_and_qualified_latest':base,'retire_mask_effect_latest':base+pathsuffix,'live_BUSY_effect_latest':base+busysuffix,'earliest_bank_READY':ready,'margin':m});bankm.append(m)
 # All8 consumer outputs are measured through the actual matrix, type gates,
 # retained-owner masks, and repaired complete cable paths.
 ready_delays=[];data_delays=[]
 for c in range(8):
  ready=[v for v in outputs['paths']if outputs['source_bindings'][v['address_bit']]['channel']==ch and outputs['source_bindings'][v['address_bit']]['kind']=='backend_ready' and v['data_bit'] in [c,8+c]]
  data=[v for v in outputs['paths']if outputs['source_bindings'][v['address_bit']]['channel']==ch and outputs['source_bindings'][v['address_bit']]['kind']=='retained_response' and 16+8*c<=v['data_bit']<16+8*(c+1)]
  assert len(ready)==2 and len(data)==8
  rmin=min(v['potential_dependency_nominal_min_ticks']for v in ready);rmax=max(v['potential_dependency_nominal_max_ticks']for v in ready);dmax=max(v['potential_dependency_nominal_max_ticks']for v in data)
  # A response is certainly stable at the already-closed bank plus one2-tick
  # storage allowance and the measured2-tick output normalizer. The prior
  # capture report separately establishes that its D settled before closure.
  setup=close_to_capture+srset+val(L,'CAPTURED_Q_to_consumer_ready')+rmin-(2+qexport+dmax)
  before_release=release-(val(L,'RETIRING_Q_to_consumer_ready')+rmax)
  consumerrows.append({'channel':ch,'consumer':c,'DATA_before_READY_margin':setup,'READY_low_before_global_ACTIVE_clear_margin':before_release,'READY_transport_min':rmin,'READY_transport_max':rmax,'DATA_transport_max':dmax})
  ready_delays.append(rmax);data_delays.append(dmax)
 # Continuous live-BUSY handoffs use the same actual OR and same outgoing
 # return cable. Common suffixes cancel in these overlap comparisons.
 C_to_R=t1+val(L,'retiring_t1_to_CAPTURED_clear')+srclear+val(L,'CAPTURED_Q_to_backend_busy')-val(L,'RETIRING_Q_to_backend_busy')
 R_to_tail=qlow+val(L,'RETIRING_Q_to_backend_busy')-(t3+val(L,'retiring_t3_to_BUSY'))
 # C->bank_request falling must traverse the measured full request path and
 # the nonnegative bank/READY return path before withdrawing bank READY.
 # Counting only requestmin is an intentionally conservative lower bound.
 initial_busy=val(L,'CAPTURED_Q_to_bank_request')+requestmin+val(L,'bank_READY_direct_to_BUSY')-val(L,'CAPTURED_Q_to_backend_busy')
 phase=regrant['same_coil_snapshot_close_and_commit_open']['paths'];busylock=regrant['snapshot_close_to_all_busy_locks']['paths'][ch];commitpath=regrant['commit_open_to_all_ACTIVE_SET']['paths'][ch]
 regrant_min=phase[1]['potential_dependency_nominal_min_ticks']+commitpath['potential_dependency_nominal_min_ticks']-(phase[0]['potential_dependency_nominal_max_ticks']+busylock['potential_dependency_nominal_max_ticks'])
 retire_residual=max(0,val(L,'retiring_t3_to_RETIRE')+retireCable[ch]-(val(L,'retiring_t3_to_BUSY')+busyCable[ch]))
 source_valid=transport['raw_VALID_fanout_to_matching_owner_VALID'];validpaths=[v for v in source_valid['paths']if v['data_bit']==ch]
 valid_drop_max=val(bounds,'external_VALID_to_fanout_tap')+max(v['potential_dependency_nominal_max_ticks']for v in validpaths)+ownerCable[ch]+val(L,'owner_valid_to_retiring_set')+srset
 last_livebusy=qlow_after_release+t3+val(L,'retiring_t3_to_BUSY')+busyCable[ch]
 drain= bounds['live_BUSY_to_consumer_drained'];drainmax=max(v['potential_dependency_nominal_max_ticks']for v in drain['paths']if v['address_bit']==ch)
 rows.append({'channel':ch,'bank_ACTIVE_to_tail_BUSY_overlap_min':min(tailm),'old_RETIRE_low_before_possible_new_ACTIVE_SET_margin':regrant_min-retire_residual,'minimum_live_BUSY_low_to_new_SET':regrant_min,'latest_old_RETIRE_low_after_live_BUSY_low':retire_residual,'bank_mask_and_live_busy_before_bank_READY_margin':min(bankm),'response_capture_close_before_bank_VALID_fall_margin':close_to_capture+srset+val(L,'CAPTURED_Q_to_bank_request')+requestmin,'DATA_before_READY_min':min(v['DATA_before_READY_margin']for v in consumerrows if v['channel']==ch),'READY_low_before_global_ACTIVE_clear_min':min(v['READY_low_before_global_ACTIVE_clear_margin']for v in consumerrows if v['channel']==ch),'CAPTURED_busy_before_bank_READY_busy_fall_margin':initial_busy,'CAPTURED_to_RETIRING_BUSY_overlap':C_to_R,'RETIRING_to_delayed_BUSY_overlap':R_to_tail,'earliest_ACTIVE_clear_from_RETIRING_Q':release,'latest_RETIRING_Q_zero_after_ACTIVE_clear':qlow_after_release,'latest_live_BUSY_low_after_ACTIVE_clear':last_livebusy,'latest_consumer_drained_after_ACTIVE_clear_if_other_channels_unowned':last_livebusy+drainmax,'external_matching_VALID_low_to_RETIRING_Q_max':valid_drop_max})
 # Keep corrected reset sources and long old residual-tail gate explicit.
 resetcable=newcost('reset_blocked')if ch==0 else None
 if ch==0:
  cold_rebind={'new_backend_C_R_forced_zero_from_memory_reset_max':86+124+resetcable+max(val(L,'reset_to_state_clear')+20,0),'new_response_locks_closed_from_memory_reset_max':86+124+resetcable+val(L,'reset_to_response_locks'),'scope':'The unchanged held cold source, no pulse-only reset, and the old arbitrary-state/actual-mask witness prerequisites remain mandatory.'}
# Add an explicit worst downstream pipeline allowance after the source-bound
# old reset-extension residual allowance. This serial overcount intentionally
# covers READY input tail, local output logic, global returns and consumer ORs.
ready_ingress=max(v['max_nominal_dependency_ticks']for n,v in cc['paths'].items()if n in ['qualified_bank_ready_to_collector','qualifier_to_backend_ready'])+cc['paths']['qualifier_to_backend_ready']['max_nominal_dependency_ticks']
local_tail=3186;local_effect=max(v['max_nominal_dependency_ticks']for L in local for n,v in L.items()if n!='RETIRING_Q_to_three_taps')
# local_effect excludes only full chain already counted; includes all direct outputs.
extra=ready_ingress+local_tail+local_effect+max(retireCable+busyCable)+outputs['max_nominal_dependency_ticks']+bounds['live_BUSY_to_consumer_drained']['max_nominal_dependency_ticks']+20
latest=cold['latest_memory_residual_from_global_cold_withdrawal']+extra
cold_rebind.update(extra_conservative_downstream_flush=extra,latest_rebound_residual_from_global_COLD_withdrawal=latest,earliest_permission_same_origin=cold['earliest_permission_from_global_cold_withdrawal'],nominal_margin=cold['earliest_permission_from_global_cold_withdrawal']-latest,assumptions=['This serial overcount is conditional on source-held0, finite actual DAG transport and the original bounded pending-update model; it is not an arbitrary Minecraft scheduling bound.','Backing bytes and response Q need not reset to0. No READY or admission may expose arbitrary retained data before cold/conditioning completes.','Bank raw reset, global request masking, six literal-F removals, fresh RF scan and all owner/phase-tail witnesses are unchanged by the four patches.'])
keys=['bank_ACTIVE_to_tail_BUSY_overlap_min','old_RETIRE_low_before_possible_new_ACTIVE_SET_margin','bank_mask_and_live_busy_before_bank_READY_margin','response_capture_close_before_bank_VALID_fall_margin','DATA_before_READY_min','READY_low_before_global_ACTIVE_clear_min','CAPTURED_busy_before_bank_READY_busy_fall_margin','CAPTURED_to_RETIRING_BUSY_overlap','RETIRING_to_delayed_BUSY_overlap']
def check(rs,c):
 assert len(rs)==4 and {v['channel']for v in rs}==set(range(4))
 for v in rs:
  for k in keys:assert v[k]>0,(v['channel'],k,v[k])
 assert c['nominal_margin']>0
check(rows,cold_rebind);negatives=[]
for ch in range(4):
 for key in keys:
  bad=copy.deepcopy(rows);bad[ch][key]=0
  try:check(bad,cold_rebind)
  except AssertionError:negatives.append({'channel':ch,'zero_margin':key})
  else:raise AssertionError('unsafe margin accepted')
bad=copy.deepcopy(cold_rebind);bad['nominal_margin']=0
try:check(rows,bad)
except AssertionError:negatives.append({'zero_margin':'cold residual to permission'})
else:raise AssertionError('unsafe cold bound accepted')
result={'status':'conditional_four_channel_actual_return_handshake_inequalities_pass','inspection_composition_manifest':bind['composition_manifest_sha256'],'channels':rows,'bank_mask_arrivals':maskrows,'consumer_arrivals':consumerrows,'SR_state_transition_nominal':{'SET_to_positive':srset,'CLEAR_to_positive':srclear,'global_RETIRE_to_ACTIVE_low':activeclear},'cold_rebind':cold_rebind,'negative_margin_cases':negatives,'normal_protocol_premises':['Begin from a freshly conditioned, stable normal epoch, all prior bank/READY/retirement tails drained and all input mask/owner/type circuits settled.','One retained global channel owner/type/payload belongs to exactly one request until release. Unselected owners are stable; one selected bank holds actual owner-qualified READY/data until bank VALID falls.','Requester holds matching VALID and payload through actual READY and read-response capture closure, then lowers matching VALID; it cannot cancel, mutate or reuse while waiting. Opposite pending request is not the acknowledgement.','Global READY requires CAPTURED, actual bank READY low and final READY delay low. RETIRING starts only after matching owner VALID low, and is retained until global ACTIVE is actually cleared.','The actual global admission barrier may delay clearing ACTIVE; it cannot advance the earliest release. It must eventually open under the normal free-running phase premise.','Live BUSY = ACTIVE OR qualified backend BUSY. Backend BUSY includes CAPTURED/RETIRING/delayed RETIRING and actual matching bank tail, so snapshots cannot regrant while these remain high. Snapshot BUSY stays closed through owner/payload OPEN; those phase-window guarantees remain their separate source-bound admission premise.','Consumer reuse/reset requires actual consumer_drained AND both read_ready and write_ready low. Drained is an actual owner×live-BUSY OR, never a READY-low alias.','Fixed device sums presume functioning scheduled components, pulse transport, positive signal strength, stable comparator mode inputs, correct storage aperture and no unmodelled update/torch-burnout hazard. These are not measured physical minima/maxima.'],'coverage':{'bank_mask_cases':len(maskrows),'consumer_pairs':len(consumerrows),'actual_DATA_READY_dependencies':len(outputs['paths']),'actual_live_BUSY_to_drained_dependencies':len(bounds['live_BUSY_to_consumer_drained']['paths']),'matching_VALID_dependencies':64,'complete_return_transport_DAGs':80,'remaining_three_channel_RETIRE_BUSY_and_VALID_cables':9},'remaining':['Independent bounded review of this composition and its dynamic-state premises.','Physical edge/pulse/late-input/phase and arbitrary-pending-event verification; no native execution was performed.','Original release-within-scan and same-word concurrent access semantic refinement remains separately unselected.','Future fabric colocation invalidates moved component/cable numeric paths; rebind local controls, bank-mask returns, request/response joins, consumer outputs and cold delivery against its actual new cells.','This is return/capture/release timing only, not complete GPU correctness, complete whole-layout electrical equivalence, global geometry selection or compactness acceptance.'],'numeric_physical_bounds_established':False,'complete_memory_dynamic_acceptance':False,'native_acceptance':False,'world_mutations':0,'source_sha256':pins}
pins[str(Path(__file__).resolve().relative_to(ROOT))]=hashlib.file_digest(Path(__file__).resolve().open('rb'),'sha256').hexdigest();(H/'combined.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'channels':rows,'cold_rebind':cold_rebind,'negatives':len(negatives)},indent=2))
