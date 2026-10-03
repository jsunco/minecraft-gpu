"""Small malformed-geometry regressions; temporary copies only, no native calls."""
import copy,json,subprocess,tempfile
from pathlib import Path
H=Path(__file__).resolve().parent
original=json.loads((H/'design.json').read_text())
def block(d,p):return next(v['block'] for v in d['blocks'] if tuple(v['position'][a] for a in 'xyz')==p)
def prop(d,p,k,v):block(d,p).setdefault('properties',{})[k]=v
def add(d,p,id,props=None):
 assert not any(tuple(v['position'][a] for a in 'xyz')==p for v in d['blocks'])
 d['blocks'].append({'position':dict(zip('xyz',p)),'block':{'id':'minecraft:'+id,**({'properties':props} if props else {})}})
 d['owner'][','.join(map(str,p))]='negative_fixture'
def extra_source(d):
 add(d,(30,37,-35),'light_gray_concrete')
 add(d,(30,38,-35),'repeater',{'facing':'south','delay':'1'})
fixtures=[
 ('parent_store_orientation',lambda d:prop(d,(1,37,-36),'facing','east')),
 ('set_receiver_reversed',lambda d:prop(d,(30,39,-37),'facing','south')),
 ('busy_raw_isolation_reversed',lambda d:prop(d,(7,39,-38),'facing','west')),
 ('predicate_collector_reversed',lambda d:prop(d,(65,61,-54),'facing','south')),
 ('lane_enable_inverter_orientation',lambda d:prop(d,(63,61,-24),'facing','west')),
 ('missing_request_receiver',lambda d:d['ports'].__setitem__(next(i for i,v in enumerate(d['ports']) if v['name']=='execute_request'),{'name':'unrelated'})),
 ('missing_fault_support',lambda d:d['blocks'].remove(next(v for v in d['blocks'] if v['position']=={'x':30,'y':38,'z':-36}))),
 ('extra_strong_source',extra_source),
 ('wrong_div_mode_literal',lambda d:d['front']['status_panels'][0]['stages'][0].__setitem__('wanted',0)),
 ('missing_microcommand',lambda d:d['ports'].remove(next(v for v in d['ports'] if v['name']=='status_open'))),
]
with tempfile.TemporaryDirectory(prefix='alu-status-corruptions-') as td:
 f=Path(td)/'design.json'
 for name,mutate in fixtures:
  d=copy.deepcopy(original);mutate(d);f.write_text(json.dumps(d))
  r=subprocess.run(['python3',str(H/'check-routing.py'),'--design',str(f)],capture_output=True,text=True)
  assert r.returncode!=0,(name,'corruption unexpectedly accepted')
print(json.dumps({'status':'offline_corruptions_rejected','fixtures':len(fixtures),'names':[n for n,_ in fixtures],'native_calls':0}))
