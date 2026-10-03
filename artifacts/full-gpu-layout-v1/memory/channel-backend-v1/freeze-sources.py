from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-backend-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/channel-payload-v1/source-manifest.json':'9eff2bbb0e7c6ada159bd9a7ebf3c30337dbd666977311074ef47ad784d2cb56','artifacts/full-gpu-layout-v1/memory/channel-backend-control-v1/source-manifest.json':'6e18bd1c0e2dff3747fde118b301b353ba9510e6f921594e4a5ef9ae65cd6e17'};files=set(parents)
for p,h in parents.items():
 assert H(p)==h
 for f,v in json.loads((R/p).read_text())['source_sha256'].items():assert H(f)==v;files.add(f)
files.add('hardware/memory-layout-channel-backend.mjs');files.update(str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py']);d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_original_channel_backend_lifecycle_partial','source_sha256':{p:H(p)for p in sorted(files)},'metrics':d['metrics'],'remaining':d['missing'],'complete_component_geometry':False,'native_acceptance':False,'selected':False};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-channel-backend.mjs')}))
