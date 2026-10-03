"""Freeze read-only37 source binding evidence; does not admit new geometry."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'read_only_binding_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Never rewrite a freeze'
c=json.loads((HERE/'checks.json').read_text())
f=json.loads((HERE/'source-functions.json').read_text())
assert c['status']=='passed_source_specific37_binding_contract_with8_missing_mask_gadgets_and_no_routes'
assert c['metrics']['original_held_cases']==3170 and c['metrics']['current_held_cases']==3154
assert c['metrics']['retained_root_identity_checks']==97 and c['metrics']['new_geometry_cells']==0
assert c['metrics']['missing_loader_masks']==8 and c['metrics']['missing_allocator_comparator_integrations']==8
assert not f['errors']
pins={}
for path in [HERE.parent/'service-quiet-loader-link-v1/source-manifest.json',HERE.parent.parent/'memory/fabric-colocation-v2/channel1-write-data-source-manifest.json']:
    d=json.loads(path.read_text());verify(d['source_sha256'])
    for p,h in d['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
    pins[str(path.relative_to(ROOT))]=sha(path)
for p,h in c['source_sha256'].items():assert p not in pins or pins[p]==h,p;pins[p]=h
for p in sorted(HERE.rglob('*')):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_read_only37_service_witness_producer_bindings','source_sha256':dict(sorted(pins.items())),'metrics':c['metrics'],'limits':c['limits'],'geometry_tip':'6b24f9a714caf7ffc2595ec62130264c0feba8d6c0e84be12df861bdab5347c7','whole_assembly_transform':None,'native_acceptance':False},indent=2)+'\n')
print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'new_geometry_cells':0,'new_routes':0}))
