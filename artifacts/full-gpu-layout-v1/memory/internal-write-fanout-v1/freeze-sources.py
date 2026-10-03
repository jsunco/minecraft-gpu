"""Finite immutable source map for the actual retained write-data joins."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
parent=H.parent/'internal-address-fanout-v1/source-manifest.json'
assert sha(parent)=='9324ba447cd7195edecd67ceab413584e2fc583e1e4e708f847d845f560d24ef'
files=json.loads(parent.read_text())['source_sha256'].copy()
for p,h in files.items():assert sha(ROOT/p)==h,p
own=[parent,*[H/n for n in ['design.json','ports.json','inventory.json','README.md','check-power.py','power-checks.json','check-bindings.mjs','bindings-checks.json','freeze-sources.py','cable-plan.json','adapter-findings-before-fix.json','adapter-source-before-fix.mjs']],*[ROOT/'hardware'/n for n in ['memory-layout-internal-write-adapters.mjs','memory-layout-internal-write-fanout.mjs']],*[H.parents[1]/n/'design.json' for n in ['master-bank-quiet-adapters-v1','master-bank-quiet-routes-v1']],*[H.parents[1]/n/'source-manifest.json' for n in ['master-bank-quiet-adapters-v1','master-bank-quiet-routes-v1']]]
for p in own:
 k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
for n in ['power-checks.json','bindings-checks.json']:assert json.loads((H/n).read_text())['status'].endswith('_pass'),n
out={'status':'frozen_offline_internal_write_fanout_candidate','source_sha256':dict(sorted(files.items())),'blocks':3141746,'added_blocks':410460,'retained_write_bits':32,'actual_bank_write_recipients':128,'external_quiet_obstacle_cells':29404,'complete_internal_write_geometry':True,'complete_memory_geometry':False,'native_acceptance':False}
path=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(path.read_text())==out
else:path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(path)}))
