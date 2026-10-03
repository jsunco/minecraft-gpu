from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/channel-allocator-v1');P=Path('artifacts/full-gpu-layout-v1/memory/data-owner-v1/source-manifest.json');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest();old=json.loads((R/P).read_text())['source_sha256']
assert H(P)=='a14ae98e76bcf0a04fa7de18d025b276995a47a86ce2ea288fb2ebd1c3e51790'
for f,h in old.items():assert H(f)==h,f
files=set(old)|{str(P),'hardware/memory-layout-channel-allocator.mjs','reference/tiny-gpu/src/controller.sv'}|{str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py']};d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_original_order_grant_matrix','complete_allocator_with_state_and_barrier':False,'native_acceptance':False,'source_sha256':{f:H(f)for f in sorted(files)},'metrics':d['metrics'],'remaining':d['missing']};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'source_pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-channel-allocator.mjs'),'design_sha256':H(D/'design.json')}))
