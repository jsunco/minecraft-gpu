"""Actual selected owner/payload/backing dependency paths at store boundaries."""
from pathlib import Path
import json, importlib.util, hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
files=[helper,H.parent/'bank-sampled-admission-v1/bank.json',H.parent/'data-owner-v1/design.json',H.parent/'data-owned-bank-v1/design.json',Path(__file__).resolve()]
bank=json.loads(files[1].read_text());owner=json.loads(files[2].read_text());owned=json.loads(files[3].read_text());world={m.P(v['position']):v['block'] for v in bank['blocks']};nets={tuple(map(int,k.split(','))):v for k,v in bank['nets'].items()};off=m.P(owned['owner_offset']);stores=[{**s,**{k:m.A(m.P(s[k]),off) for k in ['driver','storage','lock','terminal']}} for s in owner['stores']]
payload=[s for s in stores if s['name']=='payload'];owners=[s for s in stores if s['name']=='owner'];built=m.build(world);m.build=lambda _:built
ram=[{'card':s+2*t,'word':w,'bit':b,'storage':(10 if b>=4 else 2,1+8*w+140*t,8*(b%4)+64*s),'driver':(11 if b>=4 else 1,1+8*w+140*t,8*(b%4)+64*s),'lock':(10 if b>=4 else 2,1+8*w+140*t,8*(b%4)+64*s+1)} for s in range(2) for t in range(2) for w in range(16) for b in range(8)]
reports={};witnesses={}
def run(name,src,dst,allowed):
 allowed.update(src+dst);r,w=m.analyze(world,src,dst,allowed,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r);r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
# Snapshots are actual storage outputs. Their lock path is excluded so this
# combinational priority analysis cannot borrow an OPEN event as data.
sel={p for p,n in nets.items() if n.startswith(('owner/eligible','owner/grant','owner/priority','owner/not_eligible','owner/owner'))}
# Exact owner namespace includes the inherited priority network, but excludes
# held owner outputs, mux payload and all OPEN/lock-control nets.
priority={p for p,n in nets.items() if n.startswith('owner/') and not n.startswith(('owner/payload','owner/candidate','owner/selected','owner/open','owner/hold','owner/not_owner'))}
snapshot=run('sample_Q_to_owner_D',[m.P(s['storage']) for s in bank['snapshots']],[s['driver'] for s in owners],priority)
selected={p for p,n in nets.items() if n.startswith(('owner/owner','owner/not_owner','owner/selected'))}
select=run('owner_Q_to_payload_D',[s['storage'] for s in owners],[s['driver'] for s in payload],selected)
backing={p for p,n in nets.items() if n.startswith('bank/')}
backing.update(p for p,n in nets.items() if n.startswith('owner/payload'))
write=run('payload_write_Q_to_RAM_D',[s['storage'] for s in payload[6:14]],[v['driver'] for v in ram],set(backing));assert len(write['paths'])==512
for r in write['paths']:assert r['address_bit']==ram[r['data_bit']]['bit']
address=run('payload_address_Q_to_RAM_lock',[s['storage'] for s in payload[:6]],[v['lock'] for v in ram],set(backing));assert len(address['paths'])==6*512
response_targets=[m.P(s['driver']) for s in owned['responses']]
address_read=run('payload_address_Q_to_response_D',[s['storage'] for s in payload[:6]],response_targets,set(backing));assert len(address_read['paths'])==48
fanout={p for p,n in nets.items() if n.startswith('response') and n!='response_hold'}
fanout_result=run('response_Q_to_shared_DATA',[m.P(s['storage']) for s in owned['responses']],[m.P(p) for p in bank['ports']['read_data']['positions'][:8]],fanout);assert len(fanout_result['paths'])==8
# Reverse this same physical DAG to collect every one of512 RAM-Q paths with
# only8 traversal seeds. Endpoint repeaters both cost2, so path sums agree in
# either direction; this is dependency arithmetic, never reverse signal flow.
nodes,index,cost,edges=built
m.build=lambda _:(nodes,index,cost,[(b,a) for a,b in edges])
for p in response_targets+[v['storage'] for v in ram]:assert world[p]['id']==m.R and int(world[p]['properties']['delay'])==1
read=run('RAM_Q_to_response_D_reverse_computation',response_targets,[v['storage'] for v in ram],set(backing));assert len(read['paths'])==512
for r in read['paths']:assert r['address_bit']==ram[r['data_bit']]['bit']
read['reverse_computation']=True;read['endpoint_costs_equal_ticks']=2
m.build=lambda _:built
out={'status':'offline_selected_bank_data_nominal_paths','paths':reports,'RAM_cells':ram,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limits':['Owner, payload, snapshots and RAM Q are explicitly separate state boundaries. Their capture/hold phases are not replaced by these data paths.','All possible RAM address/bit branches are included even when not selected; this is conservative dependency arithmetic with stable type/valid qualification.','The eight reverse computations use the exact transpose of the frozen forward graph and equal endpoint costs; no physical reverse propagation is assumed.','Nominal device costs are not observed timing bounds. Source setup and state capture must be composed separately.'],'native_acceptance':False,'capture_hold_ordering_closed':False,'numeric_physical_bounds_established':False}
(H/'bank-data.json').write_text(json.dumps(out,indent=2)+'\n');(H/'bank-data-witnesses.json').write_text(json.dumps(witnesses)+'\n')
print(json.dumps({n:{'paths':len(v['paths']),'min':min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),'max':v['max_nominal_dependency_ticks']} for n,v in reports.items()}))
