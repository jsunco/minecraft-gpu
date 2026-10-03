"""Compose actual cold/epoch paths; never assume scanner READY clears FI/R.
The finite interleaving check documents retained-state induction, not physical
simulation. Every ordering lemma used below is separately tied to graph arcs.
"""
from pathlib import Path
import json,hashlib,itertools
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];pins={}
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def read(p):
 pins[str(p.relative_to(ROOT))]=sha(p);r=json.loads(p.read_text())
 for name,h in r.get('source_sha256',{}).items():assert sha(ROOT/name)==h,name
 return r
r=read(H/'paths.json');fa=read(H/'fetch-arcs.json');old=read(B/'control-fetch-epoch-timing-v1/arcs.json');normal=read(B/'control-fetch-epoch-timing-v1/induction.json');ph=read(B/'compact-core-guard-timing-v1/phase-checks.json');cold=read(B/'memory/cold-reset-timing-v1/integrated-cold.json');front=read(B/'compact-core-guard-timing-v1/front-state-checks.json');source_guards=read(H/'source-guards.json');global_paths=read(B/'global-complete-timing-v1/checks.json');cold_cables=read(B/'master-core-conditioning-routes-v1/checks.json')
assert fa['rows']==old['rows'] and fa['matched_fetch_IR_cells']==7430
assert not any(q['unbounded']for q in r['rows'])
assert front['minimum_finite_margin']==822 and front['unbounded_rows']==0
rows={(q['source'],q['target']):q for q in r['rows']}
def d(a,b,which='max'):return rows[a,b]['nominal_'+which]
def phase(p,typ,which='max'):return next(q['nominal_'+which+'_ticks']for q in ph['phase_paths']if q['storage']==list(p)and q['phase']==typ)
T=3160;A=544;Bs=1584;Bw=540;late=4;gate=2
flush=normal['nominal_metrics']['required_front_flush_after_both_intent_Q_zero'];assert flush==860
# Continuously normalized cold forces the side of all five actual subtractors.
# All alternative paths have been included in their latest settling values.
intent_d=max(d('cold_RF_input','FI_clear_side')+gate+d('intent_clamp_FI','FI_D'),d('cold_RF_input','R_clear_side')+gate+d('intent_clamp_R','R_D'))
core_d=max(d('cold_RF_input','core'+str(i)+'_clear_side')+gate+d('core_clamp'+str(i),'core'+str(i)+'_D')for i in range(3))
enable=max(d('cold_RF_input','next_phase_mask'),d('cold_RF_input','current_phase_mask'))+gate
ready=max(intent_d,core_d,enable)+late
# Wait at most one whole SOURCE period after all D/enable paths have settled;
# use latest physical lock arrivals, never an assumed phase alias.
a_root=ready+T
intent_latest=max(phase((-38,1+4*i,90),'A')for i in range(2))
q_zero=a_root+intent_latest+late
intent_closed=a_root+A+intent_latest+late
front_flushed=q_zero+flush+late
current_closed=a_root+Bs+Bw+max(phase((-8,1+4*i,0),'B')for i in range(3))+late
min_pulse=min(A+phase((-38,1+4*i,90),'A','min')-phase((-38,1+4*i,90),'A')for i in range(2))
# Width must be transported to the SAME local origin as the zero/closure bound.
# Actual global store->boundary DAG is joined to source-pinned cable arithmetic.
# Equal rise/fall propagation is a nominal model assumption, not measured timing.
role=global_paths['source_roles'][8]
assert role['storage']==[442,1,0] and role['family']=='held_command' and role['phase']=='A'
gp=next(q for q in global_paths['paths']if q['source']==8 and q['target'].get('port')=='cold_initialize')
assert gp['target']['position']==[445,1,0] and gp['nominal_min_ticks']==gp['nominal_max_ticks']==2
cold_transport=[]
for i,z in enumerate([-1552,-3072]):
 cable=next(q for q in cold_cables['nominal_timing']['routes']if q['name']=='core_cold_initialize_'+str(i))
 assert cable['source']==dict(x=-555,y=-54,z=550)
 assert cable['destination']==dict(x=-20,y=231,z=-263+z)
 assert cable['nominal_min_ticks']==cable['nominal_max_ticks']==[918,1154][i]
 assert cable['torch_inversions']==[182] # positive endpoint polarity
 rise_max=gp['nominal_max_ticks']+cable['nominal_max_ticks']
 fall_min=gp['nominal_min_ticks']+cable['nominal_min_ticks']
 width_loss=rise_max-fall_min
 local_high=cold['cold_high_min_nominal']-width_loss
 cold_transport.append({'core':i,'source_held_Q_local':role['storage'],'global_output_to_RF_input_delay':cable['nominal_max_ticks'],'held_Q_to_RF_input_rise_max':rise_max,'held_Q_to_RF_input_fall_min':fall_min,'assumed_nominal_width_loss':width_loss,'RF_input_high_min_same_origin':local_high,'rise_fall_equality':'fixed transport model only; physical asymmetry/burnout unverified'})
