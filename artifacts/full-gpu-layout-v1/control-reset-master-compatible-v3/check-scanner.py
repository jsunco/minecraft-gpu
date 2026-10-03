"""Two physical entry orientations; bounded actual-core clock dependency audit.

Storage inputs and the two oscillator outputs are cut, not replaced by alias edges.
The copied scanner plus its actual-core bounding-box halo is inspected. This proves
geometric phase paths, not signal strength, event ordering, or physical timing.
"""
from pathlib import Path
from collections import defaultdict, deque
import hashlib, importlib.util, json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
helper=B/'memory/program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('physical_dag',helper)
dag=importlib.util.module_from_spec(spec);spec.loader.exec_module(dag)
P,A=dag.P,dag.A;origin=(300,233,-248);T=lambda p:A(P(p),origin)
old_path=B/'control-reset-master-compatible-v2/design.json';new_path=H/'design.json'
scanner_path=B/'startup-scan-v1/clock/design.json'
old=json.loads(old_path.read_text());new=json.loads(new_path.read_text());scanner=json.loads(scanner_path.read_text())
old_world={P(v['position']):v['block']for v in old.pop('blocks')}
new_world={P(v['position']):v['block']for v in new.pop('blocks')}
assert old_world.keys()==new_world.keys()
changes=[p for p in old_world if old_world[p]!=new_world[p]]
assert sorted(changes)==[(289,231,-245),(304,231,-248)]
for p,before,after in [((289,231,-245),'east','west'),((304,231,-248),'south','north')]:
 assert old_world[p]=={'id':dag.R,'properties':{'facing':before,'delay':'1'}}
 assert new_world[p]=={'id':dag.R,'properties':{'facing':after,'delay':'1'}}
assert old['ports']==new['ports'] and old.get('box')==new.get('box')
scan={T(v['position']):v['block']for v in scanner['blocks']}
assert len(scan)==10543
for p,b in scan.items():assert old_world[p]==b
lo=tuple(scanner['box']['from'][a]+origin[i]-3 for i,a in enumerate('xyz'))
hi=tuple(scanner['box']['to'][a]+origin[i]+3 for i,a in enumerate('xyz'))
in_box=lambda p:all(lo[i]<=p[i]<=hi[i]for i in range(3))
before={p:b for p,b in old_world.items()if in_box(p)}
after={p:b for p,b in new_world.items()if in_box(p)}
phase_roots=[T(scanner['ports']['phase_'+s]['bits'][0]['position'])for s in ['a','b']]

def discover(world):
 result=[]
 for p,b in world.items():
  if b['id']!=dag.R:continue
  travel=dag.TR[b['properties']['facing']];locks=[]
  for side in dag.HOR:
   if sum(side[i]*travel[i]for i in range(3)):continue
   q=A(p,side);v=world.get(q,{})
   if v.get('id')in[dag.R,dag.C]and A(q,dag.TR[v['properties']['facing']])==p:locks.append(q)
  if locks:result.append({'storage':p,'lock_sources':locks})
 return result

scanner_stores=discover(scan);assert len(scanner_stores)==14
for s in scanner_stores:
 x,y,z=tuple(s['storage'][i]-origin[i]for i in range(3))
 if z==0 and x in[2,14]:s.update(family='scan',phase='A'if x==2 else'B',bit=(y-1)//8)
 elif z==44 and x in[-40,-28]:s.update(family='ready',phase='A'if x==-40 else'B',bit=0)
 else:raise AssertionError(('unidentified scanner store',s))
 assert len(s['lock_sources'])==1

def inspect(world):
 stores=discover(world);nodes,index,cost,edges=dag.build(world)
 cuts={index[(s['storage'],'signal')]for s in stores}|{index[(p,'signal')]for p in phase_roots}
 edges=[(a,b)for a,b in edges if b not in cuts]
 out=defaultdict(list)
 for a,b in edges:out[a].append(b)
 reach=set(index[(p,'signal')]for p in phase_roots);queue=list(reach)
 for a in queue:
  for b in out[a]:
   if b not in reach:reach.add(b);queue.append(b)
 edges=[(a,b)for a,b in edges if a in reach and b in reach]
 u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges])
 count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
 sizes=np.bincount(labels,minlength=count)
 assert not [i for i in reach if cost[i]>0 and sizes[labels[i]]>1], 'Positive-cost reachable cycle'
 weights=np.zeros(count,dtype=np.int32);adj=defaultdict(set);indeg=np.zeros(count,dtype=np.int32)
 for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
 for a,b in edges:
  ca,cb=int(labels[a]),int(labels[b])
  if ca!=cb and cb not in adj[ca]:adj[ca].add(cb);indeg[cb]+=1
 queue=deque(np.flatnonzero(indeg==0));order=[]
 while queue:
  a=int(queue.popleft());order.append(a)
  for b in adj[a]:
   indeg[b]-=1
   if indeg[b]==0:queue.append(b)
 assert len(order)==count
 rows=[]
 for phase,root in zip(['A','B'],phase_roots):
  dist=np.full(count,-1,dtype=np.int32);dist[labels[index[(root,'signal')]]]=0
  for a in order:
   if dist[a]<0:continue
   for b in adj[a]:dist[b]=max(dist[b],dist[a]+weights[b])
  for s in scanner_stores:
   ticks=int(dist[labels[index[(s['lock_sources'][0],'signal')]]])
   if ticks>=0:rows.append({'source_phase':phase,**s,'nominal_component_ticks':ticks})
 return {'halo_cells':len(world),'geometrically_discovered_stores_cut':len(stores),'reachable_nodes':len(reach),'positive_device_cycles':0,'phase_paths':rows}

baseline=inspect(before);repaired=inspect(after)
assert len(baseline['phase_paths'])==2 and all(r['family']=='ready'for r in baseline['phase_paths'])
assert len(repaired['phase_paths'])==14
assert all(r['source_phase']==r['phase']for r in repaired['phase_paths'])
assert {tuple(r['storage'])for r in repaired['phase_paths']}=={s['storage']for s in scanner_stores}
# Reverting either individual repair must lose exactly its six counter locks.
for p in changes:
 broken=dict(after);broken[p]=before[p];result=inspect(broken)
 assert len(result['phase_paths'])==8
report={'status':'actual_core_shared_scanner_entry_paths_checked','core_cells':len(new_world),'scanner_copies':1,'scanner_cells':len(scan),'changed_cells':2,'unchanged_cells':len(new_world)-2,'phase_roots':phase_roots,'old':baseline,'repaired':repaired,'single_reversion_negatives':2,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),helper,old_path,new_path,scanner_path,H/'prepare.mjs',H/'replacement-inventory.json']},'scope':['Actual copied scanner and three-cell-expanded bounding-box core halo. Incoming edges of all geometrically identified local stores and oscillator phase roots are cut.','All 12 counter locks and both READY locks have actual correctly phased geometric paths; the unmodified parent reaches only the two READY locks.','No parent source edit, new cell, store, boundary-port change, or native call.','This bounded path audit does not establish whole-core isolation, signal amplitude, pulse/event timing, or global setup/hold closure.'], 'numeric_physical_bounds_established':False,'native_acceptance':False}
(H/'scanner-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k]for k in['status','core_cells','scanner_cells','changed_cells','single_reversion_negatives']}))
