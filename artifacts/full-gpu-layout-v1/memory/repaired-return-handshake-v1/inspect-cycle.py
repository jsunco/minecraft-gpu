from pathlib import Path
import json,importlib.util
from collections import deque
H=Path(__file__).resolve().parent;spec=importlib.util.spec_from_file_location('dag',H.parent/'program-rom-timing-v1/check.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
d=json.load(open(H/'consumer-slice.json'));world={m.P(v['position']):v['block'] for v in d['blocks']};allowed=set(map(tuple,d['allowed_positions']));nodes,idx,cost,edges=m.build(world);adj={}
for a,b in edges:
 if nodes[a][0] in allowed and nodes[b][0] in allowed:adj.setdefault(a,[]).append(b)
s=idx[((531,-15,501),'signal')];q=deque(adj[s]);prev={v:s for v in adj[s]};target=None
while q:
 u=q.popleft()
 if u==s:target=u;break
 for v in adj.get(u,[]):
  if v not in prev:prev[v]=u;q.append(v)
assert target is not None
ids=[s];u=prev[s]
while u!=s:ids.append(u);u=prev[u]
ids.append(s);ids.reverse()
path=[{'position':nodes[i][0],'mode':nodes[i][1],'block':world[nodes[i][0]],'cost':int(cost[i])} for i in ids]
report={'status':'additional_actual_positive_dependency_cycle_requires_physical_classification','path':path,'scheduled_nominal_ticks':sum(v['cost'] for v in path[1:]),'source':'consumer-slice.json','native_acceptance':False}
(H/'additional-cycle.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
