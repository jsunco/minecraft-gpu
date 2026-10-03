"""Freeze this finite additive source map; exclude peer reviews and later work."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
parent=H.parent/'consumer-return-v1/source-manifest.json'
assert sha(parent)=='ecea996fc712bf92bb2aa5f5e8c93efa96f510b80613c83e8878de1c6c050c3a'
files=json.loads(parent.read_text())['source_sha256'].copy()
for p,h in files.items():assert sha(ROOT/p)==h,p
for p in [parent,*[H/n for n in ['design.json','ports.json','inventory.json','README.md','check-power.py','power-checks.json','check-bindings.mjs','bindings-checks.json','freeze-sources.py']],ROOT/'hardware/memory-layout-internal-address-fanout.mjs',H.parent/'internal-joins-v1/pending.json']:
 k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
for n in ['power-checks.json','bindings-checks.json']:assert json.loads((H/n).read_text())['status'].endswith('_pass'),n
out={'status':'frozen_offline_internal_address_fanout_candidate','source_sha256':dict(sorted(files.items())),'blocks':2731286,'added_blocks':365158,'retained_address_bits':32,'source_to_bank_joins':128,'actual_address_recipients':256,'complete_internal_address_geometry':True,'complete_memory_geometry':False,'native_acceptance':False}
path=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(path.read_text())==out
else:path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(path)}))
