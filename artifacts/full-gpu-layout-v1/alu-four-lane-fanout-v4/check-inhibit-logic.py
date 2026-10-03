"""Finite authored physical-port/settled truth check, not a Minecraft simulation."""
import json,copy
from pathlib import Path
H=Path(__file__).resolve().parent
D=json.loads((H/'inhibit-design.json').read_text());W=json.loads((H/'../alu-control/control-word.json').read_text())
K=lambda p:tuple(p[a] for a in 'xyz');P=lambda x,y,z:dict(x=x,y=y,z=z)
def check(d):
 m={K(v['position']):v['block'] for v in d['blocks']}; adj={}
 for e in d['edges']:
  a,b=K(e['from']),K(e['to']);adj.setdefault(a,set()).add(b)
  if m[a]['id']==m[b]['id']=='minecraft:redstone_wire':adj.setdefault(b,set()).add(a)
 def exact(p,id,props=None):
  b=m[p];assert b['id']=='minecraft:'+id,(p,id,b)
  if props is not None:assert b.get('properties',{})==props,(p,props,b)
 def arrive(source,target):
  q=[source];power={source:1}
  for a in q:
   if a==target:continue
   for b in adj.get(a,[]):
    id=m[b]['id'];assert id in ['minecraft:redstone_wire','minecraft:repeater','minecraft:light_gray_concrete'],('Unexpected route element',b,id)
    v=15 if id=='minecraft:repeater' else power[a]-(m[a]['id']==id=='minecraft:redstone_wire')
    if v>power.get(b,0):power[b]=v;q.append(b)
  assert power.get(target)==15,('Physical normalized arrival',source,target,power.get(target))
 assert d['reset_decoder_alias']==dict(source_command='m_parallel_select_zero',exact_macro_states=[0],shared_word_output=P(92,252,2),actual_shared_bus_tap=P(672,264,-216))
 assert W['groups']['m_parallel_select_zero']['states']==[0] and W['groups']['m_parallel_select_zero']['phase'] is None
 assert next(c for c in W['matrix'] if 'm_parallel_select_zero' in c['names'])['output']==P(92,252,2)
 arrive((672,264,-216),(684,265,-314))
 for y in range(265,334):exact((684,y,-314),'light_gray_concrete' if (y-265)%2==0 else 'redstone_torch')
 assert len(d['gates'])==4
 tested=0
 for i,g in enumerate(d['gates']):
  y=309+8*i;assert g['lane']==i
  expected=dict(enable_source=P(738,y,160),fault_source=P(740,y,184),reset_source=P(672,264,-216),allow_comparator=P(764,y,160),allow_rear=P(763,y,160),fault_side=P(764,y,159),inverter_support=P(767,y,160),inverter_torch=P(768,y,160),inhibit_comparator=P(772,y,160),inhibit_rear=P(771,y,160),reset_side=P(772,y,161),output=P(775,y,160),reset_positive_support=P(684,y,-314))
  for name,p in expected.items():assert g[name]==p,(name,g[name],p)
  for x in [763,766,769,771,774]:exact((x,y,160),'repeater',dict(facing='west',delay='1'))
  for x in [764,772]:exact((x,y,160),'comparator',dict(facing='west',mode='subtract'))
  for x in [765,770,773,775]:exact((x,y,160),'redstone_wire')
  exact((767,y,160),'light_gray_concrete');exact((768,y,160),'redstone_wall_torch',dict(facing='east'))
  exact((764,y,159),'repeater',dict(facing='north',delay='1'));exact((772,y,161),'repeater',dict(facing='south',delay='1'))
  assert (y-265)%4==0 # two inversions per positive level, read through real east diode.
  exact((685,y,-314),'repeater',dict(facing='west',delay='1'))
  arrive((738,y,160),(763,y,160));arrive((740,y,184),(764,y,159));arrive((684,y,-314),(772,y,161))
  for enable in [0,1]:
   for fault in [0,1]:
    for reset in [0,1]:
     allow=max(15*enable-15*fault,0);inverted=15 if allow==0 else 0;inhibit=max(inverted-15*reset,0)
     assert inhibit==15*bool(not reset and (not enable or fault));tested+=1
 return tested
n=check(D)
# Each corrupt copy changes one actual source/receiver property or the exact RESET source identity.
mutations=[((763,309,160),'facing','east'),((764,309,160),'mode','compare'),((764,309,159),'facing','south'),((768,309,160),'facing','west'),((772,309,161),'facing','north'),((685,309,-314),'facing','east')]
for p,k,v in mutations:
 d=copy.deepcopy(D);next(b for b in d['blocks'] if K(b['position'])==p)['block'].setdefault('properties',{})[k]=v
 try:check(d)
 except AssertionError:pass
 else:raise AssertionError(('Accepted physical corruption',p,k))
d=copy.deepcopy(D);d['reset_decoder_alias']['exact_macro_states']=[0,1]
try:check(d)
except AssertionError:pass
else:raise AssertionError('Accepted unrelated zero choice as RESET')
print(json.dumps(dict(status='four_physical_OPEN_inhibit_routes_and_settled_truth_passed',binary_combinations=n,negative_cases=len(mutations)+1,normalized_rear_side_arrivals=13,clock_or_native_proof=False,native_calls=0)))
