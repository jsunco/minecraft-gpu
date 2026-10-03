"""Freeze inventory only; nested connected subgroups have separate manifests."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
TARGET=HERE/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
    for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
    d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'frozen_inventory_pins_pass','pins':len(d['source_sha256']),'manifest_sha256':sha(TARGET)}));raise SystemExit()
d=json.loads((HERE/'inventory.json').read_text());m=d['metrics'];assert m['selected_cells']==346334 and m['program_source_bits']==4096 and m['side_locked_payload_stores']==25 and m['retained_protocol_states']==2
assert m['external_effective_cuts']==141 and m['internal_group_effective_cuts']==58 and m['current_program_corrections']==4
pins=dict(d['source_sha256'])
for p in sorted(HERE.iterdir()):
    if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
for p in sorted((HERE/'history').rglob('*')):
    if p.is_file():pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_actual_loader_program_inventory_only','source_sha256':dict(sorted(pins.items())),'metrics':m,'selected_cells_connected':False,'native_acceptance':False,'complete_loader_program':False,'limits':d['limits']},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins)}))
