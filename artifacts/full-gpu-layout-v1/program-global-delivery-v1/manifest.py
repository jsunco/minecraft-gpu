"""Freeze this actual program-quiet connection; no native/timing acceptance."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'exact_program_global_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen package must not be rewritten'
checks=json.loads((H/'checks.json').read_text());r=json.loads((H/'reservation-checks.json').read_text());ledger=json.loads((H/'remaining-cuts.json').read_text())
assert checks['status']=='passed_actual_program_quiet_to_global_delivery'
assert checks['metrics']['total_cells']==2002964 and checks['metrics']['program_output_observations']==24
assert checks['metrics']['cable_mutations']==105 and checks['metrics']['gate_mutations']==3
assert r['metrics']['total_cells']==2017918 and r['metrics']['uncredited_concurrent_obstacle_cells']==14954
assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==16
assert sum(row['status']=='pending_external_master_connection' for row in ledger['program'])==42
pins={}
def merge(values):
    for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['dispatcher-service-colocation-v1/source-manifest.json','memory/fabric-colocation-v2/channel1-address-source-manifest.json','program-service-composition-v1/source-manifest.json']:
    p=H.parent/n;merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['source-functions.json','checks.json','reservation-checks.json','remaining-cuts.json','endpoint-map.json']:
    merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_author_checked_program_quiet_global_delivery','metrics':checks['metrics'],'cost':checks['cost'],'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'complete_gpu_layout':False,'complete_timing_acceptance':False,'compact_build_admission':False,'limits':checks['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':checks['metrics']}))
