"""Bounded actual READY boundary / positive injection review; no services."""
import json,hashlib
from pathlib import Path
from collections import defaultdict,deque
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
def read(p):return json.loads(Path(p).read_text())
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
def P(p):return tuple(p[k]for k in'xyz')
def A(p,v):return tuple(a+b for a,b in zip(p,v))
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
m=read(H/'source-manifest.json');assert sha(H/'source-manifest.json')=='131fee6ea6afe4972242be90fd7e5e143cc7262f66fe8578d4b03d1d301ed635'
for p,h in m['files'].items():assert sha(ROOT/p)==h,p
d=read(H/'design.json');o=read(d['obstacle_path']);base={(x,y,z):o['palette'][p]for x,y,z,p,i in o['cells']};new={P(r['position']):r['block']for r in d['blocks']};assert len(new)==19668 and not base.keys()&new.keys();world=base|new;graph=defaultdict(set)
for e in d['edges']:graph[P(e['from'])].add(P(e['to']))
for col in d['columns']:
 x,z,lo,hi=[col[k]for k in('x','z','bottom','output_y')];assert(hi-lo)%4==1
 for y in range(lo,hi):assert world[(x,y,z)]['id']=='minecraft:'+('light_gray_concrete'if(y-lo)%2==0 else'redstone_torch')
 graph[(x,lo,z)].add((x,hi,z))
def check(c):
 i=int(c['destination_instance'][-1]);assert i in(0,1)and c['source_instance']=='loader' and c['destination_bit']==0 and c['source_bit']==i
 s=[(-500,298,1008),(-488,298,1008)][i];t=(-280,1,-1416-1520*i)
 assert P(c['source'])==s and P(c['destination'])==t
 assert c['source_port']=='program.read_ready'and c['destination_port']=='front.program_ready'
 assert base[s]['id']==base[t]['id']=='minecraft:redstone_wire'
 old=A(s,(0,0,-1));assert base[old]['id']=='minecraft:repeater'and D[base[old]['properties']['facing']]==(0,0,1)
 approach=next(r for r in d['routes']if r['name']==c['name']+'_source_approach');assert P(approach['path'][0])==s;tap=A(P(approach['path'][-1]),(0,0,1));assert new[tap]['id']=='minecraft:repeater'and D[new[tap]['properties']['facing']]==(0,0,1)
 inj=c['recipient_injection'];assert P(inj['bottom'])==A(t,(0,-5,0))and P(inj['old_support'])==A(t,(0,-1,0))and P(inj['output'])==t
 r=P(c['normalizer']);assert new[r]['id']=='minecraft:repeater'and A(r,D[new[r]['properties']['facing']])==P(inj['bottom'])
 assert base[P(inj['old_support'])]['id']=='minecraft:light_gray_concrete'
 for dy,kind in[(-5,'light_gray_concrete'),(-4,'redstone_torch'),(-3,'light_gray_concrete'),(-2,'redstone_torch')]:assert new[A(t,(0,dy,0))]['id']=='minecraft:'+kind
 seen={s};q=deque([s])
 while q:
  for p in graph[q.popleft()]:
   if p not in seen:seen.add(p);q.append(p)
 assert t in seen and set([(-280,1,-1416),(-280,1,-2936)])&seen=={t}
 return i
assert {check(c)for c in d['connections']}=={0,1}
# A new solid at a formerly air-backed parent diode would evade an old-solid-only screen.
new_rears=0
for p,b in base.items():
 if b['id']not in('minecraft:repeater','minecraft:comparator'):continue
 v=D[b['properties']['facing']];q=A(p,tuple(-n for n in v))
 if q in new and new[q]['id'].endswith('_concrete'):new_rears+=1
assert new_rears==0
neg=0
for mutate in[lambda c:c.update(source_bit=1),lambda c:c['recipient_injection']['bottom'].update(y=-3),lambda c:c['source'].update(x=-488)]:
 c=json.loads(json.dumps(d['connections'][0]));mutate(c)
 try:check(c)
 except(AssertionError,KeyError):neg+=1
 else:raise AssertionError('Corrupt READY path accepted')
for name in['checks.json','power-checks.json','all-parent-checks.json']:
 r=read(H/name);assert (r.get('design_sha256')or r.get('source',{}).get('design'))==sha(H/'design.json')
r={'status':'independently_cleared_offline','manifest_sha256':sha(H/'source-manifest.json'),'source_sha256':m['files'],'checker_sha256':sha(H/'check-independent.py'),'source_pins_verified':len(m['files']),'actual_consumer_mappings':2,'normalized_source_approaches':2,'positive_underpad_injections':2,'complete_directed_paths':2,'new_parent_diodes_with_solid_rear':new_rears,'negative_refusals':neg,'scope':'Bounded actual source/consumer identity, diode orientation and positive underpad/path review, binding author full-map electrical evidence.','limitations':['Does not establish response-data setup versus READY, pulse transport, consumer capture or asynchronous timing.','DATA/drain and complete program-channel acceptance remain pending.'],'native_acceptance':False,'native_calls':0}
(H/'independent-review.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k!='source_sha256'}))
