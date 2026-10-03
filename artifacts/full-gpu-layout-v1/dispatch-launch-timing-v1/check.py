"""Conditional nominal payload lead before any new START can leave dispatcher."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];pins={}
def read(p):
 pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
seq=read(H/'sequence-checks.json');assert seq['minimum_capture_to_raise_start_macrocycles']==4
for f,h in seq['source_sha256'].items():assert hashlib.sha256((ROOT/f).read_bytes()).hexdigest()==h;pins[f]=h
for folder in ['dispatch-clock-entry-repair-v1','master-dispatch-payload-routes-v1']:
 m=read(B/folder/'source-manifest.json')
 for f,h in m['files'].items():
  assert f not in pins or pins[f]==h,f
  assert hashlib.sha256((ROOT/f).read_bytes()).hexdigest()==h,f;pins[f]=h
paths=read(B/'dispatch-complete-timing-v1/checks.json');windows=read(B/'dispatch-complete-timing-v1/window-checks.json')
assert windows['checked_stored_dependencies']==1101 and windows['minimum_nominal_setup_margin']==84
clock=read(B/'core-phase-source/design.json')['nominal_component_sums'];assert clock['cycle_ticks']==3160 and clock['phase_b_width_ticks']==540
cables=read(B/'master-dispatch-payload-routes-v1/checks.json')['nominal_timing']['routes'];design=read(B/'master-dispatch-payload-routes-v1/design.json');dispatch=read(B/'dispatch-clock-entry-repair-v1/design.json');frame=read(B/'floorplan-v3/frame-config.json');dt=frame['instances']['dispatch']['translation'];roles=paths['source_roles'];rows=[]
def lock(i):
 r=[r for r in paths['paths']if r['source']>=125 and r['target']['kind']=='lock'and r['target']['store']==i];assert len(r)==1 and r[0]['source']==126;return r[0]
for c in design['connections']:
 core=int(c['destination_instance'][-1]);kind='block_id' if c['name'].startswith('dispatch_block_') else 'lane_mask';bit=c['source_bit'];port='core'+str(core)+'_payload_'+kind
 boundary=[r for r in paths['paths']if r['target']['kind']=='boundary'and r['target']['port']==port and r['target']['bit']==bit];assert len(boundary)==1;r=boundary[0];s=r['source'];assert roles[s]['family']=='core'+str(core)+'_payload_'+kind and roles[s]['phase']=='B' and roles[s]['bit']==bit
 assert c['source']=={a:r['target']['position'][i]+dt[a]for i,a in enumerate('xyz')}
 source_slot=next(i for i,s in enumerate(roles)if s['family']=='held_command'and s['phase']=='B'and s['bit']==2+2*core)
 pclk=lock(s);sclk=lock(source_slot);cable=next(x for x in cables if x['name']==c['name']);assert cable['source']==c['source']and cable['destination']==c['destination']
 # Payload CURRENT transfer after CAPTURE, START CURRENT after RAISE_START.
 # Use latest prior closure+explicit4 allowance for payload, earliest opening
 # for START. Every downstream START gate/cable only adds nonnegative delay.
 payload=clock['phase_b_width_ticks']+pclk['nominal_max_ticks']+4+r['nominal_max_ticks']+cable['nominal_max_ticks']
 launch=seq['minimum_capture_to_raise_start_macrocycles']*clock['cycle_ticks']+sclk['nominal_min_ticks']
 margin=launch-payload;assert margin>0
 rows.append({'name':c['name'],'payload_store':s,'START_store':source_slot,'core_boundary':c['destination'],'latest_payload_settled_relative_CAPTURE_B_open':payload,'earliest_held_START_open_relative_CAPTURE_B_open':launch,'minimum_nominal_payload_lead':margin,'source_to_export_ticks':r['nominal_max_ticks'],'cable_ticks':cable['nominal_max_ticks']})
assert len(rows)==24
worst=min(rows,key=lambda r:r['minimum_nominal_payload_lead']);negative=0
for p,l in [(worst['earliest_held_START_open_relative_CAPTURE_B_open'],worst['earliest_held_START_open_relative_CAPTURE_B_open']),(worst['latest_payload_settled_relative_CAPTURE_B_open'],worst['latest_payload_settled_relative_CAPTURE_B_open']-1)]:assert l-p<=0;negative+=1
pins[str(Path(__file__).resolve().relative_to(ROOT))]=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
report={'status':'dispatch_all_24_payload_fields_settle_before_earliest_new_held_START_under_nominal_model','fields':len(rows),'minimum_nominal_payload_lead':min(r['minimum_nominal_payload_lead']for r in rows),'spacing_macrocycles':4,'reachable_control_states':seq['reachable_retained_states'],'negative_timing_refusals':negative,'rows':rows,'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'complete_timing_acceptance':False,'limits':['Scheduled-device sums and settled control equations; no Minecraft event proof, no native timing or burnout bound.','Includes actual payload storage lock skew, explicit4-tick late-store allowance, actual2-tick export and complete cables. START comparison is conservatively at its held storage opening, before export/global gating/requester/cables.','Normal admitted epoch only. Full requester cold/rearm, global sampled-admission safety, core payload-to-capture timing and correct ACK/DONE ownership remain separate.','Master full electrical/contact composition must preserve checked local paths and forbid a new bypass/driver.']}
(H/'checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in ['rows','source_sha256','limits']}))
