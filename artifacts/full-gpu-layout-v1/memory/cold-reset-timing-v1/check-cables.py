"""Exact reset fanout and witness clear paths, with actual SR boundaries."""
from pathlib import Path
import json,hashlib,importlib.util
from collections import defaultdict
H=Path(__file__).resolve().parent;ROOT=H.parents[3];M=H.parent
helper=M/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
sources={};reports={};witnesses={};build=m.build
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(p):sources[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
def run(name,d,src,dst,cuts=(),expected=None):
 world={m.P(v['position']):v['block'] for v in d['blocks']};nodes,idx,cost,edges=build(world)
 edges=[(a,b) for a,b in edges if nodes[b][0] not in set(cuts)]
 adj=defaultdict(list);rev=defaultdict(list)
 for a,b in edges:adj[a].append(b);rev[b].append(a)
 def reach(ps,g):
  seen={idx[(p,'nonwire' if world[p]['id']==m.S else 'signal')] for p in ps};stack=list(seen)
  while stack:
   for v in g[stack.pop()]:
    if v not in seen:seen.add(v);stack.append(v)
  return seen
 cone=reach(src,adj)&reach(dst,rev);e=[(a,b) for a,b in edges if a in cone and b in cone]
 m.build=lambda _:(nodes,idx,cost,e)
 r,w=m.analyze(world,src,dst,require_all=False)
 assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r)
 assert {q['data_bit'] for q in r['paths']}==set(range(len(dst))),(name,'missing target')
 if expected is not None:assert len(r['paths'])==expected,(name,len(r['paths']),expected)
 r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w
 print(name,len(r['paths']),min(q['potential_dependency_nominal_min_ticks'] for q in r['paths']),r['max_nominal_dependency_ticks'],flush=True)
d=load(H/'reset-cable-slice.json');sources.update(d['source_sha256'])
for n,v in d['sections'].items():
 e=v['endpoints'];run(n,d,list(map(m.P,e['source'])),list(map(m.P,e['destinations'])),expected=len(e['destinations']))
w=load(M/'admission-close-v1/controller.json');cuts=[]
for l in w['latches']:
 x,y,z=m.P(l['origin']);cuts += [(x+1,y,z),(x+11,y,z)]
dst=[(m.P(l['origin'])[0],m.P(l['origin'])[1],m.P(l['origin'])[2]) for l in w['latches']]
run('initialize_to_all_witness_clear_supports',w,[m.P(w['ports']['initialize']['bits'][0]['position'])],dst,cuts,7)
run('each_mask_low_to_all_witness_clear_supports',w,[m.P(w['ports']['mask'+str(i)]['bits'][0]['position']) for i in range(8)],dst,cuts,56)
g=load(M/'channel-retention-v1/design.json')
cuts=[m.P(v['storage']) for v in g['stores']+g['snapshots']+g['busySnapshots']]
cuts += [(301,-31,350),(311,-31,350),(521,-31,350),(531,-31,350)]
cuts += [(48+128*c+1,1+80*c,172) for c in range(4)]+[(60+128*c-1,1+80*c,172) for c in range(4)]
run('master_raw_reset_to_ACTIVE_clear_support_and_SET_mask',g,[m.P(g['ports']['reset']['positions'][0])],[(300,-31,350),(314,-31,349)],cuts,2)
for p in [helper,Path(__file__).resolve()]:sources[str(p.relative_to(ROOT))]=sha(p)
(H/'reset-cables.json').write_text(json.dumps({'status':'offline_actual_reset_cable_and_witness_clear_paths','reports':reports,'source_sha256':sources,'native_acceptance':False,'numeric_physical_bounds_established':False,'limits':['Only exact named cable groups plus boundary blocks are traversed; this is not a new physical circuit.','Source-target cones exclude unrelated cycles but refuse relevant cyclic dependencies.','SR clear support arrival is not instantaneous state convergence; actual feedback settling remains an explicit requirement.']},indent=2)+'\n')
(H/'reset-cable-witnesses.json').write_text(json.dumps(witnesses)+'\n')
