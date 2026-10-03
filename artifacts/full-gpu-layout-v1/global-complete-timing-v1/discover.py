from pathlib import Path
import json
H=Path(__file__).resolve().parent;B=H.parent
D=json.loads((B/'global-command-assembly-v3/design.json').read_text());P=lambda p:tuple(p[a] for a in 'xyz');A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
W={P(r['position']):r['block'] for r in D['blocks']};R='minecraft:repeater';C='minecraft:comparator';TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};HORIZ=[(1,0,0),(-1,0,0),(0,0,1),(0,0,-1)]
rows=[]
for p,b in W.items():
 if b['id']!=R:continue
 v=TR[b['properties']['facing']];locks=[]
 for side in HORIZ:
  if sum(side[i]*v[i] for i in range(3)):continue
  q=A(p,side);lock=W.get(q,{})
  if lock.get('id') in [R,C] and A(q,TR[lock['properties']['facing']])==p:locks.append(q)
 if locks:rows.append({'storage':p,'data_rear':A(p,tuple(-x for x in v)),'output':A(p,v),'lock_sources':locks})
(H/'storage-discovery.json').write_text(json.dumps({'status':'geometry_detected_lockable_repeaters_pending_role_binding','count':len(rows),'stores':rows},indent=2)+'\n');print(json.dumps({'lockable_repeaters':len(rows),'declared_retained_bits':D['metrics']['stored_state_bits'],'example':rows[:3]}))
