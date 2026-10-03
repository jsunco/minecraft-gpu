from pathlib import Path
import hashlib,json,sys
R=Path(__file__).resolve().parents[4];D=Path('artifacts/full-gpu-layout-v1/memory/admission-close-v1');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest()
parents={'artifacts/full-gpu-layout-v1/memory/bank-ready-return-v1/source-manifest.json':'d1b48f012e0fa1fe7cf1d5ba681d9e5cb7aa4af5aa1dfbc746cff3bfc5fefe60','artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/source-manifest.json':'ac5d5ebc936a17d58673c508abd5a7e5f580571ac50b491437349a42b91f3f27'};files=set(parents)
for p,h in parents.items():
 assert H(p)==h,p
 for f,v in json.loads((R/p).read_text())['source_sha256'].items():assert H(f)==v,f;files.add(f)
files.update(['hardware/memory-layout-admission-close.mjs','hardware/memory-layout-admission-close-joined.mjs','hardware/full-gpu-literal-network.mjs','hardware/full-gpu-signal-descent.mjs']);files.update(str(D/f)for f in ['README.md','logic.mjs','controller.json','design.json','inventory.json','ports.json','check.mjs','checks.json','check-power.py','power-checks.json','check-joined.mjs','joined-checks.json','check-joined-power.py','joined-power-checks.json','freeze-sources.py'])
metrics=json.loads((R/D/'inventory.json').read_text());ports=json.loads((R/D/'ports.json').read_text());report={'status':'frozen_offline_joined_actual_admission_close_witness','source_sha256':{p:H(p)for p in sorted(files)},'metrics':metrics,'quiet_output':ports['global_channels_quiet'],'memory_admission_block_recipient':ports['memory_admission_block'],'actual_source_joins':37,'retained_witness_bits':7,'review_status':'author_checked_pending_independent_review','missing':ports['missing'],'complete_component_geometry':False,'native_acceptance':False,'selected':False};path=R/D/'source-manifest.json'
if '--save'in sys.argv:path.write_text(json.dumps(report,indent=2)+'\n')
else:assert json.loads(path.read_text())==report
print(json.dumps({'pins':len(files),'manifest_sha256':H(D/'source-manifest.json'),'joined_generator_sha256':H('hardware/memory-layout-admission-close-joined.mjs'),'component_generator_sha256':H('hardware/memory-layout-admission-close.mjs')}))
