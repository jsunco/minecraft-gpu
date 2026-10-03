from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
f=H.parent/'channel-retention-v1/design.json';d=json.loads(f.read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in d['nets'].items()};built=m.build(world);m.build=lambda _:built
reports={};witnesses={}
def run(name,src,dst,names,cut=()):
 allowed={p for p,n in nets.items() if n in names};allowed.update(src+dst);allowed.difference_update(cut)
 r,w=m.analyze(world,src,dst,allowed,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
snapclose=(359,-11,354);owneropen=(359,-11,362);ownerclose=(359,-11,370);payloadopen=(359,-11,378);payloadclose=(359,-11,386)
run('common_coil_to_event_taps',[(364,-15,350)],[snapclose,owneropen,ownerclose,payloadopen,payloadclose],{'admission/active_delayed_flush'})
run('snapshot_close_to_request_locks',[snapclose],[m.P(s['lock']) for s in d['snapshots']],{'admission/active_delayed_flush','admission/open_owner','snapshot_hold','open_snapshot'})
run('owner_close_to_locks',[ownerclose],[m.P(s['lock']) for s in d['stores'] if s['name']=='owner'],{'admission/active_delayed_flush','admission/open_address'}|{'open_owner'+str(i) for i in range(4)}|{'owner_hold'+str(i) for i in range(4)})
run('payload_open_to_locks',[payloadopen],[m.P(s['lock']) for s in d['stores'] if s['name']=='payload'],{'admission/active_delayed_flush','admission/write_phase'}|{'open_payload'+str(i) for i in range(4)}|{'payload_hold'+str(i) for i in range(4)},[payloadclose])
files=[Path(__file__).resolve(),helper,f];out={'status':'actual_global_admission_snapshot_owner_payload_gate_paths','reports':reports,'payload':[s for s in d['stores'] if s['name']=='payload'],'owners':[s for s in d['stores'] if s['name']=='owner'],'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'native_acceptance':False,'numeric_physical_bounds_established':False,'limits':['Payload closing event is cut only when analyzing earlier opening; hardware is unchanged.','Fresh raw valid must be present before its request snapshot has actually closed. Prior captured request may not be withdrawn/reassigned before ownership protocol finishes.','Inputs arriving arbitrarily close to sample closure still need physical update/hold proof; these nominal inequalities alone do not solve asynchronous pulse sampling.']}
(H/'global-gates.json').write_text(json.dumps(out,indent=2)+'\n');(H/'global-gate-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:dict(paths=len(r['paths']),min=min(q['potential_dependency_nominal_min_ticks'] for q in r['paths']),max=r['max_nominal_dependency_ticks']) for n,r in reports.items()}))
