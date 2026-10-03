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
wanted={(443,234,-240),(443,234,-232),(380,231,-263),(280,231,-204)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
move=lambda p:(p['x'],p['y']+240,p['z']-12)
store_index={tuple(s['storage']):i for i,s in enumerate(stores)};bits=[{'bit':b['bit'],'next':store_index[move(b['next_store'])],'current':store_index[move(b['current_store'])]}for b in meta['bits']];assert len(bits)==8
cuts={node(s['storage'])for s in stores}|{node(p)for p in[(443,234,-240),(443,234,-232)]};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cuts)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();count,labels=connected_components(g,directed=True,connection='strong');del g
sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e),'Require verified reverse-topological SCC ordering';del e
print(json.dumps({'graph_nodes':len(pos),'storage_cuts':len(stores),'scc_count':count}),flush=True)

times={(r['store_index'],r['phase']):r for r in phase};source=(380,231,-263);root=int(labels[node(source)]);reach=set(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)));dist={root:0}
for a in sorted(reach,reverse=True):
 if a not in dist:continue
 for q in g.indices[g.indptr[a]:g.indptr[a+1]]:
  q=int(q);v=min(INF,dist[a]+int(weight[q]));dist[q]=max(v,dist.get(q,-1))
nexts=[store_index[(302,234+8*b,-248)]for b in range(6)]+[store_index[(260,231,-204)]];currents=[store_index[(314,234+8*b,-248)]for b in range(6)]+[store_index[(272,231,-204)]];rows=[]
for n in nexts:
 q=int(labels[node(stores[n]['data_rear'])]);assert q in dist and dist[q]<INF;rows.append({'storage':stores[n]['storage'],'data_rear':stores[n]['data_rear'],'cold_to_D_nominal_max':dist[q],'A_to_lock_nominal_max':times[(n,'A')]['nominal_max_ticks']})
ready_q=int(labels[node((280,231,-204))]);assert ready_q in dist and dist[ready_q]<INF
latestD=max(r['cold_to_D_nominal_max']for r in rows);latestA=max(times[(n,'A')]['nominal_max_ticks']for n in nexts);latestB=max(times[(n,'B')]['nominal_max_ticks']for n in currents)
# Wait full cycle after all clamps have settled: guarantees a complete A pulse
# whose source rise is after that deadline, followed by B commit and closure.
bound=latestD+3160+1584+540+latestB+2
report={'status':'conditional_actual_RF_cold_clamp_and_ordered_transfer_bound','source':source,'next_rows':rows,'visible_READY_mask_nominal_max':dist[ready_q],'maximum_data_clamp_arrival':latestD,'latest_A_lock_arrival':latestA,'latest_B_lock_arrival':latestB,'cold_hold_bound_nominal_ticks':bound,'bound_formula':'max_cold_to_NEXT_D + one_full_source_cycle3160 + AtoB1584 + Bwidth540 + max_B_lock +2_storage','new_READY_earliest_claim':None,'limits':['Conditional on an already functioning complete A/B cadence and the actual data-zero clamps producing sustained0. Does not prove arbitrary oscillator/tail power-on convergence.','Hold cold past all clamps, an entire ordered A-close/B-close transfer and visible mask; releasing at an arbitrary earlier B is invalid even when READY looks low.','All7 NEXT clear paths exist; CURRENT data reaches them only through real held NEXT transfers, not direct reset forcing.','A fresh0→32 scan then retained READY cannot be assumed until both counter and READY pairs are proven zero. This report does not substitute raw READY for distant decoder closure.'],'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',ROOT/'hardware/full-gpu-startup-scan-control.mjs',B/'control-reset-master-compatible-v3/scanner-checks.json']},'native_acceptance':False,'full_cold_acceptance':False}
(H/'scanner-cold-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['next_rows','source_sha256','limits']}))
