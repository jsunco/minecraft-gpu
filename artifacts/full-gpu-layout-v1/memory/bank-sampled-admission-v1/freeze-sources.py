from pathlib import Path
import hashlib,json,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/bank-sampled-admission-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
p='artifacts/full-gpu-layout-v1/memory/admission-close-v1/source-manifest.json';assert H(p)=='50773c319a05fc6b811eba0cffc3ef2342fb75729be80d45e7f6a1cdcd101961'
files={p}
for f,v in json.loads((R/p).read_text())['source_sha256'].items():assert H(f)==v,f;files.add(f)
files.update(['hardware/memory-layout-bank-sampled-admission.mjs','hardware/memory-layout-bank-sampled-joined.mjs'])
files.update(str(D/f)for f in ['README.md','bank.json','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','check-joined.mjs','joined-checks.json','check-joined-power.py','joined-power-checks.json','freeze-sources.py'])
A=Path('artifacts/full-gpu-layout-v1/memory/admission-control-audit-v1');files.update(str(A/f)for f in ['README.md','check.mjs','checks.json'])
report={'status':'frozen_offline_four_bank_sampled_eligibility_repair','source_sha256':{p:H(p)for p in sorted(files)},'metrics':json.loads((R/D/'inventory.json').read_text()),'parent_manifest_sha256':H(p),'public_interfaces':'All admission-close-v1 physical endpoints preserved; config/loader/program metadata additionally re-exported.','review_status':'author_checked_pending_independent_review','complete_component_geometry':False,'native_acceptance':False,'selected':False,'remaining':['Complete sample/priority/owner/payload/write/response phase-arrival and lock-closure bounds.','Actual retained payload fanout and selected-bank data to response capture.','Outward owner-qualified consumer ready/data paths.','Inherited mask-low quiet rearm, original conflict ordering and release-within-scan equivalence gates.']};target=R/D/'source-manifest.json'
if '--save'in sys.argv:target.write_text(json.dumps(report,indent=2)+'\n')
else:assert json.loads(target.read_text())==report
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'local_generator_sha256':H('hardware/memory-layout-bank-sampled-admission.mjs'),'joined_generator_sha256':H('hardware/memory-layout-bank-sampled-joined.mjs'),'design_sha256':H(D/'design.json')}))
