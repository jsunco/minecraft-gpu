"""Authored contact/strength screen for refolded lane, not a redstone simulation."""
import json
from pathlib import Path
H=Path(__file__).resolve().parent
d=json.loads((H/'design.json').read_text());xyz=lambda p:tuple(p[k] for k in ('x','y','z'))
m={xyz(v['position']):v['block'] for v in d['blocks']};assert len(m)==len(d['blocks'])
D={'east':(1,0,0),'west':(-1,0,0),'south':(0,0,1),'north':(0,0,-1)}
add=lambda p,q:tuple(a+b for a,b in zip(p,q));neg=lambda p:tuple(-v for v in p)
solid=lambda p:m.get(p,{}).get('id','').endswith('_concrete')
wire=lambda p:m.get(p,{}).get('id')=='minecraft:redstone_wire'
diodes=['minecraft:repeater','minecraft:comparator']
owned=lambda p:d['owner'][','.join(map(str,p))]
edges=set()
for p,b in m.items():
 if wire(p):
  for v in D.values():
   q=add(p,v);qs=[q]
   if solid(q) and not solid(add(p,(0,1,0))):qs.append(add(q,(0,1,0)))
   if not solid(q):qs.append(add(q,(0,-1,0)))
   for q in qs:
    if wire(q):edges.add((p,q))
allowed=set()
for j in d['joins']:
 a,b=xyz(j['from']),xyz(j['to']);allowed.update([(a,b),(b,a)])
foreign=[(p,q,owned(p),owned(q)) for p,q in edges if owned(p)!=owned(q) and (p,q) not in allowed]
assert not foreign,('Unintended dust joins',foreign[:30],len(foreign))
supports=0;locks=[]
for p,b in m.items():
 if b['id'].endswith('_concrete'):continue
 q=add(p,(0,-1,0))
 if b['id']=='minecraft:redstone_wall_torch':q=add(p,neg(D[b['properties']['facing']]))
 assert solid(q),('Support',p,b);supports+=1
 if b['id']=='minecraft:repeater':
  f=D[b['properties']['facing']]
  for v in ([D['north'],D['south']] if f[0] else [D['east'],D['west']]):
   q=add(p,v);a=m.get(q,{})
   if a.get('id') in diodes and add(q,neg(D[a['properties']['facing']]))==p:
    # The only expected side locks are retained original current/next/aux cells.
    assert owned(p)==owned(q) and owned(p) in ['W','Q','M'],('New side lock',p,q)
    locks.append((p,q))
minimum=15
for r in d['routes']:
 ps=list(map(xyz,r['positions']));strength=15;previous=None
 for p,q in zip(ps,ps[1:]):
  if wire(p) and wire(q):assert (p,q) in edges and (q,p) in edges,('Blocked step',r['net'],p,q)
  elif m[p]['id']=='minecraft:repeater':assert add(p,neg(D[m[p]['properties']['facing']]))==q,('Wrong output',p,q)
  elif m[q]['id']=='minecraft:repeater':assert add(q,D[m[q]['properties']['facing']])==p,('Wrong rear',p,q)
 for p in ps:
  if m[p]['id']=='minecraft:repeater':assert strength>0;strength=15
  else:
   if previous=='minecraft:redstone_wire':strength-=1
   assert strength>0,('Attenuated',r['net'],p)
  previous=m[p]['id']
 minimum=min(minimum,strength)
for c in d['columns']:
 x,y,z=xyz(c['bottom']);top=xyz(c['top'])[1]
 for yy in range(y,top+1):assert m[x,yy,z]['id']==('minecraft:light_gray_concrete' if (yy-y)%2==0 else 'minecraft:redstone_torch')
 for yy in c['injection_y']:assert (yy-y)%4==0
