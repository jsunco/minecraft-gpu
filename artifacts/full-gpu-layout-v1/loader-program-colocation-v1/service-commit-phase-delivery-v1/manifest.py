"""Freeze four actual local commit-phase deliveries with one-way dependency pins."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];TARGET=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while chunk:=f.read(8*1024*1024):h.update(chunk)
 return h.hexdigest()
def verify(pins):
 for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
 d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'commit_phase_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen artifact: make a fresh descendant'
c=json.loads((H/'accepted-base-checks.json').read_text());u=json.loads((H/'checks.json').read_text())
assert c['metrics']['total_cells']==2011226 and c['metrics']['actual_inputs']==1658798
assert c['metrics']['new_cells']==5392 and c['metrics']['combined_held_cases']==2 and c['metrics']['independent_local_held_cases']==16
assert c['metrics']['minimum_new_repeater_rear']==5 and c['full_function_feedback']['nonwire_feedback_components']==0
assert u['metrics']['total_cells']==2060300 and u['metrics']['actual_inputs']==1703348
pins={}
def merge(values):
 for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['../service-active-witness-delivery-v1/source-manifest.json']:
 p=(H/n).resolve();merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['checks.json','accepted-base-checks.json','source-functions.json','delta.json','remaining-cuts.json','endpoint-map.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_four_actual_local_commit_phase_deliveries','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost':c['cost'],'foreign_partial_compatibility_metrics':u['metrics'],'feedback':c['full_function_feedback'],'limits':c['limits']+u['limits'],'native_acceptance':False,'foreign_partial_rows_not_credited':49074},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'pins':len(pins)}))
