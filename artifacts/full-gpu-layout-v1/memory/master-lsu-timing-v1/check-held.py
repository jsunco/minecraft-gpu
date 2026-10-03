from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py';spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
d=json.loads((H/'local-held-slice.json').read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};local=json.loads((H/'local-paths.json').read_text());stores=[];guards=[]
for lane in range(4):
 t=(300+300*(lane%2),150*(lane//2),400);move=lambda p:tuple(p[a]+t[a] for a in range(3))
 for v in local['stores']:stores.append(dict(lane=lane,name=v['name'],bit=v['bit'],**{f:move(v[f]) for f in ['storage','lock','D','Q']}))
 for b in range(9):guards.append(dict(lane=lane,bit=b,storage=move((252,1+4*b,80)),lock=move((252,1+4*b,79))))
for v in guards:assert world[v['storage']]['id']==m.R and world[v['lock']]['id']==m.R
nodes,index,cost,edges=m.build(world);cut={v['storage'] for v in stores+guards};edges=[(a,b) for a,b in edges if nodes[b][0] not in cut];m.build=lambda _:(nodes,index,cost,edges);reports={};witnesses={}
def run(name,src,dst):
 r,w=m.analyze(world,src,dst,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
phases=lambda n:[m.P(p[n]['bits'][0]['position']) for p in d['ports']]
run('B_to_guard_locks',phases('phase_b'),[v['lock'] for v in guards])
run('guard_Q_to_next_D',[v['storage'] for v in guards],[v['D'] for v in stores if v['name']=='next'])
run('current_Q_to_next_D',[v['storage'] for v in stores if v['name']=='current'],[v['D'] for v in stores if v['name']=='next'])
files=[Path(__file__).resolve(),helper,H/'local-held-slice.json',H/'local-paths.json'];out={'status':'actual_B_sampled_LSU_guard_to_NEXT_nominal_paths','reports':reports,'guards':guards,'stores':stores,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'native_acceptance':False,'numeric_physical_bounds_established':False,'limits':['Actual delivered B closure and A opening must be composed with these sampled-guard paths. Raw near-closure asynchronous changes are not thereby given a pulse/metastability guarantee.','Quiescent initialize must persist for actual sample/current closure; no all-zero placement assumption.']}
(H/'held-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'held-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:dict(paths=len(v['paths']),min=min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),max=v['max_nominal_dependency_ticks']) for n,v in reports.items()}))
