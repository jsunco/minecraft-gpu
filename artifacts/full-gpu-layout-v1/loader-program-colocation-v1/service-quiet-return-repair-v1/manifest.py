"""Freeze the passed minimal repair; never mutate pinned sources."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'repair_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
c=json.loads((HERE/'checks.json').read_text());d=json.loads((HERE/'repair-design.json').read_text());f=json.loads((HERE/'fresh-obstacles.json').read_text());parent=json.loads((HERE.parent/'service-quiet-inventory-v1/source-manifest.json').read_text())
assert c['metrics']['candidate_cells']==199436 and c['metrics']['exact_retained_body_cells']==12965
assert c['metrics']['positive_functions']==59 and c['metrics']['negative_mutations']==21
assert c['metrics']['preserved_external_cuts']==38 and c['metrics']['preserved_body_incident_cuts']==81
pins={}
for report in [parent,c,d,f]:
    for p,h in report['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_minimal_seven_return_repair_geometry_and_conditional_release','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost_comparison':c['cost_comparison'],'limits':c['limits'],'compact_placement':False,'native_acceptance':False},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
