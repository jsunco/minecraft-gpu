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




# Also reject same-net self-locks; equal names do not excuse feedback locking.
all_sides=[]
for p,b in M.items():
 if b['id']!='minecraft:repeater':continue
 for dv in dirs:
  if sum(x*y for x,y in zip(dv,V[b['properties']['facing']])):continue
  q=A(p,dv);bb=M.get(q,{})
  if (p not in old or q not in old)and bb.get('id')in['minecraft:repeater','minecraft:comparator']and A(q,V[bb['properties']['facing']])==p:all_sides.append((p,q))
assert not all_sides,all_sides[:10]
assert not wire,wire[:3]
assert not step,step[:3]
assert not side,side[:3]
assert not changed,changed[:3]
assert not newmulti,newmulti[:3]
expected_rears={tuple(v['output'][a]for a in'xyz'):tuple(v['top'][a]for a in'xyz') for v in D['fanout']}
expected_rears.update({tuple(v['normalizer'][a]for a in'xyz'):tuple(v['top'][a]for a in'xyz') for v in D['validReturns']})
assert {p:q for p,q,ss,n in rear}==expected_rears
strong=[];rear_changes=[]
for p,b in M.items():
 if p in old and b['id']in['minecraft:repeater','minecraft:comparator']:
  q=A(p,N(V[b['properties']['facing']]))
  if M.get(q,{}).get('id')==S and source(M,q)!=source(old,q):rear_changes.append((p,q))
 if b['id']!=S:continue
 for src in source(M,p):
  if M[src]['id']==W:continue
  for dv in dirs+[(0,1,0),(0,-1,0)]:
   t=A(p,dv)
   if M.get(t,{}).get('id')==W and not all(q in old for q in[src,p,t]):strong.append((src,p,t))
expected_strong={(tuple(v['normalizer'][a]for a in'xyz'),tuple(v['supportDrive'][a]for a in'xyz'),tuple(v['destination'][a]for a in'xyz')) for v in D['bindings']if v.get('supportDrive')}
assert set(strong)==expected_strong,(len(strong),set(strong)-expected_strong)
assert not rear_changes,rear_changes
# Positive tower sides and sources: the shared bus enters only its declared
# bottom face; every higher solid has exactly its own torch below.
column_sets=0
for v in D['fanout']+D['validReturns']:
 lo=tuple(v['base'][a]for a in'xyz');hi=tuple(v['top'][a]for a in'xyz');assert lo[0]==hi[0]and lo[2]==hi[2]and(hi[1]-lo[1])%4==0
 for y in range(lo[1],hi[1]+1,2):
  p=(lo[0],y,lo[2]);assert M[p]['id']==S
  if y>lo[1]:want=[(p[0],y-1,p[2])]
  elif 'input'in v:want=[tuple(v['input'][a]for a in'xyz')]
  else:want=[(p[0],y,-37 if v['kind']=='read'else-27)]
  assert source(M,p)==want,(p,source(M,p),want)
  column_sets+=1
  if y<hi[1]:assert M[(p[0],y+1,p[2])]['id']=='minecraft:redstone_torch'
# Conservative actual dust capacity. All normalized sources may be high;
# this can reject attenuation failures, not establish logical concurrency.
from collections import deque
power={};q=deque()
def offer(p,v):
 if v>power.get(p,0):power[p]=v;q.append(p)
for p,b in M.items():
 if b['id']in['minecraft:repeater','minecraft:comparator']:
  out=A(p,V[b['properties']['facing']])
  if M.get(out,{}).get('id')==W:offer(out,15)
 elif b['id']in['minecraft:redstone_torch','minecraft:redstone_wall_torch','minecraft:redstone_block']:
  for dv in dirs+[(0,1,0),(0,-1,0)]:
   out=A(p,dv)
   if M.get(out,{}).get('id')==W:offer(out,15)
for p in strong:offer(p[2],15)
for port in ['read_valid','write_valid','read_address','write_address','write_data']:
 for p in D['ports'][port]['positions']:offer(tuple(p[a]for a in'xyz'),15)
while q:
 p=q.popleft();v=power[p]
 if v<=1:continue
 for dv in dirs:
  for dy in[-1,0,1]:
   t=A(A(p,dv),(0,dy,0))
   if M.get(t,{}).get('id')!=W:continue
   if dy>0 and A(p,(0,1,0))in M or dy<0 and A(t,(0,1,0))in M:continue
   offer(t,v-1)
rears=[];failed=[]
for p,b in M.items():
 if p in old or b['id']not in['minecraft:repeater','minecraft:comparator']:continue
 rear=A(p,N(V[b['properties']['facing']]));rb=M.get(rear,{})
 assert rb,('empty rear',p,rear)
 if rb['id']in['minecraft:repeater','minecraft:comparator']:assert A(rear,V[rb['properties']['facing']])==p,('unaligned diode',p,rear)
 if rb['id']==W:
  rears.append(power.get(rear,0))
  if not power.get(rear,0):failed.append((p,rear))
assert not failed,failed[:10]
for v in D['bindings']:
 dst=tuple(v['destination'][a]for a in'xyz');assert power.get(dst)==15,('non15 destination',v['channel'],v['consumer'],v['field'],power.get(dst))
out={'status':'offline_payload_fanout_contact_power_screen_pass','new_cross_net_wire_faces':0,'new_cross_net_wire_steps':0,'new_side_lock_inputs':0,'inherited_torch_support_sources_changed':0,'inherited_solid_rear_sources_changed':0,'positive_column_source_sets':column_sets,'solid_rear_receivers':len(expected_rears),'intended_low_address_support_drives':len(strong),'new_wire_fed_rears':len(rears),'minimum_possible_rear_power':min(rears),'all_544_normalized_candidate_arrivals':True,'limits':'Static incidence/upper-bound attenuation only; not native timing or electrical acceptance.'}
if '--save'in sys.argv:(HERE/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
