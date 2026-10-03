"""Small actual-cell boundary slices; no parent edits or selected-map changes."""
from pathlib import Path
import json,hashlib,gc
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3]
P=lambda p:tuple(p[a] for a in 'xyz')
src={}
def read(n):
 p=M/n;src[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.load(open(p))
d=read('channel-payload-v1/design.json');raw={P(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,P(v['position'])))]=='raw_request_selectors' and d['nets'][','.join(map(str,P(v['position'])))] in {t+str(i) for i in range(8) for t in ['read_valid','write_valid']}};ports={k:d['ports'][k] for k in ['read_valid','write_valid']};del d;gc.collect()
d=read('channel-retention-v1/design.json');groups={'channel_active_state','channel_busy_snapshot','backend_busy_lifecycle'};nset={'active0','not_active0','clear0','retire0','busy0','backend_busy0'}
globalkeys={P(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,P(v['position'])))] in groups and d['nets'][','.join(map(str,P(v['position'])))] in nset};del d;gc.collect()
d=read('consumer-drain-v1/design.json');drainkeys={P(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,P(v['position'])))]!='backend_parent'};drainmeta={'ports':{'consumer_drained':d['ports']['consumer_drained']},'masks':d['masks']};del d;gc.collect()
d=read('master-cold-compatible-v2/design.json');world={P(v['position']):v['block'] for v in d['blocks']};
# Preserve the short inherited ACTIVE pickup and BUSY arrival after the relocated cable endpoints.
for v in d['blocks']:
 p=P(v['position']);n=d['nets'].get(','.join(map(str,p)))
 if n=='active0' and p[0]==50 and 0<=p[1]<=5 and 172<=p[2]<=176:globalkeys.add(p)
 if n=='backend0/backend_busy' and p[0]==48 and 0<=p[1]<=5 and 16<=p[2]<=22:globalkeys.add(p)
del d;gc.collect()
# The small boundary keys are inherited. The delta changes must not touch them.
reserved=raw|globalkeys|drainkeys
rel=read('channel-colocation-v1/trial-design.json')
for v in rel['removed']:
 p=P(v['position']);assert world[p]==v['block'];assert p not in reserved;del world[p]
for v in rel['blocks']:
 p=P(v['position']);assert p not in world;world[p]=v['block']
for fn,field in [('return-loop-repair-v1/delta.json','substitutions'),('return-feedback-extension-v1/delta.json','changes'),('return-feedback-extension-v2/delta.json','changes')]:
 for c in read(fn)[field]:
  p=P(c['position']);assert world.get(p)==c['before'];assert p not in reserved
  if c['after'] is None:del world[p]
  else:world[p]=c['after']
assert len(world)==3337085
for name,keys,metadata in [('raw_valid_front',raw,{'ports':ports}),('global_channel0_release',globalkeys,{}),('consumer_drain',drainkeys,drainmeta)]:
 halo={q for x,y,z in keys for dx in range(-1,2) for dy in range(-1,2) for dz in range(-1,2) if (q:=(x+dx,y+dy,z+dz)) in world}
 for p in list(halo):
  b=world[p]
  if b['id']=='minecraft:redstone_wall_torch':
   v={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}[b['properties']['facing']];halo.add(tuple(p[i]+v[i] for i in range(3)))
 out={'blocks':[{'position':dict(zip('xyz',p)),'block':world[p]} for p in sorted(halo)],'allowed_positions':sorted(keys),'metadata':metadata,'source_sha256':src,'candidate_cells':len(world)}
 (H/(name+'-slice.json')).write_text(json.dumps(out)+'\n');print(name,len(keys),len(halo),flush=True)
