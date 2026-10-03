"""Nominal LSU phase/latch paths; fixed geometry, explicit state cuts, no native."""
from pathlib import Path
import json,hashlib,importlib.util
H=Path(__file__).resolve().parent;ROOT=H.parents[3];A=ROOT/'artifacts/full-gpu-layout-v1';helper=A/'memory/program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
d=json.loads((A/'control-lsu-v2/design.json').read_text());world={m.P(v['position']):v['block'] for v in d['blocks']}
banks=[(n,x,w) for n,x,w in [('address',0,8),('store_data',20,8),('type',40,1),('result',60,8),('valid',80,1),('done',100,1),('reset_ack',120,1),('fault',140,1)]]
stores=[dict(name=n,bit=b,storage=(x+2,1+4*b,60),lock=(x+2,1+4*b,61),D=(x+1,1+4*b,60),Q=(x+5,1+4*b,60)) for n,x,w in banks for b in range(w)]
stores += [dict(name=n,bit=b,storage=(x+2,1+4*b,40),lock=(x+2,1+4*b,41),D=(x+1,1+4*b,40),Q=(x+5,1+4*b,40)) for n,x in [('next',110),('current',122)] for b in range(4)]
assert len(stores)==37
built=m.build(world);nodes,idx,cost,edges=built
cuts={s['storage'] for s in stores};edges=[(a,b) for a,b in edges if nodes[b][0] not in cuts]
m.build=lambda _: (nodes,idx,cost,edges)
reports={};witnesses={}
def pt(n):return tuple(d['ports'][n]['bits'][0]['position'][a] for a in 'xyz')
def selected(names,field):return [s[field] for s in stores if s['name'] in names]
def run(name,src,dst):
 r,w=m.analyze(world,src,dst,require_all=False);assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',r
 r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w;return r
run('A_to_payload_locks',[pt('phase_a')],selected(['address','store_data','type'],'lock'))
run('A_to_result_locks',[pt('phase_a')],selected(['result'],'lock'))
run('A_to_valid_lock',[pt('phase_a')],selected(['valid'],'lock'))
run('A_to_next_locks',[pt('phase_a')],selected(['next'],'lock'))
run('B_to_current_locks',[pt('phase_b')],selected(['current'],'lock'))
run('current_Q_to_valid_D',selected(['current'],'storage'),selected(['valid'],'D'))
run('current_Q_to_payload_locks',selected(['current'],'storage'),selected(['address','store_data','type'],'lock'))
run('current_Q_to_result_locks',selected(['current'],'storage'),selected(['result'],'lock'))
run('valid_Q_to_typed_VALID',selected(['valid'],'storage'),[pt('read_valid'),pt('write_valid')])
run('type_Q_to_typed_VALID',selected(['type'],'storage'),[pt('read_valid'),pt('write_valid')])
run('payload_Q_to_external',selected(['address','store_data','type'],'storage'),selected(['address','store_data','type'],'Q'))
run('response_pad_to_result_D',[m.P(v['position']) for v in d['ports']['read_data']['bits']],selected(['result'],'D'))
run('raw_sources_to_payload_D',[m.P(v['position']) for n in ['rs','rt'] for v in d['ports'][n]['bits']]+[pt('mem_write')],selected(['address','store_data','type'],'D'))
files=[Path(__file__).resolve(),helper,A/'control-lsu-v2/design.json',A/'control-lsu-v2/prepare.mjs',A/'control-lsu-v2/logic.mjs',ROOT/'hardware/full-gpu-state-bank.mjs']
out=dict(status='offline_local_LSU_actual_dependency_paths',reports=reports,stores=stores,cut_incoming_at_actual_storage_repeaters=True,source_sha256={str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},native_acceptance=False,numeric_physical_bounds_established=False,limits=['All actual storage input dependencies are cut, retaining their real output source nodes. Individual stores are state boundaries, not combinational pass-throughs.','Opening/closing event costs assume the appropriate CURRENT row and other masks stable. Logic polarity and state schedule are separate from this potential dependency graph.','This local template must be checked unchanged at every placed core LSU and composed with real source phase/cable delays before master setup claims.'])
(H/'local-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'local-witnesses.json').write_text(json.dumps(witnesses)+'\n')
print(json.dumps({n:dict(paths=len(v['paths']),minimum=min(q['potential_dependency_nominal_min_ticks'] for q in v['paths']),maximum=v['max_nominal_dependency_ticks']) for n,v in reports.items()}))
