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
   if bid and bid not in {W,*T,*DI,'minecraft:light_gray_concrete'}:unsupported[bid]+=1
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
 return tests
assert fixture_checks()==10
frame=ROOT/'artifacts/full-gpu-layout-v1/floorplan-v3';manifest=read(frame/'source-manifest.json');assert sha(frame/'source-manifest.json')=='a5765a161bdcdc12a766f4dce8bc8309f2ad0c22859a2fcac8157b7f69367602'
for p,h in manifest['files'].items():assert sha(ROOT/p)==h,p
composition=read(frame/'composition-checks.json');assert composition['three_cell_neighborhoods_unchanged']and composition['actual_sparse_collisions']==0
assert all(r['near_previous_delta_pairs']==0 for r in composition['cross_delta_checks'])
config=read(frame/'frame-config.json');reports=[]
for name,c in config['route_deltas'].items():
 d=read(ROOT/c['path']);o=read(d['obstacle_path']);base={(x,y,z):o['palette'][p]for x,y,z,p,i in o['cells']};added={P(r['position']):r['block']for r in d['blocks']};part={P(r['position']):r['part']for r in d['blocks']};world=base|added;wires={p for p,b in added.items()if b['id']==W}
 got,nsolids,unsupported=paths(world,wires);expected=set()
 for col in d['columns']:
  x,z,y=col['x'],col['z'],col['output_y'];p=(x,y,z)
  if p in wires:expected.add(((x,y-2,z),(x,y-1,z),p))
 unexpected=got-expected;missing=expected-got
 def detail(path):
  src,q,p=path;return{'source':src,'source_id':world[src]['id'],'source_part':part.get(src,'parent'),'solid':q,'solid_part':part.get(q,'parent'),'new_dust':p,'dust_part':part[p]}
 reports.append({'delta':name,'design_sha256':sha(ROOT/c['path']),'new_dust_cells':len(wires),'adjacent_solid_cells':nsolids,'all_strong_paths_to_new_dust':len(got),'expected_column_top_paths':len(expected),'unexpected_paths':list(map(detail,sorted(unexpected))),'missing_paths':list(map(detail,sorted(missing))),'unmodeled_neighbor_types':unsupported,'every_path':list(map(detail,sorted(got)))})
 print(json.dumps({k:v for k,v in reports[-1].items()if k!='every_path'}),flush=True)
failed=any(r['unexpected_paths']or r['missing_paths']or r['unmodeled_neighbor_types']for r in reports)
out={'status':'new_dust_strong_power_paths_refused'if failed else'new_dust_strong_power_paths_checked','frame_manifest_sha256':sha(frame/'source-manifest.json'),'source_pins_verified':len(manifest['files']),'audit_sha256':sha(H/'audit.py'),'source_rules':{p:sha(ROOT/p)for p in ['artifacts/byte-operand-routing-v1/review-evidence/RedstoneWireBlock.javap.txt','artifacts/full-gpu-layout-v1/register-sequencer-v1/data-selector/review-evidence/RedstoneTorchBlock.javap.txt']},'fixture_checks':10,'reports':reports,'native_acceptance':False,'native_calls':0,'scope':['Every six-face solid neighbor of every new dust cell; strong diode arrivals and upward torch sources include parent and new sources.','All intermediate new column solids are included whenever they have a new-dust recipient.','Wire through solid is excluded according to pinned26.3 wire source suppression; unsupported source-like neighbor types refuse rather than pass.','Exact old route neighborhoods are preserved in frame3; cross-delta distance>3 excludes unseen other-delta sources.']}
(H/'audit.json').write_text(json.dumps(out,indent=2)+'\n')
raise SystemExit(2 if failed else 0)
