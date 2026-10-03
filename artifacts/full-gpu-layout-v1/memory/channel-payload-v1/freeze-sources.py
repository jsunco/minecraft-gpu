from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-payload-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/channel-retention-v1/source-manifest.json':'5a1cb8ac43b5ba79b8b6e9cdf85240540f804a21f7f47f051d16d5d86fd4a557'}
files=set(parents)
for p,h in parents.items():
 assert H(p)==h,p
 prior=json.loads((R/p).read_text())['source_sha256']
 for f,h in prior.items():assert H(f)==h,f
 files.update(prior)
files.add('hardware/memory-layout-channel-payload.mjs')
files.update(str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py'])
d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_original_channel_raw_payload_fanout','complete_component_geometry':False,'native_acceptance':False,'selected':False,'source_sha256':{f:H(f)for f in sorted(files)},'metrics':d['metrics'],'remaining':d['missing']};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'source_pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-channel-payload.mjs'),'design_sha256':H(D/'design.json')}))
