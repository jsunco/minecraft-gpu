"""Freeze only explicit sources/evidence, excluding reviewer and draft files."""
from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def main():
    if '--check' in sys.argv:
        d=json.load((H/'source-manifest.json').open())
        for n,v in d['source_sha256'].items():assert sha(ROOT/n)==v,n
        print(json.dumps({'status':'source_pins_passed','pins':len(d['source_sha256'])}));return
    pins=dict(json.load((H/'foreign-check.json').open())['source_sha256'])
    names=['README.md','layout.py','prepare.py','check.py','check-feedback.mjs','manifest.py','delta.json','cable-slice.json','selected-config.json','foreign-check.json','checks.json','cable-witnesses.json','feedback-checks.json']
    paths=[H/n for n in names]+[H.parent/'return-loop-repair-v1/check.py',H.parent/'return-loop-repair-v1/source-manifest.json',H.parent/'program-rom-timing-v1/check.py',H.parent/'channel-colocation-v1/source-manifest.json',H.parent/'master-cold-compatible-v2/source-manifest.json',H.parents[1]/'repeater-feedback-census-v1/source-manifest.json',H.parents[1]/'repeater-feedback-census-v1/dependencies.mjs',ROOT/'hardware/memory-layout-consumer-returns.mjs',ROOT/'hardware/full-gpu-signal-descent.mjs']
    for p in paths:pins[str(p.relative_to(ROOT))]=sha(p)
    d={'status':'offline_additional_return_feedback_repair_source_freeze','source_sha256':dict(sorted(pins.items())),'census_witnesses':22,'cell_delta':-368,'native_acceptance':False,'selected_geometry':False}
    (H/'source-manifest.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(H/'source-manifest.json'),'pins':len(pins)}))
if __name__=='__main__':main()
