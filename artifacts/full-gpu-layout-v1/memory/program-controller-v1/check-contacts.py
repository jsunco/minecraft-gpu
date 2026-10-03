# Bounded actual-map contact diagnostic; no native tools or dynamic simulation.
from pathlib import Path
import json
p=Path(__file__).parent;d=json.loads((p/'design.json').read_text());P=lambda q:tuple(q[a] for a in ('x','y','z'));K=lambda q:','.join(map(str,q));S='minecraft:light_gray_concrete'
m={P(v['position']):v['block'] for v in d['blocks']};new={P(v['position']) for v in d['added_blocks']};ns=lambda q:d['nets'].get(K(q));dirs=[(1,0),(-1,0),(0,1),(0,-1)];V={'west':(1,0),'east':(-1,0),'north':(0,1),'south':(0,-1)}
allowed={tuple(sorted((P(e['from']),P(e['to'])))) for e in d['edges']};faces=set();slopes=set();sides=set();strong=set();supports=0
for a in new:
 b=m[a];x,y,z=a
 if b['id']==S:continue
 q=(x,y-1,z)
 if b['id'].endswith(':redstone_wall_torch'):
  dx,dz=V[b['properties']['facing']];q=(x+dx,y,z+dz)
 assert m.get(q,{}).get('id')==S,('missing support',a,q);supports+=1
 for dx,dz in dirs:
  q=(x+dx,y,z+dz);bb=m.get(q)
  if bb and bb['id']!=S and ns(a)!=ns(q) and tuple(sorted((a,q))) not in allowed:faces.add((a,q,ns(a),ns(q)))
  if b['id'].endswith(':redstone_wire'):
   for dy in [-1,1]:
    q=(x+dx,y+dy,z+dz)
    if m.get(q,{}).get('id')!='minecraft:redstone_wire' or ns(a)==ns(q):continue
    if dy>0 and (x,y+1,z) in m or dy<0 and (q[0],y,q[2]) in m:continue
    slopes.add((a,q,ns(a),ns(q)))
for a,b in m.items():
 if b['id'] not in ['minecraft:repeater','minecraft:comparator']:continue
 x,y,z=a;dx,dz=V[b['properties']['facing']]
 if a in new:
  for sign in [-1,1]:
   q=(x+sign*dz,y,z+sign*dx);bb=m.get(q,{})
   if bb.get('id') not in ['minecraft:repeater','minecraft:comparator']:continue
   xx,zz=V[bb['properties']['facing']]
   if (q[0]+xx,q[1],q[2]+zz)==a and tuple(sorted((a,q))) not in allowed:sides.add((a,q,ns(a),ns(q)))
 q=(x-dx,y,z-dz)
 if m.get(q,{}).get('id')!=S:continue
 sources=[]
 for xx,zz in dirs:
  r=(q[0]-xx,y,q[2]-zz);bb=m.get(r,{})
  if bb.get('id') in ['minecraft:repeater','minecraft:comparator'] and V[bb['properties']['facing']]==(xx,zz):sources.append(r)
  if bb.get('id')=='minecraft:redstone_wire':sources.append(r)
 for dy,kind in [(1,'minecraft:redstone_wire'),(-1,'minecraft:redstone_torch')]:
  r=(q[0],y+dy,q[2])
  if m.get(r,{}).get('id')==kind:sources.append(r)
 for r in sources:
  if not(a in new or r in new) or ns(a)==ns(r) or tuple(sorted((a,r))) in allowed:continue
  strong.add((r,a,ns(r),ns(a)))
out={'supports':supports,'foreign_faces':sorted(faces),'foreign_slopes':sorted(slopes),'unknown_side_sources':sorted(sides),'foreign_strong_rear':sorted(strong)}
print(json.dumps(out,indent=2))
