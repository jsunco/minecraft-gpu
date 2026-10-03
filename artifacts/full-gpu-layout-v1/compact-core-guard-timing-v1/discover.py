"""Discover actual side-lockable repeaters before assigning phase ownership."""
from pathlib import Path
import hashlib,json
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];source=B/'compact-core-guard-v1/design.json'
d=json.loads(source.read_text());P=lambda p:tuple(p[a]for a in'xyz');A=lambda p,v:tuple(p[i]+v[i]for i in range(3));world={P(v['position']):v['block']for v in d.pop('blocks')};TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};HOR=[(1,0,0),(-1,0,0),(0,0,1),(0,0,-1)];stores=[]
for p,b in world.items():
 if b['id']!='minecraft:repeater':continue
 v=TR[b['properties']['facing']];locks=[]
 for side in HOR:
  if sum(side[i]*v[i]for i in range(3)):continue
  q=A(p,side);b=world.get(q,{})
  if b.get('id')in['minecraft:repeater','minecraft:comparator']and A(q,TR[b['properties']['facing']])==p:locks.append(q)
 if locks:stores.append({'storage':p,'data_rear':A(p,tuple(-n for n in v)),'output':A(p,v),'lock_sources':locks})
report={'status':'actual_side_lock_storage_inventory_pending_phase_assignment','physical_cells':len(world),'geometrically_discovered_stores':len(stores),'declared_metrics':d['metrics'],'stores':stores,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[source,Path(__file__).resolve()]},'phase_assignment_complete':False,'complete_timing_acceptance':False,'native_acceptance':False}
(H/'storage-discovery.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in['status','physical_cells','geometrically_discovered_stores','declared_metrics']}))
