"""Actual remaining backend return cables after all four inspection overlays."""
from pathlib import Path
import json,hashlib,gc
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3];P=lambda p:tuple(p[a] for a in 'xyz');pins={}
def read(n):
 p=M/n;pins[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.load(open(p))
d=read('channel-backend-v1/design.json');keep={'retire_return','backend_busy_return'};keys={P(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,P(v['position'])))] in keep};bindings=[v for v in d['bindings'] if v.get('channel',0)>0 and v.get('name') in ['retire','backend_busy']];controllers=d['controllers'];del d;gc.collect()
d=read('channel-withdrawal-v1/design.json');keys.update(P(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,P(v['position'])))]=='matching_valid_withdrawal_return');bindings.extend(v for v in d['bindings'] if v.get('channel',0)>0 and v.get('name')=='owner_valid');del d;gc.collect()
d=read('master-cold-compatible-v2/design.json');world={P(v['position']):v['block'] for v in d['blocks']};del d;gc.collect()
d=read('channel-colocation-v1/trial-design.json')
for v in d['removed']:
 p=P(v['position']);assert world[p]==v['block'];del world[p];keys.discard(p)
for v in d['blocks']:
 p=P(v['position']);assert p not in world;world[p]=v['block']
for folder,field in [('return-loop-repair-v1','substitutions'),('return-feedback-extension-v1','changes'),('return-feedback-extension-v2','changes')]:
 for c in read(folder+'/delta.json')[field]:
  p=P(c['position']);assert world.get(p)==c['before']
  if c['after'] is None:del world[p];keys.discard(p)
  else:world[p]=c['after']
assert len(world)==3337085
# Sources and endpoints are actual physical cells. Add only explicit wire outputs.
for b in bindings:keys.update([P(b['source']),P(b['destination'])])
halo={q for x,y,z in keys for dx in range(-1,2) for dy in range(-1,2) for dz in range(-1,2) if (q:=(x+dx,y+dy,z+dz)) in world}
for p in list(halo):
 b=world[p]
 if b['id']=='minecraft:redstone_wall_torch':
  v={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}[b['properties']['facing']];halo.add(tuple(p[i]+v[i] for i in range(3)))
(H/'retirement-transports-slice.json').write_text(json.dumps({'blocks':[{'position':dict(zip('xyz',p)),'block':world[p]} for p in sorted(halo)],'allowed_positions':sorted(keys),'bindings':bindings,'controllers':controllers,'source_sha256':pins})+'\n');print(len(keys),len(halo),len(bindings),flush=True)
