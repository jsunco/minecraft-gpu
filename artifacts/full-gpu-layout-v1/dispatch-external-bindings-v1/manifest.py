import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TARGET = HERE / 'source-manifest.json'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p, h in pins.items():
        assert sha(ROOT / p) == h, p
if '--check' in sys.argv:
    d = json.loads(TARGET.read_text()); verify(d['source_sha256'])
    print(json.dumps({'status':'exact_frozen_source_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)})); raise SystemExit()
b = json.loads((HERE / 'bindings.json').read_text())
f = json.loads((HERE / 'function-checks.json').read_text())
assert len(b['incoming']) == 37 and len(b['direct']) == 48
assert len(f['foreign_cut_functions']) == 37 and all(x['interpretation'] == 'positive' for x in f['foreign_cut_functions'])
assert len(f['selected']) == 7 and all(x['old_route_function']['table'] == 2 for x in f['selected'])
pins = dict(b['source_sha256'])
for p, h in f['source_sha256'].items():
    assert p not in pins or pins[p] == h
    pins[p] = h
for folder, expected in [('dispatch-global-colocation-v6-inverted-v1','5b01e63abb25bff6c9670496068e2ced3dac0dc5a1dfc186efd79bc1bf9891fb'),('dispatch-reciprocal-edge-review-v1','6c8dcfde4bc9d947139b61c3bc18d81d1982b85cbc2ea9064ddec709621c4836')]:
    p = HERE.parent / folder / 'source-manifest.json'; assert sha(p) == expected
    parent = json.loads(p.read_text())['source_sha256']
    for n, h in pins.items():
        if n in parent: assert parent[n] == h, n
    pins[str(p.relative_to(ROOT))] = expected
for name in ['prepare.py','transport-functions.mjs','check-functions.mjs','bindings.json','function-checks.json','README.md','RESUME.md','manifest.py']:
    p = HERE / name; pins[str(p.relative_to(ROOT))] = sha(p)
verify(pins)
d = {'status':'frozen_dispatch_external_producer_and_available_compact_port_contract','source_sha256':dict(sorted(pins.items())),
     'metrics':b['metrics'],'additional_named_master_fanouts':len(b['additional_master_fanout_obligations']),
     'classified_old_cut_functions':37,'selected_complete_old_control_functions':7,
     'new_routes_claimed':0,'timing_acceptance':False,'native_acceptance':False,'complete_connected_candidate':False,'limits':b['limits'] + f['limits']}
TARGET.write_text(json.dumps(d,indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':d['metrics'],'additional_master_fanouts':d['additional_named_master_fanouts']}))
