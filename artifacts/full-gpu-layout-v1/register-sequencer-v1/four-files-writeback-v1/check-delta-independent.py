"""Read-only delta topology review; does not simulate Minecraft timing or power."""
import json, hashlib
from pathlib import Path
from collections import Counter, deque
R=Path(__file__).resolve().parents[4]; B=R/'artifacts/full-gpu-layout-v1/register-sequencer-v1'
P=lambda p:tuple(p[k] for k in ('x','y','z')); add=lambda p,q:tuple(a+b for a,b in zip(p,q)); neg=lambda p:tuple(-a for a in p)
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}; dirs=list(D.values()); W='minecraft:redstone_wire'; S='minecraft:light_gray_concrete'; T='minecraft:redstone_torch'; WT='minecraft:redstone_wall_torch'; REP='minecraft:repeater'; CMP='minecraft:comparator'
def load(p):return json.loads(p.read_text())
def index(d):
 m={P(v['position']):v['block'] for v in d['blocks']}; assert len(m)==len(d['blocks']); return m
a=load(B/'four-files-addressed-v2/design.json'); c=load(B/'four-files-data-control-v2/design.json'); d=load(B/'four-files-writeback-v1/design.json'); mux=load(R/'artifacts/full-gpu-layout-v1/writeback/design.json'); m=index(d); am=index(a); cm=index(c); baseline=dict(am)
for p,b in cm.items(): assert m.get(p)==b,('changed data-control parent',p)
for row in d['parents'][1:]:
 o=P(row['origin'])
 for p,b in index(mux).items():
  q=add(p,o);assert q not in baseline and m.get(q)==b;baseline[q]=b
for p,b in am.items():assert cm.get(p)==b,('changed addressed parent',p)
new=set(m)-set(baseline); assert len(new)==16656
ids=lambda mm,p:mm.get(p,{}).get('id'); diode=lambda b:b.get('id') in (REP,CMP)
def sources(mm,p):
 out=[]
 for dv in dirs:
  q=add(p,neg(dv));b=mm.get(q,{})
  if b.get('id')==W or diode(b) and D[b['properties']['facing']]==dv:out.append(q)
 for dv,k in [((0,-1,0),T),((0,1,0),W)]:
  q=add(p,dv)
  if ids(mm,q)==k:out.append(q)
 return sorted(out)
columns=c['columns']+d['columns']; column_by_base={(v['x'],v['bottom'],v['z']):v for v in columns}; col_top={(v['x'],v['top'],v['z']) for v in columns}
edges={(P(e['from']),P(e['to'])) for j in [c,d] for e in j['edges']}; undirected={frozenset(e) for e in edges}
# Descent paths are independently recognized as chronological supported routes.
for parent in c['parents'][1:]:
 o=P(parent['origin']); drop=parent['parameters']['drop']; path=[o]; p=o; side=0; remain=drop
 while remain:
  dv=dirs[[0,2,1,3][side%4]]
  for _ in range(3):p=add(p,dv);path.append(p)
  fall=min(3,remain)
  for _ in range(fall):p=add(add(p,dv),(0,-1,0));path.append(p)
  remain-=fall;side+=1
 for _ in range(3):p=add(p,dv);path.append(p)
 for u,v in zip(path,path[1:]): edges.add((u,v));undirected.add(frozenset((u,v)))
# Preserve exact inherited excitation and side contacts, including old solid rears.
inherited_torches=inherited_rears=new_torches=0
for p,b in m.items():
 k=b['id']
 if k in (W,REP,CMP,T,WT):
  support=add(p,D[b['properties']['facing']]) if k==WT else add(p,(0,-1,0)); assert ids(m,support)==S,('support',p)
 if k in (T,WT):
  support=add(p,D[b['properties']['facing']]) if k==WT else add(p,(0,-1,0))
  if p in baseline:assert sources(m,support)==sources(baseline,support),('changed inherited torch sources',p,support);inherited_torches+=1
  else:new_torches+=1
 if diode(b):
  travel=D[b['properties']['facing']];rear=add(p,neg(travel))
  if ids(m,rear)==S:
   assert p in baseline,('new conductor rear',p,rear)
   assert sources(m,rear)==sources(baseline,rear),('changed inherited solid rear',p,rear);inherited_rears+=1
  for dv in dirs:
   if sum(x*y for x,y in zip(dv,travel)):continue
   q=add(p,dv)
   if p in new or q in new:assert ids(m,q) in (None,S),('added side source',p,q)
# All new column supports have exactly the intended alternating source sets.
column_supports=0
for col in columns:
 x,z,lo,hi=(col[k] for k in ('x','z','bottom','top')); assert (hi-lo)%4==1
 for y in range(lo,hi):
  p=(x,y,z);assert ids(m,p)==(S if (y-lo)%2==0 else T)
  if (y-lo)%2:continue
  expected=[u for u,v in edges if v==p] if y==lo else [(x,y-1,z)]
  if y==hi-1:expected.append((x,hi,z))
  assert sources(m,p)==sorted(expected),('column source',p,sources(m,p),expected);column_supports+=1
 assert ids(m,(x,hi,z))==W
