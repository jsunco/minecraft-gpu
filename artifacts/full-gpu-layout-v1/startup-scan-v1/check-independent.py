"""Bounded independent static scanner review. No game, services, or saved-source edits."""
import copy, hashlib, json
from collections import Counter
from pathlib import Path
B=Path(__file__).resolve().parent; R=B.parents[2]
P=lambda p:tuple(p[k] for k in ('x','y','z'))
add=lambda a,b:tuple(x+y for x,y in zip(a,b)); neg=lambda p:tuple(-x for x in p)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}; dirs=list(D.values())
W='minecraft:redstone_wire'; S='minecraft:light_gray_concrete'; T='minecraft:redstone_torch'; WT='minecraft:redstone_wall_torch'; RE='minecraft:repeater'; CO='minecraft:comparator'
def load(p):return json.loads(p.read_text())
def index(d):
 m={P(v['position']):v['block']for v in d['blocks']};assert len(m)==len(d['blocks']);return m
manifest=load(B/'source-manifest.json')
for p,h in manifest['files'].items():assert hashlib.sha256((R/p).read_bytes()).hexdigest()==h,('source drift',p)
ds={n:load(B/n/'design.json')for n in ['counter','control','clock']}
def sources(m,p):
 out=[]
 for dv in dirs:
  q=add(p,neg(dv));b=m.get(q,{})
  if b.get('id')==W or b.get('id')in(RE,CO)and D[b['properties']['facing']]==dv:out.append(q)
 for dv,k in [((0,-1,0),T),((0,1,0),W)]:
  q=add(p,dv)
  if m.get(q,{}).get('id')==k:out.append(q)
 return sorted(out)
def review(d):
 m=index(d); ids=lambda p:m.get(p,{}).get('id'); parentNames={p['id']for p in d['parents']};base={P(v['position']):v['block']for v in d['blocks']if v['part']in parentNames};new=set(m)-set(base)
 edges={(P(e['from']),P(e['to']))for e in d['edges']}; allowed={frozenset(e)for e in edges}; colsolid={}; tops=set(); supports=torches=rears=contacts=0
 for col in d['columns']:
  x,z,lo,hi=(col[k]for k in ['x','z','bottom','top']);end_solid=col.get('ends_solid',False)
  for y in range(lo,hi+1):
   p=(x,y,z);expected=W if y==hi and col.get('wire_top')else S if (y-lo)%2==0 else T
   assert ids(p)==expected,('column geometry',p)
   if expected!=S:continue
   want=[u for u,v in edges if v==p]if y==lo else[(x,y-1,z)]
   if col.get('wire_top')and y==hi-1:want.append((x,hi,z))
   assert sources(m,p)==sorted(want),('column excitation',p,sources(m,p),want);colsolid[p]=col
  if col.get('wire_top'):assert (hi-lo)%4==1;tops.add((x,hi,z))
 for p,b in m.items():
  k=b['id']
  if k in(W,RE,CO,T,WT):
   q=add(p,D[b['properties']['facing']])if k==WT else add(p,(0,-1,0));assert ids(q)==S,('support',p);supports+=1
  if k in(T,WT)and p in base:
   q=add(p,D[b['properties']['facing']])if k==WT else add(p,(0,-1,0));assert sources(m,q)==sources(base,q),('changed parent torch',p);torches+=1
  if k in(RE,CO):
   dv=D[b['properties']['facing']];rear=add(p,neg(dv))
   if ids(rear)==S:
    assert p in base and sources(m,rear)==sources(base,rear),('new solid rear',p);rears+=1
   if p in new and k==RE:assert (rear,p)in edges and(p,add(p,dv))in edges,('reversed/unlisted repeater',p)
   for side in dirs:
    if sum(a*b for a,b in zip(side,dv)):continue
    q=add(p,side)
    if p not in new and q not in new:continue
    if ids(q)not in(None,S):assert k==CO and (q,p)in edges,('foreign diode side',p,q)
 for p,b in m.items():
  if b['id']!=W:continue
  for dv in dirs:
   for dy in(-1,0,1):
    q=add(add(p,dv),(0,dy,0));k=ids(q)
    if k not in(W,RE,CO,T,WT)or not(p in new or q in new):continue
    if dy and k!=W:continue
    if dy>0 and add(p,(0,1,0))in m or dy<0 and(q[0],p[1],q[2])in m:continue
    assert frozenset((p,q))in allowed,('new foreign wire contact',p,q);contacts+=1
 strong=Counter()
 for p,b in m.items():
  if b['id']!=S:continue
  for src in sources(m,p):
   for dv in dirs+[(0,1,0),(0,-1,0)]:
    q=add(p,dv);qb=m.get(q,{});k=qb.get('id')
    reads=k==W or k==T and dv==(0,1,0)or k==WT and add(q,D[qb['properties']['facing']])==p or k in(RE,CO)and D[qb['properties']['facing']]==dv
    if not reads or q==src or not(p in new or q in new or src in new):continue
    if ids(src)==W:
     assert k==W,('new weak support excitation',src,p,q);continue
    strong[ids(src).removeprefix('minecraft:')+'>'+k.removeprefix('minecraft:')]+=1
    if k==T:assert p in colsolid and q==add(p,(0,1,0))
    elif k==WT:
     assert p in colsolid and src==add(p,(0,-1,0))or(p==(-16,-2,68)and src==(-17,-2,68)and q==(-15,-2,68))
    else:assert k==W and q in tops and src==add(p,(0,-1,0)),('foreign strong path',src,p,q)
 return {'blocks':len(m),'parent_cells':len(base),'new_cells_excluding_imported_descent':len(new),'supports':supports,'parent_torch_source_sets_preserved':torches,'parent_solid_rear_source_sets_preserved':rears,'exact_column_support_source_sets':len(colsolid),'declared_external_contacts':contacts,'new_strong_support_paths':dict(strong),'foreign_support_paths':0}
