"""Conservative static delta screen; no scheduled-power or Minecraft simulation."""
import json,sys
from pathlib import Path
from collections import deque
H=Path(__file__).resolve().parent;d=json.loads((H/'design.json').read_text());local=json.loads((H/'bank.json').read_text())
P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch'
m={P(v['position']):v['block']for v in d['blocks']};base=m.copy();new=set();changes={};removed=set();netmap={};allowed=set();columns=[]
assert len(m)==len(d['blocks'])
for repair in d['bank_sampling_repairs']:
 o=P(repair['origin']);bank=repair['bank'];tr=lambda p:A(P(p),o)
 for v in repair['added_blocks']:
  p=P(v['position']);assert base.pop(p)==v['block'];new.add(p)
 for v in repair['removed_blocks']:
  p=P(v['position']);assert p not in base;base[p]=v['block'];removed.add(p)
 for v in repair['changes']:
  p=P(v['position']);assert base[p]==v['to'];base[p]=v['from'];changes[p]=v
 for v in local['blocks']:
  p=tr(v['position']);netmap[p]=str(bank)+'/'+local['nets'][K(P(v['position']))]
 for col in local['columns']:
  columns.append({**col,'x':col['x']+o[0],'z':col['z']+o[2],'lo':col['lo']+o[1],'hi':col['hi']+o[1]})
 def allow(a,b):allowed.add(frozenset((A(a,o),A(b,o))))
 for i in range(8):
  x=5*i;allow((x-1,-52,-249),(x,-52,-249));allow((x+1,-52,-246),(x,-52,-246));allow((x-2,-44,-252),(x-2,-44,-253))
 for a,b in [((41,-24,-248),(40,-24,-248)),((30,-37,-464),(31,-37,-464)),((62,-37,-464),(63,-37,-464)),((30,-37,-468),(31,-37,-468)),((110,-37,-464),(111,-37,-464)),((64,-37,-468),(63,-37,-468)),((118,-37,-467),(118,-37,-468)),((107,-25,-441),(107,-25,-440)),((106,-25,-440),(107,-25,-440)),((108,-25,-440),(107,-25,-440))]:allow(a,b)
assert len(base)==d['metrics']['parent_blocks'];assert len(new)==d['metrics']['added_blocks'];assert len(removed)==200 and len(changes)==8
delta=new|set(changes);at=lambda p:m.get(p,{}).get('id');net=lambda p:netmap.get(p,'external/'+d['nets'].get(K(p),'missing'));diode=lambda p:at(p)in(R,C)
def sources(mm,p):
 out=[]
 for v in dirs:
  q=A(p,N(v));b=mm.get(q,{})
  if b.get('id')==W or b.get('id')in(R,C)and D[b['properties']['facing']]==v:out.append(q)
 for v,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,v)
  if mm.get(q,{}).get('id')==k:out.append(q)
 return sorted(out)
