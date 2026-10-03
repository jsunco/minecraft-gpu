"""Actual fetch/IR SCC under explicitly settled zero-input gate assumptions.
This is a conditional sensitivity proof, not a cold convergence or event simulator.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'compact-core-fault-timing-v1'
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
cache=np.load(REF/'actual-graph-cache.npz');positions=cache['positions'];mode=cache['modes'];cost=cache['cost'];edges=cache['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores']
lo=np.array([-151,-16,-87]);hi=np.array([287,127,189]);inside=np.all((positions>=lo)&(positions<=hi),axis=1);ids=np.flatnonzero(inside);old_to_new=np.full(len(positions),-1,dtype=np.int32);old_to_new[ids]=np.arange(len(ids));take=inside[edges[:,0]]&inside[edges[:,1]];edges=old_to_new[edges[take]];pos=positions[ids];cost=cost[ids];mode=mode[ids]
idx={(tuple(map(int,p)),int(mode[i])):i for i,p in enumerate(pos)}
store_cuts={idx[(tuple(s['storage']),0)]for s in stores if (tuple(s['storage']),0)in idx}
keep=np.ones(len(pos),dtype=np.bool_);keep[list(store_cuts)]=False;edges=edges[keep[edges[:,1]]]
# These real subtract comparators have a normalized zero rear or15 side in
# the stated settled mode. Their outputs are independent of other inputs.
mode_cuts=[
 {'mode':'captured_handoff_to_DECODE','position':[100,1,170],'formula':'memory_valid=effective_request&&!captured','premise':'Captured is held1 and its real normalized side is15 until FI0 has reached the fetch gate. This is earned by capture/close ordering and held-intent skew, not assumed for a new transaction.'},
 {'mode':'old_IR_tail_handoff_to_FETCH','position':[-26,1,90],'formula':'fetch_request=FI&&!IR_tail','premise':'The prior completed operation held IR tail1 for multiple cycles. Its normalized side remains15 until R0 causes the tail fall; the R0 gate premise has then already arrived.'},
 {'mode':'normal_FETCH_after_R_low_arrival','position':[190,1,-52],'formula':'admitted=R&&!F','premise':'R is held0 at this comparator rear, so output is0 independently of F; its full tail then drains.'},
 {'mode':'held_operation_after_fetch_intent_low_arrival','position':[-26,1,90],'formula':'fetch_request=held_fetch_intent&&!IR_tail','premise':'held_fetch_intent is0 at this comparator rear, so request is0 independently of tail.'},
 {'mode':'reset_after_effective_mask_arrival','position':[80,1,170],'formula':'effective_request=fetch_request&&!reset','premise':'actual reset side has normalized15 and remains asserted; no data source exceeds15.'}]
# Verify the mode cut is an actual subtract comparator in the selected core,
# rather than a label-only graph edit. This read is offline.
core=B/'compact-core-fault-v1/design.json';world={tuple(v['position'][a]for a in['x','y','z']):v['block']for v in json.loads(core.read_text())['blocks']if all(lo[j]<=v['position'][a]<=hi[j]for j,a in enumerate(['x','y','z']))}
for c in mode_cuts:assert world[tuple(c['position'])]=={'id':'minecraft:comparator','properties':{'facing':'west','mode':'subtract'}}
frontend_cells=json.loads((B/'program-interface-timing-v1/frontend-cells.json').read_text())['blocks']
for cell in frontend_cells:assert world[tuple(cell['position'][a]for a in['x','y','z'])]==cell['block']
assert len(frontend_cells)==1446
def analyze(cuts):
 k=np.ones(len(pos),dtype=np.bool_);k[[idx[(tuple(p),0)]for p in cuts]]=False;e=edges[k[edges[:,1]]];g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(len(pos),len(pos))).tocsr();n,lab=connected_components(g,directed=True,connection='strong');sizes=np.bincount(lab,minlength=n);w=np.zeros(n,dtype=np.int64);np.maximum.at(w,lab,cost);cycles=np.flatnonzero((sizes>1)&(w>0));return {'positive_device_sccs':len(cycles),'positive_scc_sizes':[int(sizes[i])for i in cycles]}
raw=analyze([]);assert raw['positive_device_sccs']==1 and raw['positive_scc_sizes']==[1705]
rows=[]
for c in mode_cuts:
 result=analyze([c['position']]);assert result['positive_device_sccs']==0;rows.append(c|result)
# Check the gate premise over every0..15 rear/side level, not only booleans.
zero_rear=all(max(0-side,0)==0 for side in range(16));full_side=all(max(rear-15,0)==0 for rear in range(16));assert zero_rear and full_side
# Removal of the premise is material: a high rear and low side is nonconstant.
assert max(15-0,0)==15
r={'status':'conditional_frontend_mode_sensitivity_proof','raw_graph':raw,'compared_modes_include_transition_guards':True,'store_cuts':len(store_cuts),'exact_preserved_frontend_timing_cells':len(frontend_cells),'modes':rows,'subtractor_level_cases':32,'limits':['No edge cut is admitted for mixed/transition/cold modes without the listed actual far-input premise. The original unqualified1705-node SCC remains a blocker to unconditional max-plus closure.','Normal FETCH can use R0 only after real retained operation intent has fallen and arrived. Normal operation can use FI0 only after its actual arrival. State names alone are insufficient.','This does not prove arbitrary delayed-tail convergence. Normal induction needs a known prior completed handshake, monotonic held levels and full return-to-zero; cold needs a separate physical initialization/flush certificate.','No event scheduling, pulse rejection or native Minecraft result.'],'native_acceptance':False,'full_timing_acceptance':False,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',B/'control-front-v1/prepare.mjs',B/'control-fetch-v1/prepare.mjs',B/'control-held-ir-v1/prepare.mjs',B/'program-interface-timing-v1/frontend-cells.json',B/'program-interface-timing-v1/frontend-paths.json']}}
(H/'front-mode-checks.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'raw':raw,'conditional_modes_without_positive_cycle':len(rows),'full_timing_acceptance':False}))
