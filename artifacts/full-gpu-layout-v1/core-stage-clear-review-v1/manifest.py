"""Immutable independent final-stage-clear review pins."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];target=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def verify(pins):
 for n,h in pins.items():assert sha(ROOT/n)==h,n
if '--check' in sys.argv:
 d=json.loads(target.read_text());verify(d['source_sha256']);print(json.dumps({'status':'review_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(target)}));raise SystemExit()
assert not target.exists();r=json.loads((H/'receipt.json').read_text());l=json.loads((H/'ledger-receipt.json').read_text());f=json.loads((H/'final-checks.json').read_text())
assert r['status']=='passed_independent_core_stage_clear_sources_geometry_functions_and_mutations'
assert r['metrics']['cells']==997299 and r['metrics']['current_mutations']==64 and r['metrics']['old_mutations']==20
assert l['metrics']['current_broader_cuts']==2005 and l['metrics']['new_deliveries']==33
assert f['status']=='passed_exact_additive_inventory_and_unchanged_metadata'
pins={}
def merge(d):
 for p,h in d.items():assert p not in pins or pins[p]==h,p;pins[p]=h
source=H.parent/'core-lane-colocation-v1/final-stage-clear-connected-v1/source-manifest.json'
assert sha(source)=='a5d1c7f216e1c6263a6c31c691dcaccab1c4cc4e6ff91cdf73253b817d85feb1'
merge(json.loads(source.read_text())['source_sha256']);pins[str(source.relative_to(ROOT))]=sha(source)
for report in [r,l,f]:merge(report['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=target:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
target.write_text(json.dumps({'status':'frozen_independent_core_stage_clear_review','metrics':r['metrics'],'ledger_metrics':l['metrics'],'cost':r['cost'],'source_sha256':dict(sorted(pins.items())),'limits':r['limits']+l['limits'],'native_acceptance':False},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(target),'receipt_sha256':sha(H/'receipt.json'),'ledger_receipt_sha256':sha(H/'ledger-receipt.json'),'pins':len(pins)}))
