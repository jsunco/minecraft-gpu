"""Freeze only two checked held-global returns and exact obstacle compatibility."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];TARGET=H/'source-manifest.json'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(pins):
 for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
 d=json.loads(TARGET.read_text());verify(d['source_sha256']);print(json.dumps({'status':'exact_global_loader_return_pins_pass','pins':len(d['source_sha256']),'sha256':sha(TARGET)}));raise SystemExit()
assert not TARGET.exists(),'Frozen package must not be rewritten'
c=json.loads((H/'checks.json').read_text());r=json.loads((H/'reservation-checks.json').read_text());l=json.loads((H/'remaining-cuts.json').read_text());assert c['status']=='passed_actual_global_held_returns_to_loader';assert c['metrics']['total_cells']==2138720 and c['metrics']['output_observations']==224;assert c['metrics']['cable_mutations']==167 and c['metrics']['retained_lock_mutations']==5;assert r['metrics']['total_cells']==2188176 and r['metrics']['concurrent_obstacle_cells']==49456;assert sum(v['status']=='pending' for v in l['dispatch']['direct_foreign_boundaries'])==29
pins={}
def merge(values):
 for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n in ['loader-global-delivery-v1/source-manifest.json','global-held-commands-v1/source-manifest.json']:
 p=H.parent/n;d=json.loads(p.read_text());merge(d.get('source_sha256',d.get('files',{})));pins[str(p.relative_to(ROOT))]=sha(p)
for n in ['source-functions.json','checks.json','reservation-checks.json','remaining-cuts.json','endpoint-map.json','ready-reservation.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=TARGET:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins);TARGET.write_text(json.dumps({'status':'frozen_author_checked_two_held_global_returns_to_loader','metrics':c['metrics'],'cost':c['cost'],'concurrent_READY_compatibility':r['metrics'],'source_sha256':dict(sorted(pins.items())),'native_acceptance':False,'complete_gpu_layout':False,'complete_timing_acceptance':False,'compact_build_admission':False,'limits':c['limits']},indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(TARGET),'pins':len(pins),'metrics':c['metrics']}))
