"""Explicit source/evidence closure; no native calls or directory discovery."""
from pathlib import Path
import json, hashlib, sys
H = Path(__file__).resolve().parent
ROOT = H.parents[3]
sha = lambda p: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()
if '--check' in sys.argv:
    d = json.load(open(H / 'source-manifest.json'))
    for n, expected in d['source_sha256'].items():
        assert sha(ROOT / n) == expected, n
    print(json.dumps({'status': 'source_pins_passed', 'pins': len(d['source_sha256'])}))
else:
    reports = ['binding-checks.json', 'boundary-paths.json', 'local-paths.json',
               'legacy-local-paths.json', 'bank-ownership-paths.json',
               'transport-paths.json', 'return-output-paths.json',
               'retirement-transport-paths.json', 'regrant-paths.json', 'combined.json']
    pins = {}
    for name in reports:
        for n, expected in json.load(open(H / name))['source_sha256'].items():
            assert sha(ROOT / n) == expected, (name, n)
            assert n not in pins or pins[n] == expected, n
            pins[n] = expected
    names = '''README.md manifest.py prepare.py recipe.json prepare-boundaries.py
prepare-retirement-transports.py check-local.py check-transport.py inspect-cycle.py
check-bank-ownership.py check-boundaries.py check-return-outputs.py
check-retirement-transports.py check-regrant.py verify-bindings.py combine.py
bank_tail-slice.json tail_return-slice.json matching-slice.json lookup-slice.json
consumer-slice.json raw_valid_front-slice.json global_channel0_release-slice.json
consumer_drain-slice.json retirement-transports-slice.json
local-witnesses.json legacy-local-witnesses.json transport-witnesses.json
bank-ownership-witnesses.json boundary-witnesses.json return-output-witnesses.json
retirement-transport-witnesses.json regrant-witnesses.json additional-cycle.json
historical-three-patch-consumer-cycle-refusal.json'''.split() + reports
    for p in [H / n for n in names] + [H.parent / 'feedback-composition-review-v2/composition.json',
              H.parent / 'feedback-composition-review-v2/independent-review.json']:
        pins[str(p.relative_to(ROOT))] = sha(p)
    result = {'status': 'conditional_four_channel_return_handshake_source_freeze',
              'inspection_composition_manifest_sha256': '273b4b23e6014bedaf8a61ca1c5861616d58407d631a9fb6194c00404b5b50f4',
              'source_sha256': dict(sorted(pins.items())),
              'channels': 4, 'native_acceptance': False,
              'complete_memory_dynamic_acceptance': False, 'selected': False}
    (H / 'source-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'manifest_sha256': sha(H / 'source-manifest.json'), 'pins': len(pins)}))