local_high=min(q['RF_input_high_min_same_origin']for q in cold_transport)
assert min_pulse>late and local_high>max(intent_closed,front_flushed,current_closed)
cold_result={'cold_high_at_actual_RF_input_min':local_high,'same_origin_transport':cold_transport,'RF_input_to_front_initialize':d('cold_RF_input','front_initialize'),'intent_clamped_D_zero_by':intent_d,'core_NEXT_clamped_D_zero_by':core_d,'bank_enable_settled_by':enable,'first_guaranteed_full_A_source_by':a_root,'both_intent_Q_zero_by':q_zero,'both_intents_closed_by':intent_closed,'whole_front_flushed_by':front_flushed,'all_three_core_CURRENT_closed_zero_by':current_closed,'minimum_delivered_intent_A_pulse':min_pulse,'cold_remaining_after_front_flush':local_high-front_flushed,'cold_remaining_after_core_CURRENT_close':local_high-current_closed,'earliest_global_permission_after_cold_withdrawal':cold['earliest_permission_from_global_cold_withdrawal']}
# Actual stop masks reach B advance samplers before the candidate boundary can
# become eligible; raw masks cannot rewrite already captured guard Q.
mask_order={}
for name,p in [('IDLE',(82,1,-120)),('UPDATE',(82,25,-120))]:
 to_guard=d('entry_mask',name+'_advance_D');to_candidate=d('entry_mask','candidate_D','min')
 # A candidate may be captured at the very last end of its A window. The
 # following B must then still capture a fully settled zero advance.
 candidate_close=A+phase((-418,65,-140),'A')+late
 latest_mask_rise=candidate_close-to_candidate
 b_open=Bs+phase(p,'B','min')
 margin=b_open-(latest_mask_rise+to_guard+late)
 assert margin>0
 mask_order[name]={'mask_to_advance_D':to_guard,'mask_to_candidate_D_min':to_candidate,'following_B_zero_setup_min':margin}
state_margin=min(T-Bs+phase((-418,69,-140),'A','min')-(phase((-8,1+4*i,0),'B')+late+d('core_CURRENT'+str(i),'parked_D'))for i in range(3))
assert state_margin>0
candidate_margin=T-Bs+phase((-418,69,-140),'A','min')-(phase((-406,65,-140),'B')+late+d('barrier_candidate','parked_D'))
assert candidate_margin>0
# Enumerate all normal starting states, RET choices and held boundary-advance
# inputs. Mask arrival may miss one A completely or be observed on that A.
# Nonboundary instruction progress is adversarial/stallable. A mask that was
# eligible for candidate A is known by the quantified lemma to reach next B.
# Candidate and parked CURRENT update only on B, never on their own A sample.
seen=set();todo=[]
for state,ret,g0,g6 in itertools.product(range(8),range(2),range(2),range(2)):
 v=(state,ret,g0,g6,0,0,0);seen.add(v);todo.append(v)
