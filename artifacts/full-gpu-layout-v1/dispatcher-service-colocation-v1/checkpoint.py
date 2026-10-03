"""Reconcile one actual arrival and preserve every historical cut identity."""
import hashlib,json
from pathlib import Path
from collections import Counter
H=Path(__file__).resolve().parent; ROOT=H.parents[2]; pins={}
def read(n):
    p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
def key(p):return (p['x'],p['y'],p['z'])
placement=read('placement.json');delta=read('delta.json');checks=read('checks.json');reservation=read('reservation-checks.json');parent=read('../dispatch-global-colocation-v8-dcr-cold-v1/connected-candidate.json')
ledger=read('../dispatch-global-colocation-v8-dcr-cold-v1/remaining-ledger.json');bindings=read('../dispatch-external-bindings-v1/bindings.json');service=read('../loader-program-colocation-v1/service-payload-open-delivery-v1/remaining-cuts.json')
assert checks['metrics']['total_cells']==1956526 and reservation['metrics']['total_cells']==1960732
assert checks['metrics']['actual_inputs']==1609156
c=delta['connections'][0];t=placement['translation']
def add(p):return {a:p[a]+t[a] for a in 'xyz'}
byold={key(r['original_position']):r for r in parent['blocks'] if 'original_position' in r}
bynew={key(r['position']):r for r in parent['blocks']}
for x in [*ledger['transfers'],*ledger['direct_foreign_boundaries'],*ledger['effective_cut_ledger']]:
    for which in ['source','target']:
        if key(x[which]) in byold:x['shared_retained_'+which]=add(byold[key(x[which])]['position'])
x=ledger['transfers'][291];assert x['status']=='external_source_transfer_pending'
assert add(byold[key(x['target'])]['position'])==c['destination']
x.update(status='foreign_quiet_cut_replaced_by_checked_actual_shared_matrix_route',shared_actual_producer=c['root'],shared_arrival_normalizer=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
matching=[r for r in ledger['effective_cut_ledger'] if r['source']==x['source'] and r['target']==x['target']];assert len(matching)==1 and matching[0]['index']==501
matching[0].update(status='bound_actual_shared_matrix_to_global_sampler',reconciliation='positive_original_matrix_transport_preserved',shared_actual_producer=c['root'],shared_source=c['normalizer'],shared_target=c['destination'],shared_route=c['name'])
ledger['transfer_counts']=dict(Counter(r['status'] for r in ledger['transfers']));assert ledger['transfer_counts']['external_source_transfer_pending']==17
assert (len(ledger['transfers']),len(ledger['effective_cut_ledger']),len(ledger['direct_foreign_boundaries']))==(352,661,48)
ledger['status']='partial_dispatcher_shared_frame_one_additional_external_transfer_bound'
ledger['source_sha256']={**ledger['source_sha256'],**pins}
service['quiet_fanout'].update(shared_bound_global_target=c['destination'],shared_bound_global_arrival=c['normalizer'],shared_bound_global_route=c['name'],global_delivery_status='actual_matrix_to_sampler_transport_checked_source_witness_closure_pending')
service['quiet_fanout']['historical_global_original_target']=service['quiet_fanout'].pop('pending_global_original_target')
service['source_sha256']={**service['source_sha256'],**pins}
write('remaining-cuts.json',{'dispatch':ledger,'service':service,'limits':['All352 transfers and661 cut identities retained; only transfer291/cut501 changes status here.','Service37input witness still has21undriven inputs; this delivery is not a full quiescence proof.','Direct31 foreign obligations,19loader cuts,11panel cuts and43program cuts remain in their own scoped ledgers.'],'source_sha256':pins})
ports={}
def walk(v):
    if isinstance(v,list):
        for x in v:walk(x)
    elif isinstance(v,dict):
        if v.get('module')=='dispatch_global_requester_DCR' and v.get('position') is not None:
            original=v['original_master_position'];actual=byold.get(key(original));assert actual and actual['position']==v['position']
            identity=(v['original_instance'],v['port'],v.get('bit'),key(original))
            ports[identity]={**v,'local_position':v['position'],'shared_position':add(actual['position']),'coordinate_frame':'v8_local_plus_exact_shared_translation','status':'actual_retained_named_body_endpoint'}
        for x in v.values():walk(x)
walk(bindings)
write('endpoint-map.json',{'status':'exact_named_dispatcher_endpoints_mapped_to_shared_frame','translation':t,'named_ports':list(ports.values()),'quiet_connection':c,'body_transforms':parent['body_transforms'],'source_sha256':pins,'limits':['Local body transforms remain parent-local; add this instance translation exactly once.','Mapping a port does not draw its unconnected master cable.','Core transforms and complete floorplan remain unselected.']})
print(json.dumps({'transfer_counts':ledger['transfer_counts'],'named_ports':len(ports),'cut_identity':501,'service_witness_pending':21}))
