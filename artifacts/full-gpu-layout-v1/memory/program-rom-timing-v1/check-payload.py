"""Actual owner-to-address selectors and retained response broadcast geometry."""
import importlib.util,json
from pathlib import Path
H=Path(__file__).resolve().parent;p=H/'check.py';spec=importlib.util.spec_from_file_location('dag',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
cp=H.parent/'program-capture-v1/design.json';fp=H.parent/'program-controller-v1/design.json';capture=json.loads(cp.read_text());full=json.loads(fp.read_text())
world={m.P(v['position']):v['block'] for v in capture['blocks']}
owner=next(v for v in capture['stores'] if v['name']=='owner');addresses=sorted((v for v in capture['stores'] if v['name']=='address'),key=lambda v:v['bit'])
owner_out,owner_witness=m.analyze(world,[m.P(owner['storage'])],[m.P(v['driver']) for v in addresses])
assert owner_out['positive_device_cycles']==0
world={m.P(v['position']):v['block'] for v in full['blocks']};nets={'response'+str(b) for b in range(16)};allowed={tuple(map(int,k.split(','))) for k,v in full['nets'].items() if v in nets}
responses=sorted((v for v in capture['stores'] if v['name']=='response'),key=lambda v:v['bit']);sources=[m.P(v['storage']) for v in responses]
targets=[(85,293 if b%2 else 289,-60-2*b) for b in range(16)]
assert all(world[p]['id']==m.S for p in targets)
data_out,data_witness=m.analyze(world,sources,targets,allowed,require_all=False)
assert len(data_out['paths'])==16 and all(r['address_bit']==r['data_bit'] for r in data_out['paths'])
out={'status':'actual_owner_and_common_DATA_nominal_DAG_paths','owner_Q_to_address_D':owner_out,'response_Q_to_common_DATA':data_out,'source_sha256':{str(q.relative_to(m.ROOT)):m.sha(q) for q in [p,cp,fp,Path(__file__).resolve()]},'assumptions':['Owned address input data and owner remain stable through capture.','The response storage repeater output is the boundary; its separate capture update is not assigned zero latency.','Common DATA endpoints are actual strongly powered concrete supports before the two older fanouts.','Both maximum and minimum numbers are potential-dependency DAG costs, not scheduled Minecraft events.'],'native_acceptance':False,'numeric_physical_bounds_established':False,'world_mutations':0}
(H/'payload-checks.json').write_text(json.dumps(out,indent=2)+'\n');(H/'payload-witnesses.json').write_text(json.dumps({'owner':owner_witness,'data':data_witness})+'\n')
print(json.dumps({'owner_Q_address_D_max':owner_out['max_nominal_dependency_ticks'],'response_Q_common_DATA_max':data_out['max_nominal_dependency_ticks'],'data_mappings':len(data_out['paths'])}))
