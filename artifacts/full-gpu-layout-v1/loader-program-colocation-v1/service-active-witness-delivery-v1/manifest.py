"""Freeze four actual retained ACTIVE deliveries with one-way dependency pins."""
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
 d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'ACTIVE_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen artifact: make a fresh descendant'
c=json.loads((H/'checks.json').read_text());u=json.loads((H/'union-checks.json').read_text())
assert c['metrics']['total_cells']==2005834 and c['metrics']['actual_inputs']==1653918
assert c['metrics']['new_cells']==5240 and c['metrics']['combined_held_cases']==16
assert c['metrics']['minimum_new_repeater_rear']==5 and c['full_function_feedback']['nonwire_feedback_components']==0
assert u['metrics']['total_cells']==2024544 and u['metrics']['actual_inputs']==1670766
pins={}
def merge(values):
 for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['../service-payload-open-delivery-v1/source-manifest.json','../../dispatcher-service-colocation-v1/source-manifest.json','../../memory/fabric-colocation-v2/channel1-address-source-manifest.json']:
 p=(H/n).resolve();merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['checks.json','union-checks.json','source-functions.json','delta.json','remaining-cuts.json','endpoint-map.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_four_actual_retained_ACTIVE_deliveries','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost':c['cost'],'foreign_partial_compatibility_metrics':u['metrics'],'feedback':c['full_function_feedback'],'limits':c['limits']+u['limits'],'native_acceptance':False,'foreign_partial_rows_not_credited':18710},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'pins':len(pins)}))
