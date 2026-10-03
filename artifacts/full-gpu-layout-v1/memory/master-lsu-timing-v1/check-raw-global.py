"""Real raw-request payload fanout to the global payload latches. No host memory."""
from pathlib import Path
import json,hashlib,importlib.util
H=Path(__file__).resolve().parent;ROOT=H.parents[3];A=ROOT/'artifacts/full-gpu-layout-v1';helper=A/'memory/program-rom-timing-v1/check.py';s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
d=json.loads((A/'memory/channel-payload-v1/design.json').read_text());r=json.loads((A/'memory/channel-retention-v1/design.json').read_text());retgroups={'held_owner_mask','payload_mux','payload_collectors','payload_storage','retained_owner'}
positions={m.P(v['position']) for v in r['blocks'] if r['groups'][','.join(map(str,m.P(v['position'])))] in retgroups}
world={m.P(v['position']):v['block'] for v in d['blocks'] if d['groups'][','.join(map(str,m.P(v['position'])))] not in {'retention','raw_valid_returns'} or m.P(v['position']) in positions}
# State inputs are never combinational paths to Q; retain Q as actual source.
stores=r['stores'];cut={m.P(v['storage']) for v in stores};nodes,index,cost,edges=m.build(world);edges=[(a,b) for a,b in edges if nodes[b][0] not in cut];built=(nodes,index,cost,edges);m.build=lambda _:built
payload=[v for v in stores if v['name']=='payload'];owners=[v for v in stores if v['name']=='owner'];targets=[m.P(v['driver']) for v in payload]
reports={};witnesses={}
def run(name,src,dst):
 rr,w=m.analyze(world,src,dst,require_all=False);assert rr['status']=='conservative_potential_dependency_DAG_nominal_bound',rr;rr.update(source_positions=src,target_positions=dst);reports[name]=rr;witnesses[name]=w;return rr
run('held_owner_Q_to_global_payload_D',[m.P(v['storage']) for v in owners],targets)
# Reverse the fixed DAG to reduce68 target traversals versus208 input traversals.
# Endpoints differ in nominal cost (input wire0, target driver repeater2): reverse
# sum excludes the driver and includes the wire, so add exactly2 ticks back.
sources=[m.P(p) for n in ['read_address','write_address','write_data','read_valid','write_valid'] for p in d['ports'][n]['positions']]
for p in sources:assert world[p]['id']==m.W
for p in targets:assert world[p]['id']==m.R and world[p].get('properties',{}).get('delay')=='1'
m.build=lambda _:(nodes,index,cost,[(b,a) for a,b in edges]);rr,w=m.analyze(world,targets,sources,require_all=False);assert rr['status']=='conservative_potential_dependency_DAG_nominal_bound',rr
paths=[dict(address_bit=q['data_bit'],data_bit=q['address_bit'],potential_dependency_nominal_min_ticks=q['potential_dependency_nominal_min_ticks']+2,potential_dependency_nominal_max_ticks=q['potential_dependency_nominal_max_ticks']+2) for q in rr['paths']]
rr.update(paths=paths,source_positions=sources,target_positions=targets,max_nominal_dependency_ticks=max(q['potential_dependency_nominal_max_ticks'] for q in paths),transpose_computation_only=True,endpoint_cost_correction_ticks=2);reports['raw_inputs_to_global_payload_D']=rr;witnesses['raw_inputs_reverse_computation']=w
files=[Path(__file__).resolve(),helper,A/'memory/channel-payload-v1/design.json',A/'memory/channel-retention-v1/design.json']
out={'status':'actual_raw_global_payload_nominal_paths','reports':reports,'payload':payload,'owners':owners,'raw_port_order':['read_address','write_address','write_data','read_valid','write_valid'],'raw_port_widths':[64,64,64,8,8],'world_cells':len(world),'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'numeric_physical_bounds_established':False,'native_acceptance':False,'limits':['Every edge comes from actual vanilla block potential dependencies, not declared logical net aliases.','Transposed traversal only optimizes arithmetic; original signal flow remains source to D.','One-hot owner and read-first input conditions must remain coherent and held for the epoch; masks can influence data and are counted as dependencies.']}
(H/'raw-global-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'raw-global-witnesses.json').write_text(json.dumps(witnesses)+'\n');print(json.dumps({n:dict(paths=len(v['paths']),min=min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),max=v['max_nominal_dependency_ticks']) for n,v in reports.items()}))
