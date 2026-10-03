"""Freeze checked v7 subgroup and exact prerequisite evidence."""
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGET = HERE / 'source-manifest.json'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p, h in pins.items(): assert sha(ROOT / p) == h, p
if '--check' in sys.argv:
    d = json.loads(TARGET.read_text()); verify(d['source_sha256'])
    print(json.dumps({'status':'exact_frozen_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)})); raise SystemExit()
c = json.loads((HERE / 'checks.json').read_text())
e = json.loads((HERE / 'external-checks.json').read_text())
l = json.loads((HERE / 'remaining-ledger.json').read_text())
assert c['connected_routes'] == 268 and len(c['negative_cases']) == 268
assert c['new_internal_dependencies'] == c['lost_internal_dependencies'] == 0
assert c['body_cells'] == 100448 and c['bodyEdges'] == 77854 and c['routeEdges'] == 85742
m = e['metrics']
assert m['prior_cells_preserved'] == 189978 and m['new_cells'] == 5304 and m['complete_cells'] == 195282
assert m['body_groups'] == 55 and m['retained_stores'] == 187
assert m['pending_foreign_source_transfers'] == 30 and m['pending_direct_foreign_boundaries'] == 41
assert len(e['matched_connections']) == 7 and len(l['transfers']) == 352 and len(l['effective_cut_ledger']) == 661
pins = {}
def merge(values):
    for p, h in values.items():
        assert p not in pins or pins[p] == h, p
        pins[p] = h
for folder, expected in [
    ('dispatch-global-colocation-v6-inverted-v1','5b01e63abb25bff6c9670496068e2ced3dac0dc5a1dfc186efd79bc1bf9891fb'),
    ('dispatch-reciprocal-edge-review-v1','6c8dcfde4bc9d947139b61c3bc18d81d1982b85cbc2ea9064ddec709621c4836'),
    ('dispatch-external-bindings-v1','1d2b7d619e86a2e2391bbfe3d590b04997686ae3452e6a935b9abb97200b33ad')]:
    p = HERE.parent / folder / 'source-manifest.json'; assert sha(p) == expected
    merge(json.loads(p.read_text())['source_sha256']); pins[str(p.relative_to(ROOT))] = expected
for name in ['connected-candidate.json','checks.json','external-checks.json','remaining-ledger.json']:
    merge(json.loads((HERE / name).read_text())['source_sha256'])
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p != TARGET:
        pins[str(p.relative_to(ROOT))] = sha(p)
verify(pins)
data = {'status':'frozen_author_checked_dispatch_global_seven_internal_master_connections',
        'source_sha256':dict(sorted(pins.items())),'metrics':m,'remaining_transfer_counts':l['transfer_counts'],
        'full_timing_acceptance':False,'native_acceptance':False,'complete_connected_candidate':False,
        'limits':e['limits']}
TARGET.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':m}))
