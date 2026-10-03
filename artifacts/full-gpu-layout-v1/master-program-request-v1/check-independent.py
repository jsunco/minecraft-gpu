"""Bounded actual VALID boundary / positive injection review; no services."""
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
m=read(H/'source-manifest.json');assert sha(H/'source-manifest.json')=='f6e3ee714281c76658babcd0c6b473afcdfd84d3308e9ad55387d712b157aeb3'
for p,h in m['files'].items():assert sha(ROOT/p)==h,p
d=read(H/'design.json');o=read(d['obstacle_path']);base={(x,y,z):o['palette'][p]for x,y,z,p,i in o['cells']};new={P(r['position']):r['block']for r in d['blocks']};assert len(new)==17806 and not base.keys()&new.keys();world=base|new;graph=defaultdict(set)
for e in d['edges']:graph[P(e['from'])].add(P(e['to']))
for col in d['columns']:
 x,z,lo,hi=[col[k]for k in('x','z','bottom','output_y')];assert(hi-lo)%4==1
 for y in range(lo,hi):assert world[(x,y,z)]['id']=='minecraft:'+('light_gray_concrete'if(y-lo)%2==0 else'redstone_torch')
 graph[(x,lo,z)].add((x,hi,z))
def check(c):
 i=int(c['source_instance'][-1]);assert i in(0,1)and c['destination_bit']==i and c['source_bit']==0
 s=(-298,1,-1382-1520*i);t=[(-552,-26,1017),(-555,-26,1015)][i]
 assert P(c['source'])==s and P(c['destination'])==t
 assert c['source_port']=='front.program_valid'and c['destination_port']=='program.read_valid'
 assert base[s]['id']==base[t]['id']=='minecraft:redstone_wire'
 old=A(s,(-1,0,0));assert base[old]['id']=='minecraft:repeater'and D[base[old]['properties']['facing']]==(1,0,0)
 tap=A(s,(0,0,-1));assert new[tap]['id']=='minecraft:repeater'and D[new[tap]['properties']['facing']]==(0,0,-1)
 inj=c['recipient_injection'];assert P(inj['bottom'])==A(t,(0,-5,0))and P(inj['old_support'])==A(t,(0,-1,0))and P(inj['output'])==t
 r=P(c['normalizer']);assert new[r]['id']=='minecraft:repeater'and A(r,D[new[r]['properties']['facing']])==P(inj['bottom'])
 assert base[P(inj['old_support'])]['id']=='minecraft:light_gray_concrete'
 for dy,kind in[(-5,'light_gray_concrete'),(-4,'redstone_torch'),(-3,'light_gray_concrete'),(-2,'redstone_torch')]:assert new[A(t,(0,dy,0))]['id']=='minecraft:'+kind
 seen={s};q=deque([s])
 while q:
  for p in graph[q.popleft()]:
   if p not in seen:seen.add(p);q.append(p)
 assert t in seen and set([(-552,-26,1017),(-555,-26,1015)])&seen=={t}
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
for mutate in[lambda c:c.update(destination_bit=1),lambda c:c['recipient_injection']['bottom'].update(y=-30),lambda c:c['source'].update(z=-2902)]:
 c=json.loads(json.dumps(d['connections'][0]));mutate(c)
 try:check(c)
 except(AssertionError,KeyError):neg+=1
 else:raise AssertionError('Corrupt VALID path accepted')
for name in['checks.json','power-checks.json','all-parent-checks.json']:
 r=read(H/name);assert (r.get('design_sha256')or r.get('source',{}).get('design'))==sha(H/'design.json')
r={'status':'independently_cleared_offline','manifest_sha256':sha(H/'source-manifest.json'),'source_sha256':m['files'],'checker_sha256':sha(H/'check-independent.py'),'source_pins_verified':len(m['files']),'actual_consumer_mappings':2,'fresh_source_diodes':2,'positive_underpad_injections':2,'complete_directed_paths':2,'new_parent_diodes_with_solid_rear':new_rears,'negative_refusals':neg,'scope':'Bounded actual source/consumer identity, diode orientation and positive underpad/path review, binding author full-map electrical evidence.','limitations':['Does not establish VALID versus ADDRESS setup, memory owner capture, pulse transport or asynchronous timing.','READY/DATA/drain and complete program-channel acceptance remain pending.'],'native_acceptance':False,'native_calls':0}
(H/'independent-review.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items()if k!='source_sha256'}))
