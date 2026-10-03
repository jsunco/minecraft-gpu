"""Explicit source/evidence freeze; no native actions or dynamic file discovery."""
from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
if '--check' in sys.argv:
 d=json.load(open(H/'source-manifest.json'))
 for n,v in d['source_sha256'].items():assert sha(ROOT/n)==v,n
 print(json.dumps({'status':'source_pins_passed','pins':len(d['source_sha256'])}))
else:
 pins=dict(json.load(open(H/'foreign-check.json'))['source_sha256']);pins.update(json.load(open(H/'checks.json'))['source_sha256'])
 names=['README.md','layout.py','prepare.py','check.py','manifest.py','delta.json','cable-slice.json','all-transports.json','selected-config.json','foreign-check.json','checks.json','cable-witnesses.json','original-cycle.json']
 for p in [H/n for n in names]+[H.parent/'return-loop-repair-v1/source-manifest.json',H.parent/'return-feedback-extension-v1/source-manifest.json',H.parent/'channel-colocation-v1/source-manifest.json',H.parent/'master-cold-compatible-v2/source-manifest.json',H.parent/'feedback-composition-review-v1/source-manifest.json',H.parent/'feedback-composition-review-v1/independent-review.json',ROOT/'hardware/memory-layout-consumer-returns.mjs']:
  pins[str(p.relative_to(ROOT))]=sha(p)
 d={'status':'offline_longer_return_feedback_repair_source_freeze','source_sha256':dict(sorted(pins.items())),'repaired_positive_device_component':8,'complete_return_cables':80,'cell_delta':8,'native_acceptance':False,'selected':False}
 (H/'source-manifest.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(H/'source-manifest.json'),'pins':len(pins)}))