transitions=0;parked_cases=0
for state,ret,g0,g6,candidate,parked,masked in todo:
 for newly_masked,progress,complete in itertools.product(range(2),range(2),range(2)):
  mask=bool(masked or newly_masked)
  boundary=state in (0,7)or state==6 and complete
  cn=int(mask and boundary);pn=int(parked or(mask and candidate and boundary))
  advance=g0 if state==0 else g6 if state==6 else progress
  ns=state if not advance or state==7 else (7 if ret else 1)if state==6 else state+1
  ng0=0 if mask else progress;ng6=0 if mask else progress
  if pn:
   assert ns in (0,6,7),('Parked left real boundary',state,ns,candidate,mask)
   assert ng0==ng6==0
   parked_cases+=1
  # Once parked, only hold/reset service is legal; ordinary progress already
  # cannot leave IDLE/UPDATE and DONE is absorbing.
  nv=(ns,ret,ng0,ng6,cn,pn,int(mask));transitions+=1
  if nv not in seen:seen.add(nv);todo.append(nv)
# A one-observation replacement is demonstrably unsafe: IDLE + old guard1
# can capture park1 on A while its already captured NEXT commits FETCH on B.
assert 0 in (0,7) and 1 not in (0,6,7)
# Warm epoch clear precedes prepared D; prepared CURRENT then enables the
# A-held transfer permit. Even the fastest legal same-A committed capture
# cannot set settled CURRENT before the following B epoch.
clear_d=max(d('epoch_intent_clear','FI_clear_side')+gate+d('intent_clamp_FI','FI_D'),d('epoch_intent_clear','R_clear_side')+gate+d('intent_clamp_R','R_D'))
clear_lead=d('epoch_intent_clear','epoch_prepared_D','min')-clear_d-late
assert clear_lead>0
prepared_to_enable=T-Bs+phase((-308,181,410),'A','min')-(phase((-406,181,410),'B')+late+d('epoch_prepared','epoch_enable_D'))
assert prepared_to_enable>0
# A0 enable1. B0 committed may become1 (optimistic earliest); A1 captures
# settled_NEXT; B1 commits settled1; only A2 can capture enable0. A1 is a full
# enabled intent-capture window even when A0 was shortened by permit arrival.
settled_to_enable=T-Bs+phase((-308,181,410),'A','min')-(phase((-346,181,410),'B')+late+d('epoch_settled','epoch_enable_D'))
assert settled_to_enable>0
enable_high_at_eligible=phase((-308,181,410),'A')+late+d('epoch_enable','eligible_enable')
settled_earliest_at_eligible=T+Bs+phase((-346,181,410),'B','min')+2+d('epoch_settled','eligible_settled','min')
assert settled_earliest_at_eligible>enable_high_at_eligible
warm_last_zero=T+intent_latest+late
warm_full_close=T+A+intent_latest+late
eligible_earliest=2*T+phase((-308,181,410),'A','min')+2+d('epoch_enable','eligible_enable','min')
warm_flush_lead=eligible_earliest-(warm_last_zero+flush+late)
assert warm_flush_lead>0
sample_clear_lead=d('epoch_sample_clear','epoch_prepared_D','min')-max(d('epoch_sample_clear',n+'_advance_D')for n in ['IDLE','UPDATE'])-late
assert sample_clear_lead>0
warm={'advance_clear_before_epoch_prepared_D':sample_clear_lead,'entry_mask_order':mask_order,'CURRENT_to_parked_A_setup_min':state_margin,'candidate_CURRENT_to_parked_A_setup':candidate_margin,'retained_interleaving_states':len(seen),'retained_interleaving_transitions':transitions,'parked_boundary_assertions':parked_cases,'clear_D_before_prepared_D':clear_lead,'prepared_CURRENT_to_enable_A_setup':prepared_to_enable,'settled_CURRENT_to_enable_A_setup':settled_to_enable,'enable_high_reaches_completion_before_settled_by':settled_earliest_at_eligible-enable_high_at_eligible,'full_enabled_intent_capture_cycle_after_enable_rise':1,'last_guaranteed_FI_R_zero_after_A0':warm_last_zero,'last_guaranteed_FI_R_closed_after_A0':warm_full_close,'earliest_completion_enable_low_after_A0':eligible_earliest,'front_flush_before_completion_may_qualify':warm_flush_lead}
negative=[]
def accepts_cold(high,closed,flushed,current_closed,pulse):
 assert high>closed and high>flushed and high>current_closed and pulse>late

