"""Freeze four actual bank quiet returns and bounded compatibility evidence."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'exact_bank_global_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen package must not be rewritten'
checks=json.loads((H/'checks.json').read_text());r=json.loads((H/'reservation-checks.json').read_text());ledger=json.loads((H/'remaining-cuts.json').read_text())
assert checks['status']=='passed_actual_bank_quiet_global_deliveries'
assert checks['metrics']['total_cells']==2072756 and checks['metrics']['bank_gate_observations']==96
assert checks['metrics']['negative_cases']==777 and checks['metrics']['minimum_new_repeater_rear']==5
assert r['metrics']['total_cells']==2078148 and r['metrics']['uncredited_concurrent_obstacle_cells']==5392
assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==12
assert sum(row['status']=='pending_external_master_connection' for row in ledger['program'])==42
pins={}
def merge(values):
    for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['program-global-delivery-v1/source-manifest.json','memory/fabric-colocation-v2/channel2-address-source-manifest.json','loader-program-colocation-v1/service-active-witness-delivery-v1/source-manifest.json','master-bank-quiet-adapters-v1/source-manifest.json','master-bank-quiet-routes-v1/source-manifest.json']:
    p=H.parent/n;parent=json.loads(p.read_text());merge(parent.get('source_sha256',parent.get('files',{})));pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['source-functions.json','checks.json','reservation-checks.json','remaining-cuts.json','endpoint-map.json']:
    merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_author_checked_four_bank_quiet_global_deliveries','metrics':checks['metrics'],'cost':checks['cost'],'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'complete_gpu_layout':False,'complete_timing_acceptance':False,'compact_build_admission':False,'limits':checks['limits']},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':checks['metrics']}))
