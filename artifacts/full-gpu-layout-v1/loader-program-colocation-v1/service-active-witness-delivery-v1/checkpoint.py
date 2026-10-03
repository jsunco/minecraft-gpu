"""Keep exact service cut identities; bind only four actual retained ACTIVE deliveries."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];pins={}
def read(n):
 p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
ledger=read('../../dispatcher-service-colocation-v1/remaining-cuts.json')['service']
d=read('delta.json');checks=read('checks.json');assert checks['metrics']['total_cells']==2005834
for c in d['connections']:
 b=next(r for r in ledger['source_specific_bindings'] if r['name']==c['name'])
 b.update(shared_route=c['name'],route_status='bound_actual_retained_ACTIVE_delivery',shared_status='physically_integrated_here',shared_source_isolator=c['source_isolator'],shared_arrival_normalizer=c['normalizer'],shared_departure_pad=c['departure_pad'],shared_existing_source_prefix=c['existing_source_prefix'])
 r=next(r for r in ledger['witness_external_inputs'] if r['name']==c['name'])
 r.update(status=b['route_status'],shared_producer=c['root'],shared_receiver=c['destination'])
 cuts=[x for x in ledger['witness_body_incident'] if x['source']==r['normalizer'] and x['target']==r['destination']];assert len(cuts)==1
 cuts[0].update(status='bound_actual_retained_ACTIVE_delivery',shared_source=c['normalizer'],shared_target=c['destination'],shared_departure_isolator=c['source_isolator'],shared_departure_pad=c['departure_pad'],shared_route=c['name'])
ledger['counts'].update(witness_input_bound_here=4,witness_input_bound_total=20,witness_input_pending=17)
ledger['original_ledger_status']='All37 incoming identities/81body cuts retained;8mask+4owner_open+4payload_open+4ACTIVE deliveries bound,17 remaining. Prior root service quiet fanout binding is retained.'
ledger['geometry_added_here']={'new_cable_cells':5240,'new_routes':4,'existing_body_replacements':0}
ledger['source_sha256']={**ledger['source_sha256'],**pins};write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'four_actual_retained_ACTIVE_deliveries','connections':d['connections'],'pending_witness_bindings':[r for r in ledger['source_specific_bindings'] if r['route_status']=='pending_actual_shared_frame_cable'],'source_sha256':pins,'limits':['All coordinates are exact shared frame; no existing body moved or replaced.','Retained ACTIVE-Q identity is an explicit held state boundary; no latch transition, timing or pulse claim.']})
assert len(ledger['witness_external_inputs'])==37 and len(ledger['witness_body_incident'])==81
print(json.dumps(ledger['counts']))
