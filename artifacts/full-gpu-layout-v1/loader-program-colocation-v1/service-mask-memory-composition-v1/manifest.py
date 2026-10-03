"""Freeze the complete actual shared-frame mask integration; never mutate parents."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent
ROOT=H.parents[3]
TARGET=H/'source-manifest.json'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        while chunk:=f.read(8*1024*1024): h.update(chunk)
    return h.hexdigest()
def verify(pins):
    for p,h in pins.items(): assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256'])
    print(json.dumps({'status':'mask_composition_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen manifest already exists; use a fresh descendant'
c=json.loads((H/'latest-union-checks.json').read_text());baseline=json.loads((H/'checks.json').read_text())
assert c['metrics']['total_cells']==1700444 and c['metrics']['receivers']==845676
assert c['metrics']['actual_inputs']==1389970 and c['metrics']['new_routing_cells']==3159
assert c['metrics']['current_output_observations']==12288 and c['metrics']['negative_cases']==34
assert c['held_mask_cone_feedback']['nonwire_feedback_components']==0
pins={}
def merge(values):
    for p,h in values.items(): assert p not in pins or pins[p]==h,p; pins[p]=h
for p in ['../service-witness-input-bindings-v1/source-manifest.json','../../memory/fabric-colocation-v2/channel3-write-data-source-manifest.json','../../loader-bank-panels-v1/source-manifest.json']:
    f=(H/p).resolve();merge(json.loads(f.read_text())['source_sha256']);pins[str(f.relative_to(ROOT))]=sha(f)
for report in [c,baseline]+[json.loads((H/p).read_text()) for p in ['composed-delta.json','remaining-cuts.json','endpoint-map.json']]:merge(report['source_sha256'])
for p in sorted(H.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_actual_shared_frame_loader_mask_composition','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost':c['cost'],'feedback':c['held_mask_cone_feedback'],'limits':c['limits'],'native_acceptance':False,'shared_frame_vertical_translation_pending':[14,18],'historical_drafts_not_selected':['history/remote-mask-side-arrival-refusal','history/positive-rear1-candidate']},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(TARGET),'pins':len(pins)}))
