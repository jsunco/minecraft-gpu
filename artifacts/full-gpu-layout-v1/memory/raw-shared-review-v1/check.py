"""Independent bounded endpoint, body-copy and polarity review; offline only.

The authored edge graph is independently checked against actual blocks before
using it for parity. This is not a fresh full effective-input/event audit.
"""
from pathlib import Path
from collections import defaultdict, deque
import hashlib, json

H=Path(__file__).resolve().parent; ROOT=H.parents[3]; B=H.parent.parent
F=H.parent/'fabric-colocation-v2'
P=lambda p:tuple(p[a] for a in 'xyz')
A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
W='minecraft:redstone_wire'; R='minecraft:repeater'; C='minecraft:comparator'
T='minecraft:redstone_torch'; WT='minecraft:redstone_wall_torch'
DOWN=(0,-1,0);UP=(0,1,0)
sources={}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for v in iter(lambda:f.read(8*1024*1024),b''):h.update(v)
 return h.hexdigest()
def pin(p,expected=None):
 value=sha(p)
 if expected:assert value==expected,(str(p),value,expected)
 sources[str(p.relative_to(ROOT))]=value
 return value
def read(p):return json.loads(p.read_text())
def solid(b):return b is not None and b['id'].endswith('_concrete')
def travel(b):return TR[b['properties']['facing']]

manifest=read(F/'raw-shared-source-manifest.json')
pin(F/'raw-shared-source-manifest.json','689be52c74dfbb3135096163dba135ad8eb32561761343a6d8ae0e44a8f74062')
for p,h in manifest['source_sha256'].items():pin(ROOT/p,h)
d=read(F/'raw-shared-design.json'); base=read(F/'direct-bodies.json')
raw=read(B/'memory/channel-payload-v1/design.json')
world={P(v['position']):v['block'] for v in d['blocks']}
assert len(world)==len(d['blocks'])==406076
oldbody={}
for v in base['blocks']:
 p=P(v['position']);p=A(p,(0,0,-120)) if v['part'].startswith('owner_valid_') else p
 assert p not in oldbody;oldbody[p]=v['block'];assert world[p]==v['block']
rawshift=(40,-76,-20);rawcount=0
for v in raw['blocks']:
 p=P(v['position'])
 if raw['groups'].get(','.join(map(str,p)))!='raw_request_selectors':continue
 q=A(p,rawshift);assert q not in oldbody;oldbody[q]=v['block'];rawcount+=1
 assert world[q]==v['block']
assert (len(oldbody),rawcount)==(176508,10032)

oldbind={(v['channel'],v['consumer'],v['field']):v for v in raw['bindings']}
offsets={v['name']:P(v['offset']) for v in d['modules']}
expectedkeys={(c,i,f) for c in range(4) for i in range(8) for f in range(17)}
def binding_check(bindings,w):
 assert len(bindings)==544
 seen=set()
 for v in bindings:
  k=(v['channel'],v['consumer'],v['field']);assert k not in seen;seen.add(k)
  parent=oldbind[k]
  assert P(v['source'])==A(P(parent['source']),rawshift)
  assert P(v['destination'])==A(P(parent['destination']),offsets['owner_payload_'+str(k[0])])
  source=P(v['source']);dest=P(v['destination']);normal=P(v['normalizer']);support=P(v['supportDrive'])
  assert w[source]['id']==R and travel(w[source])==(-1,0,0)
  assert w[dest]['id']==W and support==A(dest,DOWN) and solid(w[support])
  assert w[normal]['id']==R and A(normal,travel(w[normal]))==support
  assert int(w[normal]['properties']['delay'])==1
 assert seen==expectedkeys
binding_check(d['bindings'],world)

def strong(w,s,q):
 b=w[s]
 return (b['id'] in (R,C) and A(s,travel(b))==q) or (b['id'] in (T,WT) and A(s,UP)==q)
def edge_ok(w,s,t):
 a=w.get(s);b=w.get(t)
 if not a or not b:return False
 if b['id']==T:
  support=A(t,DOWN)
  return solid(w.get(support)) and strong(w,s,support)
 if b['id']==WT:return False # None of the new fanout edges should need this case.
 if b['id'] in (R,C):
  rear=A(t,tuple(-x for x in travel(b)))
  if s==rear:
   return a['id']==W or (a['id'] in (R,C) and A(s,travel(a))==t)
  return solid(w.get(rear)) and strong(w,s,rear)
 if b['id']==W:
  if a['id']==W:
   dx,dy,dz=(t[i]-s[i] for i in range(3))
   if abs(dx)+abs(dz)!=1 or abs(dy)>1:return False
   if dy==0:return True
   low=s if s[1]<t[1] else t;high=t if s[1]<t[1] else s
   return solid(w.get(A(high,DOWN))) and not solid(w.get(A(low,UP)))
  if a['id'] in (R,C):
   front=A(s,travel(a))
   if front==t:return True
   return solid(w.get(front)) and sum(abs(front[i]-t[i]) for i in range(3))==1
  if a['id'] in (T,WT):return sum(abs(s[i]-t[i]) for i in range(3))==1
 return False

