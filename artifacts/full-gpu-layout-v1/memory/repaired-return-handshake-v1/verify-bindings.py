"""Source closure for reused normal-bank paths and the exact inspection recipe."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];pins={}
def read(p):
 pins[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.load(open(p))
manifest=M/'feedback-composition-review-v2/source-manifest.json';assert hashlib.file_digest(manifest.open('rb'),'sha256').hexdigest()=='273b4b23e6014bedaf8a61ca1c5861616d58407d631a9fb6194c00404b5b50f4'
r=read(manifest);read(M/'feedback-composition-review-v2/composition.json');cold=read(M/'master-cold-compatible-v2/design.json');world={tuple(v['position'][a] for a in 'xyz'):v['block'] for v in cold['blocks']};del cold
bank=read(M/'bank-sampled-admission-v1/bank.json');query=read(H/'bank-ownership-paths.json');names={n for d in query['paths'].values() for n in d['allowed_nets']};keys={tuple(map(int,k.split(','))) for k,v in bank['nets'].items() if v in names};bm={tuple(v['position'][a] for a in 'xyz'):v['block'] for v in bank['blocks']};checks=0
for ox,oy,oz in [(148,26,1078),(580,26,1078),(148,26,1700),(580,26,1700)]:
 for p in keys:
  q=(p[0]+ox,p[1]+oy,p[2]+oz);assert world[q]==bm[p],(p,q);checks+=1
# The4 overlay families must not touch the selected normal-bank path cells.
changed=set()
for folder,field in [('return-loop-repair-v1','substitutions'),('return-feedback-extension-v1','changes'),('return-feedback-extension-v2','changes')]:
 for c in read(M/folder/'delta.json')[field]:
  k=tuple(c['position'][a] for a in 'xyz');changed.add(k);assert world.get(k)==c['before']
  if c['after'] is None:del world[k]
  else:world[k]=c['after']
rel=read(M/'channel-colocation-v1/trial-design.json')
changed.update(tuple(v['position'][a] for a in 'xyz') for v in rel['removed']+rel['blocks'])
for v in rel['removed']:
 k=tuple(v['position'][a] for a in 'xyz');assert world[k]==v['block'];del world[k]
for v in rel['blocks']:
 k=tuple(v['position'][a] for a in 'xyz');assert k not in world;world[k]=v['block']
assert len(world)==3337085
for ox,oy,oz in [(148,26,1078),(580,26,1078),(148,26,1700),(580,26,1700)]:assert not {(p[0]+ox,p[1]+oy,p[2]+oz)for p in keys}&changed
# The3 old local backends retain their exact unqualified local geometry.
legacy=read(M/'channel-backend-control-v1/design.json');ctrl=read(M/'channel-withdrawal-v1/ports.json')['backend_controllers'];legacy_cells=0
for c in ctrl[1:]:
 off=tuple(c['origin'][a] for a in 'xyz')
 for v in legacy['blocks']:
  p=tuple(v['position'][a]+off[i] for i,a in enumerate('xyz'));assert world[p]==v['block'],('legacy backend',c['channel'],p);assert p not in changed;legacy_cells+=1
# The global SR half-path cells are geometrically identical for all4 channels.
sr=read(H/'global_channel0_release-slice.json');srbase={tuple(v['position'][a] for a in 'xyz'):v['block'] for v in sr['blocks'] if 44<=v['position']['x']<=64 and 0<=v['position']['y']<=1 and 168<=v['position']['z']<=176};sr_cells=0
for ch in range(4):
 for p,b in srbase.items():
  q=(p[0]+128*ch,p[1]+80*ch,p[2]);assert world[q]==b,(ch,p,q);sr_cells+=1
ad=read(M/'channel-retention-v1/design.json');rn=read(H/'regrant-paths.json');anames={n for r in rn['paths'].values()for n in r['allowed_nets']};adcells=0
for v in ad['blocks']:
 p=tuple(v['position'][a]for a in 'xyz')
 if ad['nets'][','.join(map(str,p))]in anames:assert world[p]==v['block'],('regrant path',p);adcells+=1
# Every report dependency that is a frozen physical input is pinned to current bytes.
for f in ['local-paths.json','transport-paths.json','bank-ownership-paths.json','boundary-paths.json','return-output-paths.json','legacy-local-paths.json','retirement-transport-paths.json','regrant-paths.json']:
 d=read(H/f)
 for n,expected in d['source_sha256'].items():assert hashlib.file_digest((ROOT/n).open('rb'),'sha256').hexdigest()==expected,n
for folder in ['channel-colocation-v1','internal-runtime-timing-v1','cold-reset-timing-v1']:
 d=read(M/folder/'source-manifest.json');mp=d.get('source_sha256',d.get('files'));assert mp
 # Validate exact later-used report files, without rehashing thousands of irrelevant parents.
 for n,h in mp.items():
  if n.endswith(('runtime-combined.json','backend-events.json','bank-combined.json','control-cables.json','integrated-cold.json')):
   assert hashlib.file_digest((ROOT/n).open('rb'),'sha256').hexdigest()==h;npath=ROOT/n;pins[n]=h
out={'status':'exact_inspection_recipe_and_normal_bank_path_binding_pass','composition_manifest_sha256':pins[str(manifest.relative_to(ROOT))],'normal_bank_cells_compared':checks,'normal_bank_path_overlay_changes':0,'unchanged_legacy_backend_cells':legacy_cells,'translated_global_SR_cells':sr_cells,'unchanged_actual_regrant_phase_cells':adcells,'frozen_reused_report_hashes_verified':True,'source_sha256':pins,'native_acceptance':False}
pins[str(Path(__file__).resolve().relative_to(ROOT))]=hashlib.file_digest(Path(__file__).resolve().open('rb'),'sha256').hexdigest();(H/'binding-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k!='source_sha256'}))
