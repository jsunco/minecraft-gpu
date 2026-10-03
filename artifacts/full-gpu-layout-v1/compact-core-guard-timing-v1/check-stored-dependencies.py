"""Two max-plus passes over every actual retained-data dependency.

No semantic mode is pruned. Positive-device SCCs are unbounded, not cut.
Multiple clock influences and same-phase epochs stay unresolved explicitly.
"""
from pathlib import Path
from collections import defaultdict,deque,Counter
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;ROOT=H.parents[2];INF=10**8
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
cache=np.load(H/'actual-graph-cache.npz');pos=cache['positions'];modes=cache['modes'];cost=cache['cost'];edges=cache['edges'];phase=json.loads((H/'phase-checks.json').read_text());stores=json.loads((H/'storage-discovery.json').read_text())['stores']
roots=[(443,234,-240),(443,234,-232)];wanted=set(roots)|{tuple(s[k])for s in stores for k in ['storage','data_rear']}|{tuple(l)for s in stores for l in s['lock_sources']}
idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):
 p=tuple(p)
 return idx.get((p,0),idx.get((p,1)))
cut={node(s['storage'])for s in stores}|{node(p)for p in roots};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]]
graph=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr()
count,labels=connected_components(graph,directed=True,connection='strong');del graph
sizes=np.bincount(labels,minlength=count);weights=np.zeros(count,dtype=np.int64);np.maximum.at(weights,labels,cost)
cyclic=np.flatnonzero((sizes>1)&(weights>0));weights[cyclic]=INF
pairs=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);pairs=np.unique(pairs[pairs[:,0]!=pairs[:,1]],axis=0)
dag=coo_matrix((np.ones(len(pairs),dtype=np.int8),(pairs[:,0],pairs[:,1])),shape=(count,count)).tocsr();del pairs
# Tarjan component numbering commonly gives reverse topological order, but the
# required property is checked rather than assumed.
if all(a>b for a in range(count)for b in dag.indices[dag.indptr[a]:dag.indptr[a+1]]):order=range(count-1,-1,-1)
else:
 indeg=np.asarray(dag.sum(axis=0)).ravel();q=deque(np.flatnonzero(indeg==0));order=[]
 while q:
  a=int(q.popleft());order.append(a)
  for b in dag.indices[dag.indptr[a]:dag.indptr[a+1]]:
   indeg[b]-=1
   if indeg[b]==0:q.append(int(b))
 assert len(order)==count
by_store=defaultdict(dict)
for r in phase['phase_paths']:by_store[r['store_index']][r['phase']]=r
clock=json.loads((H.parent/'core-phase-source/design.json').read_text())['nominal_component_sums'];assert clock['cycle_ticks']==3160
width={'A':clock['phase_a_width_ticks'],'B':clock['phase_b_width_ticks']};offset={'A':0,'B':width['A']+clock['a_to_b_gap_ticks']}
rows=[];passes=[]
for ph in ['A','B']:
 dist=np.full(count,-1,dtype=np.int64);origin=np.full(count,-1,dtype=np.int32);pred=np.full(count,-1,dtype=np.int32)
 for n,rs in by_store.items():
  if ph not in rs:continue
  c=int(labels[node(stores[n]['storage'])]);value=width[ph]+rs[ph]['nominal_max_ticks']+2
  if value>dist[c]:dist[c]=value;origin[c]=n
 for a in order:
  if dist[a]<0:continue
  for b in dag.indices[dag.indptr[a]:dag.indptr[a+1]]:
   value=min(INF,int(dist[a]+weights[b]))
   if value>dist[b]:dist[b]=value;origin[b]=origin[a];pred[b]=a
 np.savez(H/('stored-pass-'+ph+'.npz'),distance=dist,origin=origin,predecessor=pred,labels=labels)
 for n,s in enumerate(stores):
  for kind,p in [('D',s['data_rear'])]+[('lock',p)for p in s['lock_sources']]:
   end=node(p)
   if end is None:raise AssertionError(('target missing',p))
   c=int(labels[end]);value=int(dist[c])
   if value<0:continue
   for target_ph,timing in by_store.get(n,{}).items():
    delta=(offset[target_ph]-offset[ph])%clock['cycle_ticks'];same=ph==target_ph
    if same:delta=clock['cycle_ticks']
    margin=None if value>=INF else delta+timing['nominal_min_ticks']-value
    rows.append({'source_phase':ph,'source_store_index':int(origin[c]),'source_storage':stores[int(origin[c])]['storage'],'target_phase':target_ph,'target_store_index':n,'target_storage':s['storage'],'target_kind':kind,'target_position':p,'nominal_latest_from_source_phase':None if value>=INF else value,'unbounded_positive_cycle':value>=INF,'same_phase_requires_qualified_epoch_proof':same,'multiple_clock_influences':len(by_store[n])>1 or len(by_store[int(origin[c])])>1,'nominal_margin_if_next_target_epoch':margin})
 passes.append({'source_phase':ph,'seeded_stores':sum(ph in x for x in by_store.values()),'reachable_components':int(sum(dist>=0)),'unbounded_components':int(sum(dist>=INF))})
summary={'rows':len(rows),'unbounded_rows':sum(r['unbounded_positive_cycle']for r in rows),'same_phase_rows':sum(r['same_phase_requires_qualified_epoch_proof']for r in rows),'opposite_phase_rows':sum(not r['same_phase_requires_qualified_epoch_proof']for r in rows),'nonpositive_finite_opposite_rows':sum(not r['same_phase_requires_qualified_epoch_proof'] and r['nominal_margin_if_next_target_epoch'] is not None and r['nominal_margin_if_next_target_epoch']<=0 for r in rows)}
report={'status':'actual_retained_dependency_inventory_requires_mode_and_epoch_resolution','stores':len(stores),'positive_device_sccs':len(cyclic),'passes':passes,'summary':summary,'rows':rows,'unclocked_sources':[s['storage']for i,s in enumerate(stores)if i not in by_store],'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),H/'phase-checks.json',H.parent/'core-phase-source/design.json']},'limits':['All same-phase paths require real retained microepoch qualification; next-cycle arithmetic is not same-window safety.','Structural phase influence includes inhibit controls; it is not proof of an OPEN waveform.','The asynchronous fetch/decode positive SCC is assigned an unbounded cost. No edge was cut to hide it.','Unclocked IR/fetch stores and external asynchronous inputs are separate handshake sources, not omitted accepted setup cases.','Fixed component ticks and a two-tick storage allowance are nominal analysis, not measured physical setup/hold or event bounds.'],'timing_acceptance':False,'native_acceptance':False}
(H/'stored-dependency-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'passes':passes,**summary}))
