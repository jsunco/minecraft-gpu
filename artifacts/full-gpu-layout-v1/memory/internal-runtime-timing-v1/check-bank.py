"""Actual one-bank paths with retained state cut at named storage boundaries."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];base=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('nominal_dag',base);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
files=[base,H.parent/'bank-sampled-admission-v1/bank.json',H.parent/'data-owner-v1/design.json',H.parent/'data-owned-bank-v1/design.json',Path(__file__).resolve()]
bank=json.loads(files[1].read_text());owner=json.loads(files[2].read_text());owned=json.loads(files[3].read_text());world={m.P(v['position']):v['block'] for v in bank['blocks']};net={tuple(map(int,k.split(','))):v for k,v in bank['nets'].items()};offset=m.P(owned['owner_offset']);translate=lambda p:m.A(m.P(p),offset)
stores=[{**s,**{k:translate(s[k]) for k in ['driver','storage','lock','terminal']}} for s in owner['stores']]
payload=[s for s in stores if s['name']=='payload'];sources=[];source_names=[]
for slot in range(4):
 for port in ['read_address','write_address','write_data']:
  for bit in range(8):sources.append(m.P(bank['ports'][port]['positions'][8*slot+bit]));source_names.append({'slot':slot,'port':port,'bit':bit})
nets={v for v in net.values() if v.startswith(('read_address','write_address','write_data','candidate','owner/candidate_','owner/selected_'))}
allowed={p for p,v in net.items() if v in nets};targets=[s['driver'] for s in payload];allowed.update(sources+targets)
data,witness=m.analyze(world,sources,targets,allowed,require_all=False)
assert data['status']=='conservative_potential_dependency_DAG_nominal_bound',data
for row in data['paths']:
 src=source_names[row.pop('address_bit')];field=payload[row.pop('data_bit')]['bit'];assert field==(src['bit']+6 if src['port']=='write_data' else src['bit']-2),(src,field);row.update(src,field=field)
assert len(data['paths'])==80,len(data['paths'])
# Actual phase coil is the single common launch boundary. Its first repeater
# output is the source here; subsequent prefixes do not double-charge it.
source=(16,-45,-450);assert world[source]['id']==m.R
phase_nets={'sequence_active_delayed_flush','sequence_open_owner','sequence_open_address','sequence_write_phase','sequence_open_response','sequence_ready','retimed_owner','retimed_payload','retimed_write','write_early','write_late','open_sample','sample_hold','owner/open_owner','owner/hold_owner','owner/open_payload','owner/hold_payload','open_response','hold_response'}
phase_nets.update('owner_ready'+str(i) for i in range(8));phase_nets.update('read_ready'+str(i) for i in range(8));phase_nets.update('write_ready'+str(i) for i in range(8))
phase_targets=[s['lock'] for s in stores]+[m.P(s['lock']) for s in owned['responses']]+[m.P(s['lock']) for s in bank['snapshots']]+[m.P(bank['ports'][p]['positions'][i]) for p in ['read_ready','write_ready'] for i in range(4)]
phase_names=[s['name']+'_lock_'+str(s['bit']) for s in stores]+['response_lock_'+str(s['bit']) for s in owned['responses']]+['sample_lock_'+str(s['slot']) for s in bank['snapshots']]+[p+'_'+str(i) for p in ['read_ready','write_ready'] for i in range(4)]
allowed={p for p,v in net.items() if v in phase_nets};allowed.update([source]+phase_targets)
phase,phase_witness=m.analyze(world,[source],phase_targets,allowed,require_all=True)
assert phase['status']=='conservative_potential_dependency_DAG_nominal_bound',phase
for row in phase['paths']:row['target_name']=phase_names[row.pop('data_bit')];row.pop('address_bit')
out={'status':'offline_actual_bank_paths_nominal_only','source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'raw_input_to_payload_D':data,'phase_coil_to_actual_locks_and_ready':phase,'phase_source':source,'phase_source_cost_excluded_ticks':8,'assumptions':['Retained owner/read-vs-write controls are closed and stable during the input-to-D transport section.','State repeaters are boundaries; their outputs and locks are not joined as combinational feedback.','Phase cost starts at the first physical normal-coil repeater output, not at asynchronous requester VALID.','The conservative geometry DAG can include both comparator sides but does not simulate pulse widths, edge races, voltage or store updates.','This report alone does not distinguish opening and closing causes and cannot admit a capture window.'],'numeric_physical_bounds_established':False,'capture_hold_ordering_closed':False,'native_acceptance':False}
(H/'bank-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'bank-path-witnesses.json').write_text(json.dumps({'payload':witness,'phase':phase_witness})+'\n')
print(json.dumps({'status':out['status'],'payload_paths':len(data['paths']),'payload_max':data['max_nominal_dependency_ticks'],'phase_paths':len(phase['paths']),'phase_max':phase['max_nominal_dependency_ticks']}))
