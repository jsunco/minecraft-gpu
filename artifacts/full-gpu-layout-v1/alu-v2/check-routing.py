"""Finite authored geometry screen, not a redstone simulator or native harness."""
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
d=json.loads((HERE/'design.json').read_text())
base=json.loads((HERE.parent/'alu/layout-adapters.json').read_text())
xyz=lambda p:tuple(p[a] for a in ('x','y','z'))
m={xyz(v['position']):v['block'] for v in d['blocks']}
old={xyz(v['position']):v['block'] for v in base['blocks']}
assert len(m)==len(d['blocks'])
for p,b in old.items(): assert m[p]==b, ('parent block changed',p)
new=set(m)-set(old)
dirs={'east':(1,0,0),'west':(-1,0,0),'south':(0,0,1),'north':(0,0,-1)}
add=lambda p,q:tuple(a+b for a,b in zip(p,q))
neg=lambda p:tuple(-v for v in p)
key=lambda p:','.join(map(str,p))
own=lambda p:d['owner'][key(p)]
solid=lambda a,p:a.get(p,{}).get('id','').endswith('_concrete')
wire=lambda a,p:a.get(p,{}).get('id')=='minecraft:redstone_wire'
diode=lambda b:b.get('id') in ['minecraft:repeater','minecraft:comparator']
def edges(a):
 out=set()
 for p,b in a.items():
  if not wire(a,p):continue
  for h in dirs.values():
   q=add(p,h);qs=[q]
   if solid(a,q) and not solid(a,add(p,(0,1,0))):qs.append(add(q,(0,1,0)))
   if not solid(a,q):qs.append(add(q,(0,-1,0)))
   for q in qs:
    if wire(a,q):out.add((p,q))
 return out
all_edges=edges(m)
assert {(p,q) for p,q in all_edges if p in old and q in old}==edges(old),'Old dust connectivity changed'
allowed=set()
for g in d['connection_groups']:
 if g['id'] in ['W_one_hot_receivers_to_local_masks','M_Q_one_hot_receivers_to_local_masks']:
  for link in g['links']:
   q=xyz(link['destination']['position']);p=add(q,(0,0,-1));allowed.update([(p,q),(q,p)])
 if g['id'].endswith('_selector_outputs_to_next_parallel'):
  for link in g['links']:
   p=xyz(link['route_end']);q=xyz(link['receiving_wire']);allowed.update([(p,q),(q,p)])
for p,q in all_edges:
 if p in new or q in new: assert own(p)==own(q) or (p,q) in allowed,('Foreign new dust join',p,q,own(p),own(q))
supports=0
for p in new:
 b=m[p]
 if b['id'].endswith('_concrete'):continue
 q=add(p,(0,-1,0))
 if b['id']=='minecraft:redstone_wall_torch':q=add(p,neg(dirs[b['properties']['facing']]))
 assert solid(m,q),('Missing support',p)
 supports+=1
for p,b in m.items():
 if b['id']!='minecraft:repeater':continue
 f=dirs[b['properties']['facing']]
 for v in ([dirs['north'],dirs['south']] if f[0] else [dirs['east'],dirs['west']]):
  q=add(p,v);qb=m.get(q,{})
  if diode(qb) and (p in new or q in new):assert add(q,neg(dirs[qb['properties']['facing']]))!=p,('New side lock',p,q)
min_power=15
for r in d['routes']:
 strength=15;previous=None
 positions=[xyz(v) for v in r['positions']]
 for p,q in zip(positions,positions[1:]):
  a,b=m[p],m[q]
  if wire(m,p) and wire(m,q):assert (p,q) in all_edges and (q,p) in all_edges,('Blocked intended dust step',r['net'],p,q)
  elif a['id']=='minecraft:repeater':assert add(p,neg(dirs[a['properties']['facing']]))==q,('Reversed route output',p,q)
  elif b['id']=='minecraft:repeater':assert add(q,dirs[b['properties']['facing']])==p,('Wrong route rear',p,q)
 for v in r['positions']:
  p=xyz(v);b=m[p]
  if b['id']=='minecraft:repeater':assert strength>0;strength=15
  else:
   assert b['id']=='minecraft:redstone_wire'
   if previous=='minecraft:redstone_wire':strength-=1
   assert strength>0,('Route attenuation',r['net'],p)
  previous=b['id']
 min_power=min(min_power,strength)