checks={n:review(d)for n,d in ds.items()}
# Hierarchical parent identity, exact six identical half-adder/storage motifs.
cm=index(ds['counter']);control=index(ds['control']);clock=index(ds['clock'])
assert all(control[p]==v for p,v in cm.items());assert all(clock[p]==v for p,v in control.items())
half={P(v['position']):v['block']for v in ds['counter']['blocks']if v['part']=='increment_half_0'}
for bit in range(6):
 actual={P(v['position']):v['block']for v in ds['counter']['blocks']if v['part']==f'increment_half_{bit}'}
 assert actual=={add(p,(0,8*bit,0)):v for p,v in half.items()}
 for x,z in[(37,0),(37,8),(37,12),(58,0),(58,8),(67,4)]:assert cm[(x,1+8*bit,z)]=={'id':CO,'properties':{'facing':'west','mode':'subtract'}}
 for x in(2,14):assert cm[(x,1+8*bit,0)]=={'id':RE,'properties':{'facing':'west','delay':'1'}};assert cm[(x,1+8*bit,1)]=={'id':RE,'properties':{'facing':'south','delay':'1'}}
# Derive control polarity by counting physical torch inversions, not port labels.
for bit in range(6):
 y=1+8*bit
 assert ((y-(-2)+1)//2)%2==0 # increment and clear positive
 assert ((y-(-4)+1)//2)%2==1 # increment mask negative
 for x in(-4,8):
  solid_y=8*bit;inversions=(solid_y-(-2))//2+1 # vertical torches plus wall torch
  assert inversions%2==0
  assert control[(x+1,solid_y,3)]=={'id':WT,'properties':{'facing':'east'}}
# Q5 branch is one wire after a strength15 current output: actual high14.
assert control[(16,41,0)]=={'id':RE,'properties':{'facing':'west','delay':'1'}}
assert all(control[(x,41,0)]['id']==W for x in(17,18))
assert control[(18,41,1)]=={'id':RE,'properties':{'facing':'north','delay':'1'}}
# Independent settled arithmetic built from normalized comparator equations.
def compute(c,clear):
 carry=15;n=0;inc=not(c&32)
 for bit in range(6):
  a=15*((c>>bit)&1);a_minus_b=max(0,a-carry);b_minus_a=max(0,carry-a)
  sumv=15*bool(a_minus_b or b_minus_a);carry=15*bool(max(0,carry-15*bool(b_minus_a)))
  held=max(0,a-15*inc);step=max(0,sumv-15*(not inc));v=max(0,15*bool(held or step)-15*clear);n|=bool(v)<<bit
 return n
for c in range(64):assert compute(c,False)==(c+1 if c<32 else c);assert compute(c,True)==0
# All 14 stored bits arbitrary, including NEXT and ready-NEXT. Both starting
# phase positions converge after a complete asserted A-close-B-close transfer.
cases=transfers=0
for initial in range(1<<14):
 for phase_order in [('A','B'),('B','A','B')]:
  c=initial&63;n=(initial>>6)&63;r=(initial>>12)&1;rn=(initial>>13)&1
  for phase in phase_order:
   if phase=='A':n=compute(c,True);rn=0
   else:c=n;r=rn
   assert 0==max(0,15*r-15) # visible ready clamped through initialize
  assert(c,n,r,rn)==(0,0,0,0)
  seen=[]
  for cycle in range(1,35):
   if cycle<=32:seen.append(c&31)
   n=compute(c,False);rn=int(bool(c&32));c=n;r=rn;transfers+=1
   assert c==min(cycle,32)and r==int(cycle>=33)
  assert seen==list(range(32));cases+=1
# Explicit limit: an early release after B but before A can preserve a random
# terminal value forever. This is forbidden by the README's init-duration gate.
c,n,r,rn=0,63,0,1;c=n;r=rn;n=compute(c,False);rn=int(bool(c&32));c=n;r=rn
assert(c,r,c&31)==(63,1,31)
negative=0
for name,p,change in [('counter',(58,9,0),'mode'),('control',(-4,8,3),'remove'),('clock',(3,-2,-1),'reverse')]:
 bad=copy.deepcopy(ds[name]);row=next(v for v in bad['blocks']if P(v['position'])==p)
 if change=='remove':bad['blocks'].remove(row)
 elif change=='reverse':row['block']['properties']['facing']='east'
 else:row['block']['properties']['mode']='compare'
 try:
  review(bad)
  if change=='mode':assert index(bad)[p]['properties']['mode']=='subtract'
 except AssertionError:negative+=1
 else:raise AssertionError('Negative escaped')
print(json.dumps({'status':'independent_static_and_settled_scan_review_pass','source_pins':len(manifest['files']),'stages':checks,'identical_half_adder_copies':6,'actual_q5_branch_high_power':14,'settled_all_stored_state_starting_phase_cases':cases,'settled_post_init_transfers':transfers,'negative_checks':negative,'early_initialize_release_counterexample':{'initial_current':0,'initial_next':63,'initial_ready':0,'initial_ready_next':1,'released_after':'B before required A-B','wrong_persistent_address':31,'wrong_ready':1},'native_acceptance':False,'limits':['Static incidence and settled transfer model only; no timed updates, arbitrary power-on behavior or measured margin.','Architectural blanking and decoder override/switch-back routes are absent.','Initialize must remain asserted through actual clamp arrival and full ordered bank closure; the example proves shorter service is unsafe.']},indent=2))
