"""Freeze the one physical source-bound loader delivery, preserving parent pins."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'quiet_loader_link_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
c=json.loads((HERE/'checks.json').read_text());parent=json.loads((HERE.parent/'service-quiet-colocation-v1/source-manifest.json').read_text())
assert c['metrics']['total_cells']==22084 and c['metrics']['unchanged_parent_cells']==21252
assert c['metrics']['all_composed_positive_transport_functions']==25 and c['metrics']['negative_cases']==3
assert c['metrics']['loader_pending_cuts']==21 and c['metrics']['witness_external_input_producers_pending']==37
pins={}
for report in [parent,c]+[json.loads((HERE/p).read_text()) for p in ['body-placement.json','source-functions.json','old-export-scope.json','connected-candidate.json','remaining-cuts.json']]:
    for p,h in report['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_actual_service_witness_quiet_to_loader_delivery','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost':c['cost'],'limits':c['limits'],'whole_assembly_transform':None,'native_acceptance':False},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
