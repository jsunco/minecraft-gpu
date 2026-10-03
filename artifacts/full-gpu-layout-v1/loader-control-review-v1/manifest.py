import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--check' in sys.argv:
 d=json.loads(TARGET.read_text())
 for n,h in d['source_sha256'].items():assert sha(ROOT/n)==h,n
 print(json.dumps({'status':'exact_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit
r=json.loads((H/'independent-review.json').read_text())
assert r['actual_cells']==5573 and r['actual_receivers']==2786 and r['actual_inputs']==3744
assert r['settled_old_and_new_cases']==12 and len(r['negative_controls'])==9 and r['saved_matched_scope_cells']==862
pins=r['source_sha256'].copy()
parent=H.parent/'loader-program-colocation-v1/control-owner-v1/source-manifest.json'
pins[str(parent.relative_to(ROOT))]=sha(parent)
for p in H.rglob('*'):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for n,h in pins.items():assert sha(ROOT/n)==h,n
TARGET.write_text(json.dumps({'status':'frozen_independent_loader_control_owner_review','source_sha256':dict(sorted(pins.items())),'receipt_sha256':sha(H/'independent-review.json'),'complete_gpu_layout':False,'native_acceptance':False,'limits':r['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'receipt_sha256':sha(H/'independent-review.json'),'pins':len(pins)}))
