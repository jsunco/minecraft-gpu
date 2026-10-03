"""Associate the already checked immutable obstacle snapshot with its later freeze."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];pins={}
def read(n):
 p=(H/n).resolve();b=p.read_bytes();pins[str(p.relative_to(ROOT))]=hashlib.sha256(b).hexdigest();return json.loads(b)
manifest=read('../../memory/fabric-colocation-v2/channel3-address-source-manifest.json');mkey='artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/channel3-address-source-manifest.json';assert pins[mkey]=='83b1c8764e62e7c14203eecc780836298c9301c184536759f4ee8d5cbcfcd08c';assert not any('service-any-owner-delivery-v1/'in p for p in manifest['source_sha256'])
observed=read('channel3-address-reservation.json');actual=read('../../memory/fabric-colocation-v2/channel3-address-delta.json');assert observed==actual
key='artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/channel3-address-delta.json';assert pins[key]=='d519cfac8a7f0673fa0104df6e46a897308474d322ae0dee21389bf9a4a747c0';assert manifest['source_sha256'][key]==pins[key];assert len(actual['blocks'])==45064
checks=read('checks.json');assert checks['metrics']['base_cells']==manifest['foreign_composition']['union_cells']==2123212;assert checks['metrics']['preserved_inputs']==manifest['foreign_composition']['baseline_inputs']+manifest['foreign_composition']['address_added_inputs']==1760554
report={'status':'exact_checked_channel3_snapshot_matches_subsequent_source_freeze','source_sha256':pins,'memory_manifest_sha256':pins[mkey],'memory_delta_sha256':pins[key],'memory_delta_cells':45064,'checked_complete_union_cells':checks['metrics']['total_cells'],'checked_complete_union_inputs':checks['metrics']['actual_inputs'],'limits':['checks.json describes the provisional snapshot status at execution. This receipt establishes its exact byte identity with the subsequently frozen channel3 geometry; no geometry was changed or recomputed.','Memory source/protocol ownership remains separate. The combined actual input/support map is the already passed checks.json scope. No state/timing/native admission.']}
(H/'latest-freeze-correspondence.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['source_sha256','limits']}))
