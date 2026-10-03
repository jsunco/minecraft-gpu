"""Bounded independent bit/endpoint/polarity review. Pure files, no services."""
import json, hashlib
from pathlib import Path
from collections import defaultdict, deque
H=Path(__file__).resolve().parent
ROOT=H.parents[2]
def read(p): return json.loads(Path(p).read_text())
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
def P(p):return tuple(p[k]for k in 'xyz')
def A(p,q):return tuple(a+b for a,b in zip(p,q))
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
m=read(H/'source-manifest.json')
assert sha(H/'source-manifest.json')=='680a387ce70518f5002844c65b8d6ee58f3792e8e40e8fc9b90155a21d2d8844'
for p,h in m['files'].items(): assert sha(ROOT/p)==h,p
d=read(H/'design.json');f=read(d['obstacle_path'])
base={(x,y,z):f['palette'][s]for x,y,z,s,i in f['cells']}
added={P(r['position']):r['block']for r in d['blocks']}
assert len(added)==154616 and not base.keys()&added.keys()
world=base|added
frame=read(ROOT/'artifacts/full-gpu-layout-v1/floorplan-v2/placement.json')
src=frame['components']['core']['ports']['front']['program_address']['bits']
dst=frame['components']['loader']['ports']['program']['read_address']['bits']
graph=defaultdict(set)
for e in d['edges']:graph[P(e['from'])].add(P(e['to']))
for col in d['columns']:
 x,z,lo,hi=[col[k]for k in ('x','z','bottom','output_y')]
 assert (hi-lo)%4==1
 for y in range(lo,hi):
  assert world[(x,y,z)]['id']=='minecraft:'+('light_gray_concrete'if(y-lo)%2==0 else'redstone_torch')
 assert world[(x,hi,z)]['id']=='minecraft:redstone_wire'
 graph[(x,lo,z)].add((x,hi,z))
def check(c):
 core=int(c['source_instance'][-1]);bit=c['source_bit'];assert core in(0,1)and bit in range(8)
 assert c['destination_instance']=='loader' and c['source_port']=='front.program_address' and c['destination_port']=='program.read_address'
 assert c['destination_bit']==8*core+bit
 s=A(P(src[bit]['position']),(-400,0,-1552-1520*core));t=P(dst[8*core+bit]['position'])
 assert P(c['source'])==s and P(c['destination'])==t
 assert base[s]['id']==base[t]['id']=='minecraft:redstone_wire'
 driver=A(P(src[bit]['source']),(-400,0,-1552-1520*core))
 assert base[driver]['id']=='minecraft:repeater' and A(driver,D[base[driver]['properties']['facing']])==s
 tap=A(s,(1,0,0));assert added[tap]['id']=='minecraft:repeater' and D[added[tap]['properties']['facing']]==(1,0,0)
 r=P(c['normalizer']);assert added[r]['id']=='minecraft:repeater' and A(r,D[added[r]['properties']['facing']])==t
 assert r==A(t,(0,0,-1))
 seen={s};q=deque([s])
 while q:
  for n in graph[q.popleft()]:
   if n not in seen:seen.add(n);q.append(n)
 assert t in seen
 assert {P(x['position'])for x in dst}&seen=={t},'Cross-bit destination'
 return (core,bit)
assert {check(c)for c in d['connections']}=={(c,b)for c in range(2)for b in range(8)}
negative=0
for key,value in [('source_bit',7),('destination_bit',15),('destination',{'x':-528,'y':7,'z':1022}),('normalizer',{'x':-536,'y':7,'z':1023})]:
 c=json.loads(json.dumps(next(c for c in d['connections']if c['source_bit']==0 and c['source_instance']=='core0')));c[key]=value
 try:check(c)
 except(AssertionError,KeyError):negative+=1
 else:raise AssertionError('Corrupt bit/port accepted')
for n in ['checks.json','power-checks.json','all-parent-checks.json']:
 r=read(H/n);assert (r.get('design_sha256')or r.get('source',{}).get('design'))==sha(H/'design.json')
a=read(H/'all-parent-checks.json');assert a['parent_cells']==5656163 and a['slice_cells_matched']==1287511 and a['parent_delta_collisions']==0
r={'status':'independent_program_address_bit_endpoint_review_pass','source_manifest_sha256':sha(H/'source-manifest.json'),'source_pins_verified':len(m['files']),'mapped_bits':16,'actual_source_diodes':16,'actual_fresh_source_taps':16,'actual_destination_normalizers':16,'positive_directed_paths':16,'negative_refusals':negative,'source_sha256':m['files'],'native_acceptance':False,'scope':'Exact bit/consumer mapping, actual source/normalizer directions, positive declared routes and bound author full-map evidence. No runtime or timing clearance.'}
(H/'independent-checks.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:v for k,v in r.items()if k!='source_sha256'}))
