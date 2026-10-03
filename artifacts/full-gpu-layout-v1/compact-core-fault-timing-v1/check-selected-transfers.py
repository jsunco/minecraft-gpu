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
clocks=[(443,234,-240),(443,234,-232)];wanted=set(clocks)|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
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
pairs=[{'name':'pc'+str(b['bit']),'next':move(b['next_store']),'current':move(b['current_store'])}for b in meta['bits']]+[{'name':'sticky_fault','next':(-62,105,0),'current':(-50,105,0)}]
rows=[]
for pair in pairs:
 ns,cs=pair['next'],pair['current'];ni,ci=sidx[ns],sidx[cs]
 up=set(map(int,breadth_first_order(back,node(stores[ci]['data_rear']),directed=True,return_predecessors=False)))
 assert {store_nodes[n]for n in up&set(store_nodes)}=={ni},pair;assert not(up&clock_nodes),pair
 a=[r for r in phase if r['store_index']==ni];all_b=[r for r in phase if r['store_index']==ci];b=[r for r in all_b if r['phase']=='B'];other=[r for r in all_b if r['phase']!='B'];assert len(a)==len(b)==1 and a[0]['phase']=='A',pair
 assert (len(other)==1 and other[0]['phase']=='A') if pair['name'].startswith('pc') else not other,pair
 a,b=a[0],b[0];data=delay(ns,stores[ci]['data_rear']);assert data is not None and data<INF
 rows.append({**pair,'NEXT_A_lock_min':a['nominal_min_ticks'],'NEXT_A_lock_max':a['nominal_max_ticks'],'CURRENT_B_lock_min':b['nominal_min_ticks'],'CURRENT_B_lock_max':b['nominal_max_ticks'],'NEXT_Q_to_CURRENT_D':data,'only_upstream_retained_source':ns,'other_phase_influence':other,'nominal_setup_before_B':1584+b['nominal_min_ticks']-(544+a['nominal_max_ticks']+2+data),'nominal_bank_nonoverlap':1584+b['nominal_min_ticks']-(544+a['nominal_max_ticks'])})
files=[Path(__file__).resolve(),H/'actual-graph-cache.npz',H/'actual-graph-cache-pins.json',H/'storage-discovery.json',H/'phase-checks.json',B/'control-nextpc-v1/pc-storage.json']
r={'status':'actual_selected_PC_and_relocated_fault_transfer_bounds','rows':rows,'minimum_PC_nominal_setup':min(r['nominal_setup_before_B']for r in rows if r['name'].startswith('pc')),'fault_nominal_setup':rows[-1]['nominal_setup_before_B'],'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['Each CURRENT reverse cone is checked to contain exactly its own NEXT storage, with no oscillator source.','Latest NEXT Q is A latest lock closure plus2; earliest CURRENT opening is B earliest lock path. PC CURRENT additionally has an A-derived inhibit path, explicitly reported rather than equated to a B opening. Actual full qualified phases and signal strength remain prerequisites.','No mode/Boolean cuts or cycle suppression; positive-cost SCCs remain unbounded.','Actual physical event timing and full-core acceptance remain unproved.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'selected-transfer-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'PC_minimum':r['minimum_PC_nominal_setup'],'fault_setup':r['fault_nominal_setup'],'rows':len(rows)}))
