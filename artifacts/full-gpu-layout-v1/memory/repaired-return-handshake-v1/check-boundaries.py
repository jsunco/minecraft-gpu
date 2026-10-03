"""Actual source/front rail and explicit one-transition SR half-path costs.

An SR state is not treated as a combinational DAG. Each half-path terminates at
its actual Q or !Q wire; that terminal has no outgoing edges in that query.
"""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];helper=M/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);g=importlib.util.module_from_spec(s);s.loader.exec_module(g);build=g.build;P=g.P
reports={};witness={};files=[helper,Path(__file__).resolve()]
def run(name,d,src,dst,allowed,cuts=()):
 world={P(v['position']):v['block'] for v in d['blocks']};nodes,index,cost,edges=build(world)
 edges=[(a,b) for a,b in edges if nodes[a][0] not in set(cuts)]
 g.build=lambda _:(nodes,index,cost,edges)
 r,w=g.analyze(world,src,dst,set(map(tuple,allowed))|set(src+dst),require_all=False)
 assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r)
 r.update(source_positions=src,target_positions=dst,sink_only_state_positions=list(cuts));reports[name]=r;witness[name]=w
 print(name,len(r['paths']),min(v['potential_dependency_nominal_min_ticks'] for v in r['paths']),r['max_nominal_dependency_ticks'],flush=True)
 return r
p=H/'raw_valid_front-slice.json';files.append(p);d=json.load(open(p));ports=d['metadata']['ports']
src=[P(v) for n in ['read_valid','write_valid'] for v in ports[n]['positions']];dst=[(x,1+4*i,z) for x,z in [(618,125),(626,122)] for i in range(8)]
r=run('external_VALID_to_fanout_tap',d,src,dst,d['allowed_positions']);assert len(r['paths'])==16;assert all(v['address_bit']==v['data_bit'] for v in r['paths'])
p=H/'consumer_drain-slice.json';files.append(p);d=json.load(open(p));src=[(48+128*i,1+80*i,16) for i in range(4)];dst=[P(v) for v in d['metadata']['ports']['consumer_drained']['positions']];r=run('live_BUSY_to_consumer_drained',d,src,dst,d['allowed_positions']);assert len(r['paths'])==32
p=M/'channel-colocation-v1/local-qualified.json';files.append(p);d=json.load(open(p))
for st in d['states']:
 name=st['name'];pos=P(st['positive']);neg=P(st['negative']);allowed={tuple(map(int,k.split(','))) for k,v in d['groups'].items() if v==name+'_retention'}
 for label,src,dst in [('set_to_negative',P(st['set']),neg),('negative_to_positive',neg,pos),('clear_to_positive',P(st['clear']),pos),('positive_to_negative',pos,neg)]:
  run(name+'_'+label,d,[src],[dst],allowed,[p for p in [pos,neg] if p!=src])
p=H/'global_channel0_release-slice.json';files.append(p);d=json.load(open(p));pos=(50,1,172);neg=(58,1,172)
for name,src,dst in [('RETIRE_to_ACTIVE_low',(44,1,172),pos),('ACTIVE_to_inactive',pos,neg),('ACTIVE_to_live_BUSY',pos,(48,1,16)),('ACTIVE_to_relocated_pickup',pos,(50,5,176)),('backend_BUSY_arrival_to_live_BUSY',(48,5,22),(48,1,16)),('live_BUSY_to_snapshot_driver',(48,1,16),(48,1,14))]:
 run(name,d,[src],[dst],d['allowed_positions'],[p for p in [pos,neg] if p!=src])
out={'status':'explicit_source_and_SR_halfpath_nominal_dependencies','paths':reports,'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files},'limitations':['SR halves are conditional on an initialized stable latch, mutually exclusive SET/CLEAR and held source; they are not an arbitrary pending-event convergence proof.','A full SET-to-positive event traverses SET→negative then negative→positive; CLEAR-to-positive uses its real direct half-path.','Only the explicit actual state terminal is made a sink per half-path; no internal cable or positive feedback loop is silently removed.','All delays are nominal scheduled costs, not empirical edge/pulse bounds.'],'native_acceptance':False}
(H/'boundary-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'boundary-witnesses.json').write_text(json.dumps(witness)+'\n')
