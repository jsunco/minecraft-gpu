"""Credit only four original loader egresses and their exact global consumers."""
import hashlib,json
from pathlib import Path
from collections import Counter
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(n):
 p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
ledger=read('../bank-global-delivery-v1/remaining-cuts.json');service=read('../loader-program-colocation-v1/service-any-owner-delivery-v1/remaining-cuts.json');memory=read('../memory/fabric-colocation-v2/channel3-address-cut-ledger.json');f=read('source-functions.json');d=read('delta.json');checks=read('checks.json');original=read('../master-loader-control-routes-v1/design.json')
assert checks['metrics']['total_cells']==2135072 and checks['metrics']['changed_receivers']==4
for s,c,li in zip(f['selected'],d['connections'],[24,25,26,27]):
 i=s['transfer_index'];x=ledger['dispatch']['transfers'][i];assert x['status']=='external_source_transfer_pending';assert x['shared_retained_target']==c['destination'];assert c['root']==s['new_source'];assert s['old_route_function']=={'roots':[s['source']],'table':2}
 assert [a['name'] for a in original['connections'] if a['source']==s['source']]==[s['name']]
 x.update(status='foreign_loader_control_cut_replaced_by_checked_actual_shared_route',shared_actual_producer=c['root'],shared_arrival_normalizer=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
 matches=[r for r in ledger['dispatch']['effective_cut_ledger'] if r['source']==x['source'] and r['target']==x['target']];assert len(matches)==1
 matches[0].update(status='bound_actual_shared_loader_control_to_global',shared_actual_producer=c['root'],shared_source=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
 out=service['loader_control'][li];assert out['index']==li and out['status']=='pending';assert out['source']==s['source'];assert out['target'] in s['old_source_successors'];out.update(status='bound_actual_loader_global_control_egress',shared_source=c['root'],shared_departure=c['source_isolator'],shared_receiver=c['destination'],shared_normalizer=c['normalizer'],shared_route=c['name'],transfer_index=i)
ledger['dispatch']['transfer_counts']=dict(Counter(r['status'] for r in ledger['dispatch']['transfers']));assert ledger['dispatch']['transfer_counts']['external_source_transfer_pending']==8
assert (len(ledger['dispatch']['transfers']),len(ledger['dispatch']['effective_cut_ledger']),len(ledger['dispatch']['direct_foreign_boundaries']))==(352,661,48)
assert sum(r['status']=='pending_external_master_connection' for r in ledger['program'])==42
assert sum(r['status']=='pending' for r in service['loader_control'])==15
service['counts']['loader_pending']=15;service['counts']['loader_control_bound_total']=13;service['counts']['loader_control_pending']=15
assert service['counts']['witness_input_bound_total']==28 and service['counts']['witness_input_pending']==9
ledger['service']=service;ledger['memory_cut_ledger']=memory
ledger['source_sha256']={**ledger['source_sha256'],**pins};ledger['status']='four_loader_control_global_deliveries_checked';ledger['limits']=['Only transfers261/287/319/320, their four corresponding effective cuts, and loader egress24..27 newly bound.','Eight global incoming transfers,31direct foreign obligations,42program entries,15loader control entries,11panel cuts and9service witnesses remain.','All four address channels and write bytes are preserved; readback/READY/sequential state and complete timing remain separate.','Loader gate inputs held for conditional settled tests; this does not prove their upstream state generation, pulse timing or native Minecraft.']
write('remaining-cuts.json',ledger);write('endpoint-map.json',{'status':'actual_loader_control_to_shared_global','connections':d['connections'],'sources':f['sources'],'remaining':{'global_incoming':8,'global_direct_foreign':31,'program':42,'loader_control':15,'service_witness':9,'panel':11},'source_sha256':pins})
print(json.dumps({'new_global_transfers':[261,287,319,320],'new_loader_egresses':[24,25,26,27],'remaining_global':8,'remaining_loader':15}))
