"""Check every incident cable against independent actual-block graph edges."""
from pathlib import Path
import hashlib,json
import numpy as np
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];SRC=B/'compact-core-fault-v1';old=B/'control-complete-timing-v1'
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
patch=json.loads((SRC/'trial-design.json').read_text());c=np.load(H/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];edges=c['edges'];P=lambda p:tuple(p[a]for a in'xyz')
paths=[(r['name'],[P(r['source']),P(r['tap'])]+[P(p)for p in r['path']]+[P(r['arrival']),P(r['destination'])])for r in patch['connections']];wanted={p for _,seq in paths for p in seq};idx={tuple(map(int,p)):i for i,p in enumerate(pos)if modes[i]==0 and tuple(map(int,p))in wanted};assert len(idx)==len(wanted)
source_nodes={idx[p]for _,seq in paths for p in seq[:-1]};mask=np.zeros(len(pos),dtype=bool);mask[list(source_nodes)]=True;actual={tuple(map(int,e))for e in edges[mask[edges[:,0]]]};rows=[]
for name,seq in paths:
 for a,b in zip(seq,seq[1:]):assert (idx[a],idx[b])in actual,(name,a,b)
 rows.append({'name':name,'actual_consecutive_edges':len(seq)-1,'source':seq[0],'destination':seq[-1]})
# The phase inventory itself must keep every old clock-domain association after
# applying only the rigid translation to the two moved storage cells.
a=json.loads((old/'phase-checks.json').read_text())['phase_paths'];b=json.loads((H/'phase-checks.json').read_text())['phase_paths'];tr={(532,281,-720):(-62,105,0),(544,281,-720):(-50,105,0)};before={(tr.get(tuple(r['storage']),tuple(r['storage'])),r['phase']):r for r in a};after={(tuple(r['storage']),r['phase']):r for r in b};assert set(before)==set(after)
changed=[]
for key,r in after.items():
 q=before[key]
 if any(r[k]!=q[k]for k in ['nominal_min_ticks','nominal_max_ticks']):changed.append({'storage':r['storage'],'phase':r['phase'],'before':[q['nominal_min_ticks'],q['nominal_max_ticks']],'after':[r['nominal_min_ticks'],r['nominal_max_ticks']]})
 assert r['nominal_max_ticks']<=q['nominal_max_ticks'],key
files=[Path(__file__).resolve(),SRC/'trial-design.json',SRC/'source-manifest.json',H/'actual-graph-cache.npz',H/'actual-graph-cache-pins.json',old/'phase-checks.json',H/'phase-checks.json']
r={'status':'independent_actual_cable_and_clock_association_check_passed','routes':rows,'actual_consecutive_edges':sum(r['actual_consecutive_edges']for r in rows),'unchanged_phase_associations':len(before),'changed_phase_bounds':changed,'all_phase_latest_arrivals_nonincreasing':True,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['Uses independently rebuilt directional/strong-solid/dust-step graph from complete actual candidate map; authored edges are not graph input.','This checks required connections and complete clock associations. Foreign-frame contact differential remains separately source-bound author evidence and bounded source review.','Neither graph edges nor nominal delays prove pulse, amplitude, event ordering or native acceptance.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'route-graph-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'routes':len(rows),'actual_edges':r['actual_consecutive_edges'],'phase_associations':len(before),'changed':len(changed)}))
