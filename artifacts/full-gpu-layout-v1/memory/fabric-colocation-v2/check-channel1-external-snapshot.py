from pathlib import Path
import json,hashlib
here=Path(__file__).resolve().parent
root=here.parents[3]
snapshot=here/'channel1-address-external-obstacles-v4.json'
a=json.loads(snapshot.read_text());sources={}
for name,entry in a['observed_sources'].items():
 path=root/entry['path'];sha=hashlib.sha256(path.read_bytes()).hexdigest();assert sha==entry['sha256'],name;sources[name]=json.loads(path.read_text())
expected=[]
for name in ['panels','program','quiet']:
 expected.extend(dict(v,reserved_owner=name) for v in sources[name]['blocks'])
for field in ['placed_loader','placed_masks','new_cells']:
 expected.extend(dict(v,reserved_owner='service/'+field) for v in sources['service'][field])
for name,field,tag in [('owner_open','new_cells','service/owner_open'),('payload_open','new_cells','service/payload_open'),('dispatch_global','blocks','root/dispatch_global'),('dispatch_quiet','new_cells','root/dispatch_quiet')]:
 expected.extend(dict(v,reserved_owner=tag) for v in sources[name][field])
assert expected==a['blocks'];assert a['replacements']==sources['service']['replacements'];assert len(expected)==539932;assert len({tuple(v['position'][k] for k in ['x','y','z']) for v in expected})==len(expected)
out={'status':'all539932_reserved_foreign_cells_and8_replacements_equal_exact_observed_source_rows','cells':len(expected),'replacements':8,'observed_sources':a['observed_sources'],'source_sha256':{n:hashlib.sha256((here/n).read_bytes()).hexdigest() for n in ['check-channel1-external-snapshot.py','channel1-address-external-obstacles-v4.json']},'limits':['Exact row/byte source identity only. All foreign internal functions are separately owned and new foreign changes require another snapshot.','Future source-manifest closures may admit separately frozen sources; these observed hashes alone do not assert their function or timing acceptance.']}
(here/'channel1-address-external-snapshot-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['observed_sources','source_sha256']}))
