"""Freeze or verify the exact offline subgroup. No service/runtime imports."""
import hashlib, json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OWN = [
    'README.md', 'manifest.py', 'extract.mjs', 'selected-config.json',
    'inventory.json', 'actual-cuts.json', 'bodies.json', 'stores.json',
    'cell-labels.u16le', 'cell-labels.json', 'reference-scope.json',
    'declared-boundaries.json', 'analyze-cables.mjs', 'transport-cuts.json',
    'place-bodies.mjs', 'body-placement.json', 'body-placement-boundaries.json',
    'route-global-feedback.mjs', 'global-feedback-paths.json',
    'global-feedback-candidate.json', 'check-feedback.mjs',
    'global-feedback-checks.json', 'check-coverage.mjs', 'coverage.json',
]

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

target = HERE / 'source-manifest.json'
if '--check' in sys.argv:
    result = json.loads(target.read_text())
    for name, expected in result['source_sha256'].items():
        assert digest(ROOT / name) == expected, name
    print(json.dumps({'status': 'exact_frozen_source_pins_pass', 'pins': len(result['source_sha256'])}))
else:
    pins = {}
    for name in OWN:
        path = HERE / name
        pins[str(path.relative_to(ROOT))] = digest(path)
        if path.suffix == '.json':
            data = json.loads(path.read_text())
            for p, sha in data.get('source_sha256', {}).items():
                assert digest(ROOT / p) == sha, p
                assert p not in pins or pins[p] == sha, p
                pins[p] = sha
    checks = json.loads((HERE / 'global-feedback-checks.json').read_text())
    coverage = json.loads((HERE / 'coverage.json').read_text())
    assert checks['connected_routes'] == 71 and checks['new_internal_dependencies'] == checks['lost_internal_dependencies'] == 0
    assert coverage['metrics']['checked_matching_transfers'] == 69
    result = {
        'status': 'frozen_partial_connected_dispatch_global_subgroup_offline',
        'source_sha256': dict(sorted(pins.items())),
        'metrics': coverage['metrics'],
        'complete_connected_candidate': False,
        'native_acceptance': False,
        'selection_changed': False,
        'remaining': 'All 661 effective cuts are retained in coverage.json; only 69 source/receiver transfers are connected by this subgroup.',
    }
    target.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'manifest_sha256': digest(target), 'pins': len(pins), 'metrics': result['metrics']}))
