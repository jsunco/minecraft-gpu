"""Static complete selector screen; actual sources/arrival timing are separate."""
from pathlib import Path
import json,sys
from collections import deque
H=Path(__file__).resolve().parent;d=json.loads((H/'matrix.json').read_text());P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch'
m={P(v['position']):v['block']for v in d['blocks']};assert len(m)==len(d['blocks']);at=lambda p:m.get(p,{}).get('id');net=lambda p:d['nets'][K(p)];diode=lambda p:at(p)in(R,C)
allowed=set();supports=0;faces=steps=0
for b in d['branches']:
 for n in['rear','side']:allowed.add(frozenset((P(b[n]),P(b['gate']))))
 assert A(P(b['rear']),D[m[P(b['rear'])]['properties']['facing']])==P(b['gate'])
 assert A(P(b['side']),D[m[P(b['side'])]['properties']['facing']])==P(b['gate'])
 assert m[P(b['gate'])]['properties']=={'facing':'west','mode':'subtract'}
actual=set();findings=[]
def err(*x):findings.append(x)
def sources(p):
 out=[]
 for v in dirs:
  q=A(p,N(v));b=m.get(q,{})
  if b.get('id')==W or b.get('id')in(R,C)and D[b['properties']['facing']]==v:out.append(q)
 for v,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,v)
  if at(q)==k:out.append(q)
 return sorted(out)
strong=[]
for p,b in m.items():
 id=b['id']
 if id in(W,R,C,T,WT):
  q=A(p,D[b['properties']['facing']])if id==WT else A(p,(0,-1,0))
  if at(q)!=S:err('support',p,q)
  supports+=1
 if diode(p):
  for v in dirs:
   if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
   q=A(p,v)
   if diode(q)and A(q,D[m[q]['properties']['facing']])==p and frozenset((p,q))not in allowed:err('side source',p,q)
 if id not in(S,'minecraft:redstone_block'):
  for v in dirs:
   q=A(p,v)
   if at(q)not in(None,S,'minecraft:redstone_block')and net(q)!=net(p):
    pair=frozenset((p,q));actual.add(pair)
    if pair not in allowed:err('foreign face',p,q,net(p),net(q))
 if id==W:
  for v in dirs:
   for dy in(-1,0,1):
    q=A(A(p,v),(0,dy,0))
    if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    if net(p)!=net(q):err('foreign wire',p,q,net(p),net(q))
    if dy:steps+=1
    else:faces+=1
 if id==S:
  for src in sources(p):
   if at(src)==W:continue
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if at(q)==W and q!=src:
     if net(src)!=net(q):err('strong shortcut',src,p,q)
     strong.append((src,p,q))
for col in d['columns']:
 x,z,lo,hi=(col[k]for k in('x','z','lo','hi'))
 for y in range(lo,hi+1,2):
  ss=sources((x,y,z))
  if len(ss)!=1 or y>lo and ss!=[(x,y-1,z)]:err('column sources',col['name'],y,ss)
# optimistic possible power detects attenuation, not logical event behavior.
power={};queue=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;queue.append(p)
for p,b in m.items():
 if diode(p):
  q=A(p,D[b['properties']['facing']])
  if at(q)==W:offer(q,15)
 elif b['id']in(T,WT):
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if at(q)==W:offer(q,15)
for port in d['ports'].values():
 if port['direction']=='input':
  for p in port['positions']:offer(P(p),15)
for src,p,q in strong:offer(q,15)
while queue:
 p=queue.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in(-1,0,1):
   q=A(A(p,dv),(0,dy,0))
   if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
   offer(q,v-1)
rears=[]
for p,b in m.items():
 if not diode(p):continue
 q=A(p,N(D[b['properties']['facing']]))
 if q not in m:err('empty rear',p,q)
 elif at(q)==W:
  rears.append(power.get(q,0))
  if not power.get(q):err('dead rear',p,q)
 elif diode(q)and A(q,D[m[q]['properties']['facing']])!=p:err('reverse rear',p,q)
 elif at(q)==S and not sources(q):err('unfed rear',p,q)
assert actual==allowed,(actual-allowed,allowed-actual)
report={'status':'offline_matrix_static_pass'if not findings else'blocked','blocks':len(m),'supports':supports,'gate_boundaries':len(actual),'wire_faces':faces,'wire_steps':steps,'strong_paths':len(strong),'rear_count':len(rears),'minimum_possible_rear_strength':min(rears),'findings':findings,'native_acceptance':False}
print(json.dumps(report));
if '--save'in sys.argv:(H/'matrix-checks.json').write_text(json.dumps(report,indent=2)+'\n')
assert not findings
