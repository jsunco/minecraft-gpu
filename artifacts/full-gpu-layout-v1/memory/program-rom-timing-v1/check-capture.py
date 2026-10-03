"""Extend the ROM DAG accounting to the actual payload-store boundaries."""
import importlib.util,json
from pathlib import Path
H=Path(__file__).resolve().parent
p=H/'check.py';spec=importlib.util.spec_from_file_location('dag',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
f=H.parent/'program-capture-v1/design.json';d=json.loads(f.read_text())
world={m.P(v['position']):v['block'] for v in d['blocks']}
address=sorted((s for s in d['stores'] if s['name']=='address'),key=lambda s:s['bit'])
response=sorted((s for s in d['stores'] if s['name']=='response'),key=lambda s:s['bit'])
assert len(address)==8 and len(response)==16
src=[m.P(s['storage']) for s in address];dst=[m.P(s['driver']) for s in response]
out,witnesses=m.analyze(world,src,dst)
out.update(source_sha256={str(q.relative_to(m.ROOT)):m.sha(q) for q in [f,p,Path(__file__).resolve()]},source_boundary='retained owned-address repeater output, after its final stable update',destination_boundary='normalized response D repeater output, before the response store',native_acceptance=False,world_mutations=0)
(H/'capture-checks.json').write_text(json.dumps(out,indent=2)+'\n')
if witnesses is not None:(H/'capture-witnesses.json').write_text(json.dumps(witnesses)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['paths','source_sha256']}))
