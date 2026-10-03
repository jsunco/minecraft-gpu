"""Freeze checked v8 DCR/cold subgroup and exact prerequisite evidence."""
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
assert c['connected_routes'] == 280 and len(c['negative_cases']) == 280
assert c['new_internal_dependencies'] == c['lost_internal_dependencies'] == 0
assert c['body_cells'] == 100448 and c['bodyEdges'] == 77854 and c['routeEdges'] == 92584
m = e['metrics']
assert m['prior_cells_preserved'] == 195282 and m['new_cells'] == 7504 and m['complete_cells'] == 202786
assert m['body_groups'] == 55 and m['retained_stores'] == 187
assert m['pending_foreign_source_transfers'] == 18 and m['pending_direct_foreign_boundaries'] == 31
assert len(e['matched_connections']) == 12 and len(l['transfers']) == 352 and len(l['effective_cut_ledger']) == 661
assert len(e['function_and_support_negative_cases']) == 23
assert e['metrics']['newly_resolved_effective_cuts'] == 22
pins = {}
def merge(values):
    for p, h in values.items():
        assert p not in pins or pins[p] == h, p
        pins[p] = h
for folder, expected in [('dispatch-global-colocation-v7-internal-master-v1','9d365826aeff205283279f9edb8b4bbb9bbdef2d22691e74539b99771137431b')]:
    p = HERE.parent / folder / 'source-manifest.json'; assert sha(p) == expected
    merge(json.loads(p.read_text())['source_sha256']); pins[str(p.relative_to(ROOT))] = expected
for name in ['connected-candidate.json','checks.json','external-checks.json','remaining-ledger.json','source-functions.json']:
    merge(json.loads((HERE / name).read_text())['source_sha256'])
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p != TARGET:
        pins[str(p.relative_to(ROOT))] = sha(p)
verify(pins)
data = {'status':'frozen_author_checked_dispatch_DCR_byte_raw_reset_cold_initialize_group',
        'source_sha256':dict(sorted(pins.items())),'metrics':m,'remaining_transfer_counts':l['transfer_counts'],
        'full_timing_acceptance':False,'native_acceptance':False,'complete_connected_candidate':False,
        'limits':e['limits']}
TARGET.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':m}))
