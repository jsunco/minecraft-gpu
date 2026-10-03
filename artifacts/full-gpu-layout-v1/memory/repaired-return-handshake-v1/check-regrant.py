"""Actual admission snapshot/commit interval; no instant channel reuse."""
from pathlib import Path
import json,hashlib,importlib.util
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];helper=M/'program-rom-timing-v1/check.py';s=importlib.util.spec_from_file_location('dag',helper);g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
p=M/'channel-retention-v1/design.json';d=json.load(open(p));world={g.P(v['position']):v['block']for v in d['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in d['nets'].items()};built=g.build(world);g.build=lambda _:built;report={};proof={}
def run(name,src,dst,ns):
 allowed={p for p,n in nets.items()if n in ns}|set(src+dst);r,w=g.analyze(world,src,dst,allowed,require_all=True);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;r.update(source_positions=src,target_positions=dst,allowed_nets=sorted(ns));report[name]=r;proof[name]=w;print(name,[(v['potential_dependency_nominal_min_ticks'],v['potential_dependency_nominal_max_ticks'])for v in r['paths']],flush=True)
snap=(359,-11,354);commit=(359,-11,394)
run('same_coil_snapshot_close_and_commit_open',[(364,-15,350)],[snap,commit],{'admission/active_delayed_flush'})
run('snapshot_close_to_all_busy_locks',[snap],[g.P(v['lock'])for v in d['busySnapshots']],{'admission/active_delayed_flush','admission/open_owner'}|{'busy_hold'+str(i)for i in range(4)})
run('commit_open_to_all_ACTIVE_SET',[commit],[g.P(v['state_input'])for v in d['commits']],{'admission/active_delayed_flush','admission/open_response'}|{n+str(i)for i in range(4)for n in ['not_commit_phase','commit']})
files=[p,helper,Path(__file__).resolve()];out={'status':'actual_shared_admission_regrant_phase_interval','paths':report,'source_sha256':{str(x.relative_to(ROOT)):hashlib.file_digest(x.open('rb'),'sha256').hexdigest()for x in files},'premises':['All4 BUSY snapshots use this actual single phase source, stay closed during ownership and payload phases, and are not host-updated.','A channel whose actual live BUSY has not gone low cannot be captured as free under the initialized, correctly functioning aperture premise.','This does not establish arbitrary asynchronous input-edge resolution, phase pulse transport or physical scheduling bounds.'],'native_acceptance':False}
(H/'regrant-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'regrant-witnesses.json').write_text(json.dumps(proof)+'\n')
