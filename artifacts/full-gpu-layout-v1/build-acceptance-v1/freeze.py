from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent;R=H.parents[2]
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
sources={}
for name in ['cases.json','image-source-map.json','native-plan.json']:
 d=json.loads((H/name).read_text());assert d['native_acceptance'] is False
 for p,h in d['source_sha256'].items():assert sha(R/p)==h,p;assert p not in sources or sources[p]==h;sources[p]=h
assert json.loads((H/'cases.json').read_text())['physical_runs']==0
for p in H.iterdir():
 if p.is_file() and p.name!='source-manifest.json':sources[str(p.relative_to(R))]=sha(p)
r={'status':'frozen_offline_future_native_acceptance_plan','source_sha256':dict(sorted(sources.items())),'valid_images':41,'fault_images':2,'control_and_fault_campaigns':29,'selected_memory_cells_checked':8297,'physical_runs':0,'complete_gpu_layout':False,'native_acceptance':False,'world_mutations':0}
p=H/'source-manifest.json';p.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'manifest_sha256':sha(p),'pins':len(sources),'physical_runs':0}))
