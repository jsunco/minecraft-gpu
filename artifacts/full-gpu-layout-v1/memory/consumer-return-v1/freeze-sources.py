"""Finite authored source map; reviewer receipts stay outside the freeze."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
parent=H.parent/'bank-sampled-admission-v1/source-manifest.json'
assert sha(parent)=='a0a5fb2ebcf50d554d24d1da66c2f52a6daa2d55ba26d657a40004356e9fd9b0'
files=json.loads(parent.read_text())['source_sha256'].copy()
for p,h in files.items():assert sha(ROOT/p)==h,p
for p in [parent,*[H/n for n in ['design.json','matrix.json','ports.json','inventory.json','README.md','check-matrix.py','matrix-checks.json','check-power.py','power-checks.json','check-bindings.mjs','bindings-checks.json','freeze-sources.py']],*[ROOT/'hardware'/n for n in ['memory-layout-consumer-return-matrix.mjs','memory-layout-consumer-returns.mjs','full-gpu-literal-network.mjs','full-gpu-signal-descent.mjs']]]:
 k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
out={'status':'frozen_offline_consumer_return_candidate','source_sha256':dict(sorted(files.items())),'blocks':2366128,'added_blocks':266208,'actual_source_connections':80,'outward_fields':80,'complete_memory_geometry':False,'native_acceptance':False}
path=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(path.read_text())==out
else:path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(path)}))
