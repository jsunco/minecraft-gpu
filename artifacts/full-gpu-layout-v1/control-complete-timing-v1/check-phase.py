"""Full actual-core phase reachability and stored-data DAG preparation.
No authored edges or aliases, no event/tick or native acceptance.
"""
from pathlib import Path
from collections import defaultdict,deque
import hashlib,importlib.util,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];helper=B/'memory/program-rom-timing-v1/check.py';source=B/'control-reset-master-compatible-v3/design.json'
sp=importlib.util.spec_from_file_location('physical',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
d=json.loads(source.read_text());world={m.P(v['position']):v['block']for v in d.pop('blocks')};discovery=json.loads((H/'storage-discovery.json').read_text());stores=discovery['stores'];assert len(stores)==1117==d['metrics']['retained_bits'];print(json.dumps({'stage':'building_actual_graph','cells':len(world),'stores':len(stores)}),flush=True)
lever_sources=[p for p,b in world.items()if b['id']=='minecraft:lever'];world={p:b for p,b in world.items()if b['id']!='minecraft:lever'}
concrete_materials=sorted({b['id']for b in world.values()if b['id'].endswith('_concrete')})
assert all(n in {'minecraft:'+c+'_concrete'for c in['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black']}for n in concrete_materials)
world={p:({'id':m.S}if b['id']in concrete_materials else b)for p,b in world.items()}
phase_roots=[(443,234,-240),(443,234,-232)]
for p in phase_roots:assert world[p]['id']==m.W
nodes,index,cost,edges=m.build(world)
# Local derived cache for follow-up witnesses: exact source/helper hashes must match.
np.savez(H/'actual-graph-cache.npz',positions=np.asarray([p for p,mode in nodes],dtype=np.int16),modes=np.asarray([{'signal':0,'all':1,'nonwire':2}[mode] for p,mode in nodes],dtype=np.int8),cost=cost,edges=np.asarray(edges,dtype=np.int32))
(H/'actual-graph-cache-pins.json').write_text(json.dumps({str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,helper,H/'storage-discovery.json']},indent=2)+'\n')
print(json.dumps({'stage':'actual_graph_built','nodes':len(nodes),'edges':len(edges)}),flush=True)
cut={index[(tuple(s['storage']),'signal')]for s in stores}|{index[(p,'signal')]for p in phase_roots};edges=[(a,b)for a,b in edges if b not in cut]
out=defaultdict(list)
for a,b in edges:out[a].append(b)
# Clock influence stops at actual storage inputs. Retained-store roots are not
# clocks: their separate data analysis contains a mode-qualified fetch/decode loop.
reachable={index[(p,'signal')] for p in phase_roots};q=list(reachable)
for a in q:
 for b in out[a]:
  if b not in reachable:reachable.add(b);q.append(b)
edges=[(a,b)for a,b in edges if a in reachable and b in reachable];del out,q
u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges]);count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong');del u,v
sizes=np.bincount(labels,minlength=count);bad=[i for i in reachable if cost[i]>0 and sizes[labels[i]]>1]
pins={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[source,helper,Path(__file__).resolve(),H/'discover.py',H/'storage-discovery.json']}
if bad:
 report={'status':'actual_core_positive_device_cycle_requires_explicit_review','cycle_devices':len(bad),'examples':[{'position':nodes[i][0],'mode':nodes[i][1],'cost':int(cost[i]),'component':int(labels[i])}for i in bad[:80]],'source_sha256':pins,'native_acceptance':False,'complete_timing_acceptance':False}
 (H/'phase-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));raise SystemExit(1)
weights=np.zeros(count,dtype=np.int32);adj=defaultdict(set);indeg=np.zeros(count,dtype=np.int32)
for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
for a,b in edges:
 ca,cb=int(labels[a]),int(labels[b])
 if ca!=cb and cb not in adj[ca]:adj[ca].add(cb);indeg[cb]+=1
q=deque(np.flatnonzero(indeg==0));order=[]
while q:
 a=int(q.popleft());order.append(a)
 for b in adj[a]:
  indeg[b]-=1
  if indeg[b]==0:q.append(b)
assert len(order)==count
active={int(labels[i])for i in reachable};order=[i for i in order if i in active];print(json.dumps({'stage':'condensed_actual_DAG','components':count,'reachable_components':len(order),'positive_cycles':0}),flush=True)
rows=[]
for phase,root in zip(['A','B'],phase_roots):
 start=int(labels[index[(root,'signal')]]);late=np.full(count,-1,dtype=np.int32);early=np.full(count,10000000,dtype=np.int32);late[start]=early[start]=0
 for a in order:
  if late[a]<0:continue
  for b in adj[a]:late[b]=max(late[b],late[a]+weights[b]);early[b]=min(early[b],early[a]+weights[b])
 for n,s in enumerate(stores):
  for lock in s['lock_sources']:
   end=int(labels[index[(tuple(lock),'signal')]])
   if late[end]>=0:rows.append({'phase':phase,'store_index':n,'storage':s['storage'],'lock':lock,'nominal_min_ticks':int(early[end]),'nominal_max_ticks':int(late[end])})
 print(json.dumps({'phase':phase,'paths':sum(r['phase']==phase for r in rows)}),flush=True)
by_store=defaultdict(list)
for r in rows:by_store[r['store_index']].append(r)
missing=[{'index':i,**s}for i,s in enumerate(stores)if i not in by_store];both=[{'index':i,**stores[i],'paths':v}for i,v in by_store.items()if len({r['phase']for r in v})>1]
report={'status':'actual_complete_core_phase_inventory_pending_qualified_capture_analysis','cells':len(world),'stores':len(stores),'nodes':len(nodes),'reachable_nodes':len(reachable),'edges':len(edges),'positive_device_cycles':0,'phase_roots':phase_roots,'phase_paths':rows,'missing_stores':missing,'both_phase_stores':both,'omitted_external_lever_sources':lever_sources,'equivalent_conductive_concrete_materials':concrete_materials,'source_sha256':pins,'complete_timing_acceptance':False,'native_acceptance':False,'limits':['Only storage inputs and two verified physical oscillator output roots are cut. Reachability begins only at the two physical clock outputs; this does not certify retained-data paths. The upstream oscillator waveform remains an explicit premise.','Phase-root dependency paths are possible physical influence, not a Boolean proof of which qualified OPEN actually occurs. Both-phase paths require role-specific guard review.','Normal same-phase transfers such as ALU NEXT and CURRENT may be separated by retained microstate epochs; that condition must be proved rather than deleted from the graph.','Nominal torch/comparator/repeater arithmetic does not establish Minecraft pulse, amplitude, event order or physical setup/hold bounds.']}
(H/'phase-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'stores':len(stores),'phase_paths':len(rows),'missing':len(missing),'both_phase':len(both)}))
