"""Observe exact foreign draft bounds; no program-composition acceptance."""
from pathlib import Path
import json,hashlib
P=Path(__file__).resolve().parent;root=P.parents[3]
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
d=read(P/'channel3-write-data-design.json');old={tuple(v['position'][a]for a in 'xyz')for v in read(P/'channel2-write-data-design.json')['blocks']};added=[v for v in d['blocks']if tuple(v['position'][a]for a in 'xyz')not in old]
def box(rows):return {a:[min(v['position'][a]for v in rows),max(v['position'][a]for v in rows)]for a in 'xyz'}
b=box(added);observations=[]
for name in ['new-program-obstacles.json','cable-delta.json']:
 p=root/'artifacts/full-gpu-layout-v1/program-service-composition-v1'/name;f=read(p);bounds=box(f['blocks']);gaps={a:max(0,b[a][0]-bounds[a][1],bounds[a][0]-b[a][1])for a in 'xyz'};assert max(gaps.values())>4,(name,gaps)
 observations.append({'path':str(p.relative_to(root)),'observed_sha256':sha(p),'cells':len(f['blocks']),'box':bounds,'axis_separation_from_every_new_channel3_cell':gaps})
out={'status':'observed_exact_program_and_quiet_cable_separated_from_all_new_channel3_neighborhoods','new_channel3_cells':len(added),'new_box':b,'observed_foreign_sources':observations,'source_sha256':{n:sha(P/n)for n in ['check-channel3-program-separation.py','channel3-write-data-design.json','channel2-write-data-design.json']},'limits':['Exact observed foreign draft hashes and bounding separation only; foreign files are not frozen or admitted by this memory artifact.','Separation greater than4 on an axis excludes a common radius2 effective-input receiver.','Root still owns final program/quiet/loader union and functional checks; later foreign changes require recheck.']}
(P/'channel3-program-separation-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