findings=[];supports=faces=steps=oldtorch=oldrear=0;actual=set();strong=[];inheritedStrong=set()
def fail(kind,*args):findings.append([kind,*args])
for p,b in m.items():
 id=b['id']
 if p in delta and id in(W,R,C,T,WT):
  q=A(p,D[b['properties']['facing']])if id==WT else A(p,(0,-1,0))
  if at(q)!=S:fail('support',p,q,at(q))
  supports+=1
 if id in(T,WT)and p in base:
  q=A(p,(0,-1,0))if id==T else A(p,D[b['properties']['facing']]);ss=sources(m,q);old=sources(base,q)
  if ss!=old:fail('old torch support changed',p,q,old,ss)
  oldtorch+=1
 if diode(p):
  rear=A(p,N(D[b['properties']['facing']]))
  if p in base and base.get(rear,{}).get('id')==S:
   if sources(m,rear)!=sources(base,rear):fail('old solid rear changed',p,rear,sources(base,rear),sources(m,rear))
   oldrear+=1
  for v in dirs:
   if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
   q=A(p,v)
   if(p in delta or q in delta)and diode(q)and A(q,D[m[q]['properties']['facing']])==p and frozenset((p,q))not in allowed:fail('new side drive',p,q)
 if p in delta and id not in(S,'minecraft:redstone_block'):
  for v in dirs:
   q=A(p,v)
   if at(q)not in(None,S,'minecraft:redstone_block')and net(p)!=net(q):
    pair=frozenset((p,q))
    if pair not in allowed:fail('foreign device face',p,q,net(p),net(q))
    actual.add(pair)
 if id==W:
  for v in dirs:
   q=A(p,v)
   if at(q)==W and(p in delta or q in delta):
    if net(p)!=net(q):fail('foreign wire face',p,q,net(p),net(q))
    faces+=1
   for dy in(-1,1):
    q=A(A(p,v),(0,dy,0))
    if at(q)!=W or not(p in delta or q in delta)or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    if net(p)!=net(q):fail('foreign wire step',p,q,net(p),net(q))
    steps+=1
 if id==S:
  for src in sources(m,p):
   if at(src)==W:continue
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if at(q)==W and q!=src:
     if p in delta or src in delta or q in delta:
      if net(src)!=net(q):fail('foreign strong wire path',src,p,q,net(src),net(q))
      strong.append((src,p,q))
     else:inheritedStrong.add(q)
for col in columns:
 x,z,lo,hi=(col[k]for k in('x','z','lo','hi'))
 for y in range(lo,hi+1):
  if at((x,y,z))!=(T if(y-lo)%2 else S):fail('column cell',col['name'],y)
 for y in range(lo,hi+1,2):
  ss=sources(m,(x,y,z))
  if len(ss)!=1 or y>lo and ss!=[(x,y-1,z)]:fail('column source',col['name'],y,ss)
power={};q=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;q.append(p)
for p,b in m.items():
 if diode(p):
  t=A(p,D[b['properties']['facing']])
  if at(t)==W:offer(t,15)
 elif b['id']in(T,WT,'minecraft:redstone_block'):
  for v in dirs+[(0,1,0),(0,-1,0)]:
   t=A(p,v)
   if at(t)==W:offer(t,15)
for port in d['ports'].values():
 if port.get('direction')=='input':
  for p in port.get('positions',[]):
   if at(P(p))==W:offer(P(p),15)
for src,p,t in strong:offer(t,15)
for t in inheritedStrong:offer(t,15)
while q:
 p=q.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in(-1,0,1):
   t=A(A(p,dv),(0,dy,0))
   if at(t)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(t,(0,1,0))in m:continue
   offer(t,v-1)
rear=[]
for p in delta:
 if not diode(p):continue
 t=A(p,N(D[m[p]['properties']['facing']]))
 if t not in m:fail('missing diode rear',p,t)
 elif at(t)==W:
  rear.append(power.get(t,0))
  if not power.get(t,0):fail('dead rear',p,t)
 elif diode(t):
  if A(t,D[m[t]['properties']['facing']])!=p:fail('backwards rear',p,t)
 elif at(t)==S:
  if not sources(m,t):fail('unfed solid rear',p,t)
for p in new:
 if at(p)!=S:continue
 below=A(p,(0,-1,0))
 if base.get(below,{}).get('id')==W:
  for v in dirs:
   if base.get(A(p,v),{}).get('id')==W:fail('removed old slope edge',below,A(p,v))
result={'status':'offline_joined_bank_sampling_power_pass'if not findings else'blocked','findings':findings,'added_supports':supports,'old_torch_source_sets':oldtorch,'old_solid_rear_source_sets':oldrear,'new_wire_faces':faces,'new_wire_steps':steps,'new_strong_wire_paths':strong,'new_rear_count':len(rear),'minimum_possible_strength':min(rear),'foreign_boundaries':len(actual),'missing_allowed_boundaries':[list(v)for v in allowed-actual],'native_acceptance':False}
if '--save'in sys.argv:(H/'joined-power-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result));assert not findings and actual==allowed
