"""Actual global payload closure, export and ACTIVE-commit paths."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
files=[helper,H.parent/'channel-retention-v1/design.json',Path(__file__).resolve()]
d=json.loads(files[1].read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in d['nets'].items()};built=m.build(world);m.build=lambda _:built
payload=[s for s in d['stores'] if s['name']=='payload'];close=(359,-11,386);commit=(359,-11,394);commit_end=(359,-11,402);reports={};witnesses={}
def run(name,src,dst,names,cut=()):
 allowed={p for p,n in nets.items() if n in names};allowed.update(src+dst);allowed.difference_update(cut)
 r,w=m.analyze(world,src,dst,allowed,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
r=run('payload_close_to_actual_locks',[close],[m.P(s['lock']) for s in payload],{'admission/active_delayed_flush','admission/write_phase'}|{'open_payload'+str(i) for i in range(4)}|{'payload_hold'+str(i) for i in range(4)});assert len(r['paths'])==68
r=run('payload_Q_to_export',[m.P(s['storage']) for s in payload],[m.P(p) for p in d['ports']['payload']['positions']],{n for n in nets.values() if n.startswith('payload') and not n.startswith('payload_hold')});assert len(r['paths'])==68
for r in r['paths']:assert r['address_bit']==r['data_bit']
r=run('commit_open_to_active_set',[commit],[m.P(s['set']) for s in d['activeStates']],{'admission/active_delayed_flush','admission/open_response'}|{'not_commit_phase'+str(i) for i in range(4)}|{'commit'+str(i) for i in range(4)},[commit_end]);assert len(r['paths'])==4
r=run('common_coil_to_close_and_commit',[(364,-15,350)],[close,commit],{'admission/active_delayed_flush'});assert len(r['paths'])==2
out={'status':'offline_actual_global_admission_nominal_paths','paths':reports,'payload_stores':payload,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limits':['ACTIVE SET pad is an early lower-bound boundary, not an assertion that the SR latch has already settled there.','Global source Q is conservatively taken as settled by actual payload lock closure plus one2tick storage update; all raw LSU payload must already meet its own admission setup.','The commit-close tap is held inactive only for the opening-event path. Physical hardware remains unchanged.'],'numeric_physical_bounds_established':False,'native_acceptance':False}
(H/'global-admission.json').write_text(json.dumps(out,indent=2)+'\n');(H/'global-admission-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:{'paths':len(v['paths']),'min':min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),'max':v['max_nominal_dependency_ticks']} for n,v in reports.items()}))
