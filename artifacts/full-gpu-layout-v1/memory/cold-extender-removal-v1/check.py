"""Six exact cold-only source substitutions. Full memory read, bounded halos.
No native behavior or asynchronous SR convergence is inferred from a model.
"""
from pathlib import Path
import json,hashlib,copy,importlib.util
H=Path(__file__).resolve().parent;ROOT=H.parents[3];M=H.parent
P=lambda p:tuple(p[a]for a in'xyz');A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-v for v in a)
W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';S='minecraft:light_gray_concrete';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch'
D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());six=dirs+[(0,1,0),(0,-1,0)]
pins={}
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(p):pins[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
d=load(H/'delta.json');assert len(d['changes'])==6
for n in ['parent_design','parent_manifest','required_companion']:
 assert sha(ROOT/d[n])==d[n+'_sha256'];pins[d[n]]=d[n+'_sha256']
parent=load(ROOT/d['parent_design']);assert len(parent['blocks'])==3381962
centres=[P(c['position'])for c in d['changes']];want=set()
for p in centres:
 for x in range(-5,6):
  for y in range(-5,6):
   for z in range(-5,6):want.add(A(p,(x,y,z)))
world={P(v['position']):v['block']for v in parent['blocks']if P(v['position'])in want};ports=parent['ports'];del parent
for c in d['changes']:assert world[P(c['position'])]==c['before'],c
old=world.copy()
for c in d['changes']:world[P(c['position'])]=c['after']
def direct_sources(w,p):
 out=[]
 for v in dirs:
  q=A(p,N(v));b=w.get(q,{})
  if b.get('id')in[R,C]and D[b['properties']['facing']]==v:out.append((q,'diode'))
 for v,ids in [((0,-1,0),(T,WT)),((0,1,0),(W,))]:
  q=A(p,v)
  if w.get(q,{}).get('id')in ids:out.append((q,'torch_below_or_wire_above'))
 return sorted(out)
def weak_sources(w,p):
 return direct_sources(w,p)+[(A(p,v),'wire')for v in dirs if w.get(A(p,v),{}).get('id')==W]
rows=[];sensitive=0
for c in d['changes']:
 p=P(c['position']);assert world[p]['id']==S
 # There is no strong source into this newly conductive block. In particular,
 # adjacent strongly powered support blocks do not relay through another solid.
 assert not direct_sources(world,p),(p,direct_sources(world,p))
 assert world.get(A(p,(0,-1,0)),{}).get('id')!=W,'New cap over wire'
 # The original F export wire remains, with no other direct source/step path
 # introduced by the solid. No diode has this replacement as a rear support.
 export=A(p,(1,0,0));assert world[export]['id']==W
 for v in six:
  q=A(p,v);b=world.get(q,{})
  if b.get('id')in[R,C]:assert A(q,N(D[b['properties']['facing']]))!=p
  if b.get('id')==W:
   for up in [(0,1,0),(0,-1,0)]:assert world.get(A(p,up),{}).get('id')!=W,'New slope via replacement'
 rows.append({'instance':c['instance'],'replacement':p,'preserved_F_export':export,'new_solid_strong_sources':[],'old_F_positive_torch_removed':True})
for p,b in old.items():
 if p in centres:continue
 if b['id']in[T,WT]:
  support=A(p,(0,-1,0))if b['id']==T else A(p,D[b['properties']['facing']]);assert weak_sources(old,support)==weak_sources(world,support),(p,'torch support changed');sensitive+=1
 if b['id']in[R,C]:
  rear=A(p,N(D[b['properties']['facing']]))
  if old.get(rear,{}).get('id')==S:assert weak_sources(old,rear)==weak_sources(world,rear),(p,'solid rear changed');sensitive+=1
# Independent actual block graph: the six surviving F export wires have no
# torch, diode, lever or constant-source ancestor after the substitution. This
# is stronger than merely observing a LOW endpoint or assuming support power.
helper=M/'program-rom-timing-v1/check.py';spec=importlib.util.spec_from_file_location('dag',helper);dag=importlib.util.module_from_spec(spec);spec.loader.exec_module(dag)
nodes,index,cost,edges=dag.build(world);reverse={}
for a,b in edges:reverse.setdefault(b,[]).append(a)
for row in rows:
 p=tuple(row['preserved_F_export']);start=index[(p,'signal')];seen={start};stack=[start]
 while stack:
  for a in reverse.get(stack.pop(),[]):
   if a not in seen:seen.add(a);stack.append(a)
 positions={nodes[i][0]for i in seen}
 assert all(world[q]['id']in[W,S]for q in positions),(p,[(q,world[q])for q in positions])
 row['fixed_zero_ancestor_nodes']=len(seen)
pins[str(helper.relative_to(ROOT))]=sha(helper)
# Prove source domains from actual translated parents, not names alone.
program=load(M/'program-controller-v1/design.json');bank=load(M/'bank-sampled-admission-v1/bank.json');service=load(M/'four-bank-service-v1/design.json');glob=load(M/'channel-retention-v1/design.json')
proof=[('program',(-239,-49,-240),(-600,11,1100),program['ports']['reset']['positions'][0]),('data_global',(521,-31,350),(0,0,0),glob['ports']['reset']['positions'][0])]
proof += [('bank'+str(b['bank']),(-259,-49,-510),P(b['origin']),bank['ports']['reset']['positions'][0])for b in service['banks']]
for (name,src,off,reset),r in zip(proof,rows):assert name==r['instance']and A(src,off)==tuple(r['replacement']);r['raw_cold_reset_pad']=A(P(reset),off)
assert rows[0]['raw_cold_reset_pad']==(-712,-38,860)and rows[1]['raw_cold_reset_pad']==(536,-31,350)
# All four banks receive the same actual data-global raw cold fanout, while
# program and data receive root's distinct branches from held cold initialize.
cables=load(M/'cold-reset-timing-v1/reset-cables.json');master=load(ROOT/'artifacts/full-gpu-layout-v1/master-memory-cold-routes-v1/checks.json')
fanout=cables['reports']['four-bank-service-v1']
assert fanout['source_positions']==[[536,-31,350]]
assert fanout['target_positions']==[list(r['raw_cold_reset_pad'])for r in rows[2:]]
assert len(fanout['paths'])==4
# No owner/payload/storage geometry is edited: all changes exactly target the
# positive torch of the reset extender; negative halves and legacy tails remain.
negative=0
for kind in ['wrong_before','owner_instead','strong_driver','cap_wire','reverse_transform','missing_source']:
 try:
  c=copy.deepcopy(d['changes'][0]);p=P(c['position'])
  if kind=='wrong_before':c['before']={'id':W};assert old[p]==c['before']
  elif kind=='owner_instead':assert A((-59,-49,-180),(-600,11,1100))==p
  elif kind=='strong_driver':w=world.copy();w[A(p,(-1,0,0))]={'id':R,'properties':{'facing':'west','delay':'1'}};assert not direct_sources(w,p)
  elif kind=='cap_wire':w=world.copy();w[A(p,(0,-1,0))]={'id':W};assert w[A(p,(0,-1,0))]['id']!=W
  elif kind=='reverse_transform':assert A((-239,-49,-240),(600,11,1100))==p
  else:assert len(d['changes'][:-1])==6
 except AssertionError:negative+=1
 else:raise AssertionError('Survived '+kind)
assert negative==6
for p in [Path(__file__).resolve(),H/'prepare.mjs',ROOT/'hardware/memory-layout-cold-extender-removal.mjs']:pins[str(p.relative_to(ROOT))]=sha(p)
out={'status':'offline_six_cold_extender_sources_removed_no_new_power_path','full_memory_cells_read':3381962,'five_cell_halo_occupied':len(world),'source_domains':rows,'sensitive_old_supports_checked':sensitive,'new_strong_paths':0,'changed_sources':6,'owner_payload_bits_changed':0,'count_box_ports_unchanged':True,'negative_refusals':negative,'source_sha256':pins,'limits':['Full memory parent and six bounded halos checked; final master composition must select this explicit overlay plus the two-cell owner-mask repair.','Six F pulse-extender bits are removed. Short pulse-only reset is not admissible. The actual held cold plus fresh conditioning timing certificate is required.','No new wire/device/support is added, no wire caps or newly powered solid rears arise.','All old delay-chain state still needs finite propagation to quiet; this geometry check alone does not establish a time or physical behavior.'],'native_acceptance':False,'numeric_physical_bounds_established':False}
(H/'checks.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k not in ['source_sha256','source_domains','limits']}))
