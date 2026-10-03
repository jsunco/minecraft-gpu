"""Independent source-identity, exact-body and cable-chain review, offline only.

No author build/check script is executed. Off-path effective inputs are covered
by the separately pinned author differential, not rebranded as independent.
"""
from pathlib import Path
from collections import Counter
import json, hashlib

H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
F=B/'core-lane-colocation-v1/lane0-data48-v1'
P=lambda p:tuple(p[a] for a in 'xyz')
A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
HOR=tuple(TR.values());DN=(0,-1,0);UP=(0,1,0)
R='minecraft:repeater';C='minecraft:comparator';W='minecraft:redstone_wire'
pins={}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
def pin(p,expected=None):
 value=sha(p)
 if expected:assert value==expected,(str(p),value,expected)
 pins[str(p.relative_to(ROOT))]=value
def read(p):return json.loads(p.read_text())
def solid(b):return b is not None and b['id'].endswith('_concrete')
def travel(b):return TR[b['properties']['facing']]
def stores(w):
 out={}
 for p,b in w.items():
  if b['id']!=R:continue
  v=travel(b);locks=[]
  for side in HOR:
   if sum(a*b for a,b in zip(v,side)):continue
   q=A(p,side);t=w.get(q)
   if t and t['id'] in (R,C) and A(q,travel(t))==p:locks.append(q)
  if locks:out[p]=sorted(locks)
 return out

pin(F/'source-manifest.json','c28b830e5577784be4de29aca7a5f01b532facae4aa8ce31ae71c5c8ffebc78e')
manifest=read(F/'source-manifest.json')
for p,h in manifest['source_sha256'].items():pin(ROOT/p,h)
d=read(F/'lane0-draft.json');source=read(B/'core-lane-colocation-v1/bodies.json')
inv=read(B/'core-lane-colocation-v1/inventory.json')
w={P(v['position']):v['block'] for v in d['blocks']}
assert len(w)==len(d['blocks'])==113941
transforms={k:P(v) for k,v in d['transforms'].items()}
body={}
for v in source['blocks']:
 if not v['body'].startswith('lane0/'):continue
 p=A(P(v['position']),transforms[v['body'].split('/')[1]])
 assert p not in body;body[p]=v['block'];assert w[p]==v['block']
assert len(body)==89649 and len(w)-len(body)==24292
assert stores(body)==stores(w) and len(stores(w))==231
reference={v['name'].split('/')[1]:P(v['reference_translation']) for v in inv['bodies'] if v['name'].startswith('lane0/')}
offsets={name:A(reference[name],transforms[name]) for name in transforms}
rf=read(B/'register-sequencer-v1/file-address-stage/lane0.json')
alu=read(B/'alu-v5/design.json');lsu=read(B/'control-lsu-v2/design.json');wb=read(B/'writeback/design.json')
aluports={(p['name'],p.get('bit',0)):p for p in alu['ports']}
def port(module,name,bit):
 if module=='alu':v=aluports[name,bit]
 else:v={'rf':rf,'lsu':lsu,'writeback':wb}[module]['ports'][name]['bits'][bit]
 return {k:A(P(p),offsets[module]) for k,p in v.items() if isinstance(p,dict) and set('xyz')<=p.keys()}
expected={}
for operand,lsu_input in [('operand_a','rs'),('operand_b','rt')]:
 for bit in range(8):
  expected[operand+str(bit)]=(port('rf',operand,bit),port('alu',operand,bit),True,'RF_to_ALU')
  expected['lsu_'+lsu_input+str(bit)]=(port('rf',operand,bit),port('lsu',lsu_input,bit),False,'RF_to_LSU')
for bit in range(8):
 expected['alu_writeback'+str(bit)]=(port('alu','result',bit),port('writeback','alu',bit),True,'ALU_to_writeback')
 expected['lsu_writeback'+str(bit)]=(port('lsu','result',bit),port('writeback','lsu',bit),False,'LSU_to_writeback')
assert len(expected)==48
def bindings(connections):
 assert len(connections)==48 and {c['name'] for c in connections}==set(expected)
 for c in connections:
  src,dst,missing,_=expected[c['name']]
  assert P(c['source'])==src['position'] and P(c['destination'])==dst['position'],c['name']
  assert c['was_missing_in_reference']==missing
bindings(d['connections'])

