"""Reconcile exactly two global held-state returns, including matching cut edges."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(n):
 p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
ledger=read('../loader-global-delivery-v1/remaining-cuts.json');f=read('source-functions.json');d=read('delta.json');checks=read('checks.json');reservation=read('reservation-checks.json')
assert checks['metrics']['total_cells']==2138720 and reservation['metrics']['total_cells']==2188176
for s,c in zip(f['selected'],d['connections']):
 di=s['direct_index'];li=s['loader_index'];x=ledger['dispatch']['direct_foreign_boundaries'][di];y=ledger['service']['loader_control'][li];assert x['status']==y['status']=='pending';assert x['source']==s['source'] and x['target'] in s['old_source_successors'];assert x['shared_retained_source']==c['root'];assert y['target']==s['target'] and y['source']==s['old_normalizer']
 x.update(status='bound_actual_held_global_return_to_loader',shared_departure=c['source_isolator'],shared_receiver=c['destination'],shared_normalizer=c['normalizer'],shared_route=c['name'])
 match=[r for r in ledger['dispatch']['effective_cut_ledger'] if r['source']==x['source'] and r['target']==x['target']];assert len(match)==1;match[0].update(status='bound_actual_held_global_return_to_loader',shared_source=c['root'],shared_target=c['destination'],shared_arrival=c['normalizer'],shared_route=c['name'])
 y.update(status='bound_actual_global_held_return',shared_source=c['root'],shared_target=c['destination'],shared_arrival=c['normalizer'],shared_route=c['name'],global_direct_index=di)
assert (len(ledger['dispatch']['transfers']),len(ledger['dispatch']['effective_cut_ledger']),len(ledger['dispatch']['direct_foreign_boundaries']))==(352,661,48)
assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==8
assert sum(r['status']=='pending' for r in ledger['dispatch']['direct_foreign_boundaries'])==29
assert sum(r['status']=='pending' for r in ledger['service']['loader_control'])==13
assert ledger['dispatch']['direct_foreign_boundaries'][22]['status']=='pending'
ledger['service']['counts'].update(loader_pending=13,loader_control_pending=13,loader_control_bound_total=15)
ledger['status']='two_actual_held_global_returns_bound_only';ledger['source_sha256']={**ledger['source_sha256'],**pins};ledger['limits']=['Only direct global19/20, effective edges632/633 and loader22/23 are newly bound. All352transfer records remain unchanged.','Other cold_initialized consumers, including direct22 to core service, remain pending; source identity is not full fanout completion.','Eight incoming global transfers,29directforeign,42program,13loader,11panel and9witness obligations remain in this parent scope.','The exact49456READY compatibility snapshot has its own state/function/ledger gates; do not infer their completion here.']
write('remaining-cuts.json',ledger);write('endpoint-map.json',{'status':'two_actual_held_global_loader_returns','connections':d['connections'],'retained_stores':f['all_five_retained_stores'],'remaining':{'global_incoming':8,'global_direct':29,'program':42,'loader':13,'panel':11,'witness':9},'source_sha256':pins});print(json.dumps({'new_direct':[19,20],'new_effective':[632,633],'new_loader':[23,22],'remaining_direct':29,'remaining_loader':13}))
