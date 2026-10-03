"""Reviewer-only slot/admission/owner contact proof; no native access."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];load=lambda p:json.loads(p.read_text());digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();mf=load(H/'source-manifest.json')
for p,h in mf['source_sha256'].items():assert digest(ROOT/p)==h,p
d=load(H/'design.json');P=lambda p:tuple(p[a] for a in 'xyz');A=lambda a,b:tuple(x+y for x,y in zip(a,b));m={P(v['position']):v['block'] for v in d['blocks']};V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};R='minecraft:repeater';C='minecraft:comparator';S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';T='minecraft:redstone_wall_torch'
def get(p,id,**props):
 b=m[p];assert b['id']==id,(p,b,id)
 for k,v in props.items():assert b['properties'][k]==v,(p,k,v,b)
 return b
def diode(p,travel,id=R):
 b=get(p,id);assert V[b['properties']['facing']]==travel,(p,b,travel)
 if id==C:assert b['properties']['mode']=='subtract'
 assert m[A(p,(0,-1,0))]['id']==S
changes={P(x['position']):x for x in d['changes']};assert len(changes)==10
# Eight normalized original requests are masked before admission, never at a held valid.
for i in range(8):
 p=(5*i,1,-6);assert changes[p]['from']=={'id':R,'properties':{'facing':'north','delay':'1'}};diode(p,(0,0,1),C);get((5*i,1,-7),W);diode((5*i,1,-8),(0,0,1));diode((5*i+1,1,-6),(-1,0,0));get((5*i+2,1,-6),W)
 for y in range(-4,1):get((5*i+2,y,-6),S if y%2==0 else 'minecraft:redstone_torch')
# Program mask is at ACTIVE SET, while staged DCR reset has its own inverse permit.
diode((-644,-49,920),(-1,0,0),C);diode((-644,-49,919),(0,0,1));diode((-406,-4,595),(1,0,0),C);diode((-406,-4,596),(0,0,-1));get((-406,-4,598),T,facing='north')
# Only slot4 write is promoted; slot4 read and all remaining quiet roles persist.
assert len(d['quietRoleChanges'])==4
for panel,q in zip(d['panels'],d['quietRoleChanges']):
 b=panel['bank'];assert panel['slot']==4 and q['bank']==b and q['slot']==4 and q['kind']=='write_valid';wv=P(panel['write_valid']);rear=P(q['rear']);driver=P(q['driver']);assert rear==A(wv,(2,0,0)) and driver==A(wv,(1,0,0));get(rear,S);diode(driver,(-1,0,0));assert P(q['new_strong_source'])==A(wv,(3,0,0));diode(A(wv,(3,0,0)),(-1,0,0));gate=A(wv,(10,0,0));diode(gate,(-1,0,0),C);diode(A(gate,(0,0,1)),(0,0,-1));get(A(gate,(0,0,3)),T,facing='north');diode(A(gate,(1,0,0)),(-1,0,0));diode(A(gate,(1,0,4)),(-1,0,0))
 for kind in ('write_address','write_data'):
  for bit,p0 in enumerate(panel[kind]):
   p=P(p0);diode(A(p,(1,0,0)),(-1,0,0));diode(A(p,(3,0,0)),(-1,0,0));get(A(p,(2,0,0)),W)
   if kind=='write_address' and bit<2:get(A(p,(4,0,0)),'minecraft:redstone_block' if b&(1<<bit) else S)
quiet=d['ports']['data'];raw=load(ROOT/'artifacts/full-gpu-layout-v1/memory/bank-tail-sources-v1/design.json')
for panel in d['panels']:assert panel['read_valid_stays_quiet']==raw['banks'][panel['bank']]['ports']['read_valid']['positions'][4]
for q in raw['quiet']:
 if q['slot']==4 and q['kind']=='write_valid':continue
 rear,driver,pad=(P(q[k]) for k in ('rear','driver','pad'));get(rear,S);diode(driver,tuple(x-y for x,y in zip(pad,driver)))
 # No new strongly oriented source can feed a still-quiet rear.
 for vec in V.values():
  n=A(rear,tuple(-a for a in vec));v=m.get(n,{})
  assert not(v.get('id') in (R,C) and V[v['properties']['facing']]==vec),('quiet became driven',q,n)
# Four matching bank tail sources plus actual program quiet, not READY substitutions.
for b in range(4):
 c=next(c for c in d['connections'] if c['name']=='actual_bank_tail_'+str(b));assert c['source']==raw['ports']['bank_busy_any']['positions'][b]
assert {'cores_held_reset','global_channels_drained','cold_initialized'}==set(d['boundary_inputs'])
assert len(d['configuration'])==4096 and len(d['ramReadback'])==2048
print(json.dumps({'status':'independent_loader_slot_admission_source_pass','pins':len(mf['source_sha256']),'runtime_masks':8,'program_mask':1,'staged_dcr_mask':1,'loader_slots':4,'unchanged_quiet_drivers':28,'tail_sources':4,'explicit_external_boundaries':3,'native_acceptance':False}))
