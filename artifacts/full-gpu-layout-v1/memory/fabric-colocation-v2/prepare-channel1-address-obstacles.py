from pathlib import Path
import json,hashlib
here=Path(__file__).resolve().parent
prior=here/'channel0-address-external-obstacles.json'
owner=here.parent.parent/'loader-program-colocation-v1/service-owner-open-delivery-v1/delta.json'
a=json.loads(prior.read_text());b=json.loads(owner.read_text())
h=hashlib.sha256(owner.read_bytes()).hexdigest();assert h=='dc843e8f7651d1fb5b949405f0a1e31926e3bd1f2bf4f0c64dbfce0a313167c8'
assert len(b['new_cells'])==3360
a['blocks'] += [dict(v,reserved_owner='service/owner_open') for v in b['new_cells']]
assert len({tuple(v['position'][k] for k in ['x','y','z']) for v in a['blocks']})==len(a['blocks'])
a['observed_sources']['owner_open']={'path':str(owner.relative_to(here.parents[3])),'sha256':h}
a['counts']['owner_open']=3360
a['source_sha256']={'channel0-address-external-obstacles.json':hashlib.sha256(prior.read_bytes()).hexdigest(),'prepare-channel1-address-obstacles.py':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(here/'channel1-address-external-obstacles.json').write_text(json.dumps(a,separators=(',',':'))+'\n')
print(json.dumps({'cells':len(a['blocks']),'owner_open_sha256':h}))
