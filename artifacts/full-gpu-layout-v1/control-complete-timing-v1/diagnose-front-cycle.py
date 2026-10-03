"""Bounded actual-cell SCC witness; diagnostic only, no accepted timing cut."""
from pathlib import Path
from collections import defaultdict,deque
import hashlib,importlib.util,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
source=B/'control-reset-master-compatible-v3/design.json';helper=B/'memory/program-rom-timing-v1/check.py'
sp=importlib.util.spec_from_file_location('physical',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
d=json.loads(source.read_text());lo=(-151,-16,-87);hi=(287,127,189)
original={m.P(v['position']):v for v in d.pop('blocks') if all(lo[i]<=m.P(v['position'])[i]<=hi[i] for i in range(3))}
world={p:({'id':m.S} if v['block']['id'].endswith('_concrete') else v['block']) for p,v in original.items() if v['block']['id']!='minecraft:lever'}
nodes,index,cost,edges=m.build(world)
stores=json.loads((H/'storage-discovery.json').read_text())['stores'];cuts={index[(tuple(s['storage']),'signal')] for s in stores if (tuple(s['storage']),'signal') in index}
edges=[(a,b) for a,b in edges if b not in cuts]
u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges]);count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
sizes=np.bincount(labels,minlength=count);bad=[i for i in range(len(nodes)) if cost[i]>0 and sizes[labels[i]]>1]
def node(i):
 p,mode=nodes[i];return {'position':p,'mode':mode,'cost':int(cost[i]),'block':original[p]['block'],'part':original[p].get('part')}
groups=[]
for c in sorted(set(int(labels[i]) for i in bad)):
 members={i for i in range(len(nodes)) if labels[i]==c};inside=[(a,b) for a,b in edges if a in members and b in members];out=defaultdict(list)
 for a,b in inside:out[a].append(b)
 start=next(i for i in sorted(members) if cost[i]>0);prev={start:None};q=deque([start]);end=None
 while q and end is None:
  a=q.popleft()
  for b in out[a]:
   if b==start:end=a;break
   if b not in prev:prev[b]=a;q.append(b)
 assert end is not None
 path=[end]
 while prev[path[-1]] is not None:path.append(prev[path[-1]])
 path.reverse();path.append(start)
 groups.append({'nodes':len(members),'positive_devices':int(sum(cost[i]>0 for i in members)),'positions':[node(i) for i in sorted(members)],'cycle_witness':[node(i) for i in path]})
report={'status':'diagnostic_only','actual_cells':len(world),'region':{'from':lo,'to':hi},'actual_store_cuts':len(cuts),'positive_device_count':len(bad),'groups':groups,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,helper,Path(__file__).resolve(),H/'storage-discovery.json']},'native_acceptance':False,'timing_acceptance':False}
(H/'front-cycle-diagnostic.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['groups','source_sha256']}))
for g in groups:print(json.dumps({'positive_devices':int(g['positive_devices']),'cycle_nodes':len(g['cycle_witness']),'nominal_cost':sum(v['cost'] for v in g['cycle_witness'][:-1])}))
