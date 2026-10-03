from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/data-channel-v1');P=Path('artifacts/full-gpu-layout-v1/memory/data-fabric-v1/source-manifest.json');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
assert H(P)=='34a3bcfa896ba4927c591183a2d5f77cbbcf6d2c2a2ff7c592dd7f3369e3d581'
old=json.loads((R/P).read_text())['source_sha256']
for f,h in old.items():assert H(f)==h,f
files=set(old)|{str(P),'hardware/memory-layout-data-channel.mjs','hardware/memory-layout-data-sequencer.mjs','hardware/memory-layout-program-controller.mjs','hardware/memory-layout-program-reset.mjs'}|{str(D/f)for f in ['README.md','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','freeze-sources.py']}
d=json.loads((R/D/'design.json').read_text());out={'status':'frozen_offline_connected_one_bank_candidate','selected':False,'complete_one_bank_local_geometry':True,'complete_data_memory_boundary':False,'original_arbitration_equivalence':False,'native_acceptance':False,'source_sha256':{f:H(f)for f in sorted(files)},'metrics':d['metrics'],'remaining':d['missing']};p=R/D/'source-manifest.json'
if '--save'in sys.argv:p.write_text(json.dumps(out,indent=2)+'\n')
else:assert json.loads(p.read_text())==out,'manifest mismatch'
print(json.dumps({'source_pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'generator_sha256':H('hardware/memory-layout-data-channel.mjs'),'sequencer_sha256':H('hardware/memory-layout-data-sequencer.mjs'),'design_sha256':H(D/'design.json')}))
