"""Credit only four actual global bank-quiet arrivals; preserve all other cuts."""
import hashlib,json
from pathlib import Path
from collections import Counter
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(n):
 p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
ledger=read('../program-global-delivery-v1/remaining-cuts.json');service=read('../loader-program-colocation-v1/service-active-witness-delivery-v1/remaining-cuts.json');memory=read('../memory/fabric-colocation-v2/channel2-address-cut-ledger.json');f=read('source-functions.json');d=read('delta.json');checks=read('checks.json');reservation=read('reservation-checks.json')
assert checks['metrics']['total_cells']==2072756 and checks['metrics']['changed_receivers']==4
assert reservation['metrics']['total_cells']==2078148
for s,c in zip(f['selected'],d['connections']):
 i=s['transfer_index'];x=ledger['dispatch']['transfers'][i];assert x['status']=='external_source_transfer_pending';assert x['shared_retained_target']==c['destination'];assert c['root']==s['new_source'];assert s['old_route_function']=={'roots':[s['source']],'table':2}
 x.update(status='foreign_bank_quiet_cut_replaced_by_checked_actual_shared_bank_route',shared_actual_producer=c['root'],shared_arrival_normalizer=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
 matches=[r for r in ledger['dispatch']['effective_cut_ledger'] if r['source']==x['source'] and r['target']==x['target']];assert len(matches)==1
 matches[0].update(status='bound_actual_shared_bank_quiet_to_global_sampler',shared_actual_producer=c['root'],shared_source=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
ledger['dispatch']['transfer_counts']=dict(Counter(r['status'] for r in ledger['dispatch']['transfers']));assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==12
assert (len(ledger['dispatch']['transfers']),len(ledger['dispatch']['effective_cut_ledger']),len(ledger['dispatch']['direct_foreign_boundaries']))==(352,661,48)
assert sum(r['status']=='pending_external_master_connection' for r in ledger['program'])==42
ledger['service']=service
assert service['counts']['witness_input_bound_total']==20 and service['counts']['witness_input_pending']==17
# The 572-entry bank ledger predates the separate QUIET adapters. Its four
# BUSY egress records target the loader, not these global quiet consumers.
# Do not grant those unrelated loader deliveries credit for a new inverter.
egress=[r for r in memory['bank_inventory']['entries'] if r['index'] in [536,537,538,539]]
assert len(egress)==4 and all(r['status']=='outside_this_group_reconciliation_pending' for r in egress)
ledger['bank_quiet']={'bindings':[{'bank':s['bank'],'source':f['sources'][s['bank']],'destination':c['destination'],'route':c['name'],'transfer_index':s['transfer_index']} for s,c in zip(f['selected'],d['connections'])],'separate_loader_busy_egress_unchanged':egress,'bank_inventory_changed':False,'bank_entries':572,'fabric_entries':944}
ledger['source_sha256']={**ledger['source_sha256'],**pins};ledger['status']='partial_actual_four_bank_quiet_delivery_only';ledger['limits']=['Only global transfers292/293/295/296 and their matching effective cuts are newly bound. Earlier290/291 remain bound.','Twelve global incoming transfers,31direct foreign obligations and42program cuts remain;19loader controls,11panel entries and17service witnesses remain in the accepted ACTIVE parent.','The separately frozen commit-phase group has24/37 witnesses, but this package treats its copied5392 rows only as compatibility obstacles; do not infer ledger credit here.','Bank BUSY-to-loader egress536..539 and all other572/944 inventory statuses remain unchanged. Bank/controller/sampler timing and native execution remain open.']
write('remaining-cuts.json',ledger);write('endpoint-map.json',{'status':'actual_bank_quiet_to_shared_global','connections':d['connections'],'sources':f['sources'],'global_pending':12,'program_pending':42,'source_sha256':pins})
print(json.dumps({'new_global_transfers':[292,293,295,296],'remaining_global':12,'remaining_program':42,'service_bound':20,'separate_busy_egress_unchanged':[536,537,538,539]}))
