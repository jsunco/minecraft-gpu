from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-retention-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/channel-allocator-v1/source-manifest.json':'0222c5328a24e01e49afdbf912e29d659a8f9bd552e3d5fb6279877e74073442','artifacts/full-gpu-layout-v1/memory/data-channel-v1/source-manifest.json':'2f14acdb6dedeff1a268b86f91c61b69b15e61bf2b63047a076cc23ccfabc57f'}
files=set(parents)
for p,h in parents.items():
 assert H(p)==h,p
 prior=json.loads((R/p).read_text())['source_sha256']
 for f,h in prior.items():assert H(f)==h,f
 files.update(prior)
files.update(['hardware/memory-layout-channel-retention.mjs','hardware/memory-layout-channel-admission.mjs','hardware/full-gpu-signal-descent.mjs'])
files.update(str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py'])
d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_connected_original_channel_retention_claims_admission','complete_component_geometry':False,'native_acceptance':False,'selected':False,'source_sha256':{f:H(f)for f in sorted(files)},'metrics':d['metrics'],'remaining':d['missing']};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'source_pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-channel-retention.mjs'),'admission_sha256':H('hardware/memory-layout-channel-admission.mjs'),'design_sha256':H(D/'design.json')}))
