"""Freeze a current-source program-module derivative; no physical acceptance."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256'])
    print(json.dumps({'status':'exact_program_quiet_derivative_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}))
    raise SystemExit()
d=json.loads((HERE/'checks.json').read_text());m=d['metrics']
assert (m['body_cells'],m['new_cells'],m['complete_cells'],m['saved_same_scope_cells'])==(300557,1016,301573,3320)
assert (m['bodyInputs'],m['allInputs'],m['negative_cases'],m['pending_incident_cuts'])==(229381,230305,9,44)
parent=HERE.parents[1]/'loader-program-colocation-v1/source-manifest.json'
pins=dict(json.loads(parent.read_text())['source_sha256']);pins[str(parent.relative_to(ROOT))]=sha(parent)
for name in ['body-placement.json','source-functions.json','connected-candidate.json','checks.json','body-checks.json','remaining-cuts.json','endpoint-map.json']:
    for p,h in json.loads((HERE/name).read_text())['source_sha256'].items():
        assert p not in pins or pins[p]==h,p
        pins[p]=h
for rel in ['dispatch-external-bindings-v1/transport-functions.mjs','control-commit-v2/route.mjs','memory/fabric-colocation-v2/cut-inputs.mjs']:
    p=HERE.parents[1]/rel;pins[str(p.relative_to(ROOT))]=sha(p)
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_author_checked_current_program_quiet_relocation','source_sha256':dict(sorted(pins.items())),'metrics':m,'native_acceptance':False,'full_timing_acceptance':False,'complete_gpu_layout':False,'limits':d['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':m}))
