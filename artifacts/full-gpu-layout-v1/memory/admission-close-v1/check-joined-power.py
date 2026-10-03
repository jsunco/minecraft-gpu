"""Read-only connected-lifecycle delta screen; no scheduled power simulation."""
import json,sys
from pathlib import Path
from collections import deque
H=Path(__file__).resolve().parent;load=lambda p:json.loads(p.read_text());d=load(H/'design.json')
P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a);D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';R='minecraft:repeater';C='minecraft:comparator'
m={P(v['position']):v['block']for v in d['blocks']};base={p:b for p,b in m.items()if d['groups'][K(p)]in('memory_parent','loader_parent','witness')}
assert len(m)==len(d['blocks'])
replacement_keys=set()
for q,b in base.items():
 if q not in replacement_keys:assert m[q]==b,('parent changed',q)
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
supports=faces=steps=oldtorch=oldrear=0;strong=[];inheritedStrong=set();failed=[]
def strong_wire(src,p,q):
 assert net(src)==net(q),('foreign strong wire path',src,p,q,net(src),net(q))
allowed_boundaries={frozenset((P(b['driver']),P(b['source'] if b['kind']=='source' else b['destination'])))for b in d['bindings']if at(P(b['source'] if b['kind']=='source' else b['destination']))!=S and net(P(b['driver']))!=net(P(b['source'] if b['kind']=='source' else b['destination']))}|{frozenset((P(d['output_binding']['source']),P(d['output_binding']['driver'])))};actual_boundaries=set();quiet_drivers=set()
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
   if p in new or q in new:assert not(diode(q)and A(q,D[m[q]['properties']['facing']])==p) or frozenset((p,q))in allowed_boundaries,('new side drive',p,q)
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
    if at(q)==W and q!=src:
     if p in new or src in new or q in new:strong_wire(src,p,q);strong.append((src,p,q))
     else:inheritedStrong.add(q)
# A new block above an inherited wire must not remove an inherited slope edge.
headroom_sites=0
for p in new:
 if at(p)!=S:continue
 q=A(p,(0,-1,0))
 if base.get(q,{}).get('id')!=W:continue
 headroom_sites+=1
 for dv in dirs:
  target=A(p,dv)
  assert base.get(target,{}).get('id')!=W,('new headroom blocks old slope',q,target,p)
column_solids=0
for col in d['columns']:
 x,z,lo,hi=(col[k]for k in('x','z','lo','hi'));assert(hi-lo)%4==0
 for y in range(lo,hi+1):assert at((x,y,z))==(T if(y-lo)%2 else S)
 for y in range(lo,hi+1,2):
  ss=sources(m,(x,y,z));assert len(ss)==1,('column source count',col['name'],y,ss)
  if y>lo:assert ss==[(x,y-1,z)]
  else:assert net(ss[0])==col['net']
  column_solids+=1
# Capacity sources include all inherited outputs and genuine input pads. This
# optimistic union rejects dead/attenuated routes, not dynamic activation.
power={};queue=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;queue.append(p)
for p,b in m.items():
 if diode(p) and p not in quiet_drivers:
  q=A(p,D[b['properties']['facing']])
  if at(q)==W:offer(q,15)
 elif b['id']in(T,WT,'minecraft:redstone_block'):
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if at(q)==W:offer(q,15)
for port in d['ports'].values():
 if port.get('direction')=='input':
  for p in port.get('positions',[]):
   if at(P(p))==W:offer(P(p),15)
for s,p,q in strong:offer(q,15)
for q in inheritedStrong:offer(q,15)
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
 elif at(q)==S:assert sources(m,q) or p in quiet_drivers,('unfed solid',p,q)
assert not failed,failed[:10]
for b in d['bindings']:
 if b['kind']=='destination':assert power.get(P(b['destination']))==15
assert actual_boundaries==allowed_boundaries,(actual_boundaries-allowed_boundaries,allowed_boundaries-actual_boundaries)
# A normal side tap may remove only an unused automatic dust arm. The eight
# mask pads have no old recipient on the unused east. Initialize has two
# existing opposing diodes; adding north keeps both genuine east/west arms.
for name in ['mask'+str(i)for i in range(8)]:
 p=P(d['sources'][name]);assert at(A(p,(1,0,0))) is None,('lost automatic east arm had a recipient',name,p)
p=P(d['sources']['initialize'])
for dv in [(1,0,0),(-1,0,0)]:
 q=A(p,dv);assert diode(q) and D[m[q]['properties']['facing']]==dv
# Actual inherited CAPTURED-support regression: a new torch must not drive it.
regsrc=(827,120,965);regsolid=(827,121,965);regwire=(828,121,965)
assert at(regwire)==W and regsrc not in m and regsolid not in m
m[regsrc]={'id':T};m[regsolid]={'id':S};d['nets'][K(regsrc)]='injected_foreign';d['nets'][K(regsolid)]='injected_foreign'
assert regsrc in sources(m,regsolid)
try:strong_wire(regsrc,regsolid,regwire)
except AssertionError:pass
else:raise AssertionError('foreign inherited-support power accepted')
del m[regsrc];del m[regsolid];del d['nets'][K(regsrc)];del d['nets'][K(regsolid)]
result={'status':'offline_joined_admission_witness_power_pass','preserved_parent_and_component_cells':len(base),'added_supports':supports,'wire_faces':faces,'wire_steps':steps,'unchanged_old_torch_supports':oldtorch,'unchanged_old_solid_rears':oldrear,'positive_column_source_sets':column_solids,'new_strong_wire_paths':len(strong),'new_wire_rears':len(rear_power),'minimum_possible_rear_strength':min(rear_power),'boundaries':len(actual_boundaries),'unused_automatic_dust_arm_sites':8,'initialize_opposing_receiver_arms_preserved':True,'foreign_strong_support_regression_rejected':True,'native_acceptance':False}
print(json.dumps(result))
if '--save'in sys.argv:(H/'joined-power-checks.json').write_text(json.dumps(result,indent=2)+'\n')
