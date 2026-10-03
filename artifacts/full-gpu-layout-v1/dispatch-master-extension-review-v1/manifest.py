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
r=json.loads((H/'independent-review.json').read_text());assert r['actual_cells']==202786 and r['actual_receivers']==101387 and r['actual_inputs']==170716 and r['complete_original_and_new_low_high_checks']==76 and len(r['negative_controls'])==49
assert min(c['minimum_active_rear'] for c in r['new_connections'])==4
assert sorted(c['actual_source_tap_high'] for c in r['new_connections'] if c['source']!=c['route_tap'])==[14,15]
assert min(c['conservative_route_minimum_rear'] for c in r['new_connections'])==3
assert sorted(c['conservative_source_tap_high'] for c in r['new_connections'] if c['source']!=c['route_tap'])==[13,14]
assert r['additional_conservative_high_checks']==19 and r['conservative_author_comparisons']==12
pins=r['source_sha256'].copy()
for p in H.rglob('*'):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for n,h in pins.items():assert sha(ROOT/n)==h,n
TARGET.write_text(json.dumps({'status':'frozen_independent_dispatch_master_extension_review','source_sha256':dict(sorted(pins.items())),'receipt_sha256':sha(H/'independent-review.json'),'complete_gpu_layout':False,'native_acceptance':False,'limits':r['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'receipt_sha256':sha(H/'independent-review.json'),'pins':len(pins)}))
