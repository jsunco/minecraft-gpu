from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
d=json.loads((H/'local-binding.json').read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};built=m.build(world);m.build=lambda _:built
rows={};witnesses={}
for phase in ['A','B']:
 r,w=m.analyze(world,[m.P(d['endpoints']['source'][phase])],[m.P(v[phase]) for v in d['endpoints']['destinations']],require_all=True);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound';rows[phase]=r;witnesses[phase]=w
out={'status':'actual_source_tap_to_four_LSU_phase_pad_nominal_paths','paths':rows,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [Path(__file__).resolve(),helper,H/'local-binding.json']},'numeric_physical_bounds_established':False,'native_acceptance':False,'limits':['Source B begins at the actual shared_B_repair tap (-52,2,15), not the earlier raw B pad. A/B relative edge and width proof must include the upstream source-to-tap path.','Periodic transfer analysis may reuse each A cable delay across successive edges only conditionally on successful, equal-rise/fall pulse transport.']}
(H/'phase-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'phase-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:r['paths'] for n,r in rows.items()}))
