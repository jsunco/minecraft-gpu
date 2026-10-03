# Explicit authored file inventory; no recursive source discovery or live tools.
from pathlib import Path
import hashlib,json,sys
R=Path(__file__).resolve().parents[4];B=Path('artifacts/full-gpu-layout-v1/memory');H=lambda p:hashlib.sha256((R/p).read_bytes()).hexdigest();save='--save'in sys.argv
base=['hardware/memory-layout-subarray.mjs','hardware/address-decoder4.mjs',str(B/'ram16x8.json'),str(B/'interface.json'),'reference/tiny-gpu/src/gpu.sv','reference/tiny-gpu/src/controller.sv','reference/tiny-gpu/src/lsu.sv']
assert H(Path(base[0]))=='d7b65b4434cdd3ffa31de4ae1e015ff6683ba1e47cbe7a765f24cea0bea1cc19'
assert H(Path(base[1]))=='b0872a2188089f10494cfa89f531c38d0e7328b84460533bcd24db936c993776'
configs=[('data-bank64-v1','memory-layout-data-bank.mjs',[],[]),('data-backing256-v1','memory-layout-data-backing.mjs',['data-bank64-v1'],['ports.json']),('data-owner-v1','memory-layout-data-owner.mjs',[],[]),('data-owned-bank-v1','memory-layout-data-owned-bank.mjs',['data-bank64-v1','data-owner-v1'],['check-power.py','power-checks.json']),('data-fabric-v1','memory-layout-data-fabric.mjs',['data-owned-bank-v1','data-backing256-v1'],['ports.json','channel-contract.json','freeze-sources.py'])]
for name,hardware,parents,extra in configs:
 files=set(base)|{'hardware/'+hardware}|{str(B/name/f)for f in['design.json','inventory.json','README.md','check.mjs','checks.json']+extra}
 for parent in parents:
  p=B/parent/'source-manifest.json';m=json.loads((R/p).read_text());files.update(m['source_sha256']);files.add(str(p))
 pins={f:H(Path(f))for f in sorted(files)};d=json.loads((R/B/name/'design.json').read_text());manifest={'status':'frozen_offline_geometry_checkpoint','selected':False,'complete_data_memory_boundary':False,'native_acceptance':False,'source_sha256':pins,'metrics':d['metrics'],'missing':d['missing']};p=R/B/name/'source-manifest.json'
 if save:p.write_text(json.dumps(manifest,indent=2)+'\n')
 else:assert json.loads(p.read_text())==manifest,('source mismatch',name)
 print(json.dumps({'package':name,'source_pins':len(pins),'manifest_sha256':H(B/name/'source-manifest.json'),'blocks':d['metrics']['blocks']}))
