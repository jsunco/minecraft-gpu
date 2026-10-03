"""Join the frozen transport, phase and data graphs at actual boundary cells."""
from pathlib import Path
import json,hashlib,copy,re
H=Path(__file__).resolve().parent;ROOT=H.parents[3];files={}
def read(p):
 if isinstance(p,str):p=H/p
 files[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.loads(p.read_text())
c=read('cable-delay.json');g=read('global-admission.json');ctl=read('control-cables.json');be=read('backend-events.json');bank=read('bank-combined.json');bd=read('bank-data.json');ev=read('bank-events.json');el=read('eligibility.json')
req=read(H.parent/'bank-request-fanout-v1/ports.json')['connections'];rp=read(H.parent/'bank-ready-return-v1/ports.json')['connections']
lo=lambda r:r['potential_dependency_nominal_min_ticks'];hi=lambda r:r['potential_dependency_nominal_max_ticks'];pos=lambda p:tuple(p[a] for a in 'xyz') if isinstance(p,dict) else tuple(p)
def endpoint(report,source,destination):
 si=report['source_positions'].index(list(pos(source)));ti=report['target_positions'].index(list(pos(destination)));return next(r for r in report['paths'] if r['address_bit']==si and r['data_bit']==ti)
gp=g['paths'];cp=ctl['paths'];bp=be['paths'];prefix=gp['common_coil_to_close_and_commit']['paths'];commit_gap=lo(prefix[1])-hi(prefix[0]);assert commit_gap>0
def global_field(ch,field):
 i=17*ch+field;return hi(gp['payload_close_to_actual_locks']['paths'][i])+2+hi(gp['payload_Q_to_export']['paths'][i])
launch=[];data=[];type_rows=[]
for ch in range(4):
 aset=next(q for q in gp['commit_open_to_active_set']['paths'] if q['data_bit']==ch);act=next(q for q in cp['ACTIVE_Q_to_backend_ACTIVE']['paths'] if q['address_bit']==ch)
 req_source=cp['backend_request_to_raw_bank_VALID']['source_positions'][ch]
 # The true SET→Q and bank VALID→ACTIVE paths are nonnegative and are
 # deliberately omitted from this conservative earliest-launch estimate.
 active_early=commit_gap+lo(aset)+lo(act)+lo(bp['active_to_bank_request']['paths'][0])
 for b in range(4):
  for mode in ['read','write']:
   dst=next(q['destination'] for q in req if q['channel']==ch and q['bank']==b and q['kind']==mode+'_valid')
   q=endpoint(cp['backend_request_to_raw_bank_VALID'],req_source,dst);valid=active_early+lo(q);launch.append({'channel':ch,'bank':b,'mode':mode,'raw_VALID_earliest_after_global_payload_close_tap':valid})
   tq=endpoint(cp['held_type_export_to_raw_bank_VALID'],cp['held_type_export_to_raw_bank_VALID']['source_positions'][ch],dst);type_ready=global_field(ch,14)+hi(tq);type_rows.append({'channel':ch,'bank':b,'mode':mode,'type_to_request_min':valid-type_ready})
   for bit in range(8):
    field=15+bit if bit<2 else bit-2;r=next(q for q in c['routes'] if q['name']==f'address_c{ch}_b{b}_bit{bit}_{mode}');arrival=global_field(ch,field)+r['nominal_max_ticks'];data.append({'kind':'address','channel':ch,'bank':b,'mode':mode,'bit':bit,'settled_to_raw_VALID_min':valid-arrival})
   if mode=='write':
    for bit in range(8):
     r=next(q for q in c['routes'] if q['name']==f'write_c{ch}_b{b}_bit{bit}');arrival=global_field(ch,6+bit)+r['nominal_max_ticks'];data.append({'kind':'write_data','channel':ch,'bank':b,'mode':mode,'bit':bit,'settled_to_raw_VALID_min':valid-arrival})
sample_open=min(lo(q) for q in ev['events']['sample_open']['paths']);eligibility_margin=sample_open-max(b['max_nominal_dependency_ticks'] for b in el['banks'])
responses=[]
tap_times=bp['ready_to_three_taps']['paths'];t1=next(r for r in tap_times if r['data_bit']==0);t2=next(r for r in tap_times if r['data_bit']==1)
for ch in range(4):
 backend=cp['qualifier_to_backend_ready']['target_positions'][ch]
 for b in range(4):
  qualifier=next(q['destination'] for q in rp if q['kind']=='collector_input' and q['channel']==ch and q['bank']==b)
  to_br=endpoint(cp['qualifier_to_backend_ready'],qualifier,backend)
  # READ ready is the earliest source that can qualify returned data. WRITE
  # may select an internal stale byte too, but held type suppresses read-ready.
  br_source=next(q['source'] for q in rp if q['kind']=='ready_tap' and q['channel']==ch and q['bank']==b and q['type']=='read')
  to_qual=endpoint(cp['qualified_bank_ready_to_collector'],br_source,qualifier)
  ready=next(q for q in bank['ready'] if q['name']=='read_ready_'+str(ch))['earliest']
  for bit in range(8):
   data_route=next(q for q in c['routes'] if q['name']==f'response_data_b{b}_c{ch}_bit{bit}');qual_route=next(q for q in c['routes'] if q['name']==f'response_qualifier_b{b}_c{ch}_bit{bit}')
   local_q=bank['details']['response'][bit]['lock_close_latest']+2
   fanout=next(q for q in bd['paths']['response_Q_to_shared_DATA']['paths'] if q['address_bit']==bit)
   # Align both DATA and owner-qualifier causes to this exact collector pad.
   held_data_latest=local_q+hi(fanout)+data_route['nominal_max_ticks']-(ready+lo(to_qual))
   selected_D_latest=max(held_data_latest,qual_route['nominal_max_ticks'])
   opened=hi(to_br)+hi(bp['ready_rise_to_response_open']['paths'][bit]);close=lo(to_br)+lo(t1)+lo(bp['ready_t1_to_response_close']['paths'][bit]);close_late=hi(to_br)+hi(t1)+hi(bp['ready_t1_to_response_close']['paths'][bit])
   set_early=lo(to_br)+lo(t2)+lo(bp['ready_t2_to_CAPTURED_set']['paths'][0])
   responses.append({'channel':ch,'bank':b,'bit':bit,'held_data_arrival_latest_relative_qualifier':held_data_latest,'selected_D_arrival_latest_relative_qualifier':selected_D_latest,'lock_open_latest':opened,'lock_close_earliest':close,'lock_close_latest':close_late,'capture_Q_to_close_min':close-max(opened,selected_D_latest)-2,'close_to_CAPTURED_set_min':set_early-close_late,'D_to_open_min_informational':lo(to_br)+lo(bp['ready_rise_to_response_open']['paths'][bit])-selected_D_latest})
def validate(ds,ts,rs,em):
 assert all(q['settled_to_raw_VALID_min']>0 for q in ds),'global payload launch'
 assert all(q['type_to_request_min']>0 for q in ts),'retained type launch'
 assert em>0,'eligibility before opening'
 assert all(q['capture_Q_to_close_min']>0 and q['close_to_CAPTURED_set_min']>0 for q in rs),'global response capture/hold'
 assert bank['status']=='conditional_bank_nominal_capture_inequalities_pass'
validate(data,type_rows,responses,eligibility_margin);negative=0
for which,key in [(0,'settled_to_raw_VALID_min'),(1,'type_to_request_min'),(2,'capture_Q_to_close_min'),(2,'close_to_CAPTURED_set_min')]:
 bad=copy.deepcopy([data,type_rows,responses]);bad[which][0][key]=0
 try:validate(*bad,eligibility_margin)
 except AssertionError:negative+=1
 else:raise AssertionError('No-margin mutation accepted')
try:validate(data,type_rows,responses,0)
except AssertionError:negative+=1
else:raise AssertionError('Eligibility no-margin accepted')
summary={'address_settled_before_raw_VALID_min':min(q['settled_to_raw_VALID_min'] for q in data if q['kind']=='address'),'write_data_settled_before_raw_VALID_min':min(q['settled_to_raw_VALID_min'] for q in data if q['kind']=='write_data'),'retained_type_before_raw_VALID_min':min(q['type_to_request_min'] for q in type_rows),'raw_VALID_eligibility_before_sample_open_min':eligibility_margin,'global_response_Q_to_close_min':min(q['capture_Q_to_close_min'] for q in responses),'global_response_close_to_CAPTURED_set_min':min(q['close_to_CAPTURED_set_min'] for q in responses),'global_response_D_to_open_informational_min':min(q['D_to_open_min_informational'] for q in responses)}
files[str(Path(__file__).resolve().relative_to(ROOT))]=hashlib.file_digest(Path(__file__).open('rb'),'sha256').hexdigest()
out={'status':'conditional_connected_memory_normal_capture_inequalities_pass','nominal_tick_margins':summary,'local_bank_margins':bank['nominal_tick_margins'],'local_response_close_to_READY_min':bank['response_closed_to_first_ready_min'],'global_payload':data,'retained_type':type_rows,'launch':launch,'global_response':responses,'negative_refusals':negative,'source_sha256':files,'external_contract':['LSU raw VALID/address/write-data must be held through matching consumer READY; global request/payload capture assumes its local D has settled before actual global payload closure. The master LSU-to-memory delivery timing is a separate input constraint, not waived here.','No host phases: actual global admission, bank and backend controls supply every event. SR transitions must converge from admitted cold state and masks must remain stable throughout a normal transaction.','Actual owned bank READY/data stay held until global CAPTURED withdraws bank-valid; nominal global response closure precedes even CAPTURED SET, so no downstream path is needed to manufacture a hold margin.','Global CAPTURED remains held through bank-ready fall and the third delayed tail; consumer-ready then qualifies retained output. Global owner/payload cannot be regranted until retirement/busy/drained clear.','A write can select an internal stale response byte but retained type suppresses consumer read-ready; no zero-on-write DATA claim.','Staged global cold/reset admission must wait actual owners and tails drained. Reset pulse widths, pulse hazards and asynchronous power-on are outside this normal-transaction graph.','Original same-bank conflict/release-within-scan scheduling equivalence remains unselected. These inequalities do not resolve visible arbitration semantics.'],'limits':['Negative D-to-OPEN is permitted only at the global response bank: the late selected data still has a positive full capture-to-close margin while consumer-ready is low.','Nominal device costs are not physical lower/upper delay bounds; no Minecraft execution or scheduled-event/pulse simulation was performed.','These results are conditioned on the separate static Boolean/attenuation/contact checks and frozen parent preservation.'],'numeric_physical_bounds_established':False,'complete_memory_dynamic_acceptance':False,'native_acceptance':False,'world_mutations':0}
(H/'runtime-combined.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'status':out['status'],'nominal_tick_margins':summary,'negative_refusals':negative}))
