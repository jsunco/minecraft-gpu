"""Rebind explicit combinational transport sections to the inspection recipe."""
from pathlib import Path
import json,hashlib,gc
from collections import Counter
H=Path(__file__).resolve().parent;M=H.parent;ROOT=H.parents[3]
def read(n): return json.load(open(M/n))
def key(p): return tuple(p[a] for a in ('x','y','z'))
def row(p,b):return {'position':dict(zip(('x','y','z'),p)),'block':b}
sources={}
def bind(n):
 p=M/n;sources[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return read(n)
sections={}
for name,folder,exclude in [('bank_tail','bank-tail-sources-v1',{'bank_request_parent'}),('tail_return','bank-busy-return-v1',{'tail_source_parent'}),('matching','channel-matching-request-v1',{'backend_parent'}),('lookup','channel-withdrawal-v1',{'backend_parent','actual_retained_owner_routes','matching_valid_withdrawal_return'})]:
 d=bind(folder+'/design.json');counts=Counter(d['groups'].values());print(name,counts,flush=True)
 keys={key(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,key(v['position'])))] not in exclude}
 # Only exact component groups enter; a mistaken parent name is refused.
 assert len(keys)<180000,(name,len(keys),counts)
 sections[name]={'keys':keys,'metadata':{k:d[k] for k in ['bindings','ports','selectors','gates'] if k in d}};del d;gc.collect()
print('read cold parent',flush=True)
d=bind('master-cold-compatible-v2/design.json');world={key(v['position']):v['block'] for v in d['blocks']}
selected={'consumer_return_matrix','actual_ready_source_joins','actual_typed_ready_field_joins','actual_retained_response_joins','actual_owner_return_joins','actual_retained_type_joins',*[f'typed_ready_gate{i}' for i in range(4)]}
sections['consumer']={'keys':{key(v['position']) for v in d['blocks'] if d['groups'][','.join(map(str,key(v['position'])))] in selected},'metadata':{k:d[k] for k in ['return_bindings','return_matrix','return_ready_gates','ports']}}
del d;gc.collect()
p=bind('channel-colocation-v1/trial-design.json');removed={key(v['position']) for v in p['removed']}
for v in p['removed']:
 k=key(v['position']);assert world[k]==v['block'];del world[k]
for v in p['blocks']:
 k=key(v['position']);assert k not in world;world[k]=v['block']
for s in sections.values():s['keys']-=removed
# Channel0 outward joins are redrawn; complete new cables are included in consumer scope.
consumer_names={'retained_response','backend_ready'}
for c in p['connections']:
 if c['kind'] in consumer_names:
  name=c['name'];sections['consumer']['keys'].update(key(v['position']) for v in p['blocks'] if v.get('part')==name)
  for r in sections['consumer']['metadata']['return_bindings']:
   if r['channel']==0 and r['kind']==c['kind'] and r.get('bit')==c.get('bit'):
    r['source']=c['source']
for filename,field in [('return-loop-repair-v1/delta.json','substitutions'),('return-feedback-extension-v1/delta.json','changes')]:
 patch=bind(filename)
 for c in patch[field]:
  k=key(c['position']);assert world.get(k)==c['before'],(filename,k)
  belongs=any(k in s['keys'] for s in sections.values())
  if c['after'] is None:del world[k]
  else:world[k]=c['after']
  # Extension's entire new prefix belongs to the consumer return section.
  if filename.startswith('return-feedback') and c['after'] is not None:sections['consumer']['keys'].add(k)
  for s in sections.values():
   if c['after'] is None:s['keys'].discard(k)
assert len(world)==3337077
# endpoints are real cells of the composed candidate, not imported virtual sources.
for name,s in sections.items():
 meta=s['metadata']; endpoints=[]
 if name in ['bank_tail','tail_return','matching','lookup']:
  for b in meta.get('bindings',[]):endpoints.extend([b['source'],b['destination']])
 if name=='consumer':
  for b in meta['return_bindings']:endpoints.extend([b['source'],b['destination']])
  for q in ['read_ready','write_ready','read_data']:endpoints.extend(meta['ports'][q]['positions'])
 for e in endpoints:
  k=key(e)
  if k in removed:continue # removed tail-qualification branches are replaced by separate relocated backend paths
  assert k in world,(name,k);s['keys'].add(k)
 keys=s['keys'];halo=set(keys)
 for x,y,z in keys:
  for dx in range(-1,2):
   for dy in range(-1,2):
    for dz in range(-1,2):
     q=(x+dx,y+dy,z+dz)
     if q in world:halo.add(q)
 # Include support behind adjacent wall torches (may lie one cell beyond halo).
 for x,y,z in list(halo):
  b=world[(x,y,z)]
  if b['id']=='minecraft:redstone_wall_torch':
   dx,dz={'west':(1,0),'east':(-1,0),'north':(0,1),'south':(0,-1)}[b['properties']['facing']];halo.add((x+dx,y,z+dz))
 out={'blocks':[row(q,world[q]) for q in sorted(halo)],'allowed_positions':sorted(keys),'metadata':meta,'scope':name,'candidate_cells':len(world),'source_sha256':sources}
 (H/(name+'-slice.json')).write_text(json.dumps(out)+'\n');print(name,len(keys),len(halo),flush=True)
(H/'recipe.json').write_text(json.dumps({'candidate_cells':len(world),'source_sha256':sources,'composition_manifest':bind('feedback-composition-review-v1/source-manifest.json')},indent=2)+'\n')
