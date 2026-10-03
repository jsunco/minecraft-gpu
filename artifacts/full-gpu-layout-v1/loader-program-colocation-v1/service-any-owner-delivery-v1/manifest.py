"""Freeze four actual local any-owner deliveries with one-way dependency pins."""
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
 d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'any_owner_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen artifact: make a fresh descendant'
c=json.loads((H/'checks.json').read_text());u=json.loads((H/'accepted-base-checks.json').read_text());association=json.loads((H/'latest-freeze-correspondence.json').read_text())
assert c['metrics']['total_cells']==2128184 and c['metrics']['actual_inputs']==1765058
assert c['metrics']['new_cells']==4972 and c['metrics']['combined_held_cases']==1024 and c['metrics']['independent_channel_cases']==16
assert c['metrics']['minimum_new_repeater_rear']==5 and c['full_function_feedback']['nonwire_feedback_components']==0
assert u['metrics']['total_cells']==2083120 and u['metrics']['actual_inputs']==1724170
pins={}
def merge(values):
 for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['../service-commit-phase-delivery-v1/source-manifest.json','../../bank-global-delivery-v1/source-manifest.json','../../memory/fabric-colocation-v2/channel3-address-source-manifest.json']:
 p=(H/n).resolve();merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['checks.json','accepted-base-checks.json','source-functions.json','delta.json','remaining-cuts.json','endpoint-map.json','latest-freeze-correspondence.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_four_actual_local_any_owner_deliveries','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost':c['cost'],'accepted_pre_channel3_metrics':u['metrics'],'channel3_freeze_correspondence':association,'feedback':c['full_function_feedback'],'limits':c['limits']+u['limits'],'native_acceptance':False,'foreign_partial_rows_not_credited':0},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'pins':len(pins)}))
