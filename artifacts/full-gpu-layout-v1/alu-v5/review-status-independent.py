"""Root review of the repaired junctions only, not full ALU/native clearance."""
import json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((HERE/'source-manifest.json').read_text())
for p,h in manifest['source_sha256'].items():
 assert sha(ROOT/p)==h,('Frozen source drift',p)
d=json.loads((HERE/'design.json').read_text());parent=json.loads((HERE.parent/'alu-v3/design.json').read_text())
key=lambda p:tuple(p[a] for a in ('x','y','z'))
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
add=lambda a,b:tuple(x+y for x,y in zip(a,b))
targets={
 (30,38,-36):{'drivers':{(30,38,-37)},'wires':{(30,37,-36)}},
 (-1,38,-38):{'drivers':{(0,38,-38),(-2,38,-38)},'wires':{(-1,37,-38)}},
 (15,38,-38):{'drivers':{(16,38,-38)},'wires':{(15,37,-38),(15,39,-38)}},
}
def check(data):
 m={key(v['position']):v['block'] for v in data['blocks']}
 for v in parent['blocks']:assert m.get(key(v['position']))==v['block'],('Changed v3',v['position'])
 contacts=0
 for solid,claim in targets.items():
  assert m[solid]['id']=='minecraft:light_gray_concrete'
  actual=set()
  for p,b in m.items():
   if sum(abs(a-b) for a,b in zip(p,solid))!=1:continue
   if b['id'] in ('minecraft:repeater','minecraft:comparator') and add(p,D[b['properties']['facing']])==solid:actual.add(p)
   if b['id'] in ('minecraft:redstone_torch','minecraft:redstone_wall_torch') and add(p,(0,1,0))==solid:actual.add(p)
  # Intentionally no wire source: installed getBlockSignal suppresses shouldSignal.
  assert actual==claim['drivers'],('Wrong effective source set',solid,actual)
  for q in claim['wires']:assert m[q]['id']=='minecraft:redstone_wire';contacts+=1
  for p in actual:assert m[p]['id']=='minecraft:repeater';assert m[add(p,(0,-1,0))]['id']=='minecraft:light_gray_concrete'
 assert m.get((31,38,-38),{}).get('id')=='minecraft:light_gray_concrete', 'Missing dust-shape isolation cap'
 assert m[(30,38,-38)]['id']=='minecraft:redstone_wire'
 assert m[(7,39,-38)]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}},'Busy/ready isolation reversed'
 return contacts
contacts=check(d);negatives=0
for pos in [(30,38,-37),(0,38,-38),(-2,38,-38),(16,38,-38)]:
 c=json.loads(json.dumps(d));next(v for v in c['blocks'] if key(v['position'])==pos)['block']={'id':'minecraft:redstone_wire'}
 try:check(c)
 except AssertionError:negatives+=1
 else:raise AssertionError(('Accepted dust-only junction driver',pos))
c=json.loads(json.dumps(d));c['blocks']=[v for v in c['blocks'] if key(v['position'])!=(31,38,-38)]
try:check(c)
except AssertionError:negatives+=1
else:raise AssertionError('Accepted missing cap')
r={'status':'independent_v5_status_junction_repair_review_pass','manifest_sha256':sha(HERE/'source-manifest.json'),'source_pins':len(manifest['source_sha256']),'blocks':len(d['blocks']),'unchanged_v3_cells':len(parent['blocks']),'exact_non_wire_source_sets':3,'real_diode_drivers':4,'solid_to_wire_destinations':contacts,'corruptions_refused':negatives,'reviewer_sha256':sha(Path(__file__)),'native_calls':0,'native_acceptance':False,'complete_gpu_layout':False,'scope':['Bounded independent repair review only: four directional repeater sources, three exact solid-source sets, four dust recipients, v3 preservation and the shape/isolation safeguards.','Uses pinned installed-game signal rule; does not independently reprove the entire ALU or the full authored contact checker.','Shared controller, phase/enable/fault fanout, operating timing and native behavior remain unaccepted.']}
(HERE/'independent-status-review.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
