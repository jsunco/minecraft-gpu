"""Read-only connected-lifecycle delta screen; no scheduled power simulation."""
import json,sys
from pathlib import Path
from collections import deque
H=Path(__file__).resolve().parent;load=lambda p:json.loads(p.read_text());d=load(H/'design.json');parent=load(H.parent/'channel-withdrawal-v1/design.json');local=load(H.parent/'owner-valid-v1/design.json')
P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a);D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';R='minecraft:repeater';C='minecraft:comparator'
m={P(v['position']):v['block']for v in d['blocks']};base={P(v['position']):v['block']for v in parent['blocks']}
assert len(m)==len(d['blocks'])
for q,b in base.items():assert m[q]==b,('parent changed',q)
new=set(m)-set(base);at=lambda p:m.get(p,{}).get('id');net=lambda p:d['nets'][K(p)];diode=lambda p:at(p)in(R,C)
def sources(mm,p):
 out=[]
 for v in dirs:
  q=A(p,N(v));b=mm.get(q,{})
  if b.get('id')==W or b.get('id')in(R,C)and D[b['properties']['facing']]==v:out.append(q)
 for v,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,v)
  if mm.get(q,{}).get('id')==k:out.append(q)
 return sorted(out)
supports=faces=steps=oldtorch=oldrear=0;strong=[];failed=[]
allowed_boundaries={frozenset((P(b['normalizer']),P(b['destination'])))for b in d['bindings']};actual_boundaries=set()
for p,b in m.items():
 id=b['id']
 if p in new and id in(W,R,C,T,WT):
  q=A(p,D[b['properties']['facing']])if id==WT else A(p,(0,-1,0));assert at(q)==S,('support',p,q);supports+=1
 if id in(T,WT)and p in base:
  q=A(p,(0,-1,0))if id==T else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q),('changed old torch support',p,q);oldtorch+=1
 if diode(p):
  rear=A(p,N(D[b['properties']['facing']]))
  if p in base and base.get(rear,{}).get('id')==S:assert sources(m,rear)==sources(base,rear),('old solid rear change',p,rear);oldrear+=1
  for v in dirs:
   if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
   q=A(p,v)
   if p in new or q in new:assert not(diode(q)and A(q,D[m[q]['properties']['facing']])==p),('new side drive',p,q)
 if p in new and id not in(S,'minecraft:redstone_block'):
  for v in dirs:
   q=A(p,v)
   if at(q)not in(None,S,'minecraft:redstone_block')and net(p)!=net(q):
    pair=frozenset((p,q));assert pair in allowed_boundaries,('foreign device contact',p,q,net(p),net(q));actual_boundaries.add(pair)
 if id==W:
  for v in dirs:
   q=A(p,v)
   if at(q)==W and(p in new or q in new):assert net(p)==net(q),('foreign face',p,q,net(p),net(q));faces+=1
   for dy in(-1,1):
    q=A(A(p,v),(0,dy,0))
    if at(q)!=W or not(p in new or q in new)or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    assert net(p)==net(q),('foreign step',p,q,net(p),net(q));steps+=1
 if id==S:
  for src in sources(m,p):
   if at(src)==W:continue
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if at(q)==W and q!=src and(p in new or src in new or q in new):assert net(src)==net(q),('foreign strong wire path',src,p,q,net(src),net(q));strong.append((src,p,q))
cols=0
for c in d['columns']:
 x,z,lo,hi=(c[k]for k in('x','z','lo','hi'));assert(hi-lo)%4==0
 for y in range(lo,hi+1):assert at((x,y,z))==(T if(y-lo)%2 else S)
 for y in range(lo,hi+1,2):
  q=(x,y,z);ss=sources(m,q);assert len(ss)==1,('column source count',c['name'],q,ss)
  assert ss==[(x,y-1,z)]if y>lo else net(ss[0])==c['net'];cols+=1
# Capacity sources include all inherited outputs and genuine input pads. This
# optimistic union rejects dead/attenuated routes, not dynamic activation.
power={};queue=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;queue.append(p)
for p,b in m.items():
 if diode(p):
  q=A(p,D[b['properties']['facing']])
  if at(q)==W:offer(q,15)
 elif b['id']in(T,WT,'minecraft:redstone_block'):
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if at(q)==W:offer(q,15)
for s,p,q in strong:offer(q,15)
while queue:
 p=queue.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in(-1,0,1):
   q=A(A(p,dv),(0,dy,0))
   if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
   offer(q,v-1)
rear_power=[]
for p in new:
 if not diode(p):continue
 q=A(p,N(D[m[p]['properties']['facing']]))
 assert q in m,('empty new rear',p,q)
 if at(q)==W:
  if not power.get(q):failed.append((p,q))
  rear_power.append(power.get(q,0))
 elif diode(q):assert A(q,D[m[q]['properties']['facing']])==p,('backwards rear',p,q)
 elif at(q)==S:assert sources(m,q),('unfed solid',p,q)
assert not failed,failed[:10]
for b in d['bindings']:
 r=P(b['normalizer']);q=P(b['destination']);assert at(r)==R and A(r,D[m[r]['properties']['facing']])==q;assert power.get(q)==15,('unrefreshed',b)
assert actual_boundaries==allowed_boundaries
result={'status':'offline_matching_request_delta_screen_pass','parent_cells_preserved':len(base),'added_supports':supports,'new_wire_faces':faces,'new_wire_steps':steps,'unchanged_old_torch_support_sets':oldtorch,'unchanged_old_solid_rears':oldrear,'new_column_source_sets':cols,'new_strong_solid_to_wire_paths':len(strong),'new_wire_rears':len(rear_power),'minimum_possible_rear_strength':min(rear_power),'normalized_lifecycle_arrivals':len(d['bindings']),'exact_distinct_net_boundaries':len(actual_boundaries),'native_acceptance':False}
print(json.dumps(result))
if '--save'in sys.argv:(H/'power-checks.json').write_text(json.dumps(result,indent=2)+'\n')
