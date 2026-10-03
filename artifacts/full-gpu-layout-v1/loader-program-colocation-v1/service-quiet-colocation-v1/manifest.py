"""Freeze the exact connected witness, with all external obligations pending."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'connected_witness_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
c=json.loads((HERE/'checks.json').read_text());parents=[json.loads((HERE.parent/p/'source-manifest.json').read_text()) for p in ['service-quiet-return-repair-v1','control-owner-v1']]
assert c['metrics']['combined_cells']==21252 and c['metrics']['witness_current_cells']==15679
assert c['metrics']['paths']==21 and c['metrics']['negative_cases']==63
assert c['metrics']['checked_internal_cut_rows']==36 and c['metrics']['pending_external_rows']==38
pins={}
for report in parents+[c]+[json.loads((HERE/p).read_text()) for p in ['body-placement.json','source-functions.json','connected-candidate.json','remaining-cuts.json','endpoint-map.json']]:
    for p,h in report['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_connected_service_witness_colocation_beside_unchanged_loader','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'cost_comparison':c['cost_comparison'],'limits':c['limits'],'new_loader_witness_join':False,'whole_assembly_transform':None,'native_acceptance':False},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
