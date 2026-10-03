"""Explicit local/source pins; no recursive generated-history discovery."""
from pathlib import Path
import json, hashlib, sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def main():
    if '--check' in sys.argv:
        d=json.load((H/'source-manifest.json').open())
        for name,value in d['source_sha256'].items():assert sha(ROOT/name)==value,name
        print(json.dumps({'status':'source_pins_passed','pins':len(d['source_sha256'])}));return
    foreign=json.load((H/'foreign-check.json').open())
    pins=dict(foreign['source_sha256'])
    paths=[H/n for n in ['README.md','prepare.py','check.py','manifest.py','delta.json','parent-slices.json','selected-config.json','foreign-check.json','checks.json','cable-witnesses.json']]
    paths += [ROOT/'hardware/memory-layout-consumer-returns.mjs',ROOT/'hardware/full-gpu-signal-descent.mjs',H.parent/'program-rom-timing-v1/check.py',H.parent/'master-cold-compatible-v2/source-manifest.json',H.parent/'channel-colocation-v1/source-manifest.json',H.parent/'channel-colocation-v1/audit-original-feedback.mjs']
    for p in paths:pins[str(p.relative_to(ROOT))]=sha(p)
    d={'status':'offline_return_loop_repair_source_freeze','source_sha256':dict(sorted(pins.items())),'substitutions':50,'native_acceptance':False,'selected_geometry':False}
    (H/'source-manifest.json').write_text(json.dumps(d,indent=2)+'\n')
    print(json.dumps({'manifest_sha256':sha(H/'source-manifest.json'),'pins':len(pins)}))
if __name__=='__main__':main()
