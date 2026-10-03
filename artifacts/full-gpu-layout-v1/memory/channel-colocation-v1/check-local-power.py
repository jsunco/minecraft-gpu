"""Repeat the frozen backend's physical rule checks on the added tail gates."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];source=H.parent/'channel-backend-control-v1/check-power.py'
spec=importlib.util.spec_from_file_location('backend_power',source);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
d=json.loads((H/'local-qualified.json').read_text());result=m.check(d)
result['source_sha256']={str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [source,H/'local-qualified.json',Path(__file__).resolve()]}
(H/'local-power-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
