"""Authored control-matrix static screen, no native execution or transient claims."""
import json
from pathlib import Path
H=Path(__file__).resolve().parent;d=json.loads((H/'design.json').read_text())
xyz=lambda p:tuple(p[a] for a in 'xyz');m={xyz(v['position']):v for v in d['blocks']};assert len(m)==len(d['blocks'])
V={'east':(1,0,0),'west':(-1,0,0),'south':(0,0,1),'north':(0,0,-1)};add=lambda a,b:tuple(x+y for x,y in zip(a,b));neg=lambda p:tuple(-v for v in p)
b=lambda p:m.get(p,{}).get('block',{});solid=lambda p:b(p).get('id','').endswith('_concrete');wire=lambda p:b(p).get('id')=='minecraft:redstone_wire'
parent=lambda p:m[p]['part'] in ['word','phase']
sameparent=lambda p,q:parent(p) and parent(q) and m[p]['part']==m[q]['part']
edges={(xyz(e['from']),xyz(e['to'])) for e in d['edges']};pairs={frozenset((p,q)) for p,q in edges};supports=0;reps=0;contacts=0
for p,v in m.items():
 a=v['block'];id=a['id']
 if solid(p):continue
 q=add(p,neg(V[a['properties']['facing']])) if id=='minecraft:redstone_wall_torch' else add(p,(0,-1,0))
 assert solid(q),('Support',p,q);supports+=1
 if id=='minecraft:repeater' and not parent(p):
  rear=add(p,V[a['properties']['facing']]);out=add(p,neg(V[a['properties']['facing']]))
  assert (rear,p) in edges and (p,out) in edges,('Unlisted direction',p,rear,out);reps+=1
  f=V[a['properties']['facing']]
  for vv in ([V['north'],V['south']] if f[0] else [V['east'],V['west']]):
   q=add(p,vv);o=b(q)
   if o.get('id') in ['minecraft:repeater','minecraft:comparator']:assert add(q,neg(V[o['properties']['facing']]))!=p,('Foreign side lock',p,q)
for p in m:
 if not wire(p):continue
 for dv in V.values():
  q=add(p,dv);qs=[q]
  if solid(q) and not solid(add(p,(0,1,0))):qs.append(add(q,(0,1,0)))
  if not solid(q):qs.append(add(q,(0,-1,0)))
  for q in qs:
   if q not in m or not wire(q) or sameparent(p,q):continue
   assert frozenset((p,q)) in pairs,('Unlisted wire join',p,q);contacts+=1
minimum=15
for r in d['routes']:
 ps=list(map(xyz,r['path']));power=15
 for i,p in enumerate(ps):
  if b(p)['id']=='minecraft:repeater':assert power>0;minimum=min(minimum,power);power=15
  else:
   if i and wire(ps[i-1]):power-=1
   assert power>0,('Strength',r['name'],p)
  if not i:continue
  q=ps[i-1]
  if wire(p) and wire(q):
   if p[1]>q[1]:assert solid((p[0],q[1],p[2])) and not solid(add(q,(0,1,0)))
   if p[1]<q[1]:assert not solid((p[0],q[1],p[2]))
# Two positive OPEN phase columns: every bank tap is at positive parity.
attachment=set()
for c in d['columns']:
 tr=c['translation'];x=c['x']+tr['x'];z=c['z']+tr['z'];lo=c['bottom']+tr['y'];hi=c['top']+tr['y']
 for y in range(lo,hi+1):
  expected='light_gray_concrete' if (y-lo)%2==0 else 'redstone_torch'
  assert b((x,y,z))['id']=='minecraft:'+expected
  if expected=='light_gray_concrete':
   for dv in V.values():
    q=add((x,y,z),dv)
    if b(q).get('id')=='minecraft:redstone_wall_torch' and add(q,neg(V[b(q)['properties']['facing']]))==(x,y,z):attachment.add(((x,y,z),q))
# Check strong mediated paths against explicit edges, not just a dust graph.
strong=0
for p,v in m.items():
 a=v['block'];id=a['id'];targets=[]
 if wire(p):targets=[add(p,(0,-1,0))]
 elif id in ['minecraft:repeater','minecraft:comparator']:targets=[add(p,neg(V[a['properties']['facing']]))]
 elif id in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  targets=[add(p,(0,1,0))]
  for dv in V.values():
   q=add(p,dv)
   if q not in m or sameparent(p,q):continue
   if wire(q):assert frozenset((p,q)) in pairs,('Torch side wire',p,q)
 for q in targets:
  if not solid(q):continue
  for dv in [*V.values(),(0,1,0),(0,-1,0)]:
   r=add(q,dv)
   if r not in m or r==p or (sameparent(p,q) and sameparent(q,r)):continue
   if wire(r) and not wire(p):assert (q,r) in edges or frozenset((p,r)) in pairs,('Strong wire contact',p,q,r);strong+=1
   if b(r).get('id') in ['minecraft:repeater','minecraft:comparator'] and add(r,V[b(r)['properties']['facing']])==q:assert (q,r) in edges,('Strong rear contact',p,q,r)
   if b(r).get('id')=='minecraft:redstone_wall_torch' and add(r,neg(V[b(r)['properties']['facing']]))==q:assert (q,r) in attachment or (q,r) in edges,('Strong torch attachment',p,q,r)
print(json.dumps({'status':'authored_connected_phase_loop_static_screen_passed','blocks':len(m),'supports':supports,'new_directed_repeaters':reps,'listed_wire_contacts':contacts,'minimum_route_repeater_input':minimum,'strong_wire_contacts':strong,'native_calls':0}))

# Exact inherited cells and original dust graph edges remain untouched.
word=json.loads((H.parent/'control-word.json').read_text())
for v in word['blocks']:assert b(xyz(v['position']))==v['block']
assert len(word['blocks'])==20766
assert d['metrics']['retained_controller_bits']==4 and d['metrics']['shared_commands']==41
assert 'phase0' not in d['ports'] and 'phase1' not in d['ports']
for v in word['ports']:
 if v not in ['phase0','phase1']:assert d['ports'][v]==word['ports'][v]
assert len(d['connections'])==6
for bit in range(2):
 c=next(c for c in d['connections'] if c['name']==f'phase{bit}_feedback');p=xyz(c['isolation'])
 assert b(p)['properties']=={'facing':'south','delay':'1'} and add(p,(0,0,1))==xyz(c['tap'])
 assert xyz(c['destination'])==xyz(word['ports'][f'phase{bit}']['bits'][0]['position'])
assert b((50,268,-35))['id']=='minecraft:redstone_block'
assert b((50,268,-34))['properties']=={'facing':'north','delay':'1'}
# Paired-bank half-adder recurrence: clear overrides and held old bits determine carry.
truth=0
for width in [2,3]:
 for current in range(1<<width):
  for inc in [0,1]:
   for clear in [0,1]:
    carry=1;out=0
    for bit in range(width):
     c=(current>>bit)&1;s=c^carry;carry=c&carry
     out|=(0 if clear else s if inc else c)<<bit
    assert out==(0 if clear else (current+inc)%(1<<width));truth+=1
assert d['box']['to']['y']-d['box']['from']['y']<384
print(json.dumps({'phase_recurrence_cases':truth,'unchanged_word_blocks':20766,'actual_feedback_routes':2,'actual_OPEN_routes':4,'native_acceptance':False}))
