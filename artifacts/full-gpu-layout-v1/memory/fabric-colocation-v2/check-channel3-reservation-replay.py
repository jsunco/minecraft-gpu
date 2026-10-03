"""Verify cached replay changed only external reservation metadata."""
from pathlib import Path
import json, hashlib
P=Path(__file__).resolve().parent
read=lambda n:json.loads((P/n).read_text())
hashfile=lambda n:hashlib.sha256((P/n).read_bytes()).hexdigest()
before=read('channel3-routing-completion.json'); after=read('channel3-write-data-design.json')
for k,want in before['geometry_sha256'].items():
    got=hashlib.sha256(json.dumps(after[k],separators=(',',':')).encode()).hexdigest()
    assert got==want,(k,got,want)
assert after['additional_external_obstacles']['path']=='channel3-reserved-service-placement-v2.json'
assert after['additional_external_obstacles']['sha256']==hashfile('channel3-reserved-service-placement-v2.json')
assert after['metrics']==before['metrics']
out={'status':'all_actual_geometry_and48cached_paths_unchanged_under_refolded_body_reservation_replay','geometry_sha256':before['geometry_sha256'],'metrics':after['metrics'],'before_design_sha256':before['design_sha256'],'after_design_sha256':hashfile('channel3-write-data-design.json'),'source_sha256':{n:hashfile(n)for n in ['check-channel3-reservation-replay.py','channel3-routing-completion.json','channel3-write-data-design.json','channel3-reserved-service-placement.json','channel3-reserved-service-placement-v2.json','channel3-write-data-paths.json']},'limits':['Cached geometry identity and actual new reservation selection only; ordinary map/numeric/union checks remain separately required.']}
(P/'channel3-reservation-replay-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'status':out['status'],'cells':after['metrics']['cells']}))
