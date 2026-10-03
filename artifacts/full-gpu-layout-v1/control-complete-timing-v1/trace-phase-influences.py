"""Actual shortest witnesses for ambiguous phase reachability, not delay bounds."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import breadth_first_order
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
cache=np.load(H/'actual-graph-cache.npz');positions=cache['positions'];modes=cache['modes'];cost=cache['cost'];edges=cache['edges'];phase=json.loads((H/'phase-checks.json').read_text());stores=json.loads((H/'storage-discovery.json').read_text())['stores']
roots=[(443,234,-240),(443,234,-232)];wanted=set(roots)|{tuple(s['storage'])for s in stores}|{tuple(l)for s in stores for l in s['lock_sources']}
idx={tuple(map(int,p)):i for i,p in enumerate(positions)if modes[i]==0 and tuple(map(int,p))in wanted}
cut={idx[tuple(s['storage'])]for s in stores}|{idx[p]for p in roots};keep=np.ones(len(positions),dtype=np.bool_);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]]
graph=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(positions),len(positions))).tocsr();rows=[]
for ph,root in zip(['A','B'],roots):
 _,prev=breadth_first_order(graph,idx[root],directed=True,return_predecessors=True)
 for s in phase['both_phase_stores']:
  for lock in s['lock_sources']:
   end=idx[tuple(lock)]
   if prev[end]<0:continue
   chain=[end]
   while chain[-1]!=idx[root]:chain.append(int(prev[chain[-1]]));assert chain[-1]>=0
   chain.reverse();rows.append({'phase':ph,'storage':s['storage'],'lock':lock,'nominal_shortest_witness_cost':int(sum(cost[i]for i in chain)),'path':[{'position':list(map(int,positions[i])),'mode':['signal','all','nonwire'][modes[i]],'cost':int(cost[i])}for i in chain]})
report={'status':'actual_phase_dependency_witnesses_only','rows':rows,'source_sha256':pins|{str(Path(__file__).resolve().relative_to(ROOT)):hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},'timing_acceptance':False,'native_acceptance':False}
(H/'both-phase-witnesses.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'witnesses':len(rows),'not_latest_arrival_bounds':True}))
