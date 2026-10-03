"""Carry every cut identity forward and bind only the four drawn deliveries."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent; ROOT=H.parents[3]; pins={}
def read(n):
    p=(H/n).resolve();pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
def write(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
ledger=read('../service-mask-memory-composition-v1/remaining-cuts.json')
parent_delta=read('../service-mask-memory-composition-v1/composed-delta.json')
d=read('delta.json');checks=read('checks.json')
assert checks['metrics']['total_cells']==1748616
corrections=[]
# The prior ledger's shared_source named the departure isolator. The exact
# original incoming cut corresponds to the final arrival normalizer instead.
# Preserve the prior freeze and state this field-level correction explicitly.
for r in ledger['witness_body_incident']:
    if r.get('status')=='bound_actual_mask_delivery':
        c=next(c for c in parent_delta['connections'] if c['name']==r['shared_route'])
        corrections.append({'old_cut_index':r['index'],'prior_shared_source':r['shared_source'],'correct_arrival_source':c['normalizer'],'unchanged_geometry':True})
        r['shared_departure_isolator']=r['shared_source'];r['shared_source']=c['normalizer']
for c in d['connections']:
    b=next(r for r in ledger['source_specific_bindings'] if r['name']==c['name'])
    b['shared_route']=c['name'];b['route_status']='bound_actual_source_specific_owner_open_delivery';b['shared_status']='physically_integrated_here'
    b['shared_source_isolator']=c['source_isolator'];b['shared_arrival_normalizer']=c['normalizer']
    r=next(r for r in ledger['witness_external_inputs'] if r['name']==c['name'])
    r['status']=b['route_status'];r['shared_producer']=c['root'];r['shared_receiver']=c['destination']
    cuts=[x for x in ledger['witness_body_incident'] if x['source']==r['normalizer'] and x['target']==r['destination']]
    assert len(cuts)==1
    cuts[0].update(status='bound_actual_owner_open_delivery',shared_source=c['normalizer'],shared_target=c['destination'],shared_departure_isolator=c['source_isolator'],shared_route=c['name'])
ledger['counts'].update(witness_input_bound_here=4,witness_input_bound_total=12,witness_input_pending=25)
ledger['original_ledger_status']='All37 incoming identities/81body cuts retained;8mask+4owner_open deliveries bound,25 remaining. Global quiet remains separate.'
ledger['geometry_added_here']={'new_cable_cells':3360,'new_routes':4,'existing_body_replacements':0}
ledger['prior_ledger_field_corrections']=corrections
ledger['source_sha256']={**ledger['source_sha256'],**pins}
assert len(corrections)==8
write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'four_actual_owner_open_deliveries','connections':d['connections'],'pending_witness_bindings':[r for r in ledger['source_specific_bindings'] if r['route_status']=='pending_actual_shared_frame_cable'],'source_sha256':pins,'limits':['All coordinates are exact shared frame; no existing body moved or replaced.','Eight prior shared_source fields now identify the actual incoming-cut arrival normalizer. Prior departure coordinates are retained in shared_departure_isolator; no frozen geometry changes.']})
print(json.dumps(ledger['counts']))
