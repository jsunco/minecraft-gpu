"""Rebind only the actually replaced channel-0 final DATA cable segments."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def read(p):return json.loads(p.read_text())
old=read(H.parent/'internal-runtime-timing-v1/cable-delay.json');new=read(H/'control-cables.json');d=read(H/'trial-design.json');capacity=read(H/'effective-checks.json')
nt=new['new_transport'];assert len(nt['paths'])==25 and nt['positive_device_cycles']==0
routes={}
for i,conn in enumerate(nt['connections']):
 p=next(v for v in nt['paths'] if v['address_bit']==i and v['data_bit']==i)
 assert p['potential_dependency_nominal_min_ticks']==p['potential_dependency_nominal_max_ticks']
 ticks=p['potential_dependency_nominal_max_ticks'];assert ticks==next(v for v in capacity['routes'] if v['name']==conn['name'])['nominal_ticks_including_source_tap']
 routes[conn['name']]=ticks
result=copy.deepcopy(old);changed=[]
suffix=new['old_suffixes']['response_d'];assert suffix['status']=='conservative_potential_dependency_DAG_nominal_bound'
for r in result['routes']:
 if not(r['name'].startswith('response_') and '_c0_bit' in r['name']):continue
 bit=int(r['name'].rsplit('bit',1)[1]);oldpart=next(v for v in suffix['paths'] if v['address_bit']==bit and v['data_bit']==bit)
 assert oldpart['potential_dependency_nominal_min_ticks']==oldpart['potential_dependency_nominal_max_ticks']
 delta=routes['qualified_backend_d_'+str(bit)]-oldpart['potential_dependency_nominal_max_ticks']
 before={k:r[k] for k in ['nominal_min_ticks','nominal_max_ticks']}
 for k in before:r[k]+=delta;assert r[k]>=0
 actual=next(v for v in d['connections'] if v['name']=='qualified_backend_d_'+str(bit));r['destination']=actual['destination']
 changed.append({'name':r['name'],'old_final_suffix':oldpart['potential_dependency_nominal_max_ticks'],'new_final_suffix':routes['qualified_backend_d_'+str(bit)],'old':before,'new':{k:r[k] for k in before}})
assert len(changed)==64
result.update(status='changed_channel0_final_DATA_transport_nominal_only',replacement_arithmetic=changed,new_external_route_ticks=routes,native_acceptance=False,capture_hold_ordering_closed=False)
result['source_sha256']={str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [H.parent/'internal-runtime-timing-v1/cable-delay.json',H/'control-cables.json',H/'trial-design.json',H/'effective-checks.json',Path(__file__).resolve()]}
(H/'cable-delay.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'rebound_data_paths':len(changed),'new_cables':routes}))
