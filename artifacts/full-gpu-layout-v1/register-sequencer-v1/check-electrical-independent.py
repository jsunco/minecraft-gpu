# Bounded independent actual-map power/contact review; no native calls.
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];B=R/'artifacts/full-gpu-layout-v1/register-sequencer-v1';P=lambda p:tuple(p[a] for a in ('x','y','z'));V={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};D=list(V.values());S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';add=lambda a,b:tuple(x+y for x,y in zip(a,b));neg=lambda a:tuple(-x for x in a)
def load(p):
 d=json.loads(p.read_text());m={P(v['position']):v for v in d['blocks']};assert len(m)==len(d['blocks']);return d,m
def id(m,p):return m.get(p,{}).get('block',{}).get('id')
def direct(m,p):
 out=[]
 for dv in D:
  q=add(p,neg(dv));b=m.get(q,{}).get('block',{});k=b.get('id')
  if k in ['minecraft:repeater','minecraft:comparator'] and V[b['properties']['facing']]==dv or k==W:out.append(q)
 for dv,k in [((0,-1,0),'minecraft:redstone_torch'),((0,1,0),W)]:
  q=add(p,dv)
  if id(m,q)==k:out.append(q)
 return sorted(out)
def torches(m):
 for p,v in m.items():
  k=v['block']['id']
  if k in ['minecraft:redstone_torch','minecraft:redstone_wall_torch']:
   q=add(p,(0,-1,0)) if k.endswith(':redstone_torch') else add(p,V[v['block']['properties']['facing']]);assert id(m,q)==S;yield p,q
nd,nm=load(B/'next-state/design.json');checked=0
for p,q in torches(nm):
 expected=[];x,y,z=q
 if z==-5:
  tower=next(t for t in nd['towers'] if t['x']==x);expected.append((x,y,-6) if y==tower['first_y'] else (x,y-1,-5))
  if id(nm,(x,y,-4))==W:expected.append((x,y,-4)) # Intended same-input positive tap return.
 elif z==3:
  c=next(c for c in nd['or_columns'] if c['x']==x)
  if y>1:expected.append((x,y-1,3))
  row=next((r for r in nd['rows'] if r['y']==y),None)
  if row and c['bit'] in row['bits']:expected.append((x,y,2))
  if y==c['fixed_injection_y']:expected.append((x+1,y,3))
 else:raise AssertionError(('unexpected torch',p,q))
 assert direct(nm,q)==sorted(expected),(p,q,direct(nm,q),expected);checked+=1
# Every OR injection is into the positive support parity; every terminal is
# one inversion after negative support, hence positive accumulated OR.
for c in nd['or_columns']:
 assert c['fixed_injection_y']%4==1 and c['output_y']%4==0
 for r in nd['rows']:
  if c['bit'] in r['bits']:assert r['y']%4==1
 for p in [(c['x']+1,c['fixed_injection_y'],3),(c['x'],c['output_y'],4)]:assert id(nm,p)=='minecraft:repeater'
# The compact descent has only chronological dust/diode contacts; floor
# supports cannot provide a strong source into an earlier wire or rear.
sd,sm=load(R/'artifacts/full-gpu-layout-v1/signal-descent/design.json');path=list(map(P,sd['path']));index={p:i for i,p in enumerate(path)};contacts=0
for p in path:
 i=index[p];b=sm[p]['block'];assert id(sm,add(p,(0,-1,0)))==S
 if b['id']=='minecraft:repeater':
  dv=V[b['properties']['facing']];assert add(p,dv)==path[i+1] and add(p,neg(dv))==path[i-1]
 else:
  for dv in D:
   for dy in [-1,0,1]:
    q=add(add(p,dv),(0,dy,0));k=id(sm,q)
    if k not in [W,'minecraft:repeater'] or dy and k!=W:continue
    if dy>0 and add(p,(0,1,0)) in sm or dy<0 and (q[0],p[1],q[2]) in sm:continue
    assert abs(index[q]-i)==1,('shortcut',p,q);contacts+=1
for p,v in sm.items():
 if v['block']['id']==S:assert all(id(sm,q)==W for q in direct(sm,p)),('unexpected strong conductor source',p)
# Integration cannot change any parent torch's excitation or inject a new
# conductor-powered source into an inherited receiver.
cd,cm=load(B/'connected-state-loop/design.json');_,a=load(B/'state-feedback/design.json');_,b=load(B/'microdecode/design.json');parents={**a,**b};inherited=0;new=0;solid_out=[];rear_changed=[]
for p,v in parents.items():assert cm[p]['block']==v['block']
for p,q in torches(cm):
 sources=direct(cm,q)
 if p in parents:assert sources==direct(parents,q),('changed parent torch',p,q);inherited+=1
 else:assert len(sources)==1,('new torch source multiplicity',p,q,sources);new+=1
for p,v in cm.items():
 if v['block']['id'] in ['minecraft:repeater','minecraft:comparator']:
  rear=add(p,neg(V[v['block']['properties']['facing']]))
  if id(cm,rear)==S:
   if p in parents:assert direct(cm,rear)==direct(parents,rear),('changed inherited rear',p,rear)
   else:raise AssertionError(('new unintended solid rear',p,rear))
for q,v in cm.items():
 if v['block']['id']!=S:continue
 for src in direct(cm,q):
  if id(cm,src)==W:continue
  for dv in D+[(0,1,0),(0,-1,0)]:
   target=add(q,dv)
   if id(cm,target)!=W or all(p in parents for p in [q,src,target]):continue
   expected=next((c for c in cd['columns'] if target==(c['x'],c['output_y'],c['z'])),None)
   assert expected and src==(q[0],q[1]-1,q[2]) and target==(q[0],q[1]+1,q[2]),('foreign powered-solid output',src,q,target)
   solid_out.append((src,q,target))
assert len(solid_out)==len(cd['columns'])==12
# Native source bindings are unchanged; no source-dependent physics claim is
# inferred from the following finite map counters.
print(json.dumps({'status':'independent_bounded_electrical_map_checks_pass','next_state_blocks':len(nm),'next_torch_support_source_sets':checked,'or_columns':len(nd['or_columns']),'positive_fixed_injections':5,'descent_blocks':len(sm),'descent_path_cells':len(path),'descent_chronological_contacts':contacts,'connected_blocks':len(cm),'parent_positions_preserved':len(parents),'inherited_torch_source_sets_unchanged':inherited,'new_single_source_torch_supports':new,'intended_new_strong_solid_to_wire_paths':len(solid_out),'foreign_new_powered_solid_to_wire':0,'changed_inherited_solid_rear_sources':0,'native_acceptance':False},indent=2))
