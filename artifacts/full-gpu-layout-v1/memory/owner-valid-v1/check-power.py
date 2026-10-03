import json,sys
from pathlib import Path
from collections import deque
H=Path(__file__).resolve().parent;d=json.loads((H/'design.json').read_text());P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda p:tuple(-a for a in p);V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(V.values());m={P(v['position']):v['block']for v in d['blocks']};W='minecraft:redstone_wire';S='minecraft:light_gray_concrete';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';at=lambda p:m.get(p,{}).get('id');net=lambda p:d['nets'][K(p)];diode=lambda p:at(p)in(R,C)
def sources(p):
 out=[]
 for dv in dirs:
  q=A(p,N(dv))
  if at(q)==W or diode(q)and V[m[q]['properties']['facing']]==dv:out.append(q)
 for dv,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,dv)
  if at(q)==k:out.append(q)
 return sorted(out)
maskpairs={frozenset((P(g['type_gate']),P(g['type_side'])))for g in d['branches']}|{frozenset((P(g['owner_gate']),P(g['owner_side'])))for g in d['branches']};faces=steps=columns=0;power={};queue=deque();rears=[]
def offer(p,v):
 if v>power.get(p,0):power[p]=v;queue.append(p)
for p,b in m.items():
 if at(p)==W:
  for dv in dirs:
   for dy in(-1,0,1):
    q=A(A(p,dv),(0,dy,0))
    if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    assert net(p)==net(q),('wire short',p,q)
    if dy:steps+=1
    else:faces+=1
 if diode(p):
  v=V[b['properties']['facing']];q=A(p,N(v));rears.append((p,q));assert q in m,('empty rear',p,q)
  for dv in dirs:
   if sum(x*y for x,y in zip(v,dv)):continue
   q=A(p,dv)
   if diode(q)and A(q,V[m[q]['properties']['facing']])==p:assert at(p)==C and frozenset((p,q))in maskpairs,('side drive',p,q)
  q=A(p,v)
  if at(q)==W:offer(q,15)
 if at(p)in(T,WT):
  q=A(p,(0,-1,0))if at(p)==T else A(p,V[b['properties']['facing']]);assert sources(q)
 if at(p)in(T,WT,'minecraft:redstone_block'):
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if at(q)==W:offer(q,15)
for col in d['columns']:
 for y in range(col['lo'],col['hi']+1,2):
  q=(col['x'],y,col['z']);ss=sources(q);assert ss
  for s in ss:assert net(s)==col['net'] or s==(q[0],q[1]-1,q[2])
  columns+=1
for port in d['ports'].values():
 if port['direction']=='input':
  for p in port['positions']:offer(P(p),15)
while queue:
 p=queue.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in(-1,0,1):
   q=A(A(p,dv),(0,dy,0))
   if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
   offer(q,v-1)
ps=[]
for p,q in rears:
 if at(q)==W:assert power.get(q,0)>0,('dead rear',p,q);ps.append(power[q])
 elif diode(q):assert A(q,V[m[q]['properties']['facing']])==p
 elif at(q)==S:assert sources(q)
assert power[P(d['ports']['owner_valid']['positions'][0])]==15
out={'status':'offline_owner_lookup_contacts_capacity_pass','wire_faces':faces,'wire_steps':steps,'column_source_sets':columns,'intended_comparator_side_pairs':len(maskpairs),'wire_rears':len(ps),'minimum_possible_rear':min(ps),'output_strength_capacity':15,'native_acceptance':False}
if '--save'in sys.argv:(H/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
