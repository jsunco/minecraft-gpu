"""Read-only independent mask and conductor-source delta review."""
import json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent; R=H.parents[3]
load=lambda p:json.loads(p.read_text()); d=load(H/'design.json'); p=load(H.parents[1]/'register-sequencer-v1/four-files-block-control-v1/design.json'); scan=load(H.parents[1]/'startup-scan-v1/clock/design.json')
P=lambda p:tuple(p[a]for a in'xyz'); A=lambda a,b:tuple(x+y for x,y in zip(a,b)); N=lambda a:tuple(-x for x in a); V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}; dirs=list(V.values()); S='minecraft:light_gray_concrete'; W='minecraft:redstone_wire'; T='minecraft:redstone_torch'; WT='minecraft:redstone_wall_torch'; RE='minecraft:repeater'; CO='minecraft:comparator'
idx=lambda d:{P(v['position']):v['block']for v in d['blocks']};m=idx(d);base=idx(p)
for q,b in idx(scan).items():q=A(q,(-600,180,-248));assert q not in base;base[q]=b
changes={P(v['position']):v for v in d['changes']}; assert len(changes)==5
for q,b in base.items():assert m[q]==(changes[q]['to']if q in changes else b)
new=set(m)-set(base); diode=lambda b:b.get('id')in(RE,CO)
def sources(mm,p):
 out=[]
 for dv in dirs:
  q=A(p,N(dv));b=mm.get(q,{})
  if b.get('id')==W or diode(b)and V[b['properties']['facing']]==dv:out.append(q)
 for dv,k in[((0,-1,0),T),((0,1,0),W)]:
  q=A(p,dv)
  if mm.get(q,{}).get('id')==k:out.append(q)
 return sorted(out)
oldtorch=oldrear=0
for q,b in base.items():
 if b['id']in(T,WT):
  support=A(q,(0,-1,0))if b['id']==T else A(q,V[b['properties']['facing']]);assert sources(m,support)==sources(base,support);oldtorch+=1
 if diode(b):
  rear=A(q,N(V[b['properties']['facing']]))
  if base.get(rear,{}).get('id')==S:assert sources(m,rear)==sources(base,rear);oldrear+=1
# Each changed normal branch keeps its original rear and output, gains exactly
# one directly normalized perpendicular side mask, and no solid rear shortcut.
normal_checks=[]
for q,c in changes.items():
 assert c['from']['id']==RE and c['to']['id']==CO and c['to']['properties']=={'facing':c['from']['properties']['facing'],'mode':'subtract'}
 travel=V[c['to']['properties']['facing']];rear=A(q,N(travel));out=A(q,travel);assert m[rear]==base[rear]and m[out]==base[out]
 assert m[rear]['id']==W
 masks=[]
 for dv in dirs:
  if sum(x*y for x,y in zip(dv,travel)):continue
  r=A(q,dv);b=m.get(r,{})
  if diode(b)and A(r,V[b['properties']['facing']])==q:masks.append(r)
 assert masks==[(q[0],q[1],q[2]+1)] and m[masks[0]]['id']==RE
 normal_checks.append({'normal':q,'rear':rear,'out':out,'mask':masks[0]})
# Signal-relevant indirect conductor paths into the old union must be unchanged.
new_into_parent=[]
for q,b in m.items():
 if b['id']!=S:continue
 for src in sources(m,q):
  for dv in dirs+[(0,1,0),(0,-1,0)]:
   t=A(q,dv);tb=m.get(t,{})
   receives=(tb.get('id')==W and m[src]['id']!=W)or(diode(tb)and A(t,N(V[tb['properties']['facing']]))==q)or(tb.get('id')==T and dv==(0,1,0))or(tb.get('id')==WT and A(t,V[tb['properties']['facing']])==q)
   if receives and t in base and t!=src and (q in new or src in new):new_into_parent.append((src,q,t))
assert not new_into_parent,new_into_parent[:10]
# The NOT_READY tap is an odd (negative) tower level, not a named-net assumption.
col=next(c for c in d['columns']if(c['x'],c['z'])==(1,-3)); assert col['bottom']==-52
assert m[(1,-7,-3)]['id']==T and ((-7-col['bottom']+1)//2)%2==1
cases=0
for normal in range(32):
 for scan in range(32):
  for ready in(0,1):
   actual=sum((max(0,15*(normal>>i&1)-15*(1-ready))or max(0,15*(scan>>i&1)-15*ready)>0)>0 and 1<<i or 0 for i in range(5))
   assert actual==(normal if ready else scan);cases+=1
print(json.dumps({'status':'independent_static_delta_screen_pass','blocks':len(m),'explicit_substitutions':5,'preserved_parent_torch_sources':oldtorch,'preserved_parent_solid_rears':oldrear,'new_indirect_paths_into_parent':0,'normal_mask_interfaces':normal_checks,'settled_mux_cases':cases,'native_acceptance':False}))
