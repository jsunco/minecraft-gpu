"""Compose actual local source events with frozen master route arithmetic."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;ROOT=H.parents[3];A=ROOT/'artifacts/full-gpu-layout-v1';sources={}
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def read(p):sources[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
local=read(H/'local-paths.json');raw=read(H/'raw-global-paths.json');g=read(H/'global-gates.json');binding=read(H/'local-binding.json');clock=read(A/'core-phase-source/design.json')['nominal_component_sums']
assert clock['cycle_ticks']==3160 and clock['phase_a_width_ticks']==544
reports={}
for n,h in [('master-lsu-address-routes-v1','22558a22'),('master-lsu-write-data-routes-v1','bb11e5bd'),('master-lsu-control-routes-v2','e6dc44c3')]:
 p=A/n/'source-manifest.json';assert sha(p).startswith(h);manifest=read(p);pins=manifest.get('files',manifest.get('source_sha256'))
 for file in ['design.json','checks.json']:
  f=A/n/file;assert sha(f)==pins[str(f.relative_to(ROOT))];sources[str(f.relative_to(ROOT))]=sha(f)
 r=read(A/n/'checks.json');assert r['source']['design']==pins[str((A/n/'design.json').relative_to(ROOT))];reports[n]=r['nominal_timing']['routes']
addr={v['name']:v for v in reports['master-lsu-address-routes-v1']};wd={v['name']:v for v in reports['master-lsu-write-data-routes-v1']};ctrl={v['name']:v for v in reports['master-lsu-control-routes-v2']}
# The actual shared-address adapter has one delay1 diode after the cable endpoint.
ad=read(A/'master-memory-address-adapter-v1/design.json');am={tuple(v['position'][a] for a in 'xyz'):v['block'] for v in ad['blocks']}
for c in range(8):
 for b in range(8):assert am[(613,1+4*c,-6+8*b)]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
lp=local['reports'];lo=lambda n,i:lp[n]['paths'][i]['potential_dependency_nominal_min_ticks'];hi=lambda n,i:lp[n]['paths'][i]['potential_dependency_nominal_max_ticks'];T=clock['cycle_ticks'];width=clock['phase_a_width_ticks']
lead=[];response_hold=[]
for consumer in range(8):
 for typ in ['read_valid','write_valid']:
  vt=0 if typ=='read_valid' else 1;valid=2*T+lo('A_to_valid_lock',0)+2+lo('valid_Q_to_typed_VALID',vt)+ctrl[f'lsu_{consumer}_{typ}']['nominal_min_ticks']
  for b in range(8):
   at=width+hi('A_to_payload_locks',b)+2+2+addr[f'lsu_address_c{consumer}_b{b}']['nominal_max_ticks']+2
   lead.append(dict(consumer=consumer,type=typ,field='address'+str(b),source_settled_at_memory=at,earliest_valid_at_memory=valid,margin=valid-at))
   if typ=='write_valid':
    at=width+hi('A_to_payload_locks',8+b)+2+2+wd[f'lsu_write_data_c{consumer}_b{b}']['nominal_max_ticks'];lead.append(dict(consumer=consumer,type=typ,field='write_data'+str(b),source_settled_at_memory=at,earliest_valid_at_memory=valid,margin=valid-at))
  response_close=width+max(q['potential_dependency_nominal_max_ticks'] for q in lp['A_to_result_locks']['paths'])
  response_hold.append(dict(consumer=consumer,type=typ,latest_local_result_lock_close=response_close,earliest_valid_fall_at_memory=valid,margin=valid-response_close))
# Owner/payload windows are one original physical sequencer, not unrelated clocks.
gp=g['reports'];tap={tuple(p):r['potential_dependency_nominal_max_ticks'] for p,r in zip(gp['common_coil_to_event_taps']['target_positions'],gp['common_coil_to_event_taps']['paths'])}
owner_close=tap[(359,-11,370)];payload_open=tap[(359,-11,378)];snap_close=tap[(359,-11,354)]
owners_max=gp['owner_close_to_locks']['max_nominal_dependency_ticks'];owner_D=raw['reports']['held_owner_Q_to_global_payload_D']['max_nominal_dependency_ticks'];payload_min=min(q['potential_dependency_nominal_min_ticks'] for q in gp['payload_open_to_locks']['paths'])
owner_margin=payload_open+payload_min-(owner_close+owners_max+2+owner_D)
# Fresh valid cannot qualify a high request snapshot before the raw pad is high.
# Latest snapshot closure is a conservative upper bound on that pad event;
# intentionally omitted valid-return latency is nonnegative, never an invented0 path.
last_possible_raw_valid=snap_close+gp['snapshot_close_to_request_locks']['max_nominal_dependency_ticks']
raw_D=raw['reports']['raw_inputs_to_global_payload_D']['max_nominal_dependency_ticks'];raw_margin=payload_open+payload_min-last_possible_raw_valid-raw_D
result={'status':'conditional_actual_LSU_to_global_payload_nominal_admission_pass','clock_assumption':{'cycle_ticks':T,'A_width_ticks':width,'scope':'Counted source arithmetic plus successful equal-rise/fall pulse transport and full A/B state transfer. Not a measured delivered waveform.'},'source_data_before_raw_valid':lead,'local_result_closed_before_memory_sees_valid_fall':response_hold,'minimum_margins':{'master_payload_before_raw_valid':min(r['margin'] for r in lead),'local_result_close_before_remote_valid_fall':min(r['margin'] for r in response_hold),'held_owner_Q_to_global_payload_setup':owner_margin,'fresh_raw_request_to_global_payload_setup':raw_margin},'normal_state_assumptions':['CAPTURE_PAYLOAD1 -> CLOSE_PAYLOAD2 -> ASSERT_VALID3 places VALID on the second subsequent A epoch.','CAPTURE_RESULT5 -> CLOSE_RESULT6 -> DROP_VALID7 similarly retains valid through the complete intervening close state.','The held-input NEXT and CURRENT transfers must themselves meet their real phase/decode deadlines. No binary-state hazard acceptance is inferred from the state table.','Payload and type remain held until matching READY, then actual ready-low plus ownership/tail drain; quiescent cold initialize is not asserted on a live owner.','Source read and write address are the exact same physical retained bits. Both independent pads are fed by the counted two-recipient adapter.'],'remaining':['Final64 memory response DATA master routes and complete DATA-versus-typedREADY arrival/LSU capture setup.','Whole shared phase-source to A/B local window, B-sampler closure and state/action settling composition; separate current-core audit is active.','Cold/reset convergence and held mask-low/rearm durations require exact end-to-end reset evidence; this normal source timing does not clear them.','Numerical physical edge bounds, update hazards and original same-bank collision/retiming equivalence remain unproved.'],'native_acceptance':False,'numeric_physical_bounds_established':False}
def check(x):assert all(v>0 for v in x['minimum_margins'].values())
check(result);negatives=0
for k in result['minimum_margins']:
 c=copy.deepcopy(result);c['minimum_margins'][k]=0
 try:check(c)
 except AssertionError:negatives+=1
 else:raise AssertionError('Invalid margin accepted')
result['zero_margin_negatives_rejected']=negatives;sources[str(Path(__file__).resolve().relative_to(ROOT))]=sha(Path(__file__).resolve());result['source_sha256']=sources
(H/'source-admission.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'cases':len(lead),'margins':result['minimum_margins'],'negatives':negatives}))
