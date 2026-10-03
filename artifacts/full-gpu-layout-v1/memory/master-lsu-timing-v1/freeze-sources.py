"""Bind this finite source-side timing checkpoint, not mutable return drafts."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
reports=['local-paths.json','local-binding.json','local-held-slice.json','phase-paths.json','held-paths.json','raw-global-paths.json','global-gates.json','source-admission.json']
files={}
for name in reports:
 d=json.loads((H/name).read_text())
 for k,v in d.get('source_sha256',{}).items():
  assert k not in files or files[k]==v,k
  files[k]=v
assert json.loads((H/'source-admission.json').read_text())['status']=='conditional_actual_LSU_to_global_payload_nominal_admission_pass'
for p in H.iterdir():
 if p.suffix in ['.py','.mjs','.json','.md'] and p.name not in ['source-manifest.json']:
  k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
for k,v in files.items():assert sha(ROOT/k)==v,k
out={'status':'frozen_offline_conditional_LSU_source_admission_timing','source_sha256':dict(sorted(files.items())),'normal_source_admission_inequalities_pass':True,'delivered_core_phase_composition_complete':False,'read_response_admission_complete':False,'cold_reset_timing_complete':False,'numeric_physical_bounds_established':False,'native_acceptance':False,'world_mutations':0}
p=H/'source-manifest.json'
if '--check' in sys.argv:assert json.loads(p.read_text())==out
else:p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(p)}))
