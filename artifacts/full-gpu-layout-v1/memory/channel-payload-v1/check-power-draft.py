import json,collections
from pathlib import Path
import sys
HERE=Path(__file__).resolve().parent
D=json.loads((HERE/'design.json').read_text());P=json.loads((HERE.parent/'channel-retention-v1/design.json').read_text());K=lambda p:','.join(map(str,p));M={tuple(v['position'][a]for a in'xyz'):v['block']for v in D['blocks']};old={tuple(v['position'][a]for a in'xyz'):v['block']for v in P['blocks']};V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(V.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda v:tuple(-i for i in v)
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



print(json.dumps({"wire":wire[:30],"wire_count":len(wire),"step":step[:30],"step_count":len(step),"side":side[:20],"changed":changed[:10],"newmulti":newmulti[:10],"newmulti_count":len(newmulti),"rear_count":len(rear)},indent=2))
