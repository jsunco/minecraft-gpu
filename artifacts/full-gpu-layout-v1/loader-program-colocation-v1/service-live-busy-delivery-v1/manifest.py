"""Freeze four source-specific BUSY deliveries and complete shared-frame receipts."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];target=H/'source-manifest.json'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(8*1024*1024):h.update(b)
 return h.hexdigest()
def verify(pins):
 for p,h in pins.items():assert sha(ROOT/p)==h,p
if '--check' in sys.argv:
 d=json.loads(target.read_text());verify(d['source_sha256']);print(json.dumps({'status':'live_busy_pins_pass','manifest_sha256':sha(target),'pins':len(d['source_sha256'])}));raise SystemExit()
assert not target.exists(),'Frozen folder: use a new descendant'
c=json.loads((H/'checks.json').read_text());e=json.loads((H/'evaluator-checks.json').read_text());l=json.loads((H/'ledger-checks.json').read_text());f=json.loads((H/'source-functions.json').read_text());association=json.loads((H/'latest-freeze-correspondence.json').read_text())
assert c['metrics']['total_cells']==2192096 and c['metrics']['actual_inputs']==1823402
assert c['metrics']['new_cells']==3920 and c['metrics']['expanded_source_cases']==4352 and c['metrics']['joint_cases']==544
assert c['metrics']['minimum_new_repeater_rear']==5 and c['full_function_feedback']['nonwire_feedback_components']==0
assert e['metrics']['cases']==96 and e['metrics']['vertex_levels_compared']==784044
assert l['counts']['witness_input_bound_total']==32 and l['counts']['witness_input_pending']==5
assert f['unique_old_cone_devices']==69230 and f['unique_current_cone_devices']==37792
pins={}
def merge(values):
 for p,h in values.items():assert p not in pins or pins[p]==h,p;pins[p]=h
for n,expected in [('../../global-loader-return-v1/source-manifest.json','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07'),('../../memory/fabric-colocation-v2/bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125'),('../service-any-owner-delivery-v1/source-manifest.json','e6482bae4f290f76aa984e7f6fdd0a9476834879aa8204a2367329ee5f115e4e')]:
 p=(H/n).resolve();assert sha(p)==expected;merge(json.loads(p.read_text())['source_sha256']);pins[str(p.relative_to(ROOT))]=expected
for n in ['source-functions.json','evaluator-checks.json','delta.json','checks.json','remaining-cuts.json','endpoint-map.json','ledger-checks.json','latest-freeze-correspondence.json']:merge(json.loads((H/n).read_text())['source_sha256'])
for p in sorted(H.rglob('*')):
 if p.is_file() and p!=target:pins[str(p.relative_to(ROOT))]=sha(p)
verify(pins)
target.write_text(json.dumps({'status':'frozen_four_actual_live_busy_witness_deliveries','metrics':c['metrics'],'ledger_counts':l['counts'],'cost':c['cost'],'source_recovery':{'cold_cells':f['old_cold_cells_streamed'],'old_devices':f['unique_old_cone_devices'],'current_devices':f['unique_current_cone_devices'],'expanded_source_cases':8704,'bank_cases':1024,'local_cases':64,'collector_cases':128},'evaluator_agreement':e['metrics'],'feedback':c['full_function_feedback'],'foreign_freeze_correspondence':association,'source_sha256':dict(sorted(pins.items())),'limits':c['limits']+association['limits'],'native_acceptance':False},indent=2)+'\n')
print(json.dumps({'status':'frozen','manifest_sha256':sha(target),'checks_sha256':sha(H/'checks.json'),'pins':len(pins)}))
