"""Finite manifest for nominal timing, preserving the frozen hardware parent."""
from pathlib import Path
import hashlib,json,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
parent=H.parent/'internal-bank-response-v1/source-manifest.json';assert sha(parent)=='5e42a622d34a01876d956650f0147455fc87ba9b2d555173b556aeabc086cf62'
files=json.loads(parent.read_text())['source_sha256'].copy();files[str(parent.relative_to(ROOT))]=sha(parent)
reports=['bank-paths.json','bank-events.json','bank-data.json','bank-combined.json','global-admission.json','backend-events.json','control-slice.json','control-cables.json','eligibility-slices.json','eligibility.json','cable-delay.json','runtime-combined.json']
for name in reports:
 d=json.loads((H/name).read_text())
 for k,v in d.get('source_sha256',{}).items():assert k not in files or files[k]==v,k;files[k]=v
assert json.loads((H/'runtime-combined.json').read_text())['status']=='conditional_connected_memory_normal_capture_inequalities_pass'
assert json.loads((H/'bank-combined.json').read_text())['status']=='conditional_bank_nominal_capture_inequalities_pass'
own=['README.md','freeze-sources.py','analyze-cables.mjs','check-bank.py','check-bank-events.py','check-bank-data.py','combine-bank.py','check-global-admission.py','check-backend.py','prepare-control-slice.mjs','check-control-cables.py','prepare-eligibility.mjs','check-eligibility.py','combine-runtime.py',*reports,'bank-path-witnesses.json','bank-event-witnesses.json','bank-data-witnesses.json','global-admission-witnesses.json','backend-event-witnesses.json','control-cable-witnesses.json']
for name in own:
 p=H/name;k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
for k,v in files.items():assert sha(ROOT/k)==v,k
out={'status':'frozen_offline_conditional_connected_memory_normal_timing','source_sha256':dict(sorted(files.items())),'normal_nominal_inequalities_pass':True,'numeric_physical_bounds_established':False,'master_payload_admission_timing_complete':False,'cold_reset_timing_complete':False,'native_acceptance':False,'world_mutations':0}
p=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(p.read_text())==out
else:p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(p)}))
