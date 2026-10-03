from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-backend-control-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
files=['hardware/memory-layout-channel-backend-control.mjs','hardware/full-gpu-state-bank.mjs','hardware/full-gpu-signal-descent.mjs']+[str(D/f)for f in['README.md','design.json','ports.json','inventory.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py']]
d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_local_channel_backend_control','source_sha256':{p:H(p)for p in sorted(files)},'metrics':d['metrics'],'complete_local_component_geometry':True,'complete_data_memory':False,'native_acceptance':False,'selected':False};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json')}))
