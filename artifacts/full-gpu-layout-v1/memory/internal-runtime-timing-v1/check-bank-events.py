"""Separate real opening/closing causes at named physical phase taps.

The closing tap is held inactive only in an opening-event graph. This is an
analysis boundary, never a change to the hardware. All reported costs are
nominal dependencies, not measured event-delay bounds.
"""
from pathlib import Path
import json, importlib.util, hashlib
H=Path(__file__).resolve().parent; ROOT=H.parents[3]
helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
files=[helper,H.parent/'bank-sampled-admission-v1/bank.json',H.parent/'data-owner-v1/design.json',H.parent/'data-owned-bank-v1/design.json',Path(__file__).resolve()]
bank=json.loads(files[1].read_text()); owner=json.loads(files[2].read_text()); owned=json.loads(files[3].read_text())
world={m.P(v['position']):v['block'] for v in bank['blocks']}; nets={tuple(map(int,k.split(','))):v for k,v in bank['nets'].items()}
offset=m.P(owned['owner_offset']); stores=[{**s,**{k:m.A(m.P(s[k]),offset) for k in ['driver','storage','lock','terminal']}} for s in owner['stores']]
# Reuse the exact same physical graph for all event cuts.
built=m.build(world); m.build=lambda _:built
common={'sequence_active_delayed_flush'}
phase={'sequence_open_owner','sequence_open_address','sequence_write_phase','sequence_open_response','sequence_ready','retimed_owner','retimed_payload','retimed_write','write_early','write_late','open_sample','sample_hold','owner/open_owner','owner/hold_owner','owner/open_payload','owner/hold_payload','open_response','hold_response','write_phase','qualified_write_phase'}
phase.update('owner_ready'+str(i) for i in range(8)); phase.update('read_ready'+str(i) for i in range(8)); phase.update('write_ready'+str(i) for i in range(8))
phase.update(v for v in nets.values() if v.startswith('bank/'))
phase.update(['not_is_write'])
targets={
 'sample':[m.P(s['lock']) for s in bank['snapshots']],
 'owner':[s['lock'] for s in stores if s['name']=='owner'],
 'payload':[s['lock'] for s in stores if s['name']=='payload'],
 'response':[m.P(s['lock']) for s in owned['responses']],
 'write':[(10 if b>=4 else 2,1+8*w+140*t,8*(b%4)+64*s+1) for s in range(2) for t in range(2) for w in range(16) for b in range(8)],
}
for name,ps in targets.items():
 for p in ps: assert world[p]['id']==m.R,(name,p,world[p])
taps={'sample':[(14,-45,-450),(31,-45,-450)],'owner':[(47,-45,-450),(63,-45,-450)],'payload':[(95,-45,-450),(111,-45,-450)],'write':[(111,-45,-446),(95,-45,-446)],'response':[(63,-45,-442),(79,-45,-442)]}
reports={}; witnesses={}
for name,(opening,closing) in taps.items():
 for event,source in [('open',opening),('close',closing)]:
  allowed={p for p,n in nets.items() if n in common|phase}
  if name=='sample': allowed.update(p for p,n in nets.items() if n=='sequence_active_flush')
  if event=='open':allowed.remove(closing)
  allowed.update([source]+targets[name])
  try: result,w=m.analyze(world,[source],targets[name],allowed)
  except AssertionError as e: raise AssertionError((name,event,str(e))) from e
  assert result['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,event,result)
  result.update(source=list(source),target_positions=targets[name],closing_cut=list(closing) if event=='open' else None)
  reports[name+'_'+event]=result;witnesses[name+'_'+event]=w
# Establish a shared ACTIVE output epoch. The first slow repeater is an output
# boundary, so this real 2-tick input diode + delay4 cost is counted here.
epoch=(14,-45,-450)
allowed={p for p,n in nets.items() if n in {'sequence_active_flush','sequence_active_delayed_flush'}}
epoch_targets=[(16,-45,-450),taps['sample'][0]]+[p for name,ps in taps.items() for p in ps if name!='sample']+[taps['sample'][1]]
prefix,pw=m.analyze(world,[epoch],epoch_targets,allowed)
assert prefix['status']=='conservative_potential_dependency_DAG_nominal_bound',prefix
prefix['source']=epoch;prefix['target_positions']=epoch_targets
out={'status':'conditional_separate_bank_phase_events_nominal_only','events':reports,'common_epoch':prefix,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limits':['Opening cuts hold only the later closing tap inactive. Every closure is independently included; no hardware cell is removed.','Store locks are the target; one storage update and source setup still need explicit composition.','ACTIVE and reset masks are stable; old tails are drained. This does not prove pulse width or startup.','Dust/conductor zero, repeater 2*delay, comparator/torch2 are nominal scheduled costs, not physical bounds.'],'capture_hold_ordering_closed':False,'numeric_physical_bounds_established':False,'native_acceptance':False}
(H/'bank-events.json').write_text(json.dumps(out,indent=2)+'\n');(H/'bank-event-witnesses.json').write_text(json.dumps({'events':witnesses,'prefix':pw})+'\n')
print(json.dumps({n:{'paths':len(v['paths']),'min':min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),'max':v['max_nominal_dependency_ticks']} for n,v in reports.items()}))
