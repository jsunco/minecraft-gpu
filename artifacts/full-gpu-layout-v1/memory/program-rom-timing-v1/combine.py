"""Compose explicit nominal inequalities; retain every external assumption."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;ROOT=H.parents[3];files={}
def read(p):
 files[str(p.relative_to(ROOT))]=hashlib.sha256(p.read_bytes()).hexdigest();return json.loads(p.read_text())
c=read(H/'controller-checks.json');o=read(H/'opening-checks.json');p=read(H/'payload-checks.json');r=read(H/'capture-checks.json');base=read(H.parent/'program-controller-v1/checks.json');d=read(H.parent/'program-controller-v1/design.json');front=read(H.parent.parent/'program-interface-timing-v1/frontend-paths.json')
prefix={s['name']:base['normal_pipeline']['taps'][','.join(str(s['position'][a]) for a in 'xyz')]['chain_prefix_nominal_ticks'] for s in d['stages']}
assert prefix=={'t1':120,'t2':240,'t3':360,'t4':1380,'t5':1500}
get=lambda source,name:next(q for q in c['paths'] if q['source_name']==source and q['destination_name']==name)
lo=lambda row:row['potential_dependency_nominal_min_ticks'];hi=lambda row:row['potential_dependency_nominal_max_ticks']
opening=lambda name,bit:next(q for q in o['banks'][name]['paths'] if q['data_bit']==bit)
owner_closed=prefix['t1']+hi(get('t1','owner_lock_0'))
owner_D_stable=owner_closed+2+p['owner_Q_to_address_D']['max_nominal_dependency_ticks']
address=[]
for b in range(8):
 opens=prefix['t2']+hi(opening('address',b));close_early=prefix['t3']+lo(get('t3','address_lock_'+str(b)));close_late=prefix['t3']+hi(get('t3','address_lock_'+str(b)))
 address.append({'bit':b,'conditional_selected_D_stable_latest':owner_D_stable,'lock_open_latest':opens,'lock_close_earliest':close_early,'lock_close_latest':close_late,'selected_D_to_open_min':prefix['t2']+lo(opening('address',b))-owner_D_stable,'capture_Q_to_close_min':close_early-max(opens,owner_D_stable)-2})
response=[]
for b in range(16):
 data=max(address[q['address_bit']]['lock_close_latest']+2+hi(q) for q in r['paths'] if q['data_bit']==b)
 opens=prefix['t4']+hi(opening('response',b));closes=prefix['t5']+lo(get('t5','response_lock_'+str(b)));close_late=prefix['t5']+hi(get('t5','response_lock_'+str(b)))
 broadcast=next(q for q in p['response_Q_to_common_DATA']['paths'] if q['data_bit']==b)
 response.append({'bit':b,'response_D_stable_latest':data,'lock_open_latest':opens,'lock_close_earliest':closes,'lock_close_latest':close_late,'D_to_open_min':prefix['t4']+lo(opening('response',b))-data,'capture_Q_to_close_min':closes-max(opens,data)-2,'common_DATA_stable_latest_from_T5':close_late-prefix['t5']+2+hi(broadcast)})
interface=[]
for row in front['per_bit']:
 core=row['core'];bit=row['bit'];ready=get('t5','owned_ready'+str(core));data=response[bit]['common_DATA_stable_latest_from_T5']
 close=lo(ready)+row['conditional_lock_close_time'];opened=hi(ready)+row['conditional_lock_open_time'];D=data+row['conditional_data_Q_dependency_time_if_open']-2
 capture_Q=max(opened,D)+2
 interface.append({'core':core,'bit':bit,'common_DATA_stable_latest_from_T5':data,'owned_READY_earliest_from_T5':lo(ready),'producer_DATA_lead_min':lo(ready)-data,'IR_capture_Q_latest_from_T5':capture_Q,'IR_lock_close_earliest_from_T5':close,'IR_capture_Q_to_close_min':close-capture_Q,'IR_lock_close_to_local_VALID_withdraw_min':row['lock_close_to_local_valid_withdrawal'],'IR_lock_close_to_owner_VALID_withdraw_min':row['lock_close_to_owner_valid_withdrawal']})
def validate(a,b,f):
 assert all(q['selected_D_to_open_min']>0 and q['capture_Q_to_close_min']>0 for q in a),'address setup/window'
 assert all(q['D_to_open_min']>0 and q['capture_Q_to_close_min']>0 for q in b),'response setup/window'
 assert all(q['producer_DATA_lead_min']>0 and q['IR_capture_Q_to_close_min']>0 and q['IR_lock_close_to_local_VALID_withdraw_min']>0 and q['IR_lock_close_to_owner_VALID_withdraw_min']>0 for q in f),'producer/IR setup/hold'
validate(address,response,interface);negative=0
for field,which in [('selected_D_to_open_min',0),('D_to_open_min',1),('producer_DATA_lead_min',2),('IR_lock_close_to_local_VALID_withdraw_min',2)]:
 bad=copy.deepcopy([address,response,interface]);bad[which][0][field]=0
 try:validate(*bad)
 except AssertionError:negative+=1
 else:raise AssertionError('Missing margin accepted: '+field)
summary={'selected_address_setup_min':min(q['selected_D_to_open_min'] for q in address),'address_capture_window_min':min(q['capture_Q_to_close_min'] for q in address),'response_data_setup_min':min(q['D_to_open_min'] for q in response),'response_capture_window_min':min(q['capture_Q_to_close_min'] for q in response),'producer_DATA_lead_min':min(q['producer_DATA_lead_min'] for q in interface),'IR_capture_window_min':min(q['IR_capture_Q_to_close_min'] for q in interface),'IR_local_hold_min':min(q['IR_lock_close_to_local_VALID_withdraw_min'] for q in interface),'IR_owner_hold_min':min(q['IR_lock_close_to_owner_VALID_withdraw_min'] for q in interface)}
out={'status':'conditional_program_capture_nominal_inequalities_pass','nominal_tick_margins':summary,'address':address,'response':response,'interface':interface,'source_sha256':files,'negative_refusals':negative,'assumptions':['Both requesters hold their physical address stable before owned-address capture, hold VALID through instruction capture and do not reuse the channel until READY is low. Core PC/intent/phase source timing remains a distinct obligation.','Owner selection has settled by its lock closure plus one2tick store update. Owner remains held throughout the read, response, READY and acknowledgement.','Every previous phase tail is drained, ACTIVE is held and reset-busy stays low during the normal transaction. Reset/reassertion/cold behavior is a separate proof obligation.','Program cells remain immutable during execution. Correct high/low amplitudes and comparator Boolean behavior require their separate static/native checks.','Nominal scheduled-device costs and zero dust/conductor cost are the model. These are not measured Minecraft delay extrema; no tick-order or pending-update simulation is performed.','The response remains held until the consumer has closed its IR and withdrawn VALID. Existing owner/phase protocol must preserve that invariant; these sums do not replace it.'],'numeric_physical_bounds_established':False,'complete_program_interface_acceptance':False,'complete_gpu_layout':False,'native_acceptance':False,'world_mutations':0}
(H/'combined-checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'status':out['status'],'nominal_tick_margins':summary,'negative_refusals':negative}))
