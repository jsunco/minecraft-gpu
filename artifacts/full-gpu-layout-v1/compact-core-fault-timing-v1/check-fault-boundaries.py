"""Independent PC/fault held transfer and actual phase skew after relocation."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];INF=10**8
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(H/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((H/'storage-discovery.json').read_text())['stores'];phase=json.loads((H/'phase-checks.json').read_text())['phase_paths'];meta=json.loads((B/'control-nextpc-v1/pc-storage.json').read_text())
clocks=[(443,234,-240),(443,234,-232)];named=[(-50,105,0),(-61,105,0),(-100,1,-8),(-40,105,-4),(-45,105,-8),(-45,105,-4),(-43,105,0),(-120,1,-2),(-47,105,0),(120,37,-185),(-524,97,-185),(-188,157,335)];wanted=set(clocks)|set(named)|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
sidx={tuple(s['storage']):i for i,s in enumerate(stores)};store_nodes={node(s['storage']):i for i,s in enumerate(stores)};clock_nodes={node(p)for p in clocks};cut=set(store_nodes)|clock_nodes;keep=np.ones(len(pos),dtype=np.bool_);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();back=g.T.tocsr();count,labels=connected_components(g,directed=True,connection='strong');sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);dag=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e)
def delay(start,end):
 s=int(labels[node(start)]);t=int(labels[node(end)]);reach=set(map(int,breadth_first_order(dag,s,directed=True,return_predecessors=False)));d={s:0}
 for a in sorted(reach,reverse=True):
  if a not in d:continue
  for q in dag.indices[dag.indptr[a]:dag.indptr[a+1]]:
   q=int(q);d[q]=max(d.get(q,-1),min(INF,d[a]+int(weight[q])))
 return d.get(t)
move=lambda p:(p['x'],p['y']+240,p['z']-12)
queries=[('CURRENT_feedback',(-50,105,0),(-63,105,0)),('clear_port_to_NEXT_D',(-40,105,-4),(-63,105,0)),('original_front_clear_to_NEXT_D',(-100,1,-8),(-63,105,0)),('raw_fault_to_NEXT_D',(-45,105,-8),(-63,105,0)),('LSU_fault_arrival_to_NEXT_D',(-45,105,-4),(-63,105,0)),('CURRENT_to_immediate_front_fault',(-50,105,0),(-120,1,-2)),('raw_fault_to_immediate_front_fault',(-45,105,-8),(-120,1,-2)),('CURRENT_to_DONE_guard',(-50,105,0),(120,37,-185)),('CURRENT_to_reset_barrier',(-50,105,0),(-524,97,-185)),('CURRENT_to_zero_action_guard',(-50,105,0),(-188,157,335))]
rows=[]
for name,a,b in queries:
 d=delay(a,b);rows.append({'name':name,'source':a,'target':b,'nominal_delay':None if d is None or d>=INF else d,'unbounded_positive_cycle':d is not None and d>=INF,'reachable':d is not None})
 assert d is not None and d<INF,(name,d)
ni=sidx[(-62,105,0)];ci=sidx[(-50,105,0)];a=[r for r in phase if r['store_index']==ni and r['phase']=='A'][0];b=[r for r in phase if r['store_index']==ci and r['phase']=='B'][0]
margin=1576+a['nominal_min_ticks']-(b['nominal_max_ticks']+2+rows[0]['nominal_delay'])
files=[Path(__file__).resolve(),H/'actual-graph-cache.npz',H/'actual-graph-cache-pins.json',H/'storage-discovery.json',H/'phase-checks.json',H/'selected-transfer-checks.json']
r={'status':'relocated_fault_actual_boundary_and_feedback_delays','rows':rows,'CURRENT_to_NEXT_nominal_setup':margin,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['Own feedback uses earned CURRENT opening launch only after positive complete NEXT-to-CURRENT transfer.','Raw fault and clear are asynchronous held levels: finite local propagation is not phase admission or proof of pulse capture. Their held interval must cover far arrival plus full NEXT and CURRENT capture/closure.','Retained fault suppression of DONE is delayed by the actual route and held DONE capture; this is not instantaneous external fault retraction.','No mode/Boolean cuts; positive-cost SCCs are retained. Native/event timing and full core acceptance remain false.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'fault-boundary-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'feedback_setup':margin,'paths':rows}))
