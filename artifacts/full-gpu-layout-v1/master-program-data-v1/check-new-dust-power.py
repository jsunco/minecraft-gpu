"""Independent strong-source -> solid -> NEW dust audit. No native operations."""
import json,hashlib
from pathlib import Path
from collections import Counter
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
DIRS=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)]
TRAVEL={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
W='minecraft:redstone_wire';T={'minecraft:redstone_torch','minecraft:redstone_wall_torch'};DI={'minecraft:repeater','minecraft:comparator'}
def P(p):return tuple(p[a]for a in'xyz')
def A(p,v):return tuple(a+b for a,b in zip(p,v))
def read(p):return json.loads(Path(p).read_text())
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
def solid(b):return b.get('id','').endswith('_concrete')
def direct_sources(world,q):
 out=[]
 for v in DIRS:
  p=A(q,v);b=world.get(p,{});bid=b.get('id')
  if bid in DI and A(p,TRAVEL[b['properties']['facing']])==q:out.append(p)
  elif bid in T and v==(0,-1,0):out.append(p)
 # Wire sources intentionally omitted: receiver wire.getBlockSignal suppresses them.
 return out
def paths(world,wires):
 out=set();solids=set();unsupported=Counter()
 for p in wires:
  for v in DIRS:
   q=A(p,v)
   if not solid(world.get(q,{})):continue
   solids.add(q)
   for src in direct_sources(world,q):out.add((src,q,p))
 for q in solids:
  for v in DIRS:
   bid=world.get(A(q,v),{}).get('id')
   if bid and bid not in {W,*T,*DI,'minecraft:light_gray_concrete','minecraft:redstone_block'}:unsupported[bid]+=1
 return out,len(solids),dict(unsupported)
def fixture_checks():
 tests=0
 for face in DIRS:
  q=(0,0,0);wire=face;src=(0,0,-1)if face!=(0,0,-1)else(1,0,0);facing='north'if src==(0,0,-1)else'east'
  world={q:{'id':'minecraft:light_gray_concrete'},src:{'id':'minecraft:repeater','properties':{'facing':facing}},wire:{'id':W}}
  got,_,unknown=paths(world,{wire});assert got=={(src,q,wire)}and not unknown;tests+=1
 q=(0,0,0);w=(0,1,0);src=(0,-1,0)
 for kind in T:
  got,_,_=paths({q:{'id':'minecraft:light_gray_concrete'},src:{'id':kind},w:{'id':W}},{w});assert got=={(src,q,w)};tests+=1
 got,_,_=paths({q:{'id':'minecraft:light_gray_concrete'},(1,0,0):{'id':W},w:{'id':W}},{w});assert not got;tests+=1
 # A wrong-facing diode is not a source of the solid it points away from.
 got,_,_=paths({q:{'id':'minecraft:light_gray_concrete'},(-1,0,0):{'id':'minecraft:repeater','properties':{'facing':'east'}},w:{'id':W}},{w});assert not got;tests+=1
 # PoweredBlock emits weak ownSignal 15 but inherits directSignal=0.
 got,_,unknown=paths({q:{'id':'minecraft:light_gray_concrete'},(1,0,0):{'id':'minecraft:redstone_block'},w:{'id':W}},{w});assert not got and not unknown;tests+=1
 return tests

assert fixture_checks()==11
d=read(H/'design.json');o=read(d['obstacle_path']);base={(x,y,z):o['palette'][p]for x,y,z,p,i in o['cells']};added={P(v['position']):v['block']for v in d['blocks']};world=base|added;wires={p for p,b in added.items()if b['id']==W};got,nsolids,unknown=paths(world,wires);expected=set()
for c in d['columns']:
 x,z,y=c['x'],c['z'],c['output_y'];p=(x,y,z)
 if p in wires:expected.add(((x,y-2,z),(x,y-1,z),p))
assert not unknown,unknown
assert got==expected,('Unexpected new dust power paths',list(got-expected)[:25],'Missing',list(expected-got)[:25])
out={'status':'new_data_dust_support_power_paths_checked','new_dust_cells':len(wires),'adjacent_solids':nsolids,'actual_paths':len(got),'expected_column_paths':len(expected),'unexpected_paths':0,'fixture_checks':11,'design_sha256':sha(H/'design.json'),'power_rule_source_sha256':sha(ROOT/'artifacts/full-gpu-layout-v1/master-route-power-audit-v1/audit.py'),'native_acceptance':False,'world_mutations':0,'limits':['Every six-face solid neighbor of NEW dust, strong diode/torch sources. No event simulation or physical result.']}
(H/'new-dust-power-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
