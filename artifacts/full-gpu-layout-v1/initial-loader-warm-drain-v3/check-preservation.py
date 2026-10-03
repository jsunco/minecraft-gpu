"""Exact parent cells/dust/strong-source preservation, offline only."""
import json,gc
from pathlib import Path
H=Path(__file__).resolve().parent
d=json.loads((H/'design.json').read_text());xyz=lambda p:tuple(p[a] for a in 'xyz');m={xyz(v['position']):v['block'] for v in d['blocks']};changes={xyz(v['position']):v for v in d['changes']}
V={'east':(1,0,0),'west':(-1,0,0),'south':(0,0,1),'north':(0,0,-1)};add=lambda p,q:tuple(a+b for a,b in zip(p,q));neg=lambda p:tuple(-a for a in p)
wire=lambda mm,p:mm.get(p,{}).get('id')=='minecraft:redstone_wire'
solid=lambda mm,p:mm.get(p,{}).get('id','').endswith('_concrete') or mm.get(p,{}).get('id')=='minecraft:redstone_block'
def neighbors(mm,p,old):
 out=set()
 for v in V.values():
  q=add(p,v);qs=[q]
  if solid(mm,q) and not solid(mm,add(p,(0,1,0))):qs.append(add(q,(0,1,0)))
  if not solid(mm,q):qs.append(add(q,(0,-1,0)))
  out.update(q for q in qs if q in old and wire(mm,q))
 return out
def sources(mm,p):
 out=set()
 for v in [*V.values(),(0,1,0),(0,-1,0)]:
  q=add(p,v);b=mm.get(q,{});i=b.get('id','')
  if i=='minecraft:redstone_block' or ((i=='minecraft:redstone_wire' or i=='minecraft:lever' and b.get('properties',{}).get('face')=='floor') and v==(0,1,0)) or (i in ['minecraft:redstone_torch','minecraft:redstone_wall_torch'] and v==(0,-1,0)):out.add(q)
  if i in ['minecraft:repeater','minecraft:comparator'] and add(q,neg(V[b['properties']['facing']]))==p:out.add(q)
 return out
allowed={xyz(q['rear']):xyz(q['new_strong_source']) for q in d['quietRoleChanges']}
counts={'parent_cells':0,'changed_diodes':0,'old_wire_graphs':0,'old_sensitive_solid_source_sets':0,'declared_quiet_to_loader_roles':0}
for name,path in [('data','../memory/bank-tail-sources-v1/design.json'),('program','../memory/program-quiet-v1/design.json'),('config_panel','../config-panel/design.json')]:
 t=next(p['translation'] for p in d['parents'] if p['name']==name);t=xyz(t);raw=json.loads((H/path).read_text());old={add(xyz(v['position']),t):v['block'] for v in raw['blocks']};del raw;gc.collect()
 for p,b in old.items():
  if p in changes:assert b==changes[p]['from'] and m[p]==changes[p]['to'];counts['changed_diodes']+=1
  else:assert m.get(p)==b,('Changed parent',name,p)
  counts['parent_cells']+=1
  if wire(old,p):assert neighbors(old,p,old)==neighbors(m,p,old),('Changed old wire graph',p);counts['old_wire_graphs']+=1
  # Real attached torches and solid diode rears, not every passive floor block.
  q=None
  if b['id']=='minecraft:redstone_wall_torch':q=add(p,neg(V[b['properties']['facing']]))
  elif b['id']=='minecraft:redstone_torch':q=add(p,(0,-1,0))
  elif b['id'] in ['minecraft:repeater','minecraft:comparator']:q=add(p,V[b['properties']['facing']])
  if q and solid(old,q):
   before=sources(old,q);after=sources(m,q);expected=before|({allowed[q]} if q in allowed else set());assert after==expected,('Changed solid sources',name,p,q,before,after,expected);counts['old_sensitive_solid_source_sets']+=1
   if q in allowed:counts['declared_quiet_to_loader_roles']+=1
 del old;gc.collect()
assert counts['changed_diodes']==10 and counts['declared_quiet_to_loader_roles']==4
assert counts['parent_cells']==d['metrics']['parent_blocks']
print(json.dumps({'status':'exact_parent_preservation_passed',**counts,'native_calls':0,'scope':'Ten declared admission diode substitutions and four slot4 quiet-rear source additions only; old memory/config cells and old wire graph retained.'}))
