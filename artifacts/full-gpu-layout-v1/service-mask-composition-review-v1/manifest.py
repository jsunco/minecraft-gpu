"""Pin the independent eight-mask review without broadening its proof scope."""
import hashlib
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
TARGET=HERE/'source-manifest.json'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for part in iter(lambda:f.read(8*1024*1024),b''):h.update(part)
    return h.hexdigest()
def verify(pins):
    for name,h in pins.items():assert sha(ROOT/name)==h,name
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256'])
    print(json.dumps({'status':'independent_mask_review_pins_pass','sha256':sha(TARGET),'pins':len(d['source_sha256'])}));raise SystemExit()
assert not TARGET.exists(),'Frozen review is immutable'
d=json.loads((HERE/'independent-review.json').read_text())
assert d['status']=='independent_actual_eight_mask_source_cones_pass'
assert (d['complete_assembly_cells'],d['digital_cases'],d['digital_output_checks'],d['attenuated_runtime_export_cases'],len(d['actual_block_mutations']))==(1700444,512,12288,60,17)
pins=dict(d['source_sha256'])
for parent in ['program-service-composition-v1/source-manifest.json','memory/fabric-colocation-v2/channel3-write-data-source-manifest.json']:
    path=HERE.parent/parent; m=json.loads(path.read_text())
    for name,h in m['source_sha256'].items():
        assert name not in pins or pins[name]==h,name
        pins[name]=h
    pins[str(path.relative_to(ROOT))]=sha(path)
for p in HERE.iterdir():
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
TARGET.write_text(json.dumps({'status':'frozen_independent_actual_eight_mask_review','source_sha256':dict(sorted(pins.items())),
    'metrics':{k:d[k] for k in ['complete_assembly_cells','graph','supported_cone_devices','preserved_original_mask_cells','comparator_replacements','digital_cases','digital_output_checks','attenuated_runtime_export_cases','original_gate_cases','source_aware_positive_repeater_rear_minimum']},
    'limits':d['limits'],'world_mutations':0,'complete_gpu_layout':False,'native_acceptance':False},indent=2)+'\n')
print(json.dumps({'sha256':sha(TARGET),'pins':len(pins)}))
