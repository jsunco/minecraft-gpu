"""Bind only four source-specific BUSY witness deliveries in the full ledger."""
import copy,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3];pins={}
def read(n):
 p=(H/n).resolve();b=p.read_bytes();pins[str(p.relative_to(ROOT))]=hashlib.sha256(b).hexdigest();return json.loads(b)
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
root=read('../../global-loader-return-v1/remaining-cuts.json');before=copy.deepcopy(root);ledger=root['service'];d=read('delta.json');checks=read('checks.json');functions=read('source-functions.json');evalcheck=read('evaluator-checks.json')
assert checks['metrics']['total_cells']==2192096 and checks['metrics']['new_cells']==3920
assert checks['metrics']['expanded_source_cases']==4352 and checks['metrics']['joint_cases']==544
assert evalcheck['metrics']['vertex_levels_compared']==784044
oldentries=copy.deepcopy(ledger['source_specific_bindings']);oldwitness=copy.deepcopy(ledger['witness_external_inputs']);oldcuts=copy.deepcopy(ledger['witness_body_incident']);changedcuts=[]
for c in d['connections']:
 b=next(r for r in ledger['source_specific_bindings']if r['name']==c['name']);r=next(r for r in ledger['witness_external_inputs']if r['name']==c['name']);proof=next(r for r in functions['records']if r['binding']['name']==c['name'])
 assert b['role']=='busy' and b['route_status']=='pending_actual_shared_frame_cable'
 assert c['root']==b['shared_current_producer']==r['shared_producer'] and c['destination']==b['shared_witness_receiver']==r['shared_receiver']
 assert c['departure_pad']==c['root'] and c['existing_source_cone']==[] and c['existing_source_prefix']==[c['root']]
 b.update(shared_route=c['name'],route_status='bound_actual_live_busy_witness_delivery',shared_status='physically_integrated_here',shared_source_isolator=c['source_isolator'],shared_arrival_normalizer=c['normalizer'],shared_departure_pad=c['departure_pad'],shared_existing_source_prefix=c['existing_source_prefix'],expanded_source_roles=proof['source_proofs'][1]['held_boundaries'])
 r.update(status=b['route_status'],shared_producer=c['root'],shared_receiver=c['destination'])
 cuts=[(i,x)for i,x in enumerate(ledger['witness_body_incident'])if x['source']==r['normalizer']and x['target']==r['destination']];assert len(cuts)==1;i,cut=cuts[0];changedcuts.append(i)
 cut.update(status=b['route_status'],shared_source=c['normalizer'],shared_target=c['destination'],shared_departure_isolator=c['source_isolator'],shared_departure_pad=c['departure_pad'],shared_route=c['name'])
for field,old in [('source_specific_bindings',oldentries),('witness_external_inputs',oldwitness)]:
 for a,b in zip(old,ledger[field]):
  if a['name']not in [c['name']for c in d['connections']]:assert a==b
  else:
   for k,v in a.items():
    if k not in ['status','route_status','shared_status']:assert b[k]==v,(field,a['name'],k)
for i,(a,b)in enumerate(zip(oldcuts,ledger['witness_body_incident'])):
 if i not in changedcuts:assert a==b
 else:
  for k,v in a.items():
   if k!='status':assert b[k]==v,(i,k)
ledger['counts'].update(witness_input_bound_here=4,witness_input_bound_total=32,witness_input_pending=5)
assert ledger['counts']['loader_control_pending']==13 and ledger['counts']['panel_pending']==11
ledger['original_ledger_status']='All37 incoming identities/81body cuts retained; prior28 plus4actual live BUSY deliveries bound,5remaining:4commitSET and initialize. Separate bank BUSY-to-loader536..539 unchanged.'
ledger['geometry_added_here']={'new_cable_cells':3920,'new_routes':4,'existing_body_replacements':0}
ledger['source_sha256']={**ledger['source_sha256'],**pins}
for field in ['loader_control','panel_cuts','quiet_fanout']:assert ledger[field]==before['service'][field]
assert len(ledger['witness_external_inputs'])==37 and len(ledger['witness_body_incident'])==81
for field in ['dispatch','program','bank_quiet','memory_cut_ledger']:assert root[field]==before[field]
bank_loader=[r for r in root['memory_cut_ledger']['bank_inventory']['entries']if r['index']in[536,537,538,539]]
assert len(bank_loader)==4 and all(r['status']=='outside_this_group_reconciliation_pending'for r in bank_loader)
root.update(status='four_actual_live_busy_witness_deliveries_checked',limits=['Only four service witness BUSY inputs and their original corresponding body cuts newly bound. All source identities retained.','Five witnesses remain:4commitSET and initialize. Loader13/panel11, program42 and separate bank-to-loader BUSY536..539 remain unchanged.','Full shared geometry includes READY49456 and root global-loader returns3648, each frozen separately. State/reset/timing/native proof remains open.'])
root['source_sha256']={**root['source_sha256'],**pins};write('remaining-cuts.json',root)
write('endpoint-map.json',{'status':'four_actual_local_live_busy_witness_deliveries','connections':d['connections'],'pending_witness_bindings':[r for r in ledger['source_specific_bindings']if r['route_status']=='pending_actual_shared_frame_cable'],'source_sha256':pins,'limits':['All physical source and receiver identities are explicit. No existing block moved or replaced.','Expanded bank status/owner source functions are conditional on held actual states. Timing and state transitions are not accepted.']})
write('ledger-checks.json',{'status':'exact_witness_only_delta_passed','counts':ledger['counts'],'changed_original_body_cut_indices':changedcuts,'unchanged_bank_loader_busy_entries':bank_loader,'unchanged_scopes':['352dispatch transfers','661effective cuts','48direct boundaries','44program cuts','28loader cuts','79panel cuts','572bank entries','944fabric entries'],'source_sha256':pins})
print(json.dumps(ledger['counts']))