# Only intended diode-column feed and top-torch positive wire emerge as new
# strongly powered solid paths. Weak wire support paths cannot relay to dust.
strong_paths=[];weak_diode_paths=[]
for p,b in m.items():
 if b['id']!=S:continue
 for src in sources(m,p):
  for dv in dirs+[(0,1,0),(0,-1,0)]:
   out=add(p,dv);ob=m.get(out,{})
   receiver=(ob.get('id')==W or ob.get('id')==T and dv==(0,1,0) or diode(ob) and D[ob['properties']['facing']]==dv)
   if not receiver or out==src or not (p in new or src in new or out in new):continue
   if ids(m,src)==W:
    if diode(ob):weak_diode_paths.append((src,p,out))
    continue
   strong_paths.append((src,p,out))
   if ids(m,out)==T:assert out==add(p,(0,1,0)) and (p in column_by_base or src==add(p,(0,-1,0)))
   else:assert out in col_top and ids(m,src)==T and src==add(p,(0,-1,0)),('foreign strong support path',src,p,out)
assert not weak_diode_paths,weak_diode_paths[:10]
# New same-level/slope dust contacts must be explicitly chronological.
contacts=0
for p,b in m.items():
 if b['id']!=W:continue
 for dv in dirs:
  for dy in (-1,0,1):
   q=add(add(p,dv),(0,dy,0));ob=m.get(q,{})
   if ob.get('id') not in (W,REP,CMP,T,WT) or not(p in new or q in new):continue
   if dy and ob.get('id')!=W:continue
   if dy>0 and add(p,(0,1,0)) in m or dy<0 and (q[0],p[1],q[2]) in m:continue
   assert frozenset((p,q)) in undirected,('undeclared wire adjacency',p,q);contacts+=1
# Directed diode routes + column parity establish a single-net high transfer.
# This is not a scheduled-update simulation. Each independent source is tested
# alone; all wire steps attenuate and repeaters explicitly refresh.
adj={}
for u,v in edges:adj.setdefault(u,[]).append(v)
for col in columns:adj.setdefault((col['x'],col['bottom'],col['z']),[]).append((col['x'],col['top'],col['z']))
for p,b in m.items():
 if p not in new or b['id']!=REP:continue
 dv=D[b['properties']['facing']];assert (add(p,neg(dv)),p) in edges and (p,add(p,dv)) in edges,('directed repeater',p)
connections=c['connections']+d['connections']; arrivals=[]
for conn in connections:
 src,dst=P(conn['source']),P(conn['destination']);strength={src:15};queue=deque([src])
 while queue:
  p=queue.popleft()
  for q in adj.get(p,[]):
   k=ids(m,q);v=15 if k==REP or q in col_top or ids(m,p)==REP else strength[p]-1 if k==W else strength[p]
   if v>strength.get(q,0):strength[q]=v;queue.append(q)
 r=P(conn['normalizer']);assert ids(m,r)==REP and add(r,D[m[r]['properties']['facing']])==dst;assert strength.get(dst)==15,('failed standalone source transfer',conn['name'],strength.get(dst));arrivals.append(conn['name'])
# Exact source/destination binding is rederived from the saved parent ports.
for lane in range(4):
 for bit in range(8):
  conn=next(x for x in d['connections'] if x['name']==f'lane{lane}_writeback{bit}')
  assert P(conn['source'])==add(P(mux['ports']['wb']['bits'][bit]['position']),P(d['parents'][lane+1]['origin']))
  assert P(conn['destination'])==P(c['ports'][f'lane{lane}_writeback']['bits'][bit]['position'])
 for source,target in [('writeback_source','pass_writeback'),('prime_ff','fill_ones')]:
  conn=next(x for x in c['connections'] if x['name']==f'{source}_lane{lane}')
  assert P(conn['source'])==P(a['ports'][source]['bits'][0]['position']) and P(conn['destination'])==P(a['ports'][f'lane{lane}_{target}']['bits'][0]['position'])
result={'status':'independent_bounded_writeback_and_data_control_delta_pass','blocks':len(m),'addressed_parent_cells_preserved':len(am),'unchanged_mux_parent_cells':len(baseline)-len(am),'new_route_cells_including_descents':len(new),'inherited_torch_source_sets_unchanged':inherited_torches,'inherited_solid_rear_source_sets_unchanged':inherited_rears,'new_torches':new_torches,'positive_columns':len(columns),'exact_column_support_source_sets':column_supports,'declared_external_dust_contacts':contacts,'new_strong_solid_paths':len(strong_paths),'foreign_new_strong_solid_paths':0,'foreign_new_weak_support_diode_paths':0,'independent_single_source_strength15_arrivals':len(arrivals),'native_acceptance':False,'limits':['Delta support/incidence/directed signal-capacity review only.','No scheduled Minecraft power/update-order/timing proof or density selection.']}
print(json.dumps(result,indent=2))
