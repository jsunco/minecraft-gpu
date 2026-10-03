from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py';spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
src=H/'eligibility-slices.json';d=json.loads(src.read_text());reports=[]
for bank in d['banks']:
 world={m.P(v['position']):v['block'] for v in bank['blocks']};r,_=m.analyze(world,list(map(m.P,bank['sources'])),list(map(m.P,bank['targets'])),require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r;assert len(r['paths'])==8,(bank['bank'],len(r['paths']))
 for q in r['paths']:assert q['address_bit']%4==q['data_bit']
 reports.append({'bank':bank['bank'],**r})
out={'status':'offline_four_bank_valid_to_snapshot_D_nominal_paths','banks':reports,'source_sha256':{**d['source_sha256'],**{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [helper,src,H/'prepare-eligibility.mjs',Path(__file__).resolve()]}},'assumptions':['Both read/write address inputs already carry the same stable retained full address before either raw bank valid rises.','Actual bank ACTIVE may start no earlier than the first raw valid event; adding its trigger/SR delays only increases the snapshot setup lower bound.','Comparator selection hazards are not simulated. The dependency maximum includes raw-valid address selection and both bank-bit qualification paths.'],'numeric_physical_bounds_established':False,'native_acceptance':False};(H/'eligibility.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({str(b['bank']):b['max_nominal_dependency_ticks'] for b in reports}))
