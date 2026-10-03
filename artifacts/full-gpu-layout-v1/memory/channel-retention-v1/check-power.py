import json,collections
from pathlib import Path
import sys
HERE=Path(__file__).resolve().parent
D=json.loads((HERE/'design.json').read_text());P=json.loads((HERE.parent/'channel-allocator-v1/design.json').read_text());K=lambda p:','.join(map(str,p));M={tuple(v['position'][a]for a in'xyz'):v['block']for v in D['blocks']};old={tuple(v['position'][a]for a in'xyz'):v['block']for v in P['blocks']};V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(V.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda v:tuple(-i for i in v)
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
assert not changed,changed[:10]
expected_locks={(tuple(v['storage'][a]for a in'xyz'),tuple(v['lock'][a]for a in'xyz'))for v in D['stores']+D['snapshots']+D['busySnapshots']}
assert {(tuple(v[0]),tuple(v[1]))for v in side}==expected_locks
assert len(newmulti)==520
sr={}
for ch in range(4):
 x=128*ch;y=80*ch+1
 sr[(x+49,y,172)]=[(x+47,y,172),(x+48,y,171),(x+48,y,173)]
 sr[(x+59,y,172)]=[(x+60,y,171),(x+61,y,172)]
sr.update({(301,-31,350):[(299,-31,350),(300,-31,349),(300,-31,351)],(311,-31,350):[(312,-31,349),(313,-31,350)],(521,-31,350):[(519,-31,350),(520,-31,351)],(531,-31,350):[(532,-31,349),(533,-31,350)]})
for p,q,ss,n in newmulti:
 if n.startswith('selected'):
  assert ss==sorted([A(q,(0,-1,0)),A(q,(1,0,0))])
 elif n.startswith('any_valid'):
  assert ss==sorted([A(q,(0,0,-1)),A(q,(0,0,1))])
 elif n.startswith('any_owner'):
  assert ss==sorted([A(q,(0,-1,0)),A(q,(-1,0,0))])
 else:assert ss==sr[p],(p,q,ss,n)
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


assert not strong,strong[:10]
# New constant source has exactly its isolated SET driver as a neighboring
# device. This explicit check supplements the generic solid-source screen.
constant=(316,-31,348)
assert M[constant]['id']=='minecraft:redstone_block'
near=[A(constant,dv)for dv in dirs+[(0,1,0),(0,-1,0)]if A(constant,dv)in M]
assert near==[(316,-31,349)],near
assert M[near[0]]=={'id':'minecraft:repeater','properties':{'facing':'north','delay':'1'}}
# The normal and reset source/tail OR sets above are intentional. Every other
# changed wire-step or diode side contact would have failed before this point.
out={'status':'offline_retention_claims_admission_contact_power_screen_pass','new_cross_net_wire_faces':0,'new_cross_net_wire_steps':0,'intended_side_lock_inputs':len(side),'inherited_torch_support_sources_changed':0,'intended_multiple_source_torch_supports':len(newmulti),'solid_rear_receivers':len(rear),'aligned_new_diode_rears':aligned,'new_strong_solid_wire_paths':len(strong),'new_constant_neighbors':near,'limits':'Bounded contact and source-incidence screen; not a full redstone power simulator or native timing/initialization proof.'}
if '--save'in sys.argv:(HERE/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
