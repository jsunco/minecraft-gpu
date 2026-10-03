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
  if m.get(q,{}).get('id')==k or k==T and m.get(q,{}).get('id')==WT:out.add(q)
 return out

d=load(H/'design.json');obs=load(Path(d['obstacle_path']));base={(x,y,z):obs['palette'][p]for x,y,z,p,i in obs['cells']};m=base|{P(v['position']):v['block']for v in d['blocks']};new=set(m)-set(base);torch=rear=0
for p,b in base.items():
 if b['id']in(T,WT):
  q=A(p,(0,-1,0))if b['id']==T else A(p,D[b['properties']['facing']]);assert sources(m,q)==sources(base,q),('torch support changed',p,sources(m,q)-sources(base,q));torch+=1
 if b['id']in DI:
  q=A(p,N(D[b['properties']['facing']]))
  if solid(m.get(q,{})):
   assert solid(base.get(q,{})),('new solid at parent diode rear',p,q)
   assert sources(m,q)==sources(base,q),('solid rear changed',p);rear+=1
# Exact upper adapters: old reset wire below the rear solid is not a
# downward direct source. Only the new wire above may drive the diode rear.
upper=[]
for c in d['connections']:
 if c.get('arrival_kind')!='upper_solid_adapter':continue
 rear_pos=P(c['rear_solid']);out=P(c['injection_support']);diode=P(c['normalizer']);inp=P(c['input_wire']);target=P(c['destination'])
 assert sources(m,rear_pos)=={inp},('upper diode rear has unrelated source',c['name'],sources(m,rear_pos))
 assert sources(m,out)=={diode},('upper output has unrelated source',c['name'],sources(m,out))
 assert P(c['input_wire'])==A(rear_pos,(0,1,0))
 assert A(diode,D[m[diode]['properties']['facing']])==out
 assert A(out,(0,-1,0))==target
 upper.append({'name':c['name'],'rear':rear_pos,'only_rear_source':inp,'output':out,'only_output_source':diode,'target':target})
for c in d['connections']:
 if c.get('arrival_kind')!='positive_torch_underpad':continue
 bottom=P(c['injection_bottom']);diode=P(c['normalizer']);target=P(c['destination']);old_support=P(c['injection_support'])
 assert sources(m,bottom)=={diode}
 assert sources(m,A(bottom,(0,2,0)))=={A(bottom,(0,1,0))}
 assert sources(m,old_support)=={A(bottom,(0,3,0)),target}
paths=[]
for p,b in m.items():
 if not solid(b):continue
 for src in sources(m,p):
  if m[src]['id']==W:continue
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if q in base and base[q]['id']==W and(src in new or p in new):paths.append((src,p,q))
allowed={(P(s['source']),P(s['position']),P(s['destination']))for s in d.get('borrowed_supports',[])}
assert set(paths)==allowed,('unexpected/missing underpad injection',set(paths)-allowed,allowed-set(paths))
for c in d['columns']:
 x,z,lo,hi=(c[k]for k in['x','z','bottom','output_y'])
 for y in range(lo,hi,2):
  q=(x,y,z);ss=sources(m,q);expected={(x,y-1,z)}if y>lo else set()
  if y==lo:
   incoming=[src for src in ss if m[src]['id']in DI];assert len(incoming)==1,(c['name'],q,ss);expected.update(incoming)
  if y==hi-1:expected.add((x,hi,z))
  assert ss==expected,('column',c['name'],q,ss,expected)
new_wire_paths=set()
for q,b in m.items():
 if not solid(b):continue
 for src in sources(m,q):
  if m[src]['id']==W:continue
  for v in dirs+[(0,1,0),(0,-1,0)]:
   w=A(q,v)
   if w in new and m[w]['id']==W:new_wire_paths.add((src,q,w))
expected_new={((c['x'],c['output_y']-2,c['z']),(c['x'],c['output_y']-1,c['z']),(c['x'],c['output_y'],c['z']))for c in d['columns']}
assert new_wire_paths==expected_new,('unexpected strong source into NEW dust',new_wire_paths-expected_new,expected_new-new_wire_paths)
# Small directional counterexamples for the uncommon wire/solid/diode rear.
fixtures=0
for c in d['connections']:
 if c.get('arrival_kind')!='upper_solid_adapter':continue
 rp=P(c['rear_solid']);ip=P(c['input_wire']);di=P(c['normalizer']);op=P(c['injection_support'])
 fixture={rp:{'id':S},ip:{'id':W},A(rp,(0,-1,0)):{'id':W}}
 assert sources(fixture,rp)=={ip};fixtures+=1
 intruder=A(rp,(1,0,0));fixture[intruder]={'id':'minecraft:repeater','properties':{'facing':'east'}}
 assert sources(fixture,rp)!={ip};fixtures+=1
 fixture.pop(intruder);fixture.pop(ip)
 assert sources(fixture,rp)==set();fixtures+=1
r={'status':'master_LSU_shared_address_parent_power_isolation_screen_pass','parent_torch_source_sets':torch,'parent_solid_rears':rear,'new_strong_solid_to_parent_paths':len(paths),'all_six_face_strong_paths_to_new_dust':len(new_wire_paths),'all_new_dust_paths_are_named_column_tops':True,'exact_declared_strong_solid_injections':list(allowed),'new_column_source_sets':sum((c['output_y']-c['bottom']+1)//2 for c in d['columns']),'upper_adapter_source_sets':upper,'upper_adapter_directional_fixtures':fixtures,'design_sha256':hashlib.sha256((H/'design.json').read_bytes()).hexdigest(),'native_acceptance':False,'world_mutations':0,'limits':['Exact local source-set screen on verified complete route-neighborhood slice, not Minecraft scheduling.']}
(H/'power-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
