"""Tie complete routing reservations to later exact independent source freezes."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];pins={}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
records=[]
for snapshot,source,manifest,expected,cells in [
 ('ready-reservation-v1.json','../../memory/fabric-colocation-v2/bank-ready-collectors-v1/delta.json','../../memory/fabric-colocation-v2/bank-ready-collectors-v1/source-manifest.json','aa2eac00ab251ce74a650451a4c97fdeadf636effcf176a0d9fbc5ebd70b5125',49456),
 ('root-return-reservation-v1.json','../../global-loader-return-v1/delta.json','../../global-loader-return-v1/source-manifest.json','3eac886044516ba07fefb591ec0e16e59d382bdce4086dda69cb6ae30d27af07',3648)]:
 a=(H/snapshot).resolve();b=(H/source).resolve();m=(H/manifest).resolve();assert sha(a)==sha(b);assert sha(m)==expected;d=json.loads(m.read_text());assert d['source_sha256'][str(b.relative_to(ROOT))]==sha(b);assert not any('service-live-busy-delivery-v1/'in k for k in d['source_sha256']);assert len(json.loads(a.read_text())['new_cells'])==cells
 for p in [a,b,m]:pins[str(p.relative_to(ROOT))]=sha(p)
 records.append({'snapshot':snapshot,'frozen_delta':str(b.relative_to(ROOT)),'delta_sha256':sha(b),'manifest_sha256':expected,'cells':cells,'reverse_dependency':False})
pins[str(Path(__file__).resolve().relative_to(ROOT))]=sha(Path(__file__).resolve());report={'status':'exact_routing_reservations_match_frozen_sources','records':records,'source_sha256':pins,'limits':['This equality check resolves the historical provisional labels. Foreign source acceptance remains scoped to its own frozen receipts. No circular manifest pins.']};(H/'latest-freeze-correspondence.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'status':report['status'],'reserved_cells':sum(r['cells']for r in records)}))
