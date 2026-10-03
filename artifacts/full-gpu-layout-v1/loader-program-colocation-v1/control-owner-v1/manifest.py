"""Freeze the exact small connected loader control and owner group."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'exact_connected_subgroup_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
d=json.loads((HERE/'checks.json').read_text());m=d['metrics'];assert m['complete_cells']==5573 and m['body_cells']==5231 and m['new_cells']==342 and m['saved_same_scope_cells']==862
assert m['bodyInputs']==3434 and m['allInputs']==3744 and m['negative_cases']==9 and m['pending_incident_cuts']==22
parent=HERE.parent/'source-manifest.json';pins=dict(json.loads(parent.read_text())['source_sha256']);pins[str(parent.relative_to(ROOT))]=sha(parent)
for name in ['body-placement.json','source-functions.json','connected-candidate.json','checks.json','remaining-cuts.json','endpoint-map.json']:
    for p,h in json.loads((HERE/name).read_text())['source_sha256'].items():
        assert p not in pins or pins[p]==h,p
        pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for p in [HERE.parents[1]/'dispatch-external-bindings-v1/transport-functions.mjs']:
    pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_author_checked_loader_control_owner_subgroup','source_sha256':dict(sorted(pins.items())),'metrics':m,'native_acceptance':False,'full_timing_acceptance':False,'complete_loader_program':False,'limits':d['limits']},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':m}))
