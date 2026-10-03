# Conservative local solid-power candidate screen; not a redstone simulator.
from pathlib import Path
import json,sys
R=Path(__file__).resolve().parents[4];B=R/'artifacts/full-gpu-layout-v1/memory';P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};D=list(V.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';add=lambda a,b:tuple(x+y for x,y in zip(a,b));neg=lambda a:tuple(-x for x in a)
def load(p):
 d=json.loads(p.read_text());return d,{P(v['position']):v['block']for v in d['blocks']}
def ident(m,p):return m.get(p,{}).get('id')
def direct(m,p):
 out=[]
 for dv in D:
  q=add(p,neg(dv));b=m.get(q,{});k=b.get('id')
  if k in ['minecraft:repeater','minecraft:comparator'] and V[b['properties']['facing']]==dv or k==W:out.append(q)
 for dv,k in [((0,-1,0),'minecraft:redstone_torch'),((0,1,0),W)]:
  q=add(p,dv)
  if ident(m,q)==k:out.append(q)
 return sorted(out)
def torches(m):
 for p,b in m.items():
  if b['id'] in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
   yield p,add(p,(0,-1,0))if b['id'].endswith(':redstone_torch')else add(p,V[b['properties']['facing']])
bd,bm=load(B/'data-bank64-v1/design.json');_,card=load(B/'ram16x8.json');old={}
for c in bd['cards']:
 for p,b in card.items():old[add(p,P(c['origin']))]=b
changed=unchanged=multi=0
for p,q in torches(bm):
 ds=direct(bm,q)
 if ident(old,p)in['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
  prior=direct(old,q)
  if prior!=ds:
   x,y,z=q;assert y==141 and p==(x,142,z)
   # Exactly upper-card initial source changes; same positive phase from below.
   if x in[0,12]:expected=[(x,140,z)]
   else:assert x in[18,30];expected=[(x,140,z),(x+(1 if x==18 else-1),141,z)]
   assert ds==sorted(expected),(p,q,ds,expected);changed+=1
  else:unchanged+=1
 else:
  if len(ds)!=1:
   x,y,z=q
   if y==121 and x in[18,30]:expected=[(x,120,z),(x+(1 if x==18 else-1),121,z)]
   elif y==-5 and x in[0,12]:expected=[(x,-6,z),(x+(1 if x==0 else-1),-5,z)]
   elif y==271 and x in[-4,-8,-12,-16,36,40,44,48]:expected=[(x,270,z),(x+(1 if x<0 else-1),271,z)]
   else:raise AssertionError(('unexpected multi-source support',p,q,ds))
   assert ds==sorted(expected);multi+=1
assert changed==24 and multi==28
od,om=load(B/'data-owner-v1/design.json');owner_supports=0
for p,q in torches(om):
 ds=direct(om,q);x,y,z=q
 if ident(om,p)=='minecraft:redstone_wall_torch':assert len(ds)==1
 elif z==-5:assert ds==[(x,1,-6)]if y==1 else ds==[(x,y-1,z)]
 elif x==48 and z==4:assert ds==[(48,1,5)]if y==1 else ds==[(x,y-1,z)]
 elif x==58:
  expected=[]
  if y>1:expected.append((x,y-1,z))
  if y<=29 and(y-1)%4==0:expected.append((59,y,z))
  assert ds==sorted(expected),(p,q,ds,expected)
 elif x==51:
  expected=[(51,31,z+1)]if y==31 else[(x,y-1,z)];assert ds==expected,(p,q,ds)
 else:raise AssertionError(('unknown owner column',p,q,ds))
 owner_supports+=1
cd,cm=load(B/'data-owned-bank-v1/design.json');parents={**bm,**{add(p,P(cd['owner_offset'])):b for p,b in om.items()}};inherited=0;new=0;solid_rear=0;diode_rears=0
for p,q in torches(cm):
 if p in parents:assert direct(cm,q)==direct(parents,q),('changed parent torch',p,q);inherited+=1
 else:assert len(direct(cm,q))==1,(p,q,direct(cm,q));new+=1
for p,b in cm.items():
 if b['id']not in['minecraft:repeater','minecraft:comparator']:continue
 rear=add(p,neg(V[b['properties']['facing']]))
 if ident(cm,rear)in['minecraft:repeater','minecraft:comparator']:
  assert add(rear,V[cm[rear]['properties']['facing']])==p,('perpendicular rear diode',p,rear);diode_rears+=1
 if ident(cm,rear)==S:
  assert p in parents,('unexpected new solid rear',p,rear)
  assert direct(cm,rear)==direct(parents,rear),('changed parent diode rear',p,rear);solid_rear+=1
# Changes in source-to-solid-to-wire paths must be the15 intentional owner output
# extension contacts, or none: added request routes are dust/repeaters on isolated
# floors, while response uses direct pad→diode rather than an extra power block.
new_solid_outputs=[]
for q,b in cm.items():
 if b['id']!=S:continue
 for src in direct(cm,q):
  if ident(cm,src)==W:continue
  for dv in D+[(0,1,0),(0,-1,0)]:
   target=add(q,dv)
   if ident(cm,target)!=W or all(p in parents for p in[src,q,target]):continue
   new_solid_outputs.append((src,q,target))
assert not new_solid_outputs,new_solid_outputs[:20]
out={'status':'bounded_candidate_power_source_sets_pass','bank_inherited_torch_supports_unchanged':unchanged,'upper_source_substitutions_same_positive_phase':changed,'new_intended_multi_source_columns':multi,'owner_torch_supports':owner_supports,'owned_inherited_torch_supports_unchanged':inherited,'owned_new_single_source_inverters':new,'unchanged_inherited_solid_rear_sources':solid_rear,'foreign_new_strong_solid_to_wire_paths':0,'aligned_diode_rears':diode_rears,'limits':'Horizontal dust candidates are conservative; this checks source incidence, not temporal behavior, dynamic shapes, dust self-suppression, strength simulation or torch startup. Native proof remains absent.'}
if '--save'in sys.argv:(Path(__file__).parent/'power-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
