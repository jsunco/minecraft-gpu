"""Actual retained frontend state/guard→NEXT and intent paths, compact-fault source."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'compact-core-fault-timing-v1';INF=10**8
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(REF/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores'];meta=json.loads((B/'control-nextpc-v1/pc-storage.json').read_text());phase=json.loads((REF/'phase-checks.json').read_text())['phase_paths']
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
move=lambda p:(p['x'],p['y']+240,p['z']-12)
store_index={tuple(s['storage']):i for i,s in enumerate(stores)};bits=[{'bit':b['bit'],'next':store_index[move(b['next_store'])],'current':store_index[move(b['current_store'])]}for b in meta['bits']];assert len(bits)==8
cuts={node(s['storage'])for s in stores}|{node(p)for p in[(443,234,-240),(443,234,-232)]};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cuts)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();count,labels=connected_components(g,directed=True,connection='strong');del g
sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e),'Require verified reverse-topological SCC ordering';del e
print(json.dumps({'graph_nodes':len(pos),'storage_cuts':len(stores),'scc_count':count}),flush=True)


times={(r['store_index'],r['phase']):r for r in phase}
current=[store_index[(-8,1+4*b,0)]for b in range(3)];nxt=[store_index[(-20,1+4*b,0)]for b in range(3)];intents=[store_index[(-38,1+4*b,90)]for b in range(2)];guards=[store_index[(82,1+4*b,-120)]for b in range(7)]
# Core CURRENT opening bounds inherit the separately checked direct NEXT→CURRENT pairs.
pairs=json.loads((B/'control-complete-timing-v1/direct-pair-checks.json').read_text())['rows'];assert all(any(p['current_index']==n for p in pairs)for n in current)
def run(srcs,bound):
 dist={};origin={};reach=set()
 for n in srcs:
  t=times[(n,'B')];root=int(labels[node(stores[n]['storage'])]);dist[root]=t['nominal_max_ticks']+2+(540 if bound=='close'else 0);origin[root]=n;reach.update(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)))
 for a in sorted(reach,reverse=True):
  if a not in dist:continue
  for q in g.indices[g.indptr[a]:g.indptr[a+1]]:
   q=int(q);v=min(INF,dist[a]+int(weight[q]))
   if v>dist.get(q,-1):dist[q]=v;origin[q]=origin[a]
 return dist,origin
out=[]
for name,src,bound in [('core_CURRENT',current,'opening'),('held_advance',guards,'close')]:
 d,o=run(src,bound)
 for n in nxt+intents:
  for kind,target in [('D',stores[n]['data_rear'])]+[('lock',x)for x in stores[n]['lock_sources']]:
   q=int(labels[node(target)])
   if q not in d:continue
   a=d[q];margin=None if a>=INF else 1576+times[(n,'A')]['nominal_min_ticks']-a
   out.append({'source_group':name,'source_storage':stores[o[q]]['storage'],'target_storage':stores[n]['storage'],'target_kind':kind,'nominal_latest_from_B':None if a>=INF else a,'nominal_margin_before_A':margin,'unbounded':a>=INF})
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',B/'control-complete-timing-v1/direct-pair-checks.json']
r={'status':'conditional_actual_frontend_retained_guard_and_decode_bounds','rows':out,'nonpositive_finite_rows':sum(x['nominal_margin_before_A']is not None and x['nominal_margin_before_A']<=0 for x in out),'unbounded_rows':sum(x['unbounded']for x in out),'minimum_finite_margin':min(x['nominal_margin_before_A']for x in out if x['nominal_margin_before_A']is not None),'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['Held guard inputs may be asynchronous at B; this is only the held B output→A data/enable bound.','Core CURRENT opening bound requires a complete qualified B transfer and actual previously verified paired NEXT-only source.','Warm/cold initialize and arbitrary asynchronous masks are not inferred stable from this graph.','Normal state/intent sequence is a separate semantic proof; this report does not cut the fetch/IR handshake SCC.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'front-state-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k not in['rows','source_sha256','limits']}))
