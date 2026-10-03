from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
r=json.loads((H/'checks.json').read_text());assert r['status']=='offline_six_cold_extender_sources_removed_no_new_power_path'
pins=r['source_sha256'].copy()
for n in ['delta.json','checks.json','README.md','freeze-sources.py']:
 p=H/n;pins[str(p.relative_to(ROOT))]=sha(p)
for p,h in pins.items():assert sha(ROOT/p)==h,p
out={'status':'frozen_offline_six_source_cold_extender_removal','source_sha256':dict(sorted(pins.items())),'replaced_cells':6,'added_cells':0,'removed_protocol_extender_bits':6,'ports_unchanged':True,'native_acceptance':False,'numeric_physical_bounds_established':False,'requires_integrated_cold_certificate':True}
p=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(p.read_text())==out
else:p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(p),'pins':len(pins)}))
