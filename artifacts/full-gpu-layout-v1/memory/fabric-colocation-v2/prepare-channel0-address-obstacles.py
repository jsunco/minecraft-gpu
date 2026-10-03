from pathlib import Path
import json,hashlib
here=Path(__file__).resolve().parent
root=here.parent.parent
sources={
 'panels':root/'loader-bank-panels-v1/delta.json',
 'service':root/'loader-program-colocation-v1/service-mask-memory-composition-v1/composed-delta.json',
 'program':root/'program-service-composition-v1/new-program-obstacles.json',
 'quiet':root/'program-service-composition-v1/cable-delta.json'
}
data={k:json.loads(p.read_text()) for k,p in sources.items()}
hashes={k:hashlib.sha256(p.read_bytes()).hexdigest() for k,p in sources.items()}
assert hashes['service']=='88796d9d24b7b1ec1eb9fa1468bbbf308f384145b0223f37e48bcfa4ace2f259'
rows=[]
for kind in ['panels','program','quiet']:
 rows.extend(dict(v,reserved_owner=kind) for v in data[kind]['blocks'])
for field in ['placed_loader','placed_masks','new_cells']:
 rows.extend(dict(v,reserved_owner='service/'+field) for v in data['service'][field])
assert len({tuple(v['position'][a] for a in ['x','y','z']) for v in rows})==len(rows)
assert len(data['panels']['blocks'])==648
out=dict(status='exact_foreign_geometry_reserved_without_admitting_foreign_functions',blocks=rows,replacements=data['service']['replacements'],observed_sources={k:dict(path=str(p.relative_to(here.parents[3])),sha256=hashes[k]) for k,p in sources.items()},counts={k:len(data[k]['blocks']) for k in ['panels','program','quiet']},service_counts={k:len(data['service'][k]) for k in ['placed_loader','placed_masks','new_cells','replacements']},limits=['Eight service comparator changes apply only to the foreign obstacle/composition context; immutable memory parent cells are not edited.','This exact snapshot is an obstacle reservation. Final whole composition input checks remain required; no foreign function/timing credit.'])
(here/'channel0-address-external-obstacles.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print(json.dumps(dict(cells=len(rows),hashes=hashes,service_counts=out['service_counts'])))
