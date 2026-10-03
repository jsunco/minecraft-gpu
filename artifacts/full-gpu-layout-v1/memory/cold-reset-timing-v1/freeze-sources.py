from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
pins={}
for n in ['paths.json','reset-cables.json','scanner-admission-paths.json','integrated-cold.json']:
 d=json.loads((H/n).read_text())
 for p,h in d['source_sha256'].items():
  assert p not in pins or pins[p]==h,('Conflicting source reports',p)
  pins[p]=h
for n in ['check-reset.py','check-cables.py','prepare-cables.mjs','check-scanner-admission.py','check-integrated.py','reset-cable-slice.json','paths.json','witnesses.json','reset-cables.json','reset-cable-witnesses.json','scanner-admission-paths.json','scanner-admission-witnesses.json','integrated-cold.json','README.md','freeze-sources.py']:
 p=H/n;pins[str(p.relative_to(ROOT))]=sha(p)
for p,h in pins.items():assert sha(ROOT/p)==h,('Changed source',p)
out={'status':'frozen_conditional_nominal_integrated_cold_and_conditioning_certificate','source_sha256':dict(sorted(pins.items())),'required_overlay':'artifacts/full-gpu-layout-v1/memory/cold-extender-removal-v1/delta.json','required_program_owner_mask':'artifacts/full-gpu-layout-v1/memory/program-cold-mask-repair-v1/delta.json','native_acceptance':False,'numeric_physical_bounds_established':False,'complete_physical_cold_acceptance':False}
p=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(p.read_text())==out
else:p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'pins':len(pins),'manifest_sha256':sha(p)}))
