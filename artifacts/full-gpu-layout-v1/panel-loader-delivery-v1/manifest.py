"""Freeze the checked two actual panel inputs without admitting the whole layout."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
 for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check'in sys.argv:
 d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'exact_panel_loader_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen folder must not be overwritten'
c=json.loads((H/'checks.json').read_text());l=json.loads((H/'ledger-checks.json').read_text());assert c['status']=='passed_actual_panel_loader_deliveries' and c['metrics']['total_cells']==2192740;assert c['metrics']['cable_mutations']==35 and c['metrics']['gate_mutations']==2;assert l['status']=='exact_six_record_delta_passed'
pins={}
def merge(d):
 for p,h in d.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['global-loader-return-v1','memory/fabric-colocation-v2/bank-ready-collectors-v1','loader-program-colocation-v1/service-live-busy-delivery-v1']:
 p=H.parent/n/'source-manifest.json';d=json.loads(p.read_text());merge(d['source_sha256']);pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['source-functions.json','checks.json','remaining-cuts.json','endpoint-map.json','ledger-checks.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file()and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_author_checked_two_operator_panel_inputs_to_loader','metrics':c['metrics'],'cost':c['cost'],'source_sha256':dict(sorted(pins.items())),'complete_gpu_layout':False,'native_acceptance':False,'complete_timing_acceptance':False,'compact_build_admission':False,'limits':c['limits']},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':c['metrics']}))
