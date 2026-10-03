from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/four-bank-service-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/consumer-drain-v1/source-manifest.json':'1e51d5d5cb077427a7c7d27588fcab3cc7cd2829f16665dc55a2bd703e051406','artifacts/full-gpu-layout-v1/memory/data-channel-v1/source-manifest.json':'2f14acdb6dedeff1a268b86f91c61b69b15e61bf2b63047a076cc23ccfabc57f'};files=set(parents)
for p,h in parents.items():
 assert H(p)==h
 for f,v in json.loads((R/p).read_text())['source_sha256'].items():assert H(f)==v;files.add(f)
files.update(['hardware/memory-layout-four-bank-service.mjs','reference/tiny-gpu/test/helpers/memory.py']);files.update(str(D/f)for f in['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','check-conflicts.py','conflict-checks.json','contract-excerpt.json','freeze-sources.py']);d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_four_bank_service_partial_connections','source_sha256':{p:H(p)for p in sorted(files)},'metrics':d['metrics'],'remaining':d['missing'],'complete_component_geometry':False,'native_acceptance':False,'selected':False};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-four-bank-service.mjs')}))
