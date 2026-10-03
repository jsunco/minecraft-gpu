"""Compose per-cell nominal capture inequalities; never infer physical bounds."""
from pathlib import Path
import json,hashlib,copy
H=Path(__file__).resolve().parent;ROOT=H.parents[3];files={}
def read(name):
 p=H/name;files[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.loads(p.read_text())
e=read('bank-events.json');d=read('bank-data.json');p=read('bank-paths.json')
lo=lambda r:r['potential_dependency_nominal_min_ticks'];hi=lambda r:r['potential_dependency_nominal_max_ticks']
prefix={tuple(e['common_epoch']['target_positions'][r['data_bit']]):hi(r) for r in e['common_epoch']['paths']}
event=lambda name,kind,b:e['events'][name+'_'+kind]['paths'][b]
at=lambda name,kind,b,which:prefix[tuple(e['events'][name+'_'+kind]['source'])]+which(event(name,kind,b))
rows=d['paths']; report={}
for bank,dependency,previous,count in [('owner','sample_Q_to_owner_D','sample',8),('payload','owner_Q_to_payload_D','owner',15)]:
 out=[]
 for b in range(count):
  stable=max(at(previous,'close',q['address_bit'],hi)+2+hi(q) for q in rows[dependency]['paths'] if q['data_bit']==b)
  opening=at(bank,'open',b,hi);close=at(bank,'close',b,lo)
  out.append({'bit':b,'D_stable_latest':stable,'lock_open_earliest':at(bank,'open',b,lo),'lock_open_latest':opening,'lock_close_earliest':close,'lock_close_latest':at(bank,'close',b,hi),'D_to_open_min':at(bank,'open',b,lo)-stable,'Q_to_close_min':close-max(stable,opening)-2})
 report[bank]=out
ram=[]
for i,cell in enumerate(d['RAM_cells']):
 wd=next(q for q in rows['payload_write_Q_to_RAM_D']['paths'] if q['data_bit']==i)
 stable=at('payload','close',wd['address_bit']+6,hi)+2+hi(wd)
 adr=max(at('payload','close',q['address_bit'],hi)+2+hi(q) for q in rows['payload_address_Q_to_RAM_lock']['paths'] if q['data_bit']==i)
 opening=at('write','open',i,hi);close=at('write','close',i,lo)
 ram.append({**{k:cell[k] for k in ['card','word','bit']},'D_stable_latest':stable,'address_effects_settled_latest':adr,'lock_open_earliest':at('write','open',i,lo),'lock_open_latest':opening,'lock_close_earliest':close,'lock_close_latest':at('write','close',i,hi),'D_to_open_min':at('write','open',i,lo)-stable,'address_to_open_min':at('write','open',i,lo)-adr,'Q_to_close_min':close-max(stable,opening)-2})
report['RAM']=ram
response=[]
for b in range(8):
 address=max(at('payload','close',q['address_bit'],hi)+2+hi(q) for q in rows['payload_address_Q_to_response_D']['paths'] if q['data_bit']==b)
 # Reverse report indexes: address_bit is response bit; data_bit is RAM cell.
 written=max(ram[q['data_bit']]['lock_close_latest']+2+hi(q) for q in rows['RAM_Q_to_response_D_reverse_computation']['paths'] if q['address_bit']==b)
 stable=max(address,written);opening=at('response','open',b,hi);close=at('response','close',b,lo)
 response.append({'bit':b,'address_settled_latest':address,'written_Q_return_latest':written,'D_stable_latest':stable,'lock_open_earliest':at('response','open',b,lo),'lock_open_latest':opening,'lock_close_earliest':close,'lock_close_latest':at('response','close',b,hi),'D_to_open_min':at('response','open',b,lo)-stable,'Q_to_close_min':close-max(stable,opening)-2})
report['response']=response
# Earlier broad phase report starts at first slow-repeater OUTPUT. Add its
# actual10-tick arrival from the shared epoch before comparing returned ready.
ready=[{'name':q['target_name'],'earliest':10+lo(q),'latest':10+hi(q)} for q in p['phase_coil_to_actual_locks_and_ready']['paths'] if q['target_name'].startswith(('read_ready_','write_ready_'))]
last_response=max(q['lock_close_latest']+2 for q in response);ready_margin=min(q['earliest'] for q in ready)-last_response
def validate(r,rm):
 for name,rs in r.items():
  for q in rs:
   assert q['D_to_open_min']>0,(name,'data setup',q)
   assert q['Q_to_close_min']>0,(name,'capture window',q)
   if name=='RAM':assert q['address_to_open_min']>0,(name,'address setup',q)
 assert rm>0,('ready before response closure',rm)
failures=[]
try:validate(report,ready_margin)
except AssertionError as error:failures.append(str(error))
negative=0
for name,field in [('owner','D_to_open_min'),('payload','Q_to_close_min'),('RAM','address_to_open_min'),('response','Q_to_close_min')]:
 bad=copy.deepcopy(report);bad[name][0][field]=0
 try:validate(bad,ready_margin)
 except AssertionError:negative+=1
 else:raise AssertionError('Missing nominal margin accepted')
summary={name:{field:min(q[field] for q in rs) for field in ['D_to_open_min','Q_to_close_min']+(['address_to_open_min'] if name=='RAM' else [])} for name,rs in report.items()}
out={'status':'conditional_bank_nominal_capture_inequalities_'+('fail' if failures else 'pass'),'nominal_tick_margins':summary,'response_closed_to_first_ready_min':ready_margin,'details':report,'ready':ready,'failures':failures,'negative_refusals':negative,'source_sha256':files,'required_external_assumptions':['All actual raw request/selected address/write-data inputs have settled before eligibility capture starts, and remain held until typed bank READY. The global transport/launch comparison is still pending.','Raw eligibility sampled before owner priority evaluation; busy/reset masks stable and old tails drained.','Normal store Q follows its actual D within one nominal2tick storage update when lock is open. No race or pending-update physical proof is inferred.','Backing write qualification selects exactly one card/word with retained type; that settled Boolean contract is separate from nominal path sums.'],'numeric_physical_bounds_established':False,'complete_internal_memory_timing':False,'native_acceptance':False}
(H/'bank-combined.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:out[k] for k in ['status','nominal_tick_margins','response_closed_to_first_ready_min','failures','negative_refusals']}))
