import json,collections
from pathlib import Path
import sys
HERE=Path(__file__).resolve().parent
D=json.loads((HERE/'design.json').read_text());P=json.loads((HERE.parent/'data-owned-bank-v1/design.json').read_text());K=lambda p:','.join(map(str,p));M={tuple(v['position'][a]for a in'xyz'):v['block']for v in D['blocks']};old={tuple(v['position'][a]for a in'xyz'):v['block']for v in P['blocks']};V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(V.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda v:tuple(-i for i in v)
wire=[];step=[];side=[];face=[]
for p,b in M.items():
 if p in old or b['id']==S:continue
 for dv in dirs:
  q=A(p,dv);bb=M.get(q,{})
  if bb and bb['id']!=S and D['nets'][K(p)]!=D['nets'][K(q)]:
   row=[p,q,D['nets'][K(p)],D['nets'][K(q)],b['id'],bb['id']];face.append(row)
   if b['id']==bb['id']==W:wire.append(row)
   if b['id']=='minecraft:repeater'and bb['id']in['minecraft:repeater','minecraft:comparator']and V[b['properties']['facing']][0]*dv[0]+V[b['properties']['facing']][2]*dv[2]==0 and A(q,V[bb['properties']['facing']])==p:side.append(row)
  if b['id']!=W:continue
  for dy in[-1,1]:
   q=A(A(p,dv),(0,dy,0));bb=M.get(q,{})
   if bb.get('id')!=W or D['nets'][K(p)]==D['nets'][K(q)]:continue
   if dy>0 and A(p,(0,1,0))in M or dy<0 and A(q,(0,1,0))in M:continue
   step.append([p,q,D['nets'][K(p)],D['nets'][K(q)]])
def source(m,p):
 o=[]
 for dv in dirs:
  q=A(p,dv);b=m.get(q,{})
  if b.get('id')==W or b.get('id')in['minecraft:repeater','minecraft:comparator']and A(q,V[b['properties']['facing']])==p:o.append(q)
 for dv,k in[((0,-1,0),'minecraft:redstone_torch'),((0,1,0),W)]:
  q=A(p,dv)
  if m.get(q,{}).get('id')==k:o.append(q)
 return sorted(o)
changed=[];newmulti=[];rear=[]
for p,b in M.items():
 if b['id']in['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  q=A(p,(0,-1,0))if b['id'].endswith(':redstone_torch')else A(p,V[b['properties']['facing']])
  ds=source(M,q)
  if p in old and ds!=source(old,q):changed.append([p,q,source(old,q),ds])
  if p not in old and len(ds)!=1:newmulti.append([p,q,ds,D['nets'][K(p)]])
 if p not in old and b['id']in['minecraft:repeater','minecraft:comparator']:
  q=A(p,N(V[b['properties']['facing']]))
  if M.get(q,{}).get('id')==S:rear.append([p,q,source(M,q),D['nets'][K(p)]])
assert not wire,wire[:10]
assert not step,step[:10]
assert not side,side[:10]
assert not changed,changed[:10]
assert len(newmulti)==18
for p,q,ss,net in newmulti:
 if p[0]==96:
  assert p[2] in[-125,-105] and p[1] in range(-49,-24,4)
  assert ss==[(95,q[1],q[2]),(96,q[1]-1,q[2])]
 else:
  expected={(-259,-49,-510):[(-261,-49,-510),(-260,-49,-509)],(-249,-49,-510):[(-248,-49,-511),(-247,-49,-510)],(1,-49,-450):[(-1,-49,-450),(0,-49,-451),(0,-49,-449)],(11,-49,-450):[(12,-49,-451),(13,-49,-450)]}
  assert ss==expected[p],(p,ss)
aligned=0
for p,b in M.items():
 if p in old or b['id'] not in['minecraft:repeater','minecraft:comparator']:continue
 q=A(p,N(V[b['properties']['facing']]))
 assert q in M,('unconnected rear',p,q)
 if M[q]['id']in['minecraft:repeater','minecraft:comparator']:
  assert A(q,V[M[q]['properties']['facing']])==p,('rear diode is not aimed at receiver',p,q)
  aligned+=1
strong=[]
for q,b in M.items():
 if b['id']!=S:continue
 for src in source(M,q):
  if M[src]['id']==W:continue
  for dv in dirs+[(0,1,0),(0,-1,0)]:
   t=A(q,dv)
   if M.get(t,{}).get('id')==W and not all(p in old for p in[src,q,t]):strong.append((src,q,t))
assert sorted(strong)==sorted([((53,-53,-230),(52,-53,-230),(52,-52,-230)),((48,-22,-245),(48,-22,-244),(48,-21,-244))]),strong
out={'status':'bounded_connected_channel_contact_power_screen_pass','new_cross_net_wire_faces':0,'new_cross_net_wire_steps':0,'new_direct_diode_side_lock_inputs':0,'inherited_torch_support_sources_changed':0,'new_intended_multiple_source_torch_supports':len(newmulti),'new_solid_rear_receivers':len(rear),'aligned_new_diode_rears':aligned,'new_strong_solid_wire_paths':len(strong),'strong_paths':strong,'limits':'Conservative source-incidence and contact screen, not dynamic dust-shape/torch/phase simulation or native correctness.'}
if '--save'in sys.argv:(HERE/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
