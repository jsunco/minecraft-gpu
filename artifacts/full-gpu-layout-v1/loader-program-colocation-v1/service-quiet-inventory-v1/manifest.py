"""Freeze actual source recovery and refusal evidence, never a repair acceptance."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'inventory_and_refusal_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
i=json.loads((HERE/'inventory.json').read_text());f=json.loads((HERE/'function-checks.json').read_text());c=json.loads((HERE/'cycle-classification.json').read_text());r=json.loads((HERE/'transport-cycle-refusal.json').read_text())
assert i['metrics']['actual_original_cells']==199408 and i['metrics']['witness_matrix_and_state_body_cells']==12965
assert i['metrics']['external_cuts']==38 and i['metrics']['body_incident_cuts']==81
assert f['metrics']['total_passed_functions']==52 and f['metrics']['retained_feedback_functions_refused']==7
assert c['metrics']['cycles']==7 and c['metrics']['cycle_vertices']==623 and r['metrics']['non_wire_components']==7
pins={}
for d in [i,f,c,r]:
    for p,h in d['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_service_quiet_inventory_with_classified_original_transport_refusal','source_sha256':dict(sorted(pins.items())),'inventory_metrics':i['metrics'],'function_metrics':f['metrics'],'cycle_classification_metrics':c['metrics'],'connected_compact_placement':False,'repair_selected':False,'native_acceptance':False,'limits':c['limits']+i['limits']},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
