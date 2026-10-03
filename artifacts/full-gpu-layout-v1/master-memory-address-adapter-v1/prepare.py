"""Draw the shared-address recipient adapter against the frozen memory union."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent;R=H.parents[2];B=R/'artifacts/full-gpu-layout-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
P=lambda x,y,z:dict(x=x,y=y,z=z)
K=lambda p:tuple(p[a]for a in 'xyz')
mp=B/'memory/consumer-return-v1/source-manifest.json';assert sha(mp)=='ecea996fc712bf92bb2aa5f5e8c93efa96f510b80613c83e8878de1c6c050c3a'
manifest=json.loads(mp.read_text());pins=manifest.get('files',manifest.get('source_sha256',manifest.get('pins')))
dp=B/'memory/consumer-return-v1/design.json';assert sha(dp)==pins[str(dp.relative_to(R))]
old=json.loads(dp.read_text());bounds={'x':[607,619],'y':[-4,35],'z':[-12,58]}
near=[v for v in old['blocks'] if all(bounds[a][0]<=v['position'][a]<=bounds[a][1] for a in 'xyz')];base={K(v['position']):v['block'] for v in near}
ledger=json.loads((B/'floorplan-v3/connections.json').read_text());buses=[]
for core in range(2):
 for lane in range(4):
  prefix=f'gpu/core{core}/lane{lane}/lsu.'
  read=next(n for n in ledger['nets'] if n['name'].startswith(prefix+'read_address'))
  write=next(n for n in ledger['nets'] if n['name'].startswith(prefix+'write_address'))
  assert read['driver']['positions']==write['driver']['positions']
  buses.append({'core':core,'lane':lane,'source':read['driver']['positions'],'read_recipients':read['sink']['positions'],'write_recipients':write['sink']['positions']})
blocks=[];added={};inputs=[];branches=[]
def put(p,name,properties=None):
 b={'id':'minecraft:'+name}
 if properties:b['properties']=properties
 assert K(p) not in base and K(p) not in added,('Collision',p)
 v={'position':p,'block':b};added[K(p)]=b;blocks.append(v)
for bus in buses:
 consumer=4*bus['core']+bus['lane']
 for bit,(read,write) in enumerate(zip(bus['read_recipients'],bus['write_recipients'])):
  assert read['x']==write['x']==612 and read['y']==write['y']==1+4*consumer and write['z']==read['z']+2
  x,y,z=read['x'],read['y'],read['z']+1
  source=P(x+2,y,z);normalizer=P(x+1,y,z);solid=P(x,y,z)
  for p in [source,normalizer]:put(P(p['x'],y-1,z),'light_gray_concrete')
  put(source,'redstone_wire');put(normalizer,'repeater',{'facing':'east','delay':'1'});put(solid,'light_gray_concrete')
  for dest in [read,write]:
   assert base[K(dest)]['id']=='minecraft:redstone_wire'
   assert base[(dest['x']-1,dest['y'],dest['z'])]=={'id':'minecraft:repeater','properties':{'facing':'east','delay':'1'}}
  inputs.append({'consumer':consumer,'core':bus['core'],'lane':bus['lane'],'bit':bit,'position':source,'normalizer':normalizer,'required_high_power':15,'direction':'input','travel':{'x':-1,'y':0,'z':0}})
  branches.append({'consumer':consumer,'bit':bit,'source':source,'normalizer':normalizer,'strong_solid':solid,'recipients':[read,write],'upstream_LSU_source':bus['source'][bit]})
source_sha256={str(mp.relative_to(R)):sha(mp),str(dp.relative_to(R)):sha(dp),str((B/'floorplan-v3/connections.json').relative_to(R)):sha(B/'floorplan-v3/connections.json')}
out={'status':'offline_shared_address_recipient_adapter_draft','blocks':blocks,'inputs':inputs,'branches':branches,'metrics':{'added_cells':len(blocks),'shared_input_bits':64,'old_recipient_pads':128,'retained_bits':0},'source_sha256':source_sha256,'native_acceptance':False,'complete_master_address_bus':False,'limits':['Only the final two-recipient fanout is drawn. The64LSU-to-adapter trunks are still required.','The64 read/write address identities share exact physical LSU sources. No dynamic mux or host state is introduced.']}
(H/'design.json').write_text(json.dumps(out)+'\n');(H/'obstacles.json').write_text(json.dumps({'bounds':bounds,'blocks':near,'source_sha256':source_sha256})+'\n');print(json.dumps({'parent_cells':len(old['blocks']),'slice':len(near),**out['metrics']}))
