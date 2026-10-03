"""Freeze the exact panel delta and scoped author checks; no native claim."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for name,h in pins.items():assert sha(ROOT/name)==h,name
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256'])
    print(json.dumps({'status':'exact_loading_panel_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
checks=json.loads((HERE/'checks.json').read_text());functions=json.loads((HERE/'function-checks.json').read_text())
assert checks['status']=='exact_panel_relocation_whole_union_static_pass'
assert functions['status']=='passed_actual_original_and_current_panel_functions'
assert len(functions['banks'])==4 and len(functions['negative_cases'])==72
assert checks['metrics']['total_cells']==1328434 and checks['metrics']['added_bank_inputs']==68
pins={}
for relative in ['loader-program-colocation-v1/source-manifest.json','memory/fabric-colocation-v2/channel2-write-data-source-manifest.json']:
    p=HERE.parent/relative;m=json.loads(p.read_text())
    for name,h in m['source_sha256'].items():assert name not in pins or pins[name]==h; pins[name]=h
    pins[str(p.relative_to(ROOT))]=sha(p)
for f in ['checks.json','function-checks.json','delta.json','remaining-cuts.json']:
    for name,h in json.loads((HERE/f).read_text())['source_sha256'].items():assert name not in pins or pins[name]==h;pins[name]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_author_checked_four_bank_loading_panels','metrics':checks['metrics'],'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'full_timing_acceptance':False,'complete_gpu_layout':False,'limits':checks['limits']+functions['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':checks['metrics']}))
