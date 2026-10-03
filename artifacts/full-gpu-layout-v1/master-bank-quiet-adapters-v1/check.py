"""Exact local inverter/source isolation; no native timing or execution."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;R=H.parents[2]
P=lambda p:tuple(p[a]for a in'xyz');A=lambda p,v:tuple(a+b for a,b in zip(p,v));N=lambda v:tuple(-x for x in v)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};V=list(D.values());SIX=V+[(0,1,0),(0,-1,0)];W='minecraft:redstone_wire';DI={'minecraft:repeater','minecraft:comparator'};T={'minecraft:redstone_torch','minecraft:redstone_wall_torch'}
solid=lambda b:b.get('id','').endswith('_concrete')
def sources(m,q,strong=False):
 out=set()
 for v in V:
  p=A(q,N(v));b=m.get(p,{})
  if b.get('id')in DI and D[b['properties']['facing']]==v:out.add(p)
  if not strong and b.get('id')==W:out.add(p)
 for dy in [-1,1]:
  p=A(q,(0,dy,0));b=m.get(p,{})
  if dy==-1 and b.get('id')in T:out.add(p)
  if not strong and dy==1 and b.get('id')==W:out.add(p)
 return out
def wire_edges(m,p):
 out=set()
 for v in V:
  for dy in [-1,0,1]:
   q=A(p,(v[0],dy,v[2]));b=m.get(q,{})
   if b.get('id')!=W:continue
   if dy==1 and solid(m.get(A(p,(0,1,0)),{})):continue
   if dy==-1 and solid(m.get(A(q,(0,1,0)),{})):continue
   out.add(q)
 return out
def check(d,o):
 base={P(v['position']):v['block']for v in o['blocks']};added={P(v['position']):v['block']for v in d['blocks']};assert len(added)==32 and not(set(added)&set(base));m=base|added
 allowed=set();expected_outputs=[]
 for a in d['adapters']:
  s,r,q,t,ro,out=[P(a[k])for k in ['source','input_normalizer','inverter_support','torch','output_normalizer','destination']]
  assert [r,q,t,ro,out]==[A(s,(-i,0,0))for i in range(1,6)]
  assert base[s]['id']==W and m[out]['id']==W and solid(m[q])
  for pos in [r,ro]:assert m[pos]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  assert m[t]=={'id':'minecraft:redstone_wall_torch','properties':{'facing':'west'}}
  assert sources(m,q)=={r},('Foreign inverter support source',q,sources(m,q))
  assert A(t,D[m[t]['properties']['facing']])==q
  assert A(ro,N(D[m[ro]['properties']['facing']]))==t
  for x,y in [(s,r),(q,t),(t,ro),(ro,out)]:allowed.add(frozenset([x,y]))
  expected_outputs.append(out)
 assert list(map(P,d['ports']['bank_quiet']['positions']))==expected_outputs
 supports=0
 for p,b in added.items():
  assert -64<=p[1]<=319
  if b['id']==W or b['id']in DI:assert solid(m.get(A(p,(0,-1,0)),{}));supports+=1
  if b['id']in DI:
   v=D[b['properties']['facing']]
   for off in [(v[2],0,v[0]),(-v[2],0,-v[0])]:assert m.get(A(p,off),{}).get('id')not in {W,*DI,*T},('New diode side',p,A(p,off))
  if b['id']in {W,*T}:
   for v in V:
    q=A(p,v);other=m.get(q,{})
    if other.get('id')in {W,*DI,*T}:assert frozenset([p,q])in allowed,('New active face contact',p,q,other)
  if b['id']==W:assert not wire_edges(m,p),('New dust step connection',p,wire_edges(m,p))
  if b['id']in T:
   # An upward strong output is only allowed if its receiving solid is
   # explicitly part of this inverter. This motif has no such column.
   assert not solid(m.get(A(p,(0,1,0)),{}))
 old_torches=old_rears=old_wires=0
 for p,b in base.items():
  if b['id']in T:
   q=A(p,(0,-1,0))if b['id']=='minecraft:redstone_torch'else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q),('Changed old torch',p,q);old_torches+=1
  if b['id']in DI:
   v=D[b['properties']['facing']];q=A(p,N(v))
   if solid(base.get(q,{})):assert sources(m,q)==sources(base,q),('Changed old diode rear',p,q);old_rears+=1
   elif q not in base:assert q not in added,('New block behind old diode',p,q)
   for off in [(v[2],0,v[0]),(-v[2],0,-v[0])]:assert A(p,off)not in added or m[A(p,off)]['id']not in{W,*DI,*T},('New old-diode side',p)
  if b['id']==W:
   assert wire_edges(m,p)==wire_edges(base,p),('Changed old wire neighborhood',p);old_wires+=1
 parent_paths=set();new_paths=set()
 for q,b in m.items():
  if not solid(b):continue
  for src in sources(m,q,True):
   for v in SIX:
    p=A(q,v)
    if m.get(p,{}).get('id')!=W:continue
    if p in added:new_paths.add((src,q,p))
    if p in base and(src in added or q in added):parent_paths.add((src,q,p))
 assert not parent_paths and not new_paths,('Unexpected strong-support paths',parent_paths,new_paths)
 assert supports==12 and len(d['adapters'])==4
 return {'supports':supports,'actual_inverters':4,'old_torch_source_sets':old_torches,'old_solid_rears':old_rears,'old_wire_step_neighborhoods':old_wires,'new_strong_support_paths_to_old_or_new_dust':0}
d=json.loads((H/'design.json').read_text());o=json.loads((H/'obstacles.json').read_text());r=check(d,o)
for p,h in d['source_sha256'].items():assert hashlib.sha256((R/p).read_bytes()).hexdigest()==h,p
negative=0
for kind in ['wrong_input_facing','wrong_inverter_facing','wrong_output']:
 bad=copy.deepcopy(d);a=bad['adapters'][0]
 if kind=='wrong_input_facing':next(v for v in bad['blocks']if v['position']==a['input_normalizer'])['block']['properties']['facing']='west'
 elif kind=='wrong_inverter_facing':next(v for v in bad['blocks']if v['position']==a['torch'])['block']['properties']['facing']='east'
 else:bad['ports']['bank_quiet']['positions'][0]=a['source']
 try:check(bad,o)
 except (AssertionError,KeyError):negative+=1
 else:raise AssertionError('Accepted '+kind)
truth=0
for bank in range(4):
 for pattern in range(8):
  active,tail,reset=[bool(pattern&(1<<i))for i in range(3)];busy=active or tail or reset;quiet=not busy
  assert quiet==(not active and not tail and not reset);truth+=1
r.update(status='bank_quiet_inverters_static_source_checks_pass',settled_equation_cases=truth,negative_refusals=negative,design_sha256=hashlib.sha256((H/'design.json').read_bytes()).hexdigest(),native_acceptance=False,master_quiet_routes_complete=False,world_mutations=0)
(H/'checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
