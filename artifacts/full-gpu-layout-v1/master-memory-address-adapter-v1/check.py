"""Bounded static electrical checks, with every endpoint tied to actual cells."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;R=H.parents[2]
P=lambda p:tuple(p[a]for a in 'xyz');A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda v:tuple(-x for x in v)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};V=list(D.values());SIX=V+[(0,1,0),(0,-1,0)];W='minecraft:redstone_wire';DI={'minecraft:repeater','minecraft:comparator'};T={'minecraft:redstone_torch','minecraft:redstone_wall_torch'}
solid=lambda b:b.get('id','').endswith('_concrete')
def sources(m,q,strong_only=False):
 out=set()
 for v in V:
  p=A(q,N(v));b=m.get(p,{})
  if b.get('id') in DI and D[b['properties']['facing']]==v:out.add(p)
  if not strong_only and b.get('id')==W:out.add(p)
 for dy in [-1,1]:
  p=A(q,(0,dy,0));b=m.get(p,{})
  if dy==-1 and b.get('id') in T:out.add(p)
  if not strong_only and dy==1 and b.get('id')==W:out.add(p)
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
 base={P(v['position']):v['block'] for v in o['blocks']};added={P(v['position']):v['block'] for v in d['blocks']};assert len(added)==len(d['blocks']) and not(set(base)&set(added));m=base|added
 expected={(P(b['normalizer']),P(b['strong_solid']),P(t)) for b in d['branches'] for t in b['recipients']}
 allowed_contacts=set();supports=0
 for b in d['branches']:
  s,r,q=map(P,[b['source'],b['normalizer'],b['strong_solid']]);assert m[s]['id']==W
  assert m[r]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  assert A(s,(-1,0,0))==r and A(r,(-1,0,0))==q and solid(m[q])
  assert sources(m,q,True)=={r},('Fanout solid has additional strong source',q,sources(m,q,True))
  assert sources(m,q)=={r,*map(P,b['recipients'])},('Fanout solid weak neighbors differ from its exact two recipients',q,sources(m,q))
  allowed_contacts.add(frozenset([s,r]))
  for t in b['recipients']:assert m[P(t)]['id']==W and sum(abs(a-c)for a,c in zip(P(t),q))==1
 for p,b in added.items():
  assert -64<=p[1]<=319
  if b['id']==W or b['id'] in DI:assert solid(m.get(A(p,(0,-1,0)),{}));supports+=1
  if b['id']==W:
   for v in V:
    for dy in [-1,0,1]:
     q=A(p,(v[0],dy,v[2]));other=m.get(q,{})
     if other.get('id') not in {W,*DI,*T}:continue
     if dy and other['id']!=W:continue
     if dy==1 and solid(m.get(A(p,(0,1,0)),{})):continue
     if dy==-1 and solid(m.get(A(q,(0,1,0)),{})):continue
     assert frozenset([p,q]) in allowed_contacts,('New dust unintended contact',p,q,other)
  if b['id'] in DI:
   v=D[b['properties']['facing']]
   for off in [(v[2],0,v[0]),(-v[2],0,-v[0])]:
    q=A(p,off);assert m.get(q,{}).get('id') not in {W,*DI,*T},('New diode side input',p,q)
 old_torches=old_rears=old_wires=0
 for p,b in base.items():
  if b['id'] in T:
   q=A(p,(0,-1,0)) if b['id']=='minecraft:redstone_torch' else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q);old_torches+=1
  if b['id'] in DI:
   q=A(p,N(D[b['properties']['facing']]))
   if solid(base.get(q,{})):assert sources(m,q)==sources(base,q);old_rears+=1
   elif q not in base:assert q not in added,('New solid behind old diode',p,q)
  if b['id']==W:assert wire_edges(m,p)&set(base)==wire_edges(base,p);old_wires+=1
 actual=set();new_paths=set()
 for q,b in m.items():
  if not solid(b):continue
  for src in sources(m,q,True):
   for v in SIX:
    p=A(q,v)
    if m.get(p,{}).get('id')!=W:continue
    if p in added:new_paths.add((src,q,p))
    if p in base and(src in added or q in added):actual.add((src,q,p))
 assert actual==expected,('Unexpected or missing parent power paths',actual-expected,expected-actual)
 assert not new_paths,('Unexpected support power into new inputs',new_paths)
 assert supports==128 and len(expected)==128 and len(d['branches'])==64
 return {'supports':supports,'exact_fanout_sources':64,'named_recipient_strong_paths':len(actual),'new_input_support_power_paths':len(new_paths),'old_torch_source_sets':old_torches,'old_solid_rears':old_rears,'old_wire_step_neighborhoods':old_wires}
d=json.loads((H/'design.json').read_text());o=json.loads((H/'obstacles.json').read_text());r=check(d,o)
for p,h in d['source_sha256'].items():assert hashlib.sha256((R/p).read_bytes()).hexdigest()==h,p
negative=0
for kind in ['direction','missing_solid','wrong_recipient']:
 bad=copy.deepcopy(d);branch=bad['branches'][0]
 if kind=='direction':next(v for v in bad['blocks'] if v['position']==branch['normalizer'])['block']['properties']['facing']='west'
 if kind=='missing_solid':bad['blocks']=[v for v in bad['blocks'] if v['position']!=branch['strong_solid']]
 if kind=='wrong_recipient':branch['recipients'][0]['z']-=1
 try:check(bad,o)
 except (AssertionError,KeyError):negative+=1
 else:raise AssertionError('Accepted corruption '+kind)
r.update(status='shared_address_recipient_adapter_static_checks_pass',negative_refusals=negative,design_sha256=hashlib.sha256((H/'design.json').read_bytes()).hexdigest(),native_acceptance=False,complete_master_address_bus=False,world_mutations=0)
(H/'checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
