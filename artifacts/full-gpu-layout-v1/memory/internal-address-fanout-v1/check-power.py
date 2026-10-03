"""Conservative actual-map delta screen, not scheduled Minecraft simulation."""
import json,sys,hashlib
from pathlib import Path
from collections import deque,Counter
H=Path(__file__).resolve().parent
d=json.loads((H/'design.json').read_text())
P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());six=dirs+[(0,1,0),(0,-1,0)]
S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch'
n=d['metrics']['parent_blocks'];m={P(v['position']):v['block']for v in d['blocks']};new={P(v['position'])for v in d['blocks'][n:]};assert len(m)==len(d['blocks']);assert len(new)==d['metrics']['added_blocks'];base=lambda p:m.get(p,{})if p not in new else {}
at=lambda p:m.get(p,{}).get('id');net=lambda p:d['nets'].get(K(p),'MISSING');diode=lambda p:at(p)in(R,C)
declared_wire_edges=set()
def declare(path):
 for a,b in zip(path,path[1:]):
  if at(a)==W and at(b)==W:declared_wire_edges.add(frozenset((a,b)))
for r in d['address_routes']:declare([P(p) for p in r['path']])
for a in d['address_adapters']:
 x,y,z=P(a['solid']);end=P(a['input'])[0];declare([(xx,y-2,z) for xx in range(end,x+3,-1)]+[(x+3,y-1,z),(x+2,y,z),(x+1,y,z),(x,y,z)])
# Canonical spiral path: each step is three flat then up to three down,
# cycling E,S,W,N, ending with a final three-flat normalized outlet.
for r in d['address_descents']:
 p=P(r['origin']);path=[p];remaining=r['drop'];side=0;vv=[(1,0,0),(0,0,1),(-1,0,0),(0,0,-1)]
 while remaining:
  v=vv[side%4]
  for _ in range(3):p=A(p,v);path.append(p)
  n=min(remaining,3)
  for _ in range(n):p=A(p,(v[0],-1,v[2]));path.append(p)
  remaining-=n;side+=1
 v=vv[(side-1)%4]
 for _ in range(3):p=A(p,v);path.append(p)
 declare(path)
allowed=set();columns=list(d['address_columns']);strong_allowed=set()
for b in d['address_adapters']:
 for name in ['read','write']:
  strong_allowed.add((P(b['driver']),P(b['solid']),P(b[name])))
for b in d['address_bindings']:
 allowed.add(frozenset((P(b['source']),P(b['tap']))))
def sources(p,old=False):
 get=base if old else lambda q:m.get(q,{})
 out=[]
 for v in dirs:
  q=A(p,N(v));b=get(q)
  if b.get('id')==W or b.get('id')in(R,C)and D[b['properties']['facing']]==v:out.append(q)
 for v,types in[((0,-1,0),(T,WT)),((0,1,0),(W,))]:
  q=A(p,v)
  if get(q).get('id')in types:out.append(q)
 return sorted(out)
