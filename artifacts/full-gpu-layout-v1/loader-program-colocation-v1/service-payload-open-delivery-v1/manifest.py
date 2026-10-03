"""Freeze source-specific corrected payload-open deliveries and one-way geometry inputs."""
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
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'payload_open_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen artifact: make a fresh descendant'
c=json.loads((H/'checks.json').read_text());accepted=json.loads((H/'accepted-base-checks.json').read_text())
assert c['metrics']['total_cells']==1757086 and c['metrics']['actual_inputs']==1441248
assert c['metrics']['new_cells']==4264 and c['metrics']['combined_held_cases']==32
assert c['metrics']['minimum_new_repeater_rear']==5 and c['full_function_feedback']['nonwire_feedback_components']==0
pins={}
def merge(values):
    for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['../service-owner-open-delivery-v1/source-manifest.json']:
    p=(H/n).resolve();merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['checks.json','accepted-base-checks.json','source-functions.json','delta.json','remaining-cuts.json','endpoint-map.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_four_source_specific_payload_open_deliveries','source_sha256':dict(sorted(pins.items())),'metrics':accepted['metrics'],'cost':accepted['cost'],'foreign_partial_compatibility_metrics':c['metrics'],'feedback':c['full_function_feedback'],'limits':c['limits'],'native_acceptance':False,'deliberate_corrections_preserved':4,'foreign_partial_memory_rows_not_credited':4206},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'pins':len(pins)}))
