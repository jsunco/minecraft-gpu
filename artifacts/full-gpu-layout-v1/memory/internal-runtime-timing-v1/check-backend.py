"""Actual global backend response closure/capture/withdrawal dependencies."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
files=[helper,H.parent/'channel-backend-control-v1/design.json',Path(__file__).resolve()];d=json.loads(files[1].read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in d['nets'].items()};built=m.build(world);m.build=lambda _:built
states={s['name']:s for s in d['states']};cut={m.P(s[k]) for s in d['states'] for k in ['positive','negative']};br=m.P(d['ports']['bank_ready']['positions'][0]);taps=[m.P(v['tap']) for v in d['delays'] if v['name']=='ready_delay'];locks=[m.P(v['lock']) for v in d['response']];reports={};witnesses={}
def run(name,src,dst,allowed=None,extra_cut=()):
 a=set(world) if allowed is None else set(allowed);a.difference_update(cut);a.difference_update(extra_cut);a.update(src+dst)
 r,w=m.analyze(world,src,dst,a,require_all=True);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r);r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
run('ready_rise_to_response_open',[br],locks,extra_cut=[taps[0]])
run('ready_t1_to_response_close',[taps[0]],locks)
run('ready_to_three_taps',[br],taps,{p for p,n in nets.items() if n in ['bank_ready','ready_delay']})
run('ready_t2_to_CAPTURED_set',[taps[1]],[m.P(states['captured']['set'])])
# State-Q paths start at the actual stored output and cut the feedback cycle.
run('CAPTURED_Q_to_bank_request_fall',[m.P(states['captured']['positive'])],[m.P(d['ports']['bank_request']['positions'][0])])
run('ready_t3_fall_to_consumer_ready',[taps[2]],[m.P(d['ports']['consumer_ready']['positions'][0])])
run('active_to_bank_request',[m.P(d['ports']['active']['positions'][0])],[m.P(d['ports']['bank_request']['positions'][0])])
out={'status':'offline_backend_event_nominal_paths','paths':reports,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limits':['Two actual SR positive/negative output wires are state boundaries, excluding combinational traversal around retained feedback. Their settling remains a separate state-transition obligation.','Opening assumes ACTIVE1/CAPTURED0/RETIRING0/reset0 and holds ready_t1 inactive. Closing is a separate t1 event.','CAPTURED set requires bank_ready still held high through t2. READY output on withdrawal requires both raw bank-ready low and t3 low; raw-ready alone is not used as an acknowledgement.','All paths are nominal dependency sums; pulse width, SR settling, cold initialization and physical bounds remain unproved.'],'numeric_physical_bounds_established':False,'native_acceptance':False}
(H/'backend-events.json').write_text(json.dumps(out,indent=2)+'\n');(H/'backend-event-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:{'paths':len(v['paths']),'min':min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),'max':v['max_nominal_dependency_ticks']} for n,v in reports.items()}))
