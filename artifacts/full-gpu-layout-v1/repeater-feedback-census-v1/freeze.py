"""Pin actual inputs plus this bounded offline census; never traverse mutable roots."""
from pathlib import Path
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

if '--check' in sys.argv:
    manifest = json.loads((HERE / 'source-manifest.json').read_text())
    for name, expected in manifest['source_sha256'].items():
        assert sha(ROOT / name) == expected, name
    print(json.dumps({'status': 'source_pins_passed', 'pins': len(manifest['source_sha256'])}))
else:
    assert not (HERE / 'source-manifest.json').exists(), 'Frozen package already exists'
    census = json.loads((HERE / 'census.json').read_text())
    assert census['feedback_witnesses'] == 56
    assert census['known_author_positives_reproduced'] == 34
    assert census['witness_supports_checked'] == 336
    assert census['unique_reference_cells'] == 10015941
    assert census['occupied_chunk_columns'] == 45395
    pins = dict(census['source_sha256'])
    for name, expected in pins.items():
        assert sha(ROOT / name) == expected, name
    for name in ['README.md', 'freeze.py', 'census.json', 'check-fixtures.mjs', 'packed-world.bin']:
        path = HERE / name
        pins[str(path.relative_to(ROOT))] = sha(path)
    for name in ['hardware/memory-layout-large-json-v2.mjs', 'scripts/source-pin-hasher.mjs']:
        pins[name] = sha(ROOT / name)
    manifest = {'status': 'offline_bounded_repeater_feedback_census_frozen',
                'source_sha256': dict(sorted(pins.items())),
                'feedback_witnesses': 56, 'physical_runs': 0,
                'complete_gpu_layout': False, 'selected_build_admission': False}
    path = HERE / 'source-manifest.json'
    path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'manifest_sha256': sha(path), 'pins': len(pins)}))
