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
r=json.loads((H/'independent-review.json').read_text());e=json.loads((H/'expected-edges-review.json').read_text())
assert r['actual_cells']==1191454 and r['receivers']==594096 and r['actual_inputs']==975011
assert r['expanded_assignments']==256 and r['output_bit_checks_per_model']==2048 and len(r['actual_block_mutations'])==72
assert e['distinct_allowed_added_inputs']==38822 and e['exact_original_gate_cells']==676 and e['exact_positive_column_cells']==176
pins=r['source_sha256'].copy()
for n,h in e['source_sha256'].items():assert n not in pins or pins[n]==h;pins[n]=h
for p in H.rglob('*'):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for n,h in pins.items():assert sha(ROOT/n)==h,n
TARGET.write_text(json.dumps({'status':'frozen_independent_typed_request_review','source_sha256':dict(sorted(pins.items())),'receipt_sha256':sha(H/'independent-review.json'),'expected_edges_receipt_sha256':sha(H/'expected-edges-review.json'),'complete_gpu_layout':False,'native_acceptance':False,'limits':r['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'receipt_sha256':sha(H/'independent-review.json'),'expected_edges_receipt_sha256':sha(H/'expected-edges-review.json'),'pins':len(pins)}))
