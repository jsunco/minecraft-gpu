"""Freeze/verify the exact repaired offline group. No Minecraft services."""
import hashlib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWN = [
    'README.md', 'RESUME.md', 'manifest.py', 'repair-inversions.mjs',
    'connected-candidate.json', 'inversion-repair.json',
    'check-connected.mjs', 'checks.json', 'check-coverage.mjs', 'coverage.json',
    'check-port-semantics.mjs', 'port-semantics-checks.json',
    'check-source-transport.mjs', 'source-transport-checks.json',
    'remaining-ledger.json', 'add-inversions.mjs',
]
OWN += sorted(str(p.relative_to(HERE)) for p in (HERE / 'history').rglob('*') if p.is_file())


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


target = HERE / 'source-manifest.json'
if '--check' in sys.argv:
    manifest = json.loads(target.read_text())
    for name, expected in manifest['source_sha256'].items():
        assert digest(ROOT / name) == expected, name
    print(json.dumps({'status': 'exact_frozen_source_pins_pass', 'pins': len(manifest['source_sha256'])}))
else:
    pins = {}

    def add_pin(name, expected):
        assert digest(ROOT / name) == expected, name
        assert name not in pins or pins[name] == expected, name
        pins[name] = expected

    for name in OWN:
        path = HERE / name
        add_pin(str(path.relative_to(ROOT)), digest(path))
        if path.suffix == '.json':
            obj = json.loads(path.read_text())
            for name, sha in obj.get('source_sha256', {}).items():
                add_pin(name, sha)
    for relative in [
        'dispatch-global-colocation-v5/source-manifest.json',
        'dispatch-global-colocation-v6/mutable-checkpoint.json',
    ]:
        path = HERE.parent / relative
        add_pin(str(path.relative_to(ROOT)), digest(path))
        parent = json.loads(path.read_text())
        for name, sha in parent['source_sha256'].items():
            add_pin(name, sha)
    checks = json.loads((HERE / 'checks.json').read_text())
    coverage = json.loads((HERE / 'coverage.json').read_text())
    truth = json.loads((HERE / 'source-transport-checks.json').read_text())
    ports = json.loads((HERE / 'port-semantics-checks.json').read_text())
    ledger = json.loads((HERE / 'remaining-ledger.json').read_text())
    assert checks['connected_routes'] == 261
    assert checks['new_internal_dependencies'] == checks['lost_internal_dependencies'] == 0
    assert len(checks['negative_cases']) == 261
    assert coverage['metrics']['complete_cells'] == 189978
    assert coverage['metrics']['checked_matching_transfers'] == 259
    assert truth['checked_transfers'] == 259 and not truth['non_positive']
    assert truth['actual_inverse_transfers'] == 5 and len(truth['negative_cases']) == 10
    assert len(ports['comparator_roles']) == 30 and ports['complete_body_transfer_roots'] == 265
    assert ports['clear_OR_groups'] == 3 and len(ports['negative_cases']) == 16
    assert ledger['transfer_counts']['external_source_transfer_pending'] == 37
    assert len(ledger['effective_cut_ledger']) == 661
    assert len(ledger['direct_foreign_boundaries']) == 48
    result = {
        'status': 'frozen_author_checked_partial_dispatch_global_group_with_required_inverse_branches',
        'source_sha256': dict(sorted(pins.items())),
        'metrics': coverage['metrics'],
        'body_only_transfer_roots_preserved_or_connected': 265,
        'actual_inverse_transfers': 5,
        'remaining_transfer_counts': ledger['transfer_counts'],
        'foreign_direct_boundaries_pending': 48,
        'failed_v6_preserved': True,
        'complete_connected_candidate': False,
        'timing_acceptance': False,
        'native_acceptance': False,
        'selection_changed': False,
    }
    target.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'manifest_sha256': digest(target), 'pins': len(pins), 'metrics': result['metrics'], 'remaining': ledger['transfer_counts']}))
