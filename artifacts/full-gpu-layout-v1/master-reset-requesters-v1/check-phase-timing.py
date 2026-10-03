"""Actual geometry of all requester locks and stored-data dependencies.
Nominal component arithmetic only. Shared phase source behavior is a premise.
"""
from pathlib import Path
import json,hashlib,importlib.util
from collections import defaultdict,deque
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];helper=B/'memory/program-rom-timing-v1/check.py'
sp=importlib.util.spec_from_file_location('physical',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
d=json.loads((H/'phase-audit-slice.json').read_text());world={m.P(v['position']):v['block']for v in d['blocks']};stores=d['stores']
external_levers=[p for p,b in world.items()if b['id']=='minecraft:lever']
world={p:b for p,b in world.items()if b['id']!='minecraft:lever'}
nodes,ix,cost,edges=m.build(world);physical_stores=[]
for p,b in world.items():
 if b['id']!=m.R:continue
 travel=m.TR[b['properties']['facing']]
 for side in m.HOR:
  if sum(side[i]*travel[i]for i in range(3)):continue
  q=m.A(p,side);b=world.get(q,{})
  if b.get('id')in[m.R,m.C]and m.A(q,m.TR[b['properties']['facing']])==p:physical_stores.append(p);break
assert {m.P(s['position'])for s in stores}<=set(physical_stores)
cut={ix[(p,'signal')]for p in physical_stores}|{ix[(m.P(r['position']),'signal')]for r in d['roots']}
edges=[(a,b)for a,b in edges if b not in cut];out=defaultdict(list)
for a,b in edges:out[a].append(b)
roots=[*d['roots'],*stores];reachable={ix[(m.P(v['position']),'signal')]for v in roots};q=list(reachable)
for a in q:
 for b in out[a]:
  if b not in reachable:reachable.add(b);q.append(b)
edges=[(a,b)for a,b in edges if a in reachable and b in reachable]
u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges]);count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
sizes=np.bincount(labels,minlength=count);bad=[i for i in reachable if cost[i]>0 and sizes[labels[i]]>1];assert not bad,('positive-cost cycle',[nodes[i]for i in bad[:10]])
weights=np.zeros(count,dtype=np.int32);adj=defaultdict(set);indegree=np.zeros(count,dtype=np.int32)
for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
for a,b in edges:
 ca,cb=int(labels[a]),int(labels[b])
 if ca!=cb and cb not in adj[ca]:adj[ca].add(cb);indegree[cb]+=1
q=deque(np.flatnonzero(indegree==0));order=[]
while q:
 a=int(q.popleft());order.append(a)
 for b in adj[a]:
  indegree[b]-=1
  if indegree[b]==0:q.append(b)
assert len(order)==count
def walk(p):
 start=int(labels[ix[(m.P(p),'signal')]]);latest=np.full(count,-1,dtype=np.int32);earliest=np.full(count,10000000,dtype=np.int32);latest[start]=earliest[start]=0
 for a in order:
  if latest[a]<0:continue
  for b in adj[a]:latest[b]=max(latest[b],latest[a]+weights[b]);earliest[b]=min(earliest[b],earliest[a]+weights[b])
 return earliest,latest
lock_rows=[]
for r in d['roots']:
 early,late=walk(r['position'])
 for s in stores:
  end=labels[ix[(m.P(s['lock']),'signal')]]
  if late[end]<0:continue
  assert s['phase']==r['phase'],('wrong phase reaches lock',s['name'],r['phase'])
  lock_rows.append({'store':s['name'],'phase':r['phase'],'earliest':int(early[end]),'latest':int(late[end])})
assert len(lock_rows)==len(stores)==26
locks={v['store']:v for v in lock_rows};clock=d['clock'];start={'A':0,'B':clock['phase_a_width_ticks']+clock['a_to_b_gap_ticks']};width={'A':clock['phase_a_width_ticks'],'B':clock['phase_b_width_ticks']};rows=[];feedback=[]
for s in stores:
 early,late=walk(s['position'])
 for t in stores:
  end=labels[ix[(m.P(t['data_rear']),'signal')]]
  if late[end]<0:continue
  delay=int(late[end]);row={'source':s['name'],'target':t['name'],'nominal_delay':delay}
  if s['phase']==t['phase']:
   assert s['name']==t['name']and s['group']=='A_held_commands'and s['bit']==0,('unexpected same-phase stored-data dependency',row)
   feedback.append({**row,'purpose':'monotonic held-RESET self-retention under closed, B-sampled demand; separate finite logic checks bind this intentional exception'});continue
  target_open=start[t['phase']]+locks[t['name']]['earliest']+(clock['cycle_ticks']if s['phase']=='B'else 0)
  source_closed=start[s['phase']]+width[s['phase']]+locks[s['name']]['latest']
  row['nominal_setup_margin']=target_open-source_closed-delay-4;assert row['nominal_setup_margin']>0,row;rows.append(row)
assert len(feedback)==2
report={'status':'actual_requester_storage_cut_phase_and_data_nominal_audit','physical_cells':len(world),'all_discovered_stores_cut':len(physical_stores),'requester_stores':len(stores),'omitted_external_lever_sources':external_levers,'phase_roots':d['roots'],'phase_lock_paths':lock_rows,'data_dependencies':rows,'intentional_same_phase_feedback':feedback,'minimum_nominal_setup_margin':min(v['nominal_setup_margin']for v in rows),'positive_device_cycles':0,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),helper,H/'phase-audit-slice.json']},'numeric_physical_bounds_established':False,'native_acceptance':False,'limits':['The physical DAG identifies actual storage and cuts every storage input plus the two phase output roots. No authored route alias is used as connectivity proof.','Nominal rise/fall component equality, full source pulse generation, far pulse closure and asynchronous input hold durations remain assumptions requiring physical/event bounds.','Only the held RESET output has intentional same-phase self-feedback; it is not a normal opposite-phase NEXT capture and is recorded explicitly.','The complete global controller state machine is not re-audited here. Its actual cells provide the phase paths and source boundaries.']}
(H/'physical-phase-timing.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in['status','physical_cells','requester_stores','minimum_nominal_setup_margin']}))
