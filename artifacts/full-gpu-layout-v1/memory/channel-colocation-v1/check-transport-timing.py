"""Conservative dependency DAGs over the changed exact cable paths."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
d=json.loads((H/'timing-slices.json').read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};e={n:v['endpoints'] for n,v in d['sections'].items()};reports={};witnesses={};original_build=m.build;built=m.build(world);m.build=lambda _:built
def run(name,src,dst,count):
 s=list(map(m.P,src));t=list(map(m.P,dst));r,w=m.analyze(world,s,t,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r);assert len(r['paths'])==count,(name,len(r['paths']));r.update(source_positions=s,target_positions=t);reports[name]=r;witnesses[name]=w
run('ACTIVE_Q_to_backend_ACTIVE',e['channel-backend-v1']['active'],e['channel-backend-v1']['backend_active'],4)
run('backend_request_to_raw_bank_VALID',e['channel-typed-request-v1']['backend_request'],e['bank-request-fanout-v1']['bank_valid'],32)
run('held_type_export_to_raw_bank_VALID',e['channel-matching-request-v1']['held_type_export'],e['bank-request-fanout-v1']['bank_valid'],32)
run('qualified_bank_ready_to_collector',e['bank-ready-return-v1']['bank_ready'],e['bank-ready-return-v1']['qualifier'],32)
run('qualifier_to_backend_ready',e['bank-ready-return-v1']['qualifier'],e['bank-ready-return-v1']['backend_ready'],16)
suffixes={}
for name,s in d['suffixes'].items():
 w={m.P(v['position']):v['block'] for v in s['blocks']};built=original_build(w);m.build=lambda _:built
 src=[m.P(v['source']) for v in s['connections']];dst=[m.P(v['destination']) for v in s['connections']]
 r,proof=m.analyze(w,src,dst,require_all=False);r.update(source_positions=src,target_positions=dst);suffixes[name]=r;witnesses[name]=proof
 if r['status']!='conservative_potential_dependency_DAG_nominal_bound':
  assert name in ['response_q','consumer_ready'] and r['status']=='positive_device_cycles_refuse_nominal_bound',(name,r)
  # Preserve the actual historical refusal. It is not a delay bound and is
  # never substituted into the new capture comparison or treated as passing.
  continue
 assert len(r['paths'])==len(src);assert all(v['address_bit']==v['data_bit'] for v in r['paths'])
s=d['new_transport'];w={m.P(v['position']):v['block'] for v in s['blocks']};built=original_build(w);m.build=lambda _:built
src=[m.P(v['source']) for v in s['connections']];dst=[m.P(v['destination']) for v in s['connections']]
new,proof=m.analyze(w,src,dst,set(map(tuple,s['allowed_positions'])),require_all=False)
assert new['status']=='conservative_potential_dependency_DAG_nominal_bound',new
assert len(new['paths'])==25 and all(v['address_bit']==v['data_bit'] for v in new['paths'])
new.update(source_positions=src,target_positions=dst,connections=s['connections']);witnesses['new_transport']=proof
out={'status':'changed_control_transport_nominal_paths_with_historical_response_cycle_refusal','paths':reports,'new_transport':new,'old_suffixes':suffixes,'historical_reference_response_Q_latest_bound':False,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [H/'timing-slices.json',Path(__file__).resolve(),helper]},'native_acceptance':False,'numeric_physical_bounds_established':False}
(H/'control-cables.json').write_text(json.dumps(out,indent=2)+'\n');(H/'control-cable-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:len(v['paths']) for n,v in reports.items()}))
