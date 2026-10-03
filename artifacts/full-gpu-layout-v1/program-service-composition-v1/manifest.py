"""Freeze the scoped actual program/service composition, without native claims."""
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
    print(json.dumps({'status':'exact_program_service_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
checks=json.loads((HERE/'checks.json').read_text());body=json.loads((HERE/'body-checks.json').read_text())
assert checks['status']=='passed_whole_program_memory_service_quiet_union'
assert body['status']=='actual_program_quiet_gate_and_loader_delivery_settled_pass'
assert (checks['metrics']['complete_cells'],checks['metrics']['cable_cells'],checks['metrics']['mutations'])==(1653081,990,3)
assert (body['assignments_per_model'],body['output_bit_checks_per_model'],len(body['actual_gate_mutations']))==(8,32,3)
pins={}
for relative in ['loader-bank-panels-v1/source-manifest.json','program-rom-colocation-v1/quiet-connected-v1/source-manifest.json','loader-program-colocation-v1/service-quiet-loader-link-v1/source-manifest.json']:
    p=HERE.parent/relative;m=json.loads(p.read_text())
    for name,h in m['source_sha256'].items():assert name not in pins or pins[name]==h; pins[name]=h
    pins[str(p.relative_to(ROOT))]=sha(p)
for f in ['body-placement.json','source-functions.json','checks.json','body-checks.json','remaining-cuts.json','endpoint-map.json','connected-candidate.json']:
    for name,h in json.loads((HERE/f).read_text())['source_sha256'].items():assert name not in pins or pins[name]==h;pins[name]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_author_checked_partial_program_service_composition','metrics':checks['metrics'],'cost':checks['cost'],'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'full_timing_acceptance':False,'complete_gpu_layout':False,'limits':checks['limits']+body['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':checks['metrics']}))
