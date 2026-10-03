#!/usr/bin/env python3
"""Freeze read-only evidence and exact dependencies; --check never writes."""
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGET = HERE / 'source-manifest.json'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify(pins):
    for path, expected in pins.items():
        assert sha(ROOT / path) == expected, f'Changed source: {path}'

if '--check' in sys.argv:
    data = json.loads(TARGET.read_text())
    verify(data['source_sha256'])
    print(json.dumps({'status': 'exact_frozen_source_pins_pass',
                      'pins': len(data['source_sha256']),
                      'manifest_sha256': sha(TARGET)}))
    raise SystemExit()

report = json.loads((HERE / 'reconciliation.json').read_text())
ledger = json.loads((HERE / 'assembly-ledger.json').read_text())
m = report['metrics']
assert m['reciprocal_rows'] == 50
assert m['reciprocal_only_original_self_roots'] == 50
assert m['semantic_bidirectional_transfers_found'] == 0
assert m['direct_internal_rows'] == 6
assert m['classified_effective_cut_rows'] == 106
assert m['negative_cases'] == 61
assert m['reciprocal_new_dispositions'] == {'outgoing_repeater_isolates_terminal_no_transport_return': 50}
assert len(ledger['transfers']) == 352
assert len(ledger['effective_cut_ledger']) == 661
assert len(ledger['direct_foreign_boundaries']) == 48
assert m['foreign_source_transfers_still_pending'] == 37
pins = dict(report['source_sha256'])
for dirname, expected in [
    ('dispatch-global-colocation-v6-inverted-v1', '5b01e63abb25bff6c9670496068e2ced3dac0dc5a1dfc186efd79bc1bf9891fb'),
    ('dispatch-polarity-repair-review-v1', '09462bea6bf808fc54b609280472c75246af4494f11262bf196bc9b8deda39ff'),
]:
    p = HERE.parent / dirname / 'source-manifest.json'
    assert sha(p) == expected
    source = json.loads(p.read_text())
    for name, digest in source['source_sha256'].items():
        assert name not in pins or pins[name] == digest
        pins[name] = digest
    pins[str(p.relative_to(ROOT))] = expected
for name in ['reconcile.mjs', 'reconciliation.json', 'assembly-ledger.json',
             'reciprocal-endpoints.csv', 'README.md', 'RESUME.md', 'manifest.py']:
    p = HERE / name
    pins[str(p.relative_to(ROOT))] = sha(p)
verify(pins)
data = {'status': 'frozen_read_only_dispatch_reciprocal_and_direct_edge_reconciliation',
        'source_sha256': dict(sorted(pins.items())), 'metrics': m,
        'transfer_counts': ledger['transfer_counts'],
        'candidate_unchanged': True, 'timing_acceptance': False,
        'native_acceptance': False, 'complete_connected_candidate': False,
        'limits': report['limits']}
TARGET.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps({'manifest_sha256': sha(TARGET), 'pins': len(pins), 'metrics': m}))
