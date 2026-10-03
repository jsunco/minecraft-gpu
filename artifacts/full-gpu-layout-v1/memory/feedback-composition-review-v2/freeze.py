"""Freeze an inspection recipe and its exact independently checked sources."""
from pathlib import Path
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

if '--check' in sys.argv:
    data = json.loads((HERE / 'source-manifest.json').read_text())
    for name, expected in data['source_sha256'].items():
        assert sha(ROOT / name) == expected, name
    print(json.dumps({'status': 'source_pins_passed', 'pins': len(data['source_sha256'])}))
else:
    assert not (HERE / 'source-manifest.json').exists(), 'Already frozen'
    review = json.loads((HERE / 'independent-review.json').read_text())
    assert review['status'] == 'combined_feedback_screen_passed'
    assert review['remaining_feedback_witnesses'] == []
    assert review['composed_unique_cells'] == 9971064
    assert review['composed_occupied_chunk_columns'] == 45411
    pins = dict(review['source_sha256'])
    sources = ['artifacts/full-gpu-layout-v1/repeater-feedback-census-v1/config.json',
               'artifacts/full-gpu-layout-v1/memory/master-cold-compatible-v2/design.json',
               'artifacts/full-gpu-layout-v1/memory/channel-colocation-v1/trial-design.json',
               'artifacts/full-gpu-layout-v1/memory/return-loop-repair-v1/delta.json',
               'artifacts/full-gpu-layout-v1/memory/return-feedback-extension-v1/delta.json',
               'artifacts/full-gpu-layout-v1/memory/return-feedback-extension-v2/delta.json']
    recipe = {'status': 'source_bound_inspection_composition_not_build_admission',
              'source_sha256': {p: pins[p] for p in sources},
              'order': ['Use the exact26-instance reference config.',
                        'For memory, verify every original full block state and remove/add the channel0 patch.',
                        'Apply all50 in-place return-entry substitutions.',
                        'Apply the explicit additional-return changes; null denotes absence.',
                        'Apply the longer owner2/consumer3 approach repair using its exact before/after states.',
                        'Interpret historical route metadata with all explicit new paths and prefix overrides.'],
              'selected': False, 'full_electrical_acceptance': False, 'native_acceptance': False}
    (HERE / 'composition.json').write_text(json.dumps(recipe, indent=2) + '\n')
    for name in ['README.md', 'check.mjs', 'freeze.py', 'composition.json', 'independent-review.json']:
        path = HERE / name
        pins[str(path.relative_to(ROOT))] = sha(path)
    for name, expected in pins.items():
        assert sha(ROOT / name) == expected, name
    result = {'status': 'frozen_independent_four_patch_memory_repair_composition_screen',
              'source_sha256': dict(sorted(pins.items())), 'selected': False,
              'complete_gpu_layout': False, 'native_acceptance': False}
    path = HERE / 'source-manifest.json'
    path.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'manifest_sha256': sha(path), 'review_sha256': sha(HERE / 'independent-review.json'), 'pins': len(pins)}))
