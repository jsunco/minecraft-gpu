"""Exact additive inventory and unchanged metadata, independent of author totals."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(path):
 p=(H/path).resolve();raw=p.read_bytes();pins[str(p.relative_to(ROOT))]=hashlib.sha256(raw).hexdigest();return json.loads(raw)
def key(p):return (p['x'],p['y'],p['z'])
d=read('../core-lane-colocation-v1/final-stage-clear-connected-v1/design.json')
p=read('../core-lane-colocation-v1/final-exit-control-connected-v1/design.json')
r=read('receipt.json');l=read('ledger-receipt.json')
parent={key(x['position']):x['block'] for x in p['blocks']};current={key(x['position']):x['block'] for x in d['blocks']}
body=[b for g in d['logic_bodies'] for b in g['blocks']];new=body+d['added'];new_map={key(x['position']):x['block'] for x in new}
assert len(new_map)==len(new)==21508
assert new_map=={k:b for k,b in current.items() if k not in parent}
assert d['ports']==p['ports'] and d['constant_recipes']==p['constant_recipes']
assert r['metrics']['cells']==len(current)==997299
assert r['metrics']['current_mutations']==64 and r['metrics']['old_mutations']==20
assert l['metrics']['retained_island_cuts']==982 and l['metrics']['current_broader_cuts']==2005
assert all(m['witness'] is not None and m['structural_refusal'] is None for m in r['mutations']+r['old_mutations'])
out={'status':'passed_exact_additive_inventory_and_unchanged_metadata','metrics':{'parent_cells':len(parent),'new_unique_cells':len(new_map),'new_body_cells':len(body),'new_cable_cells':len(d['added']),'current_cells':len(current),'all84_mutations_have_numeric_counterexamples':True},'original_ports_unchanged':True,'constant_recipes_unchanged':True,'source_sha256':pins}
(H/'final-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out['metrics']))
