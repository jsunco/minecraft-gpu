"""Actual complete global controller geometry, conservative nominal dependency audit.
Cuts only the incoming edges of identified physical stores and two clock outputs.
There is no native/event proof and no automatic acceptance of a clock period.
"""
from pathlib import Path
import json, hashlib, importlib.util
from collections import defaultdict, deque
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
parent=B/'memory/program-rom-timing-v1/check.py';spec=importlib.util.spec_from_file_location('physical_dag',parent);dagmod=importlib.util.module_from_spec(spec);spec.loader.exec_module(dagmod)
source=B/'global-command-assembly-v3/design.json';d=json.loads(source.read_text());P=dagmod.P
world={P(r['position']):r['block'] for r in d['blocks']};discovery=json.loads((H/'storage-discovery.json').read_text());stores=discovery['stores'];assert len(stores)==28==d['metrics']['stored_state_bits']

def role(p):
 x,y,z=p
 assert z==0 and (y-1)%4==0
 if x in [152,164]:return {'family':'state','phase':'A' if x==152 else 'B','bit':(y-1)//4}
 if x==442:return {'family':'held_command','phase':'A','bit':(y-1)//4}
 if x==-98:return {'family':'external_sample','phase':'B','bit':(y-1)//4}
 raise AssertionError(('Unbound physical store',p))
for s in stores:s.update(role(s['storage']));assert len(s['lock_sources'])==1
manual_low=[]
for row in d['manual_controls']:
 p=P(row['position']);block=world[p]
 assert row['name']=='clock_stop' and row['default_powered'] is False
 assert block['id']=='minecraft:lever' and block['properties']['powered']=='false'
 manual_low.append({'name':row['name'],'position':p,'assumed_value':0})
 # An explicitly OFF lever has no powered outgoing edge in this mode.
 # Preserve its actual support; no arbitrary unsupported device is omitted.
 del world[p]
assert len(manual_low)==1
nodes,index,cost,edges=dagmod.build(world)
clock=[(293,65,-352),(293,65,-344)]
roots=[tuple(s['storage'])for s in stores]+clock
cut={index[(p,'signal')]for p in roots};edges=[(a,b)for a,b in edges if b not in cut]
# Only analyze dependencies reachable from these actual state/clock outputs;
# the upstream oscillator loop is deliberately not a combinational path.
out=defaultdict(list)
for a,b in edges:out[a].append(b)
reachable=set(cut);queue=list(cut)
for a in queue:
 for b in out[a]:
  if b not in reachable:reachable.add(b);queue.append(b)
edges=[(a,b)for a,b in edges if a in reachable and b in reachable]
u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges]);count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
sizes=np.bincount(labels,minlength=count);bad=[i for i in reachable if cost[i]>0 and sizes[labels[i]]>1]
if bad:
 report={'status':'positive_scheduled_device_cycle_refuses_bound','nodes':len(nodes),'reachable':len(reachable),'cycle_devices':len(bad),'examples':[{'position':nodes[i][0],'cost':int(cost[i]),'component':int(labels[i])}for i in bad[:40]],'native_acceptance':False}
 (H/'checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));raise SystemExit(1)
weights=np.zeros(count,dtype=np.int32)
for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
adj=defaultdict(set);indegree=np.zeros(count,dtype=np.int32);witness={}
for a,b in edges:
 ca,cb=int(labels[a]),int(labels[b])
 if ca!=cb and cb not in adj[ca]:adj[ca].add(cb);indegree[cb]+=1;witness[(ca,cb)]=(a,b)
q=deque(np.flatnonzero(indegree==0));order=[]
while q:
 a=int(q.popleft());order.append(a)
 for b in adj[a]:
  indegree[b]-=1
  if indegree[b]==0:q.append(b)
assert len(order)==count
# Isolated graph components do not need to be scanned for every source.
active_components={int(labels[i])for i in reachable};order=[i for i in order if i in active_components]
targets=[{'kind':'data_rear','store':n,'position':tuple(s['data_rear'])}for n,s in enumerate(stores)]+[{'kind':'lock','store':n,'position':tuple(s['lock_sources'][0])}for n,s in enumerate(stores)]
for name in ['cold_initialize','cold_initialized','memory_admission_block','dispatch_start','core0_start','core0_reset','core1_start','core1_reset']:
 for b in d['ports'][name]['bits']:targets.append({'kind':'boundary','port':name,'bit':b['bit'],'position':P(b['position'])})
rows=[];maximum_paths=[]
for srcnum,src in enumerate(roots):
 start=int(labels[index[(src,'signal')]]);distance=np.full(count,-1,dtype=np.int32);earliest=np.full(count,10000000,dtype=np.int32);distance[start]=0;earliest[start]=0;prev={}
 for a in order:
  if distance[a]<0:continue
  for b in adj[a]:
   earliest[b]=min(earliest[b],earliest[a]+weights[b]);candidate=int(distance[a]+weights[b])
   if candidate>distance[b]:distance[b]=candidate;prev[b]=a
 for t in targets:
  pos=t['position'];mode='nonwire' if world[pos]['id']==dagmod.S else 'signal';end=int(labels[index[(pos,mode)]])
  if distance[end]<0:continue
  row={'source':srcnum,'target':t,'nominal_min_ticks':int(earliest[end]),'nominal_max_ticks':int(distance[end])};rows.append(row)
  if not maximum_paths or row['nominal_max_ticks']>=max(v['nominal_max_ticks']for v in maximum_paths):
   chain=[];cursor=end
   while cursor!=start:
    before=prev[cursor];a,b=witness[(before,cursor)]
    if weights[cursor]:chain.append({'position':nodes[b][0],'block':world[nodes[b][0]],'cost':int(weights[cursor])})
    cursor=before
   chain.reverse();assert sum(v['cost']for v in chain)==distance[end]
   maximum_paths.append({**row,'scheduled_devices':chain})
 if srcnum%16==0:print(json.dumps({'sources_done':srcnum+1,'paths':len(rows)}),flush=True)
summary={'status':'complete_global_storage_cut_nominal_dependency_inventory','physical_cells':len(d['blocks']),'graph_cells':len(world),'explicit_manual_low':manual_low,'identified_stores':len(stores),'physical_clock_roots':clock,'graph_nodes':len(nodes),'reachable_nodes':len(reachable),'graph_edges':len(edges),'positive_device_cycles':0,'dependency_paths':len(rows),'max_nominal_dependency_ticks':max(r['nominal_max_ticks']for r in rows),'source_roles':stores,'paths':rows,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[source,parent,Path(__file__).resolve(),H/'discover.py',H/'storage-discovery.json']},'native_acceptance':False,'numeric_physical_bounds_established':False,'complete_timing_acceptance':False,'limits':['Each storage repeater is an independent root; its data/lock incoming edges are cut. Separate setup/hold/phase and Boolean checks must compose these dependency segments.','Two actual oscillator phase output wires are roots. Upstream oscillator behavior and pulse formation are excluded, not treated as instantaneous correct behavior.','Possible physical dependencies overapproximate dust weak-output directions and gate sensitization; no amplitude, event order or real elapsed tick bound is claimed.']}
(H/'checks.json').write_text(json.dumps(summary,indent=2)+'\n');(H/'maximum-witnesses.json').write_text(json.dumps(maximum_paths)+'\n');print(json.dumps({k:v for k,v in summary.items()if k not in['source_roles','paths','source_sha256','limits']}))
