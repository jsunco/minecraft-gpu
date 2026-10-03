"""Actual ALU retained control loops and macro/phase→lane dependency bounds."""
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


times={(r['store_index'],r['phase']):r for r in phase};groups={};store_role={}
for lane,(ox,oy)in enumerate([(1800,78),(1984,78),(1800,202),(1984,202)]):
 ns=[];cs=[]
 for bank,dx in [('W',0),('Q',40),('M',80)]:
  for b in range(8):
   for role,p in [('NEXT',(ox+dx+12,oy+1,12+12*b)),('CURRENT',(ox+dx+2,oy+1,12*b))]:
    n=store_index[p];(ns if role=='NEXT'else cs).append(n);store_role[n]={'lane':lane,'bank':bank,'kind':role,'bit':b}
  for role,p in [('NEXT',(ox+dx+18,oy+1,6)),('CURRENT',(ox+dx+18,oy+1,0))]:
   n=store_index[p];(ns if role=='NEXT'else cs).append(n);store_role[n]={'lane':lane,'bank':bank,'kind':role,'bit':'aux'}
 assert len(ns)==len(cs)==27;groups[lane]={'NEXT':ns,'CURRENT':cs}
def run(srcs):
 dist={};origin={};reach=set()
 for n in srcs:
  t=times[(n,'A')];root=int(labels[node(stores[n]['storage'])]);dist[root]=544+t['nominal_max_ticks']+2;origin[root]=n;reach.update(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)))
 for a in sorted(reach,reverse=True):
  if a not in dist:continue
  for q in g.indices[g.indptr[a]:g.indptr[a+1]]:
   q=int(q);v=min(INF,dist[a]+int(weight[q]));
   if v>dist.get(q,-1):dist[q]=v;origin[q]=origin[a]
 return dist,origin
rows=[]
for lane,group in groups.items():
 for source_kind in ['NEXT','CURRENT']:
  d,o=run(group[source_kind])
  for target_kind in ['NEXT','CURRENT']:
   epochs={('NEXT','CURRENT'):1,('CURRENT','NEXT'):3,('NEXT','NEXT'):4,('CURRENT','CURRENT'):4}[(source_kind,target_kind)]
   for n in group[target_kind]:
    target=stores[n]['data_rear'];q=int(labels[node(target)])
    if q not in d:continue
    source=o[q];value=d[q];margin=None if value>=INF else epochs*3160+times[(n,'A')]['nominal_min_ticks']-value
    same_bank_exception=source_kind==target_kind=='NEXT'
    if same_bank_exception:
     assert store_role[source]['bank']=='Q'and store_role[source]['bit']=='aux',(store_role[source],store_role[n]);assert store_role[n]['bank']in['W','M']
    rows.append({'source_storage':stores[source]['storage'],'source_role':store_role[source],'target_storage':stores[n]['storage'],'target_role':store_role[n],'nominal_latest_from_source_A':None if value>=INF else value,'unbounded':value>=INF,'minimum_separating_cycles':epochs,'nominal_margin_before_target_A':margin,'same_NEXT_hold_requires_not_take_mode':same_bank_exception})
  print(json.dumps({'lane':lane,'source_kind':source_kind,'rows':len(rows)}),flush=True)
for r in rows:assert not r['unbounded']and r['nominal_margin_before_target_A']>0
summary=[]
for pair in [('NEXT','CURRENT'),('CURRENT','NEXT'),('NEXT','NEXT'),('CURRENT','CURRENT')]:
 rs=[r for r in rows if(r['source_role']['kind'],r['target_role']['kind'])==pair];summary.append({'source_kind':pair[0],'target_kind':pair[1],'rows':len(rs),'minimum_nominal_margin':min((r['nominal_margin_before_target_A']for r in rs),default=None)})
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',H/'alu-epoch-checks.json']
r={'status':'conditional_actual_lane_data_epoch_bounds','lane_data_stores':216,'status_stores_excluded':12,'summary':summary,'rows':rows,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['All source Q changes conservatively seeded at latest A lock closure+2. NEXT/CURRENT here are both physical A-driven lane banks, distinguished by the actual held2-bit ALU phase.','One-cycle NEXT→CURRENT and three-cycle CURRENT→NEXT spacing requires the established four-phase microprogram, complete qualified pulses and normal cold-admitted execution.','Same-NEXT sensitivity is only retained Q auxiliary take→W/M data. not_take is selected exclusively in DIV_RESTORE_BIT, whose Q_NEXT remains closed; earliest later macro NEXT is fourcycles. No assumption that all same-phase banks are simultaneously transparent.','Status fault/busy/ready cells and data-dependent lock/action qualification are not covered by these D-only bounds. No native pulse/event proof.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'lane-transfer-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(summary))
