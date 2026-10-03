"""Earned early CURRENT-Q bound for direct paired banks, not arbitrary stores."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import breadth_first_order
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(H/'actual-graph-cache.npz');pos=c['positions'];mode=c['modes'];edges=c['edges'];stores=json.loads((H/'storage-discovery.json').read_text())['stores'];pairs=json.loads((H/'direct-pair-checks.json').read_text())['rows']
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']};idx={tuple(map(int,p)):i for i,p in enumerate(pos)if mode[i]==0 and tuple(map(int,p))in wanted};store_indices={idx[tuple(s['storage'])]:n for n,s in enumerate(stores)};clock_indices={idx[(443,234,-240)],idx[(443,234,-232)]};cut=set(store_indices)|clock_indices
keep=np.ones(len(pos),dtype=np.bool_);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]];back=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,1],edges[:,0])),shape=(len(pos),len(pos))).tocsr();rows=[]
for p in pairs:
 end=idx[tuple(stores[p['current_index']]['data_rear'])];up=set(map(int,breadth_first_order(back,end,directed=True,return_predecessors=False)));actual={store_indices[i]for i in up&set(store_indices)}
 assert actual=={p['next_index']},(p['current_storage'],actual)
 assert not(up&clock_indices),(p['current_storage'],'clock on data')
 assert p['next_phase_influences']==['A'] and p['nominal_data_setup_margin']>0
 rows.append({'current_storage':p['current_storage'],'next_storage':p['next_storage'],'upstream_retained_sources':len(actual),'upstream_nodes':len(up),'direct_A_to_B_nominal_setup':p['nominal_data_setup_margin'],'nominal_CURRENT_Q_latest':'B rise + actual B→lock latest + 2 storage ticks','conditional_gain_vs_close_bound':540})
feedback=json.loads((H/'pair-feedback-checks.json').read_text());bound={tuple(r['current_storage'])for r in rows};refined=[]
for r in feedback['rows']:
 assert tuple(r['source_storage'])in bound
 refined.append(r|{'nominal_setup_using_held_NEXT':None if r['nominal_setup_before_next_A']is None else r['nominal_setup_before_next_A']+540})
report={'status':'conditional_held_NEXT_early_CURRENT_Q_bound','verified_pairs':len(rows),'direct_source_exclusivity':rows,'feedback_rows':refined,'unbounded_feedback_rows':sum(r['unbounded_positive_cycle']for r in refined),'minimum_finite_feedback_setup':min(r['nominal_setup_using_held_NEXT']for r in refined if r['nominal_setup_using_held_NEXT']is not None),'nonpositive_finite_feedback_rows':sum(r['nominal_setup_using_held_NEXT']is not None and r['nominal_setup_using_held_NEXT']<=0 for r in refined),'assumptions':['NEXT is A-only and holds through all of the later qualified B transfer; proven direct nominal setup is positive.','B opens only in a complete admitted phase with stable normal/reset qualification. A late release of a separate inhibit is not covered.','A held input causes the unlocked CURRENT repeater to settle within its nominal two-tick delay; physical scheduled-event bounds remain unmeasured.','No arbitrary CURRENT bank was shortened: all74 CURRENT D cones reach exactly the paired NEXT storage root and neither clock root.','Own-pair feedback only. Cross-group commands, explicit asynchronous handshakes, same-phase ALU epochs and far closure remain separately required.'],'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),H/'direct-pair-checks.json',H/'pair-feedback-checks.json']},'native_acceptance':False,'complete_timing_acceptance':False}
(H/'held-transfer-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in['direct_source_exclusivity','feedback_rows','assumptions','source_sha256']}))
