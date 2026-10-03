from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
r=json.loads((H/'checks.json').read_text());assert r['status']=='offline_two_cell_program_cold_owner_mask_repair_checked'
files=r['source_sha256'].copy()
for n in ['delta.json','checks.json','owner-mask-witness.json','README.md','freeze-sources.py']:
 p=H/n;files[str(p.relative_to(ROOT))]=sha(p)
for k,v in files.items():assert sha(ROOT/k)==v,k
out={'status':'frozen_offline_two_cell_program_cold_mask_repair_candidate','source_sha256':dict(sorted(files.items())),'blocks_replaced':2,'blocks_added':0,'native_acceptance':False,'cold_convergence_accepted':False,'world_mutations':0}
p=H/'source-manifest.json'
if '--check' in sys.argv:assert json.loads(p.read_text())==out
else:p.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'files':len(files),'manifest_sha256':sha(p)}))