graph=defaultdict(list)
for e in d['edges']:
 s,t=P(e['from']),P(e['to']);assert edge_ok(world,s,t),(s,t,world.get(s),world.get(t))
 graph[s].append(t)
source_targets=defaultdict(set);dest_owner={}
for v in d['bindings']:
 s,t=P(v['source']),P(v['destination']);source_targets[s].add(t);dest_owner[t]=s
assert len(source_targets)==136 and len(dest_owner)==544
parity=[]
for source,targets in source_targets.items():
 seen={(source,0)};q=deque([(source,0)])
 while q:
  p,bit=q.popleft()
  for t in graph[p]:
   nxt=(t,bit ^ (world[t]['id'] in (T,WT)))
   if nxt not in seen:seen.add(nxt);q.append(nxt)
 reached={p for p,b in seen if p in dest_owner}
 assert reached==targets,(source,reached,targets)
 for t in targets:assert (t,0) in seen and (t,1) not in seen,(source,t)
 parity.append({'source':source,'matching_destinations':len(targets),'visited_polarity_states':len(seen),'output_inversion':False})

columns=[]
for c in d['columns']:
 lo=P(c['base']);hi=P(c['top']);assert hi[0]==lo[0] and hi[2]==lo[2] and hi[1]-lo[1]==212
 for n in range(213):
  p=A(lo,(0,n,0));assert world[p]['id']==T if n%2 else solid(world[p])
 # Lower/upper channel taps take the output of the 18th and 106th inverters.
 for n in (35,211):assert world[A(lo,(0,n,0))]['id']==T and ((n+1)//2)%2==0
 columns.append({'base':lo,'torch_count':106,'tap_inversions':[18,106]})
assert len(columns)==272

negative=[]
def refuse(label,fn):
 try:fn()
 except (AssertionError,KeyError):negative.append(label);return
 raise AssertionError('Mutation was not refused: '+label)
v=d['bindings'][0];normal=P(v['normalizer']);wrong=dict(world)
wrong[normal]={'id':R,'properties':{'facing':'north','delay':'1'}}
refuse('reversed_terminal_normalizer',lambda:binding_check(d['bindings'],wrong))
changed=[dict(v) for v in d['bindings']];changed[0]['consumer']=1
refuse('consumer_binding_swap',lambda:binding_check(changed,world))
lo=P(d['columns'][0]['base']);torch=A(lo,(0,1,0));wrong=dict(world);wrong[torch]={'id':W}
# A replacement wire can still receive the preceding diode's strong-solid
# signal. It cannot provide the original torch's upward strong power to the
# next inverter. Check that outgoing edge, not the still-valid arrival edge.
sample=next((P(e['from']),P(e['to'])) for e in d['edges'] if P(e['from'])==torch)
refuse('first_torch_replaced_with_dust',lambda:(_ for _ in ()).throw(AssertionError()) if not edge_ok(wrong,*sample) else None)
mins={a:min(p[i] for p in world) for i,a in enumerate('xyz')};maxs={a:max(p[i] for p in world) for i,a in enumerate('xyz')}
assert [-64-mins['y'],319-maxs['y']]==[14,18]
pin(Path(__file__).resolve())
result={'status':'independent_bounded_source_terminal_parity_review_pass','cells':len(world),'preserved_body_cells':len(oldbody),'raw_selector_cells':rawcount,'sources':136,'destinations':544,'authored_edges_checked_against_actual_blocks':len(d['edges']),'positive_columns':272,'column_tap_inversions':[18,106],'negative_cases':negative,'legal_y_translation':[14,18],'source_sha256':sources,'limits':['Checks actual copied selector/body cells, parent-bound consumer/field/channel identities, terminal strong-solid drivers, each authored fanout edge and endpoint polarity.','The full no-extra-input and graph completeness claims remain the separate author check; this bounded review does not independently rediscover every possible edge.','No torch event, burnout, settling, raw-valid/ownership/claim/bank/tail/reset closure or complete fabric acceptance.64 local cables remain absent in this exact snapshot.'],'complete_fabric':False,'native_acceptance':False,'world_mutations':0}
(H/'independent-review.json').write_text(json.dumps(result,indent=2)+'\n')
(H/'polarity-witnesses.json').write_text(json.dumps({'sources':parity,'columns':columns},indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('source_sha256','limits')}))
