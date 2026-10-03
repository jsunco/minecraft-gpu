"""Carry every cut identity forward and bind only the four drawn deliveries."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent; ROOT=H.parents[3]; pins={}
def read(n):
    p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
ledger=read('../service-owner-open-delivery-v1/remaining-cuts.json')
d=read('delta.json');checks=read('checks.json');reservation=read('channel1-address-reservation.json');foreign=read('../../memory/fabric-colocation-v2/channel1-address-minimal-adapter-partial-delta.json');assert reservation==foreign
assert checks['metrics']['total_cells']==1757086
for c in d['connections']:
    b=next(r for r in ledger['source_specific_bindings'] if r['name']==c['name'])
    b['shared_route']=c['name'];b['route_status']='bound_actual_source_specific_payload_open_delivery';b['shared_status']='physically_integrated_here'
    b['shared_source_isolator']=c['source_isolator'];b['shared_arrival_normalizer']=c['normalizer']
    r=next(r for r in ledger['witness_external_inputs'] if r['name']==c['name'])
    r['status']=b['route_status'];r['shared_producer']=c['root'];r['shared_receiver']=c['destination']
    cuts=[x for x in ledger['witness_body_incident'] if x['source']==r['normalizer'] and x['target']==r['destination']]
    assert len(cuts)==1
    cuts[0].update(status='bound_actual_payload_open_delivery',shared_source=c['normalizer'],shared_target=c['destination'],shared_departure_isolator=c['source_isolator'],shared_route=c['name'])
ledger['counts'].update(witness_input_bound_here=4,witness_input_bound_total=16,witness_input_pending=21)
ledger['original_ledger_status']='All37 incoming identities/81body cuts retained;8mask+4owner_open+4payload_open deliveries bound,21 remaining. Global quiet remains separate.'
ledger['geometry_added_here']={'new_cable_cells':4264,'new_routes':4,'existing_body_replacements':0}
ledger['source_sha256']={**ledger['source_sha256'],**pins}
write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'four_actual_corrected_payload_open_deliveries','connections':d['connections'],'pending_witness_bindings':[r for r in ledger['source_specific_bindings'] if r['route_status']=='pending_actual_shared_frame_cable'],'source_sha256':pins,'limits':['All coordinates are exact shared frame; no existing body moved or replaced.','Four documented payload-mask attenuation corrections remain; old busy-high/phase-high output15 is intentionally current0.']})
print(json.dumps(ledger['counts']))