findings=[];counts=Counter();actual=set();strong=[];inheritedStrong=set()
def fail(kind,*args):findings.append([kind,*args])
for p,b in m.items():
 id=b['id']
 if p in new and id in(W,R,C,T,WT):
  q=A(p,D[b['properties']['facing']])if id==WT else A(p,(0,-1,0))
  if at(q)!=S:fail('support',p,q,at(q))
  counts['new_supports']+=1
 if id in(T,WT)and p not in new:
  q=A(p,(0,-1,0))if id==T else A(p,D[b['properties']['facing']]);a=sources(q);before=sources(q,True)
  if a!=before:fail('old torch sources changed',p,q,before,a)
  counts['old_torch_sources']+=1
 if diode(p):
  rear=A(p,N(D[b['properties']['facing']]))
  if p not in new and base(rear).get('id')==S:
   if sources(rear)!=sources(rear,True):fail('old solid rear changed',p,rear,sources(rear,True),sources(rear))
   counts['old_solid_rears']+=1
  for v in dirs:
   if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
   q=A(p,v)
   if(p in new or q in new)and diode(q)and A(q,D[m[q]['properties']['facing']])==p and frozenset((p,q))not in allowed:fail('new side drive',p,q)
 if p in new and id not in(S,'minecraft:redstone_block'):
  for v in dirs:
   q=A(p,v)
   if at(q)not in(None,S,'minecraft:redstone_block')and net(p)!=net(q):
    pair=frozenset((p,q));actual.add(pair)
    if pair not in allowed:fail('foreign device face',p,q,net(p),net(q))
 if id==W:
  for v in dirs:
   for dy in[-1,0,1]:
    q=A(A(p,v),(0,dy,0))
    if at(q)!=W or not(p in new or q in new)or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    if net(p)!=net(q):fail('foreign wire',p,q,net(p),net(q))
    if frozenset((p,q)) not in declared_wire_edges:fail('undeclared wire shortcut',p,q,net(p),net(q))
    counts['wire_steps'if dy else'wire_faces']+=1
 if id==S:
  for src in sources(p):
   if at(src)==W:continue # Dust suppressed during wire direct-neighbor queries.
   for v in six:
    q=A(p,v)
    if at(q)==W and q!=src:
     if p in new or src in new or q in new:
      if net(src)!=net(q) and (src,p,q) not in strong_allowed:fail('foreign strong wire path',src,p,q,net(src),net(q))
      strong.append((src,p,q))
     else:inheritedStrong.add(q)
for col in columns:
 x,z,lo,hi=(col[k]for k in('x','z','lo','hi'))
 assert(hi-lo)%4==0
 for y in range(lo,hi+1):
  if at((x,y,z))!=(T if(y-lo)%2 else S):fail('column cell',col['name'],y)
 for y in range(lo,hi+1,2):
  ss=sources((x,y,z))
  if len(ss)!=1 or y>lo and ss!=[(x,y-1,z)]:fail('column source',col['name'],y,ss)
power={};queue=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;queue.append(p)
for p,b in m.items():
 if diode(p):
  q=A(p,D[b['properties']['facing']])
  if at(q)==W:offer(q,15)
 elif b['id']in(T,WT,'minecraft:redstone_block'):
  for v in six:
   q=A(p,v)
   if at(q)==W:offer(q,15)
for port in d['ports'].values():
 if port.get('direction')=='input':
  for p in port.get('positions',[]):
   if at(P(p))==W:offer(P(p),15)
for src,p,q in strong:offer(q,15)
for q in inheritedStrong:offer(q,15)
while queue:
 p=queue.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in[-1,0,1]:
   q=A(A(p,dv),(0,dy,0))
   if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
   offer(q,v-1)
rears=[]
for p in new:
 if diode(p):
  q=A(p,N(D[m[p]['properties']['facing']]))
  if q not in m:fail('empty rear',p,q)
  elif at(q)==W:
   rears.append(power.get(q,0))
   if not power.get(q,0):fail('dead rear',p,q)
  elif diode(q)and A(q,D[m[q]['properties']['facing']])!=p:fail('backwards rear',p,q)
  elif at(q)==S and not sources(q):fail('unfed solid rear',p,q)
 if at(p)==S:
  below=A(p,(0,-1,0))
  if base(below).get('id')==W:
   for v in dirs:
    if base(A(p,v)).get('id')==W:fail('removed old slope edge',below,A(p,v))
if len(strong)!=256:fail('unexpected strong path count',len(strong))
report={'status':'offline_internal_address_power_pass'if not findings else'blocked','source_sha256':{n:hashlib.sha256((H/n).read_bytes()).hexdigest()for n in ['design.json','check-power.py']},'counts':dict(counts),'new_columns':len(columns),'new_strong_wire_paths':strong,'foreign_boundaries':len(actual),'new_wire_rears':len(rears),'minimum_possible_strength':min(rears),'findings':findings,'native_acceptance':False}
if '--save'in sys.argv:(H/'power-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({**report,'findings':findings[:30],'new_strong_wire_paths':len(strong),'total_findings':len(findings)}));assert not findings
