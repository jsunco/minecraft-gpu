"""Actual selected core scanner + RF admission dependencies, no native calls.
Reuse the exact block-derived graph cache after verifying its source bindings.
Every storage input is cut, never an authored route or unbounded handshake loop.
"""
from pathlib import Path
import json,hashlib,importlib.util
from collections import deque
import numpy as np
from scipy.sparse import coo_matrix
H=Path(__file__).resolve().parent;B=H.parents[1];ROOT=H.parents[3];C=B/'control-complete-timing-v1'
helper=H.parent/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
pins=json.loads((C/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert sha(ROOT/p)==h,p
cache=np.load(C/'actual-graph-cache.npz');pos=cache['positions'];mode=cache['modes'];cost=cache['cost'];edges=cache['edges']
stores=json.loads((C/'storage-discovery.json').read_text())['stores'];phase=[(443,234,-240),(443,234,-232)]
scan=[s for s in stores if (s['storage'][0] in [302,314] and s['storage'][2]==-248 and s['storage'][1] in range(234,275,8)) or tuple(s['storage']) in [(260,231,-204),(272,231,-204)]]
admission=[s for s in stores if tuple(s['storage']) in [(678,186,84),(690,186,84)]]
assert len(scan)==14 and len(admission)==2,(len(scan),len(admission))
selected=scan+admission
initialize=(380,231,-263);visible_ready=(280,231,-204);admitted=(693,186,84)
sources=[initialize]+phase+[tuple(s['storage']) for s in selected]
targets=[tuple(s['data_rear']) for s in selected]+[tuple(s['lock_sources'][0])for s in selected]+[visible_ready,admitted]
wanted=set(sources+targets)|{tuple(s['storage'])for s in stores}
idx={(tuple(map(int,p)),int(mode[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
node=lambda p:idx.get((p,0),idx.get((p,1)))
cut={node(tuple(s['storage']))for s in stores}|{node(p)for p in phase};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cut)]=False
edges=edges[keep[edges[:,1]]]
graph=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr()
def reach(nodes,g):
 seen=np.zeros(len(pos),dtype=np.bool_);seen[nodes]=True;q=list(nodes)
 for a in q:
  for b in g.indices[g.indptr[a]:g.indptr[a+1]]:
   if not seen[b]:seen[b]=True;q.append(int(b))
 return seen
cone=reach([node(p)for p in sources],graph)&reach([node(p)for p in targets],graph.transpose().tocsr())
# Preserve isolated required roots/targets explicitly. Their absence of paths is
# reported, not repaired with synthetic edges.
cone[[node(p)for p in sources+targets]]=True
ids=np.flatnonzero(cone);remap=np.full(len(pos),-1,dtype=np.int32);remap[ids]=np.arange(len(ids));e=edges[cone[edges[:,0]]&cone[edges[:,1]]];e=remap[e]
nodes=[(tuple(map(int,pos[i])),['signal','all','nonwire'][int(mode[i])])for i in ids];index={n:i for i,n in enumerate(nodes)};cost=cost[ids]
d=json.loads((B/'control-reset-master-compatible-v3/design.json').read_text());wanted={p for p,mode in nodes};world={m.P(v['position']):({'id':m.S}if v['block']['id'].endswith('_concrete')else v['block'])for v in d.pop('blocks')if m.P(v['position'])in wanted}
m.build=lambda _:(nodes,index,cost,[tuple(map(int,x))for x in e])
r,w=m.analyze(world,sources,targets,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r
r.update(sources=sources,targets=targets,stores=selected,scope_cells=len(world))
init=[q for q in r['paths']if q['address_bit']==0]
assert {q['data_bit']for q in init if q['data_bit']<len(selected)}=={i for i,s in enumerate(selected)if s['storage'][0]in[302,260,678]},('Initialize must clamp7 scanner NEXT inputs and RF admission NEXT via masked READY',init)
assert any(q['data_bit']==32 for q in init),'No initialize→visible READY mask'
for i,s in enumerate(selected):
 ph='A'if s['storage'][0]in[302,260,678]else'B'
 clock=[q for q in r['paths']if q['address_bit']in[1,2]and q['data_bit']==16+i]
 assert len(clock)==1 and clock[0]['address_bit']==(1 if ph=='A'else 2),(s,clock)
 r['stores'][i]['phase']=ph
pins.update({str(p.relative_to(ROOT)):sha(p)for p in[helper,Path(__file__).resolve(),C/'actual-graph-cache.npz',C/'actual-graph-cache-pins.json']})
(H/'scanner-admission-paths.json').write_text(json.dumps({'status':'actual_scanner_and_RF_admission_cone_paths','reports':r,'source_sha256':pins,'limits':['All1117 actual store inputs and two phase roots cut. Selected sources are raw initialize, real phase roots and16 selected store outputs.','No callback, authored route shortcut or virtual host clock is inserted. Upstream actual oscillator waveform remains a conditional premise.','This finite DAG certifies dependencies; the cold/conditioning ordered-transfer argument is separate.'],'native_acceptance':False,'numeric_physical_bounds_established':False},indent=2)+'\n')
(H/'scanner-admission-witnesses.json').write_text(json.dumps(w)+'\n')
print(json.dumps({'paths':len(r['paths']),'cone_cells':len(world),'init_next_max':max(q['potential_dependency_nominal_max_ticks']for q in init if q['data_bit']<16),'initialize_visible_READY':next(q for q in init if q['data_bit']==32)}))
