"""Reconcile exactly two panel departures and the corresponding loader arrivals."""
import copy,hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2];pins={}
def read(n):
 p=(H/n).resolve();b=p.read_bytes();pins[str(p.relative_to(ROOT))]=hashlib.sha256(b).hexdigest();return json.loads(b)
def write(n,d):(H/n).write_text(json.dumps(d,indent=2)+'\n')
ledger=read('../loader-program-colocation-v1/service-live-busy-delivery-v1/remaining-cuts.json');before=copy.deepcopy(ledger);f=read('source-functions.json');d=read('delta.json');checks=read('checks.json')
assert checks['status']=='passed_actual_panel_loader_deliveries' and checks['metrics']['total_cells']==2192740
changed=[]
for s,c in zip(f['selected'],d['connections']):
 di=s['direct_index'];li=s['loader_index'];x=ledger['dispatch']['direct_foreign_boundaries'][di];y=ledger['service']['loader_control'][li]
 assert x['status']==y['status']=='pending';assert x['source']==s['source'] and x['target'] in s['old_source_successors'];assert x['shared_retained_source']==c['root'];assert y['target']==s['target'] and y['source']==s['old_normalizer']
 match=[(i,r)for i,r in enumerate(ledger['dispatch']['effective_cut_ledger'])if r['source']==x['source'] and r['target']==x['target']];assert len(match)==1;i,e=match[0];changed.append(i)
 x.update(status='bound_actual_panel_input_to_loader',shared_departure=c['source_isolator'],shared_receiver=c['destination'],shared_normalizer=c['normalizer'],shared_route=c['name'])
 e.update(status='bound_actual_panel_input_to_loader',shared_source=c['root'],shared_target=c['destination'],shared_arrival=c['normalizer'],shared_route=c['name'])
 y.update(status='bound_actual_operator_panel_input',shared_source=c['root'],shared_target=c['destination'],shared_arrival=c['normalizer'],shared_route=c['name'],global_direct_index=di)
assert changed==[614,615]
for a,b,indices in [(before['dispatch']['direct_foreign_boundaries'],ledger['dispatch']['direct_foreign_boundaries'],[1,2]),(before['dispatch']['effective_cut_ledger'],ledger['dispatch']['effective_cut_ledger'],changed),(before['service']['loader_control'],ledger['service']['loader_control'],[0,1])]:
 assert len(a)==len(b)
 for i,(x,y)in enumerate(zip(a,b)):
  if i not in indices:assert x==y
  else:
   for key,value in x.items():
    if key!='status':assert y[key]==value
for scope in ['program','bank_quiet','memory_cut_ledger']:assert ledger[scope]==before[scope]
for scope in ['transfers','transfer_counts']:assert ledger['dispatch'][scope]==before['dispatch'][scope]
for scope in ['source_specific_bindings','witness_external_inputs','witness_body_incident','panel_cuts','quiet_fanout']:assert ledger['service'][scope]==before['service'][scope]
assert sum(r['status']=='pending' for r in ledger['dispatch']['direct_foreign_boundaries'])==27
assert sum(r['status']=='pending' for r in ledger['service']['loader_control'])==11
ledger['service']['counts'].update(loader_pending=11,loader_control_pending=11,loader_control_bound_total=17)
assert ledger['service']['counts']['witness_input_pending']==5
ledger.update(status='two_actual_operator_panel_loader_inputs_bound',limits=['Only direct global1/2, effective614/615 and loader0/1 newly bound. Raw RESET retains its separate other fanout.','Eight incoming global transfers,27direct foreign,42program,11loader,11panel and5witness obligations remain in this parent ledger; independent READY ledger is a separate scope.','Actual START/RESET switches are external user inputs. No state decisions, kernel result, timing or native execution is supplied by the host.'])
ledger['source_sha256']={**ledger['source_sha256'],**pins};write('remaining-cuts.json',ledger)
write('endpoint-map.json',{'status':'two_actual_operator_panel_loader_inputs','connections':d['connections'],'operator_levers':[s['boundaries'][0]for s in f['sources']],'remaining':{'global_incoming':8,'global_direct':27,'program':42,'loader':11,'panel':11,'witness':5},'source_sha256':pins})
write('ledger-checks.json',{'status':'exact_six_record_delta_passed','changed':{'global_direct':[1,2],'effective':[614,615],'loader':[0,1]},'unchanged':['all352dispatch transfers','service32/37witness bindings','all79panelcuts','all44programcuts','all572bank and944fabric records in parent ledger','other global direct/rawRESET fanout'], 'source_sha256':pins});print(json.dumps({'direct_remaining':27,'loader_remaining':11,'witness_remaining':5,'changed_effective':changed}))
