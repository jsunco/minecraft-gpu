import json, hashlib
from pathlib import Path
H=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text())
P=lambda p:tuple(p[a]for a in'xyz');A=lambda p,q:tuple(a+b for a,b in zip(p,q));N=lambda p:tuple(-a for a in p)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());W='minecraft:redstone_wire';S='minecraft:light_gray_concrete';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';DI={'minecraft:repeater','minecraft:comparator'}
def solid(b):return b.get('id','').endswith('_concrete')
def sources(m,p):
 out=set()
 for v in dirs:
  q=A(p,N(v));b=m.get(q,{})
  if b.get('id')==W or b.get('id')in DI and D[b['properties']['facing']]==v:out.add(q)
 for v,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,v)
  if m.get(q,{}).get('id')==k:out.add(q)
 return out

d=load(H/'design.json');obs=load(Path(d['obstacle_path']));base={(x,y,z):obs['palette'][p]for x,y,z,p,i in obs['cells']};m=base|{P(v['position']):v['block']for v in d['blocks']};new=set(m)-set(base);torch=rear=0
for p,b in base.items():
 if b['id']in(T,WT):
  q=A(p,(0,-1,0))if b['id']==T else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q),('torch support changed',p,sources(m,q)-sources(base,q));torch+=1
 if b['id']in DI:
  q=A(p,N(D[b['properties']['facing']]))
  if solid(base.get(q,{})):assert sources(m,q)==sources(base,q),('solid rear changed',p);rear+=1
paths=[]
for p,b in m.items():
 if not solid(b):continue
 for src in sources(m,p):
  if m[src]['id']==W:continue
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if q in base and base[q]['id']==W and(src in new or p in new):paths.append((src,p,q))
assert not paths,paths[:12]
for c in d['columns']:
 x,z,lo,hi=(c[k]for k in['x','z','bottom','output_y'])
 for y in range(lo,hi,2):
  q=(x,y,z);ss=sources(m,q);expected={(x,y-1,z)}if y>lo else set()
  if y==lo:
   incoming=[src for src in ss if m[src]['id']in DI];assert len(incoming)==1,(c['name'],q,ss);expected.update(incoming)
  if y==hi-1:expected.add((x,hi,z))
  assert ss==expected,('column',c['name'],q,ss,expected)
r={'status':'master_control_parent_power_isolation_screen_pass','parent_torch_source_sets':torch,'parent_solid_rears':rear,'new_strong_solid_to_parent_paths':0,'new_column_source_sets':sum((c['output_y']-c['bottom']+1)//2 for c in d['columns']),'design_sha256':hashlib.sha256((H/'design.json').read_bytes()).hexdigest(),'native_acceptance':False,'world_mutations':0,'limits':['Exact local source-set screen on verified complete route-neighborhood slice, not Minecraft scheduling.']}
(H/'power-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
