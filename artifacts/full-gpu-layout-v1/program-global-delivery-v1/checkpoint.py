"""Bind only the checked program quiet delivery and its two historical cuts."""
import hashlib,json
from pathlib import Path
from collections import Counter
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(n):
 p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
ledger=read('../dispatcher-service-colocation-v1/remaining-cuts.json');program=read('../program-service-composition-v1/remaining-cuts.json');functions=read('source-functions.json');d=read('delta.json');checks=read('checks.json');reserve=read('reservation-checks.json')
assert checks['metrics']['total_cells']==2002964
c=d['connections'][0];b=functions['original_binding'];x=ledger['dispatch']['transfers'][290]
assert x['status']=='external_source_transfer_pending';assert x['shared_retained_target']==c['destination']
x.update(status='foreign_program_quiet_cut_replaced_by_checked_actual_shared_program_route',shared_actual_producer=c['root'],shared_arrival_normalizer=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
match=[r for r in ledger['dispatch']['effective_cut_ledger'] if r['source']==x['source'] and r['target']==x['target']];assert len(match)==1
match[0].update(status='bound_actual_shared_program_quiet_to_global_sampler',reconciliation='positive_original_program_transport_preserved',shared_actual_producer=c['root'],shared_source=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
ledger['dispatch']['transfer_counts']=dict(Counter(r['status'] for r in ledger['dispatch']['transfers']));assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==16
p=program['program'][21];assert p['status']=='pending_external_master_connection';assert p['original_selected_world']['source']==b['old_connection']['source'];assert p['original_selected_world']['target'] in functions['original_source_successors']
p.update(status='bound_actual_program_quiet_to_global',shared_source=c['root'],shared_departure_isolator=c['source_isolator'],shared_global_receiver=c['destination'],shared_arrival_normalizer=c['normalizer'],shared_route=c['name'])
assert sum(r['status']=='pending_external_master_connection' for r in program['program'])==42
assert (len(ledger['dispatch']['transfers']),len(ledger['dispatch']['effective_cut_ledger']),len(ledger['dispatch']['direct_foreign_boundaries']))==(352,661,48)
ledger['program']=program['program'];ledger['source_sha256']={**ledger['source_sha256'],**pins}
ledger['status']='partial_program_quiet_delivery_only_no_new_state_or_other_cut_credit';ledger['limits']=['Transfer290 and its matching effective cut, plus program outgoing cut21, are bound by this actual source-specific route. Earlier291 remains bound.','16global incoming transfers and31direct foreign obligations remain;42program cuts,19loader controls,11panel cuts and21service witness inputs remain in this parent scope.','Concurrent ACTIVE and channel2 partial snapshots are obstacles only, not accepted geometry or changes to their ledgers.']
write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'actual_program_quiet_shared_global_delivery','connection':c,'original_binding':b,'program_boundaries':functions['actual_program_boundary_sources'],'existing_loader_destination':functions['existing_loader_destination'],'remaining':{'global_incoming_transfers':16,'global_direct_foreign':31,'program_cuts':42},'source_sha256':pins})
print(json.dumps({'global_transfer':290,'global_cut':match[0]['index'],'program_cut':21,'remaining_global':16,'remaining_program':42}))
