"""Independent source-identity, exact-body and cable-chain review, offline only.

No author build/check script is executed. Off-path effective inputs are covered
by the separately pinned author differential, not rebranded as independent.
"""
from pathlib import Path
from collections import Counter
import json, hashlib

H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
F=B/'core-lane-colocation-v1/lane0-ir-data58-v1'
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


pin(F/'source-manifest.json','15f6e154e9f99f04c58a8152dbdf0b218e2c25bc688da7b105b0cce01f79a7a4')
manifest=read(F/'source-manifest.json')
for p,h in manifest['source_sha256'].items():pin(ROOT/p,h)
pin(B/'core-lane-route-review-v2/source-manifest.json','3973c3fc1bd7ba8d8f176918276d45a484c9c3ee8ef436aa8cdc81efb13591f7')
pin(B/'core-lane-route-review-v2/check.py')
d=read(F/'design.json');lane=read(B/'core-lane-colocation-v1/lane0-lower-alu-v1/lane0-draft.json');ir=read(B/'core-lane-colocation-v1/shared-ir-body.json');wb=read(B/'writeback/design.json')
w={P(v['position']):v['block'] for v in d['blocks']};body={P(v['position']):v['block'] for v in lane['blocks']}
assert len(w)==len(d['blocks'])==120602 and len(body)==112441
assert d['ir_transform']=={'quarter_turns':2,'translation':{'x':-40,'y':0,'z':-40}}
assert not ir['changes'] and ir['body_cells']==6045 and ir['stored_bits']==16 and len(ir['crossings'])==31
opp={'west':'east','east':'west','north':'south','south':'north'}
def at(p):p=P(p);return(-p[0]-40,p[1],-p[2]-40)
for row in ir['blocks']:
 p=at(row['position']);block=json.loads(json.dumps(row['block']))
 if 'facing' in block.get('properties',{}):block['properties']['facing']=opp[block['properties']['facing']]
 assert p not in body;body[p]=block
assert len(body)==118486
for p,block in body.items():assert w[p]==block
assert stores(body)==stores(w) and len(stores(w))==247
expected={}
for bit in range(8):
 v=ir['ports']['immediate']['bits'][bit];assert v['bit']==v['instruction_bit']==bit
 source=at(v['position']);drivers=[A(source,delta) for delta in HOR if w.get(A(source,delta),{}).get('id')==R and A(A(source,delta),travel(w[A(source,delta)]))==source]
 assert len(drivers)==1
 dest=wb['ports']['immediate']['bits'][bit]
 expected['immediate'+str(bit)]=({'position':source,'driver':drivers[0]},{k:A(P(v),(0,-10,-30)) for k,v in dest.items() if isinstance(v,dict) and set('xyz')<=v.keys()},True,'IR_immediate_to_writeback')
for bit in range(2):
 v=next(p for p in ir['ports']['controls']['bits'] if p['name']=='reg_input_mux_'+str(bit));dest=wb['ports']['select']['bits'][bit]
 expected['select'+str(bit)]=({'position':at(v['position']),'isolator':at(v['isolator'])},{k:A(P(v),(0,-10,-30)) for k,v in dest.items() if isinstance(v,dict) and set('xyz')<=v.keys()},True,'IR_select_to_writeback')
def bindings(connections):
 assert len(connections)==10 and {v['name'] for v in connections}==set(expected)
 for c in connections:
  src,dst,_,_=expected[c['name']]
  assert P(c['source'])==src['position'] and P(c['destination'])==dst['position']
  assert c['was_missing_in_reference']
  assert c['source_port']==('held_IR.immediate' if c['name'].startswith('immediate') else 'held_IR.controls.reg_input_mux_'+str(c['bit']))
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

def refuse(name,fn):
 try:fn()
 except (AssertionError,KeyError):negative.append(name);return
 raise AssertionError('Mutation was not refused: '+name)

routes=[validate_route(c,w) for c in d['connections']]
assert len(w)-len(body)==2116
negative=[]
for c in d['connections']:
 p=P(c['arrival']);old=w[p]
 w[p]={'id':R,'properties':{**old['properties'],'facing':opp[old['properties']['facing']]}}
 refuse(c['name']+':reversed_arrival',lambda c=c:validate_route(c,w));w[p]=old
 p=next(P(x) for x in c['path'] if w[P(x)]['id']==R);old=w[p];del w[p]
 refuse(c['name']+':missing_refresh',lambda c=c:validate_route(c,w));w[p]=old
bad=[dict(v) for v in d['connections']];bad[-1]['source']=bad[-2]['source'];refuse('swapped_select_source',lambda:bindings(bad))
pin(Path(__file__).resolve())
result={'status':'independent_bounded_shared_IR_route_review_pass','cells':len(w),'prior_lane_cells_preserved':112441,'shared_IR_cells_rotated_once':6045,'added_route_cells':2116,'retained_stores':247,'new_bit_connections':10,'previous_data_connections_preserved':48,'completed_previously_missing_lane0_bits':34,'actual_cable_vertices_checked':sum(v['vertices'] for v in routes),'maximum_dust_vertices':max(v['maximum_dust_vertices'] for v in routes),'minimum_nominal_rear_power':min(v['minimum_nominal_rear_power'] for v in routes),'negative_cases':len(negative),'source_sha256':pins,'limits':['Independent exact parent-cell preservation,180-degree IR block-state/orientation rotation,247 store identities,actual original immediate bit and named decoder-select sources,normalizers and ten cable/support chains.','Author full-input differential is separately pinned; this is not an independent complete graph,opcode truth-table or event/timing proof.','IR fetch/open/reset and shared controls,177 further shared stores and three further lanes remain unplaced/unjoined. Full core and native acceptance remain false.'],'complete_core':False,'native_acceptance':False,'world_mutations':0}
(H/'independent-review.json').write_text(json.dumps(result,indent=2)+'\n');(H/'route-witnesses.json').write_text(json.dumps({'routes':routes,'negative_cases':negative},indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('source_sha256','limits')}))
