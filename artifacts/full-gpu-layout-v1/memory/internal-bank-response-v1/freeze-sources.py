"""Finite source map for the physically drawn bank response join; no native calls."""
import hashlib,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
parent=H.parent/'internal-write-fanout-v1/source-manifest.json'
assert sha(parent)=='7712e24577e108ca9573632462c3bf38673c0d47ca5af5dd8194e9dad32e00d9'
files=json.loads(parent.read_text())['source_sha256'].copy()
for p,h in files.items():assert sha(ROOT/p)==h,p
own=[parent,*[H/n for n in ['design.json','ports.json','inventory.json','README.md','collector.json','check-collector.py','collector-checks.json','check-bindings.mjs','bindings-checks.json','check-power.py','power-checks.json','check-json.mjs','json-checks.json','attenuation-before-fix.json','freeze-sources.py']],*[ROOT/'hardware'/n for n in ['memory-layout-bank-response-collector.mjs','memory-layout-internal-bank-response.mjs','memory-layout-large-json-v2.mjs']]]
for p in own:
 k=str(p.relative_to(ROOT));v=sha(p);assert k not in files or files[k]==v,k;files[k]=v
for n in ['power-checks.json','bindings-checks.json']:assert json.loads((H/n).read_text())['status'].endswith('_pass'),n
metrics=json.loads((H/'inventory.json').read_text())
out={'status':'frozen_offline_internal_bank_response_candidate','source_sha256':dict(sorted(files.items())),**metrics,'complete_internal_bank_response_geometry':True,'complete_memory_timing':False,'native_acceptance':False}
path=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(path.read_text())==out
else:path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':'source_pins_checked','files':len(files),'manifest_sha256':sha(path)}))
