"""Static actual-contact/support/power-capacity check; not a timing simulator."""
import json,sys
from pathlib import Path
from collections import deque
H=Path(__file__).resolve().parent
P=lambda p:tuple(p[a]for a in'xyz'); K=lambda p:','.join(map(str,p)); A=lambda a,b:tuple(x+y for x,y in zip(a,b)); N=lambda a:tuple(-x for x in a)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';R='minecraft:repeater';C='minecraft:comparator'
def check(d):
 m={P(v['position']):v['block']for v in d['blocks']};assert len(m)==len(d['blocks']);net=lambda p:d['nets'][K(p)];at=lambda p:m.get(p,{}).get('id');diode=lambda p:at(p)in(R,C)
 def sources(p):
  s=[]
  for v in dirs:
   q=A(p,N(v));b=m.get(q,{})
   if at(q)==W or diode(q)and D[b['properties']['facing']]==v:s.append(q)
  for v,k in[((0,-1,0),T),((0,1,0),W)]:
   q=A(p,v)
   if at(q)==k:s.append(q)
  return sorted(s)
 supports=0;contacts=0;steps=0;locks=[];foreign=[];strong=[];rears=[];torches=[]
 for p,b in m.items():
  id=b['id']
  if id in(W,R,C,T,WT):
   q=A(p,D[b['properties']['facing']])if id==WT else A(p,(0,-1,0));assert at(q)==S,('support',p,q);supports+=1
  if id==W:
   for v in dirs:
    q=A(p,v)
    if at(q)==W:
     contacts+=1
     if net(p)!=net(q):foreign.append((p,q))
    for dy in(-1,1):
     q=A(A(p,v),(0,dy,0))
     if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
     steps+=1
     if net(p)!=net(q):foreign.append((p,q))
  if id==R:
   for v in dirs:
    if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
    q=A(p,v)
    if diode(q)and A(q,D[m[q]['properties']['facing']])==p:locks.append((p,q))
  if id in(T,WT):
   q=A(p,(0,-1,0))if id==T else A(p,D[b['properties']['facing']]);torches.append((p,q,sources(q)))
  if diode(p):
   rear=A(p,N(D[b['properties']['facing']]));assert rear in m,('missing rear',p,rear);rears.append((p,rear))
 assert not foreign,foreign[:8]
 assert set(locks)=={(P(v['storage']),P(v['lock']))for v in d['response']},('unexpected locks',locks)
 # Every physical column is positive at its exported height. Its only source
 # besides the preceding torch must have the same named signal and face inward.
 column_sets=0
 for col in d['columns']:
  x,z,lo,hi=(col[k]for k in('x','z','lo','hi'));assert(hi-lo)%4==0
  for y in range(lo,hi+1):assert at((x,y,z))==(T if(y-lo)%2 else S)
  for y in range(lo,hi+1,2):
   q=(x,y,z);ss=sources(q);assert ss,('unfed column',col['name'],q)
   for src in ss:
    assert src==(x,y-1,z)and y>lo or net(src)==col['net'],('column cross power',col['name'],q,src,net(src))
   if y>lo:assert(x,y-1,z)in ss
   column_sets+=1
 # New solid rear paths must remain within their signal, except deliberate NOR
 # inverse stores and the unchanged response HOLD tower.
 rear_solids=[]
 for p,q in rears:
  if at(q)!=S:continue
  ss=sources(q);assert ss,('unfed solid rear',p,q)
  for s in ss:assert net(s)==net(p)or(net(p).startswith('response/')and net(s).startswith('response/')),('solid rear foreign',p,q,s,net(p),net(s))
  rear_solids.append((p,q))
 # One-solid power paths to dust must not couple unrelated route nets.
 for p,b in m.items():
  if b['id']!=S:continue
  for s in sources(p):
   if at(s)==W:continue
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if q!=s and at(q)==W:
     assert net(s)==net(q)or net(s).startswith('response/')and net(q).startswith('response/'),('strong foreign dust',s,p,q,net(s),net(q));strong.append((s,p,q))
 # Repeater/comparator outputs, torches and explicit external pads are capacity
 # sources; no claim that all can be high simultaneously is made.
 power={};todo=deque()
 def offer(p,v):
  if v>power.get(p,0):power[p]=v;todo.append(p)
 for p,b in m.items():
  if diode(p):
   q=A(p,D[b['properties']['facing']]);
   if at(q)==W:offer(q,15)
  elif b['id']in(T,WT,'minecraft:redstone_block'):
   for v in dirs+[(0,1,0),(0,-1,0)]:
    q=A(p,v)
    if at(q)==W:offer(q,15)
 for s,p,q in strong:offer(q,15)
 for v in d['ports'].values():
  if v['direction']=='input':
   for p in v['positions']:offer(P(p),15)
 while todo:
  p=todo.popleft();v=power[p]
  if v<=1:continue
  for dv in dirs:
   for dy in(-1,0,1):
    q=A(A(p,dv),(0,dy,0))
    if at(q)!=W or dy>0 and A(p,(0,1,0))in m or dy<0 and A(q,(0,1,0))in m:continue
    offer(q,v-1)
 powers=[]
 for p,q in rears:
  if at(q)==W:assert power.get(q,0)>0,('attenuated rear',p,q);powers.append(power[q])
  if diode(q):assert A(q,D[m[q]['properties']['facing']])==p,('wrong rear diode',p,q)
 for f in d['feedback']:assert power[P(f['destination'])]==15,('unrefreshed feedback',f['name'])
 for v in d['states']:
  x,y,z=P(v['positive_support']);nx,ny,nz=P(v['negative_support']);assert(nx-x,nz-z)==(12,0)
  assert sources((x,y,z))==sorted([(x-1,y,z),(x,y,z+1)]),('SR clear feedback',v)
  assert sources((nx,ny,nz))==sorted([(nx+1,ny,nz),(nx,ny,nz-1)]),('SR set feedback',v)
 for p,q,ss in torches:assert ss,('unpowered torch support',p,q)
 return{'blocks':len(m),'support_checks':supports,'same_net_wire_faces':contacts,'same_net_wire_steps':steps,'column_source_sets':column_sets,'response_side_locks':len(locks),'solid_rears':len(rear_solids),'strong_solid_to_wire_paths':len(strong),'wire_rears':len(powers),'minimum_possible_rear_power':min(powers),'no_foreign_wire_or_solid_dust_paths':True}
if __name__=='__main__':
 d=json.loads((H/'design.json').read_text());out=check(d);print(json.dumps(out))
 if '--save'in sys.argv:(H/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
