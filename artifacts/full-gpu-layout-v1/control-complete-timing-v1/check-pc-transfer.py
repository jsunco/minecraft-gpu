"""Actual eight-bit PC held NEXT→CURRENT source and nominal closure binding."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
pins=json.loads((H/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(H/'actual-graph-cache.npz');pos=c['positions'];mode=c['modes'];edges=c['edges'];stores=json.loads((H/'storage-discovery.json').read_text())['stores'];meta=json.loads((B/'control-nextpc-v1/pc-storage.json').read_text());rows=json.loads((H/'stored-dependency-checks.json').read_text())['rows'];phase=json.loads((H/'phase-checks.json').read_text())['phase_paths']
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(l)for s in stores for l in s['lock_sources']};idx={tuple(map(int,p)):i for i,p in enumerate(pos)if mode[i]==0 and tuple(map(int,p))in wanted};store_nodes={idx[tuple(s['storage'])]:n for n,s in enumerate(stores)};store_index={tuple(s['storage']):i for i,s in enumerate(stores)};clocks={idx[(443,234,-240)],idx[(443,234,-232)]};cut=set(store_nodes)|clocks;keep=np.ones(len(pos),dtype=np.bool_);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]];back=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,1],edges[:,0])),shape=(len(pos),len(pos))).tocsr()
move=lambda p:(p['x'],p['y']+240,p['z']-12)
out=[]
for b in meta['bits']:
 ns,cs=move(b['next_store']),move(b['current_store']);ni,ci=store_index[ns],store_index[cs]
 assert tuple(stores[ci]['data_rear'])==move(b['current_driver']) and [list(move(b['current_lock']))]==stores[ci]['lock_sources']
 assert tuple(stores[ni]['data_rear'])==move(b['next_driver']) and [list(move(b['next_lock']))]==stores[ni]['lock_sources']
 up=set(map(int,breadth_first_order(back,idx[move(b['current_driver'])],directed=True,return_predecessors=False)))
 assert {store_nodes[i]for i in up&set(store_nodes)}=={ni};assert not(up&clocks)
 r=[r for r in rows if r['target_store_index']==ci and r['target_kind']=='D'and r['target_phase']=='B'];assert len(r)==1 and r[0]['source_store_index']==ni and r[0]['source_phase']=='A';r=r[0]
 a=[p for p in phase if p['store_index']==ni];assert len(a)==1 and a[0]['phase']=='A'
 data_delay=r['nominal_latest_from_source_phase']-(544+a[0]['nominal_max_ticks']+2);assert data_delay==4
 out.append({'bit':b['bit'],'next_storage':ns,'current_storage':cs,'only_upstream_retained_source':ns,'nominal_NEXT_Q_to_CURRENT_D':data_delay,'nominal_setup_before_B':r['nominal_margin_if_next_target_epoch'],'inhibit_dependency_on_A':True})
assert len(out)==8
report={'status':'conditional_actual_PC_transfer_bound','bits':out,'minimum_nominal_setup':min(r['nominal_setup_before_B']for r in out),'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),B/'control-nextpc-v1/pc-storage.json',H/'stored-dependency-checks.json',H/'phase-checks.json']},'limits':['The26-tick nominal minimum is not a measured physical setup/hold guarantee. It is a route-skew repair priority.','B must be a complete qualified transfer; A-derived inhibits and reset qualification cannot be assumed stable without their separate epoch proof.','CURRENT→incrementer/selector→NEXT and branch agreement are separate dependencies.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'pc-transfer-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'bits':len(out),'minimum_nominal_setup':report['minimum_nominal_setup'],'native_acceptance':False}))