def validate_route(c,world):
 name=c['name'];src,dst,_,family=expected[name]
 nodes=[P(c['source']),P(c['tap'])]+list(map(P,c['path']))+[P(c['arrival']),P(c['destination'])]
 assert len(set(nodes))==len(nodes),(name,'repeated path vertex')
 assert nodes[2]==P(c['start']) and nodes[-3]==P(c['end'])
 driver=src.get('isolator',src.get('driver',src.get('source')))
 assert driver is not None and world[driver]['id']==R and A(driver,travel(world[driver]))==nodes[0]
 assert int(world[driver]['properties']['delay'])>=1
 if 'receiver' in dst:
  receiver=dst['receiver'];assert world[receiver]['id'] in (R,C)
  assert A(receiver,tuple(-v for v in travel(world[receiver])))==nodes[-1]
 run=maximum=delay=0;signal_cells=[]
 for i,p in enumerate(nodes):
  b=world[p];assert b['id'] in (R,W),(name,p,b)
  assert solid(world.get(A(p,DN))),(name,p,'missing support')
  if b['id']==R:
   assert 0<i<len(nodes)-1
   assert A(p,travel(b))==nodes[i+1] and A(p,tuple(-v for v in travel(b)))==nodes[i-1],(name,p,'diode direction')
   delay+=2*int(b['properties']['delay']);run=0
  else:
   run+=1;maximum=max(maximum,run)
  if i:
   prev=nodes[i-1];a=world[prev]
   if a['id']==b['id']==W:
    delta=tuple(p[j]-prev[j] for j in range(3))
    assert abs(delta[0])+abs(delta[2])==1 and abs(delta[1])<=1
    if delta[1]:
     low=prev if prev[1]<p[1] else p;assert not solid(world.get(A(low,UP)))
  if p not in body:signal_cells.append(p)
 assert maximum<=14,(name,maximum)
 return {'name':name,'family':family,'maximum_dust_vertices':maximum,'minimum_nominal_rear_power':16-maximum,'diode_delay_ticks':delay,'vertices':len(nodes),'new_signal_cells':len(signal_cells)}

routes=[validate_route(c,w) for c in d['connections']]
# Per-net additions count support-sharing once in the actual map.
counts=Counter(v['part'] for v in d['blocks'] if P(v['position']) not in body)
by_family=Counter()
for name,count in counts.items():assert name in expected;by_family[expected[name][3]]+=count
assert dict(by_family)=={'RF_to_ALU':3412,'RF_to_LSU':9712,'ALU_to_writeback':5508,'LSU_to_writeback':5660}
negative=[]
def refuse(name,fn):
 try:fn()
 except (AssertionError,KeyError):negative.append(name);return
 raise AssertionError('Mutation was not refused: '+name)
# Every route must fail when an interior refresh diode is removed or reversed.
for c in d['connections']:
 p=next(P(p) for p in c['path'] if w[P(p)]['id']==R)
 old=w[p];del w[p];refuse(c['name']+':missing_refresh',lambda c=c:validate_route(c,w));w[p]=old
 f=old['properties']['facing'];opposite={'west':'east','east':'west','north':'south','south':'north'}[f]
 w[p]={'id':R,'properties':{**old['properties'],'facing':opposite}}
 refuse(c['name']+':reversed_refresh',lambda c=c:validate_route(c,w));w[p]=old
bad=[dict(c) for c in d['connections']];bad[0]['destination']=bad[1]['destination']
refuse('operand_bit_destination_swap',lambda:bindings(bad))
pin(Path(__file__).resolve())
result={'status':'independent_bounded_lane_data_route_review_pass','cells':len(w),'unchanged_translated_body_cells':len(body),'added_route_support_cells':len(w)-len(body),'retained_stores':231,'source_bound_data_connections':48,'newly_completed_missing_bits':24,'added_cells_by_family':dict(by_family),'actual_cable_vertices_checked':sum(x['vertices'] for x in routes),'maximum_dust_vertices':max(x['maximum_dust_vertices'] for x in routes),'minimum_nominal_rear_power':min(x['minimum_nominal_rear_power'] for x in routes),'negative_cases':len(negative),'source_sha256':pins,'limits':['Independently checks actual component-port source/bit/destination identity, unchanged body blocks, unchanged side-lock storage, every authored cable chain/support/direction, source normalizers and attenuation.','Off-path input exclusion and72,198 preserved internal dependencies remain the separately pinned author differential; this review does not independently rediscover the full electrical graph.','Ten immediate/select inputs, all shared control/phase/reset/status wiring, four-lane composition and complete timing are still pending. No complete-lane, whole-core, density or native acceptance.'],'complete_lane':False,'complete_core':False,'native_acceptance':False,'world_mutations':0}
(H/'independent-review.json').write_text(json.dumps(result,indent=2)+'\n')
(H/'route-witnesses.json').write_text(json.dumps({'routes':routes,'corruption_refusals':negative},indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('source_sha256','limits')}))