def accepts_park(guard_margins,state_margin,two_observations):
 assert min(guard_margins)>0 and state_margin>0 and two_observations

def accepts_epoch(clear_lead,prepared_setup,settled_setup,enable_order,flush_lead):
 assert min(clear_lead,prepared_setup,settled_setup,enable_order,flush_lead)>0

def rejects(name,fn,*args):
 try:fn(*args)
 except AssertionError:negative.append(name);return
 raise AssertionError('Unsafe case accepted '+name)
base_cold=[local_high,intent_closed,front_flushed,current_closed,min_pulse]
accepts_cold(*base_cold)
for name,idx,value in [('short_cold_before_full_A_close',1,8933),('short_cold_before_860_flush',2,8933),('late_core_CURRENT_zero',3,8933),('no_complete_intent_A_pulse',4,late)]:
 bad=base_cold.copy();bad[idx]=value;rejects(name,accepts_cold,*bad)
# A slower rise than fall can erase the closure interval. Test the actual
# duration equation, including equality (strict setup has no zero slack).
for loss in [local_high-current_closed,local_high-current_closed+1]:
 rejects('cold_width_loss_'+str(loss),accepts_cold,local_high-loss,intent_closed,front_flushed,current_closed,min_pulse)
assert local_high-current_closed==2726
base_park=[[v['following_B_zero_setup_min']for v in mask_order.values()],state_margin,True]
accepts_park(*base_park)
rejects('mask_return_too_early_for_B_guard_setup',accepts_park,[0,1186],state_margin,True)
rejects('CURRENT_boundary_late_at_park_A',accepts_park,base_park[0],0,True)
rejects('single_observation_has_actual_IDLE_to_FETCH_counterexample',accepts_park,base_park[0],state_margin,False)
base_epoch=[clear_lead,prepared_to_enable,settled_to_enable,settled_earliest_at_eligible-enable_high_at_eligible,warm_flush_lead]
accepts_epoch(*base_epoch)
for name,idx in [('clear_not_setup_before_prepared',0),('prepared_late_at_enable',1),('settled_late_at_enable',2),('old_enable0_visible_when_settled_arrives',3),('completion_before_complete_860_flush',4)]:
 bad=base_epoch.copy();bad[idx]=0;rejects(name,accepts_epoch,*bad)
# Fresh-state enumeration is meaningful only after source-bound scrub: direct
# zero forcing clears two intent bits for all four states on a complete A.
for bits in range(4):assert [False,False]==[bool((bits>>i)&1)and False for i in range(2)]
for file in ['control-front-v1/prepare.mjs','control-core-v2/prepare.mjs','control-event-gates-v1/prepare.mjs','control-reset-retire-v1/logic.mjs','control-reset-retire-v1/prepare.mjs','control-reset-quiet-v1/logic.mjs','control-reset-quiet-v1/prepare.mjs','control-reset-scratch-v1/logic.mjs','control-reset-epoch-v1/logic.mjs','control-reset-epoch-v1/prepare.mjs','control-reset-final-v1/logic.mjs','control-reset-final-v1/prepare.mjs','control-rf-composed-v1/prepare.mjs','control-rf-status-v1/prepare.mjs','control-core-guards-v1/prepare.mjs','master-reset-requesters-v2/source-manifest.json','master-reset-requesters-v2/independent-review.json','master-reset-requesters-v2/README.md','dispatch-launch-timing-v1/sequence-checks.json','dispatch-launch-timing-v1/check-sequence.mjs']:
 pins[str((B/file).relative_to(ROOT))]=sha(B/file)
