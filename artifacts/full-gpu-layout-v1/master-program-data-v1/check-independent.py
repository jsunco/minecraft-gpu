"""Independent bounded DATA source, bit identity and complete declared-path review."""
import json,hashlib
from pathlib import Path
from collections import defaultdict
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
read=lambda p:json.loads(p.read_text())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
P=lambda p:tuple(p[a]for a in'xyz');A=lambda p,v:tuple(a+b for a,b in zip(p,v));D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
manifest=read(H/'source-manifest.json');assert sha(H/'source-manifest.json')=='eed8c2dd343db1c83434cff4bc2b19669eb33a40fbd8d8ad39990d48976e8678'
for p,h in manifest['files'].items():assert sha(ROOT/p)==h,p
d=read(H/'design.json');o=read(Path(d['obstacle_path']));base={(x,y,z):o['palette'][i]for x,y,z,i,j in o['cells']};new={P(r['position']):r['block']for r in d['blocks']};m=base|new
assert len(new)==len(d['blocks'])==231856 and not(set(base)&set(new))
program=read(ROOT/'artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/design.json')['ports']['program']['read_data']['bits']
core=read(ROOT/'artifacts/full-gpu-layout-v1/control-rf-status-v1/design.json')['ports']['front']['program_data']['bits']
S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';T='minecraft:redstone_torch';R='minecraft:repeater'
def block(p,id,face=None):
 assert m[p]['id']==id,(p,id,m[p])
 if face:assert m[p]['properties']['facing']==face,(p,face,m[p])
def sources():
 assert len(d['source_equivalence'])==16
 out=[]
 for b,e in enumerate(d['source_equivalence']):
  s=P(e['common_response_solid']);p0=P(program[b]['position']);p1=P(program[16+b]['position']);assert e['bit']==b and P(e['old_consumer0'])==p0 and P(e['old_consumer1'])==p1
  assert s==(p0[0]-4,p0[1],p0[2]) and p1==(s[0]+2,s[1],s[2]-2)
  block(s,S);block(A(s,(0,-1,0)),T);assert P(e['driver'])==A(s,(0,-1,0))
  # Physical common parent fanout: one East branch and one North branch.
  for off,face in [((1,0,0),'west'),((3,0,0),'west'),((2,0,-1),'south')]:block(A(s,off),R,face)
  for off in[(2,0,0),(4,0,0),(2,0,-2)]:block(A(s,off),W)
  block(A(s,(-1,0,0)),R,'east');block(A(s,(-2,0,0)),W);out.append(s)
 return out
def destinations():
 assert len(d['connections'])==32
 out={}
 for c in d['connections']:
  b=c['source_bit'];i=int(c['destination_instance'][-1]);assert i in[0,1] and 0<=b<16 and c['destination_bit']==b
  p=core[b]['position'];want=(p['x']-400,p['y'],p['z']-[1552,3072][i]);assert P(c['destination'])==want and P(c['source'])==P(d['source_equivalence'][b]['common_response_solid'])
  assert (i,b)not in out;out[(i,b)]=want;block(want,W)
  r=P(c['normalizer']);block(r,R);assert A(r,D[m[r]['properties']['facing']])==P(c['recipient_injection']['bottom'])
  assert P(c['recipient_injection']['output'])==want and P(c['recipient_injection']['old_support'])==A(want,(0,-1,0));block(A(want,(0,-1,0)),S)
 return out
# Independently cover new supports at previously air-backed OLD diode rears.
DI={'minecraft:repeater','minecraft:comparator'};dirs=list(D.values())+[(0,1,0),(0,-1,0)]
old_diodes_checked=0
for q,b in base.items():
 if b['id']in DI:
  rear=A(q,tuple(-v for v in D[b['properties']['facing']]));old_diodes_checked+=1
  assert not(rear in new and new[rear]['id']==S),('new solid at old diode rear',q,rear)
