"""Geometry-derived control cable and retained-type event paths."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=H/'control-slice.json';d=json.loads(p.read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};e={n:v['endpoints'] for n,v in d['sections'].items()};reports={};witnesses={};built=m.build(world);m.build=lambda _:built
def run(name,src,dst,count):
 s=list(map(m.P,src));t=list(map(m.P,dst));r,w=m.analyze(world,s,t,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r);assert len(r['paths'])==count,(name,len(r['paths']));r.update(source_positions=s,target_positions=t);reports[name]=r;witnesses[name]=w;return r
run('ACTIVE_Q_to_backend_ACTIVE',e['channel-backend-v1']['active'],e['channel-backend-v1']['backend_active'],4)
run('backend_request_to_raw_bank_VALID',e['channel-typed-request-v1']['backend_request'],e['bank-request-fanout-v1']['bank_valid'],32)
run('held_type_export_to_raw_bank_VALID',e['channel-matching-request-v1']['held_type_export'],e['bank-request-fanout-v1']['bank_valid'],32)
run('qualified_bank_ready_to_collector',e['bank-ready-return-v1']['bank_ready'],e['bank-ready-return-v1']['qualifier'],32)
run('qualifier_to_backend_ready',e['bank-ready-return-v1']['qualifier'],e['bank-ready-return-v1']['backend_ready'],16)
out={'status':'offline_control_cables_nominal_paths','paths':reports,'source_sha256':{**d['source_sha256'],**{str(q.relative_to(ROOT)):hashlib.file_digest(q.open('rb'),'sha256').hexdigest() for q in [p,helper,Path(__file__).resolve()]}},'limits':['Typed request data/owner stable; both mode paths are dependencies, not simultaneous true valids.','ACTIVE state SET→Q and bank raw VALID→local ACTIVE add nonnegative delays omitted from the earliest-launch lower bound.','Bank read/write READY sources are actual retained-owner/type-qualified endpoints, not consumer-facing ready aliases.','Zero dust/conductor and fixed scheduled-device costs are nominal only.'],'numeric_physical_bounds_established':False,'native_acceptance':False}
(H/'control-cables.json').write_text(json.dumps(out,indent=2)+'\n');(H/'control-cable-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:{'paths':len(v['paths']),'min':min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),'max':v['max_nominal_dependency_ticks']} for n,v in reports.items()}))
