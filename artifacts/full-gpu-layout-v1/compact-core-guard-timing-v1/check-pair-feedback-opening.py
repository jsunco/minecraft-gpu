"""Own CURRENT→logic→NEXT, after exact NEXT-only source-cone validation."""
from pathlib import Path
from collections import defaultdict,deque
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;ROOT=H.parents[2];INF=10**8
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(H/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((H/'storage-discovery.json').read_text())['stores'];pairs=json.loads((H/'direct-pair-checks.json').read_text())['rows'];phase=json.loads((H/'phase-checks.json').read_text())
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
cuts={node(s['storage'])for s in stores}|{node(p)for p in[(443,234,-240),(443,234,-232)]};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cuts)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();reverse=g.T.tocsr();store_nodes={node(s['storage']):i for i,s in enumerate(stores)};clock_nodes={node(p)for p in [(443,234,-240),(443,234,-232)]};
for pair in pairs:
 up=set(map(int,breadth_first_order(reverse,node(stores[pair['current_index']]['data_rear']),directed=True,return_predecessors=False)))
 assert {store_nodes[n]for n in up&set(store_nodes)}=={pair['next_index']},pair
 assert not(up&clock_nodes),pair
assert all(p['nominal_data_setup_margin']>0 for p in pairs)
count,labels=connected_components(g,directed=True,connection='strong');del g
sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e),'Require verified reverse-topological SCC ordering';del e
times={(r['store_index'],r['phase']):r for r in phase['phase_paths']};groups=[]
by_axis=defaultdict(list)
for p in pairs:by_axis[(p['next_storage'][0],p['next_storage'][2])].append(p)
for axis,ps in sorted(by_axis.items()):
 ps.sort(key=lambda p:p['next_storage'][1]);group=[]
 for p in ps:
  if group and (p['next_storage'][1]!=group[-1]['next_storage'][1]+4 or len(group)==8):groups.append(group);group=[]
  group.append(p)
 if group:groups.append(group)
rows=[];witnesses=[]
for gn,group in enumerate(groups):
 dist={};origin={};pred={};reachable=set()
 for p in group:
  n=p['current_index'];root=int(labels[node(stores[n]['storage'])]);t=times[(n,'B')];dist[root]=t['nominal_max_ticks']+2;origin[root]=n
  reachable.update(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)))
 for a in sorted(reachable,reverse=True):
  if a not in dist:continue
  for b in g.indices[g.indptr[a]:g.indptr[a+1]]:
   b=int(b);value=min(INF,dist[a]+int(weight[b]))
   if value>dist.get(b,-1):dist[b]=value;origin[b]=origin[a];pred[b]=a
 for p in group:
  n=p['next_index'];s=stores[n];t=times[(n,'A')]
  for kind,target in [('D',s['data_rear'])]+[('lock',v)for v in s['lock_sources']]:
   end=int(labels[node(target)])
   if end not in dist:continue
   value=dist[end];margin=None if value>=INF else 1576+t['nominal_min_ticks']-value
   row={'group':gn,'group_next_stores':[q['next_storage']for q in group],'source_storage':stores[origin[end]]['storage'],'target_storage':s['storage'],'target_kind':kind,'target_position':target,'nominal_latest_from_B':None if value>=INF else value,'unbounded_positive_cycle':value>=INF,'nominal_setup_before_next_A':margin,'multiple_clock_influences':sum(r['store_index']==n for r in phase['phase_paths'])>1 or sum(r['store_index']==origin[end] for r in phase['phase_paths'])>1};rows.append(row)
   if margin is not None and margin<=0:
    chain=[end]
    while chain[-1] in pred:chain.append(pred[chain[-1]])
    chain.reverse();witnesses.append({'row':row,'components':chain})
 print(json.dumps({'group':gn,'width':len(group),'reachable':len(reachable)}),flush=True)
report={'status':'actual_own_pair_feedback_with_verified_NEXT_only_CURRENT_sources','source_bound':'CURRENT latest B opening+2 after positive held NEXT setup, conditional on real stable B qualification','pair_bits':len(pairs),'groups':len(groups),'dependency_rows':len(rows),'unbounded_rows':sum(r['unbounded_positive_cycle']for r in rows),'nonpositive_finite_rows':sum(r['nominal_setup_before_next_A']is not None and r['nominal_setup_before_next_A']<=0 for r in rows),'minimum_finite_setup':min(r['nominal_setup_before_next_A']for r in rows if r['nominal_setup_before_next_A']is not None),'rows':rows,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),H/'phase-checks.json',H/'direct-pair-checks.json']},'native_acceptance':False,'full_timing_acceptance':False,'limits':['Groups are exact adjacent13-cell pairs, not a claim that all GPU stores use this motif.','Own-CURRENT sources only; cross-group sampled guards/data dependencies remain in the full inventory.','Every CURRENT data reverse cone reaches exactly its own NEXT and no clock. All direct NEXT-to-CURRENT setup margins are positive. This permits a conditional B-opening+2 source bound; late asynchronous qualification and multi-phase inhibit influences are not proved safe here.']}
(H/'pair-feedback-opening-checks.json').write_text(json.dumps(report,indent=2)+'\n');(H/'pair-feedback-opening-negative-witnesses.json').write_text(json.dumps(witnesses,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['rows','source_sha256','limits']}))
