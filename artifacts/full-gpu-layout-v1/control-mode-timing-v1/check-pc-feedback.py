"""Source-bound PC CURRENT→NEXT actual-cell dependency audit; no semantic edge cuts."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'control-complete-timing-v1';INF=10**8
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(REF/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores'];meta=json.loads((B/'control-nextpc-v1/pc-storage.json').read_text());phase=json.loads((REF/'phase-checks.json').read_text())['phase_paths'];transfer=json.loads((REF/'pc-transfer-checks.json').read_text());assert transfer['minimum_nominal_setup']==26
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
move=lambda p:(p['x'],p['y']+240,p['z']-12)
store_index={tuple(s['storage']):i for i,s in enumerate(stores)};bits=[{'bit':b['bit'],'next':store_index[move(b['next_store'])],'current':store_index[move(b['current_store'])]}for b in meta['bits']];assert len(bits)==8
cuts={node(s['storage'])for s in stores}|{node(p)for p in[(443,234,-240),(443,234,-232)]};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cuts)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();count,labels=connected_components(g,directed=True,connection='strong');del g
sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e),'Require verified reverse-topological SCC ordering';del e
print(json.dumps({'graph_nodes':len(pos),'storage_cuts':len(stores),'scc_count':count}),flush=True)
times={(r['store_index'],r['phase']):r for r in phase};dist={};origin={};pred={};reach=set()
for b in bits:
 n=b['current'];t=times[(n,'B')];root=int(labels[node(stores[n]['storage'])]);dist[root]=t['nominal_max_ticks']+2;origin[root]=n;reach.update(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)))
for a in sorted(reach,reverse=True):
 if a not in dist:continue
 for q in g.indices[g.indptr[a]:g.indptr[a+1]]:
  q=int(q);v=min(INF,dist[a]+int(weight[q]))
  if v>dist.get(q,-1):dist[q]=v;origin[q]=origin[a];pred[q]=a
rows=[];chains=[]
for bit in bits:
 n=bit['next'];s=stores[n];t=times[(n,'A')]
 for kind,target in [('D',s['data_rear'])]+[('lock',p)for p in s['lock_sources']]:
  end=int(labels[node(target)])
  if end not in dist:
   rows.append({'bit':bit['bit'],'kind':kind,'target_storage':s['storage'],'target_position':target,'reachable_from_PC_current':False});continue
  value=dist[end];margin=None if value>=INF else 1576+t['nominal_min_ticks']-value
  source=origin[end];r={'bit':bit['bit'],'kind':kind,'target_storage':s['storage'],'target_position':target,'source_storage':stores[source]['storage'],'source_B_latest_lock_arrival':times[(source,'B')]['nominal_max_ticks'],'target_A_earliest_lock_arrival':t['nominal_min_ticks'],'reachable_from_PC_current':True,'unbounded_positive_cycle':value>=INF,'nominal_latest_from_B':None if value>=INF else value,'nominal_margin_before_next_A':margin,'nominal_margin_if_CURRENT_Q_only_at_B_close':None if margin is None else margin-540};rows.append(r)
  chain=[end]
  while chain[-1]in pred:chain.append(pred[chain[-1]])
  chains.append((r,list(reversed(chain))))
# Save actual SCC representatives, costs, and every positive SCC on each critical chain.
# Every singleton representative is the actual unique node; zero-cost SCCs are connectivity classes.
needed={q for _,chain in chains for q in chain};representatives={};positive_nodes={q:[]for q in needed if weight[q]>=INF}
for i,l in enumerate(labels):
 l=int(l)
 if l in needed and (l not in representatives or cost[i]>representatives[l]['cost']):representatives[l]={'position':list(map(int,pos[i])),'mode':int(modes[i]),'cost':int(cost[i])}
 if l in positive_nodes:positive_nodes[l].append({'position':list(map(int,pos[i])),'mode':int(modes[i]),'cost':int(cost[i])})
witnesses=[{'row':r,'chain':[{'component':q,'size':int(sizes[q]),'weight':int(weight[q]),'representative':representatives[q]}for q in chain],'positive_scc_nodes':{str(q):positive_nodes[q]for q in chain if q in positive_nodes}}for r,chain in chains]
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',REF/'pc-transfer-checks.json',B/'control-nextpc-v1/pc-storage.json']
report={'status':'actual_PC_own_feedback_dependency_inventory','phase_epoch':{'B_to_next_A':1576,'A_width':544,'B_width':540,'cycle':3160},'bits':8,'rows':rows,'finite_rows':sum(r.get('nominal_margin_before_next_A')is not None for r in rows),'unbounded_rows':sum(r.get('unbounded_positive_cycle',False)for r in rows),'nonpositive_finite_rows':sum(r.get('nominal_margin_before_next_A')is not None and r['nominal_margin_before_next_A']<=0 for r in rows),'minimum_finite_margin':min((r['nominal_margin_before_next_A']for r in rows if r.get('nominal_margin_before_next_A')is not None),default=None),'graph_build':'Reused source-hash-checked actual graph cache from frozen complete-timing reference; cache bytes bound here. No new geometry graph claim.','source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['CURRENT source opening-bound relies on independently checked held NEXT-only data and positive26-tick NEXT→CURRENT setup plus a complete stable-qualified B transfer.','No source-clock frequency or world-event proof; actual mask changes can alter opening and need their own epoch qualification.','All actual storage inputs and two oscillator roots cut; no signal formula or mode cut. Positive device SCCs are infinite, never discarded.','PC own-feedback only. Immediate/flags/target agreement and other retained sources remain separate.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'pc-feedback-checks.json').write_text(json.dumps(report,indent=2)+'\n');(H/'pc-feedback-witnesses.json').write_text(json.dumps(witnesses,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','source_sha256','limits','graph_build']}))
