"""Freeze exact local certificate inputs. No geometry/native operation."""
from pathlib import Path
import json,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[2];B=H.parent;sources={}
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def add(p,h=None):
 p=Path(p);p=p if p.is_absolute()else ROOT/p;n=str(p.relative_to(ROOT));h=h or sha(p)
 assert n not in sources or sources[n]==h,n
 assert sha(p)==h,n;sources[n]=h
for n in ['paths.json','fetch-arcs.json','source-guards.json','epochs.json']:
 p=H/n;r=json.loads(p.read_text());add(p)
 for name,h in r['source_sha256'].items():add(name,h)
for n in ['global-complete-timing-v1/checks.json','memory/cold-reset-timing-v1/integrated-cold.json']:
 r=json.loads((B/n).read_text())
 for name,h in r['source_sha256'].items():add(name,h)
for n in ['master-core-conditioning-routes-v1/source-manifest.json','master-core-conditioning-routes-v1/design.json','master-core-conditioning-routes-v1/check.mjs']:add(B/n)
# Include the precise proof/geometry references without substituting their
# broad acceptance scope for the explicitly selected arcs in this package.
for n,h in {
 'compact-core-guard-v1/source-manifest.json':'cb4b955e6e7405a637e4573ef629f3a53ca3065377f9d519d0e9730150fab922',
 'compact-core-guard-timing-v1/source-manifest.json':'f8df2a8b3f17868966ef35c700a02a30204c64ff16767de0b83861029bea31ef',
 'control-fetch-epoch-timing-v1/source-manifest.json':'ce86101ae5160f6177337ec8f928a96601baba1d833137d0a5d7583382b27349',
 'master-reset-requesters-v2/source-manifest.json':'573bda505e4617f5e8ffcef4005af2bcc9bb788eb45423b9474ace1aeb519f3c'
}.items():add(B/n,h)
for n in ['README.md','extract-paths.py','extract-fetch-arcs.py','check-source-guards.mjs','check-epochs.py','prepare-manifest.py']:add(H/n)
r=json.loads((H/'epochs.json').read_text())
assert len(r['negative_refusals'])==14 and r['source_guard_missing_input_refusals']==44
assert not r['scope']['native_acceptance']and not r['scope']['full_core_timing_acceptance']
assert [v['held_Q_to_RF_input_rise_max']for v in r['cold']['same_origin_transport']]==[920,1156]
m={'status':'source_bound_conditional_local_FETCH_cold_warm_certificate','parent_geometry':'artifacts/full-gpu-layout-v1/compact-core-guard-v1/design.json','parent_manifest_sha256':'cb4b955e6e7405a637e4573ef629f3a53ca3065377f9d519d0e9730150fab922','cold_local_zero_and_flush':True,'warm_local_park_and_flush':True,'remote_drain_freshness_proved':False,'full_core_timing_acceptance':False,'native_acceptance':False,'source_sha256':dict(sorted(sources.items()))}
p=H/'source-manifest.json'
if '--check'in sys.argv:assert json.loads(p.read_text())==m
else:p.write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'pins':len(sources),'manifest_sha256':sha(p),'remote_drain_freshness_proved':False,'native_acceptance':False}))