strong_old=set()
for q,b in new.items():
 if b['id']!=S:continue
 incoming=[]
 for v in dirs:
  r=A(q,v);rb=m.get(r,{})
  if rb.get('id')in DI and A(r,D[rb['properties']['facing']])==q:incoming.append(r)
  elif rb.get('id')in{T,'minecraft:redstone_wall_torch'}and v==(0,-1,0):incoming.append(r)
 for r in incoming:
  for v in dirs:
   w=A(q,v)
   if base.get(w,{}).get('id')==W:strong_old.add((r,q,w))
# Recipient final supports are OLD and driven by new torches; include explicitly.
for r,b in new.items():
 if b['id']!=T:continue
 q=A(r,(0,1,0))
 if base.get(q,{}).get('id')!=S:continue
 for v in dirs:
  w=A(q,v)
  if base.get(w,{}).get('id')==W:strong_old.add((r,q,w))
expected_old={(A(P(c['destination']),(0,-2,0)),A(P(c['destination']),(0,-1,0)),P(c['destination']))for c in d['connections']}
assert strong_old==expected_old,('unexpected strong path to old dust',strong_old-expected_old,expected_old-strong_old)
src=sources();dst=destinations();graph=defaultdict(set)
for e in d['edges']:
 a,b=P(e['from']),P(e['to']);assert a in m and b in m;delta=tuple(y-x for x,y in zip(a,b));assert abs(delta[0])+abs(delta[2])==1 and abs(delta[1])<=1,(a,b)
 for p,q,outgoing in[(a,b,True),(b,a,False)]:
  if m[p]['id']==R:assert q==A(p,D[m[p]['properties']['facing']]if outgoing else tuple(-v for v in D[m[p]['properties']['facing']]))
 graph[a].add(b)
for c in d['columns']:
 x,z,lo,hi=(c[k]for k in['x','z','bottom','output_y']);assert(hi-lo)%4==1
 for y in range(lo,hi):block((x,y,z),S if(y-lo)%2==0 else T)
 block((x,hi,z),W);graph[(x,lo,z)].add((x,hi,z))
reaches=[]
for bit,s in enumerate(src):
 seen={s};todo=[s]
 for p in todo:
  for q in graph[p]:
   if q not in seen:seen.add(q);todo.append(q)
 hit={key for key,p in dst.items()if p in seen};assert hit=={(0,bit),(1,bit)},(bit,hit);reaches.append({'bit':bit,'destinations':sorted(hit),'reachable_path_nodes':len(seen)})
# Focused source/mapping/polarity corruptions without changing authored files.
negative=0
for b in[0,7,15]:
 e=d['source_equivalence'][b];old=e['old_consumer1'];e['old_consumer1']=d['source_equivalence'][(b+1)%16]['old_consumer1']
 try:sources();raise RuntimeError('corruption accepted')
 except AssertionError:negative+=1
 finally:e['old_consumer1']=old
for index in[0,15,31]:
 c=d['connections'][index];old=c['destination_bit'];c['destination_bit']=(old+1)%16
 try:destinations();raise RuntimeError('corruption accepted')
 except AssertionError:negative+=1
 finally:c['destination_bit']=old
p=A(src[0],(-1,0,0));old=m[p]['properties']['facing'];m[p]['properties']['facing']='west'
try:sources();raise RuntimeError('corruption accepted')
except AssertionError:negative+=1
finally:m[p]['properties']['facing']=old
out={'status':'independent_shared_DATA_source_and_32_path_review_pass','source_manifest_sha256':sha(H/'source-manifest.json'),'source_pins_verified':len(manifest['files']),'checker_sha256':sha(H/'check-independent.py'),'old_diodes_screened_for_new_rear_solids':old_diodes_checked,'new_rear_solid_intrusions':0,'independent_strong_paths_to_old_dust':len(strong_old),'common_response_sources':len(src),'destinations':len(dst),'directed_geometric_edges':len(d['edges']),'positive_columns':len(d['columns']),'per_bit_reachability':reaches,'negative_refusals':negative,'native_acceptance':False,'limits':['Bounded source/bit/declared-path check; full parent/contact/power reports are inspected and bound, not regenerated here.','Real propagation, independent READY launch, capture setup/hold and response ownership remain unproved.']}
(H/'independent-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='per_bit_reachability'}))