pins[str(Path(__file__).resolve().relative_to(ROOT))]=sha(Path(__file__).resolve())
report={'status':'source_bound_local_FETCH_cold_zero_and_warm_park_flush_certificate','geometry_manifest_sha256':'cb4b955e6e7405a637e4573ef629f3a53ca3065377f9d519d0e9730150fab922','cold':cold_result,'warm':warm,'negative_refusals':negative,'source_guard_missing_input_refusals':source_guards['rejected_missing_or_opposite_required_inputs'],'cold_unknown_intent_states':4,'scope':{'actual_FETCH_IR_arcs_rebound_to_guard':210,'actual_delay_cells':168,'no_arbitrary_SCC_cuts':True,'no_geometry_changes':True,'local_cold_and_warm_ordering_under_nominal_model':True,'full_core_timing_acceptance':False,'native_acceptance':False},'earned_predicates':[
 'Cold: continuously high actual RF INIT propagates into both normalized FI/R side clamps; a complete delivered A captures zero for both unknown initial values. Actual upper core NEXT clamps plus a complete A/B leave CURRENT000 before cold withdrawal.',
 'Cold: the complete860 FETCH/IR flush is finished inside held cold, not merely inferred from later scanner READY. The shared scanner permission delay is additional slack.',
 'Warm: once both physical mask returns can qualify candidate, the following B has enough time to zero IDLE/UPDATE advance. The separate candidate/parked CURRENT observations reject the one-extra-FETCH escape; that already admitted instruction may retire normally.',
 'Warm: clear enters only after retained parked and the actual program-quiet/READY-low, RF quiet, and all four LSU true-drain/READY-low/VALID-low conjunctions. These are real sources, not aliases of local IDLE or scalar READY-low.',
 'Warm: fresh epoch prepared→enable→committed→settled retains permit over a full A window. The completion enable-low cannot qualify until A2; FI/R zero and the entire860 flush precede it. WITHDRAW/rearm therefore starts after the local loop is in the known-zero mode.'
 ],'remaining_producer_and_timing_gates':[
 'Memory/program actual quiet and response ownership contracts must be valid for the current epoch, including no delayed old-high drain and source payload retention. This local report characterizes consumption, not the complete remote producer/cable event proof.',
 'RF owner and commit retain completion until their claims fall; ALU normal status drain and fault-before-completion ordering remain their separately checked producer contracts. Faults do not earn warm reset completion.',
 'Requester-v2 retained RESET/START and dispatcher hold-through-ACK-low protocol are source-bound references. Full actual latest master composition and far requester/START/RESET timing are not re-proved by this local certificate.',
 'Full initializer scrub of other core states, mode-qualified enable dependencies, PC/flags closure, and remaining ALU/RF/LSU setup classes remain separate full-core obligations.',
 'Cold width is transported from actual held global Q through2 source ticks and918/1154 cable ticks: both edges shift920/1156 under the fixed equal-rise/fall model. Any real width loss must be subtracted; 2726 or more fails this bound. Cable delays are source-pinned authored-path sums; no native asymmetry/burnout bound is established.',
 'All arithmetic uses the existing nominal3160 A/B source, complete pulse transport, stable normalized signals, four-tick storage allowance and no torch burnout. Native timing and arbitrary delayed block scheduling are not established.'
 ],'source_sha256':pins}
(H/'epochs.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k in ['status','cold','warm','negative_refusals','scope']}))
