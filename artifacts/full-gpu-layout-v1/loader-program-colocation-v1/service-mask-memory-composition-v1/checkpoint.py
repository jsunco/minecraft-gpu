"""Record exact shared-frame endpoints and preserve every original cut identity."""
import copy, hashlib, json
from pathlib import Path
H=Path(__file__).resolve().parent
ROOT=H.parents[3]
pins={}
def read(p):
    p=(H/p).resolve(); pins[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest()
    return json.loads(p.read_text())
def write(name,data): (H/name).write_text(json.dumps(data,indent=2)+'\n')
def add(p,t): return {a:p[a]+t[a] for a in ('x','y','z')}
d=read('composed-delta.json'); refold=read('refolded-mask-placement.json')
c=read('latest-union-checks.json'); old=read('../service-witness-input-bindings-v1/remaining-cuts.json')
panel=read('../../loader-bank-panels-v1/remaining-cuts.json')
program=read('../../program-service-composition-v1/cable-delta.json')
assert c['metrics']['total_cells']==1700444
ledger=copy.deepcopy(old); t=d['loader_translation']; bound=[]
for r in ledger['source_specific_bindings']:
    r['shared_witness_receiver']=add(r['witness_receiver_local'],t)
    if r['role']=='mask':
        i=int(r['name'][4:]); port=refold['maskPorts'][i]; cable=next(v for v in d['connections'] if v.get('mask')==i)
        assert r['shared_witness_receiver']==cable['destination']
        r['shared_current_producer']=port['source']; r['shared_source_isolator']=port['source_isolator']
        r['shared_comparator_receiver']=port['receiver']; r['route_status']='bound_actual_mask_delivery_and_allocator_inhibit'
        r['shared_route']=cable['name'];r['shared_status']='physically_integrated_here'
        bound.append(r['name'])
    else:
        r['shared_current_producer']=r['current_physical_pad']
        r['route_status']='pending_actual_shared_frame_cable';r['shared_status']='source_specific_binding_known_no_delivery'
for r in ledger['witness_external_inputs']:
    binding=next(b for b in ledger['source_specific_bindings'] if b['name']==r['name'])
    r['shared_receiver']=binding['shared_witness_receiver'];r['shared_producer']=binding['shared_current_producer']
    r['status']=binding['route_status']
    if r['name'] in bound:
        matching=[x for x in ledger['witness_body_incident'] if x['target']==r['destination'] and x['source']==r['normalizer']]
        assert len(matching)==1
        matching[0]['status']='bound_actual_mask_delivery';matching[0]['shared_source']=binding['shared_source_isolator']
        matching[0]['shared_target']=binding['shared_witness_receiver'];matching[0]['shared_route']=binding['shared_route']
for r in ledger['loader_control']:
    if r['index']==18:
        r['status']='bound_actual_runtime_block_to_mask_chain'; r['shared_route']=d['connections'][0]
    if r['index']==11:
        r['status']='bound_foreign_root_program_quiet_cable_in_exact_union';r['shared_route']=program['connections'][0]
ledger['quiet_fanout']['shared_matrix_source']=add(ledger['quiet_fanout']['matrix_source'],t)
ledger['quiet_fanout']['shared_bound_loader_target']=add(ledger['quiet_fanout']['bound_loader_target'],t)
ledger['panel_cuts']=panel['panel_cuts']
ledger['original_ledger_status']='All 37 witness incoming identities and all 81 body-incident cuts retained; eight incoming mask deliveries bound here,29 incoming deliveries and the separate global quiet export remain pending.'
ledger['geometry_added_here']={'mask_and_local_link_cells':208,'new_cable_cells':3159,'comparator_replacements':8,'preserved_loader_service_cells_placed':22084}
ledger['counts']={'witness_input_bound_here':8,'witness_input_pending':29,'loader_original_cuts':28,'loader_pending':sum(r['status']=='pending' for r in ledger['loader_control']),'panel_original_cuts':len(panel['panel_cuts']),'panel_pending':sum(r['status'].startswith('pending') for r in panel['panel_cuts'])}
assert ledger['counts']['loader_pending']==19 and ledger['counts']['panel_pending']==11
ledger['source_sha256']={**ledger['source_sha256'],**pins}
write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'actual_shared_frame_mask_integration','loader_translation':t,'loader_cell_map':'composed-delta.json .placed_loader entries preserve every local_position and block','mask_cell_map':'refolded-mask-placement.json .mapping, with eight explicit output-isolator rotations','mask_ports':refold['maskPorts'],'new_cables':d['connections'],'program_quiet_foreign_cable':program['connections'],'pending_witness_bindings':[r for r in ledger['source_specific_bindings'] if r['role']!='mask'],'source_sha256':pins,'limits':['Exact frame is the frozen channel3 memory frame with loader translation(-160,-32,-176); program placement is separately owned.','No affine alias is asserted for repaired producer functions, missing globals or undispatched cuts.']})
print(json.dumps(ledger['counts']))
