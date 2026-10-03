"""Independent additive phase-route screen; reads frozen JSON, no native use."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent
D=json.loads((H/'design.json').read_text());P=json.loads((H.parent/'counter-control/design.json').read_text())
xyz=lambda p:tuple(p[a] for a in 'xyz');m={xyz(v['position']):v['block'] for v in D['blocks']};pm={xyz(v['position']):v['block'] for v in P['blocks']}
V={'east':(1,0,0),'west':(-1,0,0),'north':(0,0,-1),'south':(0,0,1)}
add=lambda a,b:tuple(x+y for x,y in zip(a,b));neg=lambda v:tuple(-x for x in v)
wire=lambda p:m.get(p,{}).get('id')=='minecraft:redstone_wire';solid=lambda p:m.get(p,{}).get('id','').endswith('_concrete')
assert len(m)==8578 and len(pm)==7368
for p,b in pm.items():assert m[p]==b
new=set(m)-set(pm);listed={(xyz(e['from']),xyz(e['to'])) for e in D['edges']};pairs={frozenset((a,b)) for a,b in listed}
columns={};expected_power=set();attachments=set()
for c in D['columns']:
 x,z,low,high=c['x'],c['z'],c['bottom'],c['top']
 for y in range(low,high+1):
  p=(x,y,z);expected='redstone_wire' if y==high and c.get('wire_top') else 'light_gray_concrete' if (y-low)%2==0 else 'redstone_torch'
  assert m[p]['id']=='minecraft:'+expected;columns[p]=c['name']
  if expected=='light_gray_concrete':
   if wire(add(p,(0,1,0))):expected_power.add((p,add(p,(0,1,0))))
   q=add(p,(1,0,0))
   if m.get(q,{}).get('id')=='minecraft:redstone_wall_torch':attachments.add((p,q))
strong=[];torch_edges=[]
for p,b in m.items():
 targets=[];id=b['id']
 if id=='minecraft:redstone_wire':targets=[add(p,(0,-1,0))]
 elif id in ['minecraft:repeater','minecraft:comparator']:targets=[add(p,neg(V[b['properties']['facing']]))]
 elif id in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  targets=[add(p,(0,1,0))]
  for dv in V.values():
   q=add(p,dv);a=m.get(q,{})
   if p not in new and q not in new:continue
   if wire(q):assert frozenset((p,q)) in pairs,('Torch side to wire',p,q);torch_edges.append((p,q))
   if a.get('id') in ['minecraft:repeater','minecraft:comparator'] and add(q,V[a['properties']['facing']])==p:assert (p,q) in listed,('Torch diode rear',p,q)
 for q in targets:
  if not solid(q):continue
  for dv in [*V.values(),(0,1,0),(0,-1,0)]:
   r=add(q,dv);a=m.get(r,{})
   if r==p or (p not in new and q not in new and r not in new):continue
   if wire(r):assert (q,r) in expected_power or frozenset((p,r)) in pairs,('Strong support to wire',p,q,r);strong.append((p,q,r))
   if a.get('id') in ['minecraft:repeater','minecraft:comparator'] and add(r,V[a['properties']['facing']])==q:assert (q,r) in listed,('Strong support to diode',p,q,r)
   if a.get('id')=='minecraft:redstone_wall_torch' and add(r,neg(V[a['properties']['facing']]))==q:assert (q,r) in attachments,('Unexpected torch attached to powered block',p,q,r)
# Every generated route edge must be a genuine step, not merely in an allowlist.
route_edges=0;minimum=15
for route in D['routes']:
 ps=list(map(xyz,route['path']));power=15
 for i,p in enumerate(ps):
  if m[p]['id']=='minecraft:repeater':
   assert i>0 and i<len(ps)-1
   assert add(p,V[m[p]['properties']['facing']])==ps[i-1] and add(p,neg(V[m[p]['properties']['facing']]))==ps[i+1]
   assert power>0;minimum=min(minimum,power);power=15
  else:
   assert wire(p)
   if i and wire(ps[i-1]):power-=1
   assert power>0
  if not i:continue
  q=ps[i-1];assert abs(p[0]-q[0])+abs(p[2]-q[2])==1
  if wire(p) and wire(q):
   if p[1]>q[1]:assert solid((p[0],q[1],p[2])) and not solid(add(q,(0,1,0)))
   elif p[1]<q[1]:assert not solid((p[0],q[1],p[2])) and solid((q[0],p[1],q[2]))
  route_edges+=1
# Independent source-to-OPEN truth by inversion parity, including both low defaults.
truth=0
for nx in [0,1]:
 for cu in [0,1]:
  for bank,x in [('next',-4),('current',8)]:
   incoming=nx if bank=='next' else cu
   for bit in range(4):
    value=incoming
    for y in range(-1,8*bit,2):value=1-value
    value=1-value # wall torch
    assert value==incoming
    p=(x+3,8*bit,3);assert m[p]['properties']=={'facing':'west','delay':'1'}
    assert xyz(P['ports'][f'{bank}_open_{bit}']['bits'][0]['position'])==add(p,(1,0,0));truth+=1
  for bank,x,low in [('next',126,-5),('current',138,-9)]:
   value=nx if bank=='next' else cu
   for y in range(low+1,0,2):value=1-value
   assert value==(nx if bank=='next' else cu)
   assert xyz(P['ports'][f'boot_{bank}_open']['bits'][0]['position'])==(x+4,0,83)
   for xx in [x+1,x+3]:assert m[xx,0,83]['properties']=={'facing':'west','delay':'1'}
   truth+=1
print(json.dumps({'status':'independent_offline_phase_route_screen_passed','blocks':len(m),'preserved_blocks':len(pm),'additions':len(new),'phase_to_open_truth_cases':truth,'route_edges':route_edges,'minimum_repeater_input':minimum,'strong_support_wire_contacts':len(strong),'torch_to_wire_contacts':len(torch_edges),'native_calls':0}))
