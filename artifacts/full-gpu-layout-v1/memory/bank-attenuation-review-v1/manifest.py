import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];TARGET=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
if '--check' in sys.argv:
 d=json.loads(TARGET.read_text())
 for n,h in d['source_sha256'].items():assert sha(ROOT/n)==h,n
 print(json.dumps({'status':'exact_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit
r=json.loads((H/'independent-review.json').read_text());assert r['only_body_changes']==28 and r['cases']==84 and len(r['reversed_refresh_mutations'])==28 and len(r['source_free_inactive_rears'])==364
pins=r['source_sha256'].copy()
for p in H.iterdir():
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for n,h in pins.items():assert sha(ROOT/n)==h,n
TARGET.write_text(json.dumps({'status':'frozen_independent_bounded_bank_attenuation_review','source_sha256':dict(sorted(pins.items())),'receipt_sha256':sha(H/'independent-review.json'),'complete_gpu_layout':False,'native_acceptance':False,'limits':r['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'receipt_sha256':sha(H/'independent-review.json'),'pins':len(pins)}))