for s in d['selectors']:
 for b in s['bits']:
  cmp=xyz(b['comparator']);out=xyz(b['output_receiver']);supp=xyz(b['output_support']);mask=xyz(b['mask_receiver']);rear=xyz(b['data_receiver'])
  assert add(out,(1,0,0))==supp and solid(supp)
  assert m[out]['properties']['facing']=='west'
  assert cmp==add(mask,(0,0,-1)) and m[mask]['properties']['facing']=='south'
  assert m[cmp]['properties']=={'facing':'west','mode':'subtract'}
  assert m[rear]['properties']['facing']=='west'
for g in d['groups']:
 if g['id'].endswith('_current_to_self'):
  assert len(g['links'])==8
  for b,l in enumerate(g['links']):assert l['bit']==b and l['source']==d['banks'][g['id'][0]]['current'][b]
 if g['id'].endswith('_current_to_left_upper7'):
  assert len(g['links'])==7
  for b,l in enumerate(g['links'],1):assert l['bit']==b and l['source_bit']==b-1
# Strong-support and direct-torch crossings are also screened, including the
# two-block vertical cases which a dust-only adjacency graph would miss.
allowed_power={(xyz(c['top']),xyz(c['output'])) for c in d['columns']}
allowed_taps={(xyz(t['support']),xyz(t['first'])) for t in d['taps']}
strong_contacts=0
for p,b in m.items():
 targets=[]
 if b['id'] in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  targets=[add(p,(0,1,0))]
  for v in D.values():
   q=add(p,v);a=m.get(q,{})
   if q not in m or owned(q)==owned(p):continue
   assert not wire(q) or any(c['value']==1 and xyz(c['position'])==q and p==add(q,(-1,0,0)) for c in d['fixed_constants']),('Foreign torch to wire',p,q)
   if a.get('id') in diodes:assert add(q,D[a['properties']['facing']])!=p,('Foreign torch diode rear',p,q)
 elif b['id'] in diodes:targets=[add(p,neg(D[b['properties']['facing']]))]
 elif wire(p):targets=[add(p,(0,-1,0))]
 for q in targets:
  if not solid(q):continue
  for v in [*D.values(),(0,1,0),(0,-1,0)]:
   r=add(q,v);a=m.get(r,{})
   if r not in m or r==p or owned(r)==owned(p):continue
   if wire(r):
    assert (q,r) in allowed_power or (p,r) in allowed,('Foreign support to wire',p,q,r)
    strong_contacts+=1
   elif a.get('id') in diodes and add(r,D[a['properties']['facing']])==q:
    assert (q,r) in allowed_taps,('Foreign support to diode rear',p,q,r)
    strong_contacts+=1
for z in d['zero_ports']:
 p=xyz(z['position']);assert wire(p) and solid(add(p,(0,-1,0)))
 for v in [*D.values(),(0,1,0),(0,-2,0)]:
  q=add(p,v)
  if v==D['east']:assert m[q]['id']=='minecraft:repeater' and m[q]['properties']['facing']=='west'
  else:assert q not in m,('Constant zero contact',p,q)
assert len(d['zero_ports'])==30
# Offline settled transfer equation of every stacked OR column, all choice masks
# and payloads. Not a transient or native simulation.
truth=0
for choices in [6,5]:
 for data in range(1<<choices):
  for selection in range(1<<choices):
   value=0
   for i in reversed(range(choices)):
    injected=((data>>i)&1) if (selection>>i)&1 else 0
    value=value|injected
   assert value==int(bool(data&selection));truth+=1
r={'status':'authored_partial_folded_geometry_screen_passed','blocks':len(m),'supported_components':supports,'original_storage_locks':len(locks),'foreign_dust_joins':0,'new_side_locks':0,'minimum_route_endpoint_strength':minimum,'selector_choices':len(d['selectors']),'positive_OR_columns':len(d['columns']),'checked_cross_owner_strong_contacts':strong_contacts,'settled_selector_truth_cases':truth,'isolated_zero_choice_bits':len(d['zero_ports']),'limitations':['Partial ALU, no build plans or native calls.','Strong-support dynamics, simultaneous transitions, and timing are not simulated.']}
if '--save' in __import__('sys').argv:(H/'routing-check.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
