"""Four physical inversions of the existing complete bank-busy producers."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent;R=H.parents[2];B=R/'artifacts/full-gpu-layout-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();P=lambda x,y,z:dict(x=x,y=y,z=z);K=lambda p:tuple(p[a]for a in 'xyz')
mp=B/'memory/consumer-return-v1/source-manifest.json';assert sha(mp)=='ecea996fc712bf92bb2aa5f5e8c93efa96f510b80613c83e8878de1c6c050c3a'
dp=B/'memory/consumer-return-v1/design.json';pins=json.loads(mp.read_text())['source_sha256'];assert sha(dp)==pins[str(dp.relative_to(R))]
old=json.loads(dp.read_text());sources=old['ports']['bank_busy_any']['positions'];bounds={'x':[379,822],'y':[61,68],'z':[960,1588]}
near=[v for v in old['blocks'] if all(bounds[a][0]<=v['position'][a]<=bounds[a][1]for a in'xyz')];base={K(v['position']):v['block']for v in near};blocks=[];added=set();adapters=[]
def put(p,name,props=None):
 assert K(p)not in base and K(p)not in added,('Collision',p)
 b={'id':'minecraft:'+name}
 if props:b['properties']=props
 blocks.append({'position':p,'block':b});added.add(K(p))
for bank,s in enumerate(sources):
 x,y,z=K(s);entry=P(x-1,y,z);solid=P(x-2,y,z);torch=P(x-3,y,z);outrep=P(x-4,y,z);out=P(x-5,y,z)
 assert base[K(s)]['id']=='minecraft:redstone_wire'
 for p in [entry,outrep,out]:put(P(p['x'],y-1,z),'light_gray_concrete')
 for p in [entry,outrep]:put(p,'repeater',{'facing':'east','delay':'1'})
 put(solid,'light_gray_concrete');put(torch,'redstone_wall_torch',{'facing':'west'});put(out,'redstone_wire')
 adapters.append({'bank':bank,'source':s,'source_port':'bank_busy_any','input_normalizer':entry,'inverter_support':solid,'torch':torch,'output_normalizer':outrep,'destination':out,'nominal_ticks':6})
sources_hash={str(p.relative_to(R)):sha(p)for p in [mp,dp,B/'memory/consumer-return-v1/ports.json',B/'memory/bank-tail-sources-v1/README.md',B/'memory/bank-tail-sources-v1/source-manifest.json']}
d={'status':'offline_bank_quiet_source_adapter_draft','blocks':blocks,'adapters':adapters,'ports':{'bank_quiet':{'direction':'output','width':4,'positions':[a['destination']for a in adapters],'polarity':'active_high','meaning':'NOT (bank ACTIVE OR final normal delayed tail OR retained reset blocker)'}},'metrics':{'added_cells':len(blocks),'retained_state_bits':0,'output_bits':4},'source_sha256':sources_hash,'native_acceptance':False,'master_quiet_routes_complete':False,'world_mutations':0}
(H/'design.json').write_text(json.dumps(d)+'\n');(H/'obstacles.json').write_text(json.dumps({'bounds':bounds,'blocks':near,'source_sha256':sources_hash})+'\n');print(json.dumps({'slice':len(near),**d['metrics']}))