for tap in d['taps']:
 p=xyz(tap['source']);assert wire(m,p) and solid(m,xyz(tap['source_support']))
 for k in ['first_receiver','second_receiver']:assert m[xyz(tap[k])]['id']=='minecraft:repeater'
 assert solid(m,xyz(tap['cap']))
for a in d['adapters']:
 p=xyz(a['output']);assert wire(m,p)
 for y in [-1,-3,-5]:assert solid(m,add(p,(0,y,0)))
 for y in [-2,-4]:assert m[add(p,(0,y,0))]['id']=='minecraft:redstone_torch'
 assert m[xyz(a['receiver'])]['id']=='minecraft:repeater'
for c in d.get('columns',[]):
 p=xyz(c['output']);bottom=xyz(c['bottom']);assert c['inversions']%2==0
 for y in range(bottom[1],p[1]-1):assert m[(p[0],y,p[2])]['id']==('minecraft:light_gray_concrete' if (y-bottom[1])%2==0 else 'minecraft:redstone_torch')
for z in d.get('zero_ports',[]):
 p=xyz(z['position']);assert wire(m,p) and solid(m,add(p,(0,-1,0)))
 assert add(p,(0,1,0)) not in m and add(p,(0,-2,0)) not in m
 for v in dirs.values():
  q=add(p,v)
  if v==dirs['south']:assert m[q]['id']=='minecraft:repeater' and m[q]['properties']['facing']=='north'
  else:assert q not in m,('Nonisolated constant-zero source',p,q)
assert len(d['connection_groups'][0]['links'])==8
for b,link in enumerate(d['connection_groups'][0]['links']):
 assert link['bit']==b and link['source']['port']==f'current[{b}]'
 assert xyz(link['source']['position'])==(2,1,12*b)
 assert xyz(link['destination']['position'])==(-46,-12,10+12*b)
 assert xyz(link['receiving_wire'])==(-48,-17,10+12*b)
for g in d['connection_groups']:
 for link in g['links']:
  p=xyz(link['destination']['position']);assert wire(m,p)
  if g['id']=='W_shift_left_to_trial_high7':assert link['source']['port']==f"current[{link['bit']-1}]" and p==(-58,-12,10+12*link['bit'])
  if g['id']=='Q_current_to_W_q':assert link['source']['port']==f"current[{link['bit']}]" and p==(-34,-12,10+12*link['bit'])
  if g['id']=='Q_msb_to_W_trial0':assert link['source']['port']=='current[7]' and p==(-58,-12,10)
# Exact bit indices across all three banks; shifted LSB scope remains explicit.
for g in d['connection_groups']:
 for link in g['links']:
  b=link.get('bit');dst=link['destination'];src=link['source'];p=xyz(dst['position'])
  if g['id'] in ['M_current_to_M_self','Q_current_to_Q_self']:
   bank=g['id'][0];assert src['port']==f'current[{b}]'
   assert xyz(src['position'])==((48 if bank=='M' else 96)+2,1,12*b)
   assert p==((196 if bank=='M' else 268),-12,10+12*b)
  if g['id'] in ['M_current_shift_left','Q_current_shift_left']:
   assert 1<=b<=7 and src['port']==f'current[{b-1}]'
   assert p==((184 if g['id'][0]=='M' else 280),-12,10+12*b)
  if g['id'] in ['operand_A_to_M_Q','operand_B_to_M_Q']:
   operand=g['id'][8].lower();assert src['port']==f'operand_{operand}[{b}]'
   x={('M_select','a'):160,('M_select','b'):172,('Q_select','a'):244,('Q_select','b'):256}[dst['instance'],operand]
   assert p==(x,-12,10+12*b)
assert len([p for p in d['interface_ports'] if p['name'] not in ['operand_a','operand_b']])==25
result={'status' :'authored_routed_group_geometry_screen_passed','parent_blocks_unchanged':len(old),'new_blocks':len(new),'total_blocks':len(m),'new_component_supports':supports,'checked_connection_groups':[g['id'] for g in d['connection_groups']],'foreign_new_dust_joins':0,'new_diode_side_locks':0,'original_dust_edges_unchanged':len(edges(old)),'minimum_end_route_strength':min_power,'native_calls':0,'limitations':['Only listed connection groups are complete. Remaining full ALU producers/control still missing.','Static motifs and dust/diode contacts, not simultaneous-state strong-support dynamics or vanilla timing.']}
if '--save' in __import__('sys').argv:(HERE/'routing-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
