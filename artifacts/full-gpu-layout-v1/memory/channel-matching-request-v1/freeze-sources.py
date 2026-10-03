from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-matching-request-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/channel-withdrawal-v1/source-manifest.json':'7c240097013130626afa998fc63c70d91f0679045abf40fd85451cd352db07d4'};files=set(parents)
for p,h in parents.items():
 assert H(p)==h
 for f,v in json.loads((R/p).read_text())['source_sha256'].items():assert H(f)==v;files.add(f)
files.add('hardware/memory-layout-channel-matching-request.mjs');files.update(str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py']);d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_original_channel_matching_request_connected','source_sha256':{p:H(p)for p in sorted(files)},'metrics':d['metrics'],'remaining':d['missing'],'complete_component_geometry':False,'native_acceptance':False,'selected':False};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-channel-matching-request.mjs')}))
