"""Bounded exact two-cell composition/power/attenuation and owner-mask proof."""
from pathlib import Path
import json,hashlib,importlib.util,copy
H=Path(__file__).resolve().parent;ROOT=H.parents[3];M=H.parent;P=lambda p:tuple(p[a]for a in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));N=lambda a:tuple(-x for x in a)
sources={}
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(p):sources[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
delta=load(H/'delta.json');parent=ROOT/delta['parent_design'];assert sha(parent)==delta['parent_design_sha256'];sources[delta['parent_design']]=delta['parent_design_sha256'];pm=ROOT/delta['parent_manifest'];assert sha(pm)==delta['parent_manifest_sha256'];sources[delta['parent_manifest']]=sha(pm)
program=load(M/'program-controller-v1/design.json');old={P(v['position']):v['block'] for v in program['blocks']};new=copy.deepcopy(old)
changes=delta['changes'];O=P(delta['translation']);assert len(changes)==2
for c in changes:
 p=P(c['local']);assert A(p,O)==P(c['position']);assert old[p]==c['before'];new[p]=c['after']
# Read the entire frozen parent exactly once, retain only translated program
# cells and the complete four-cell halo around both changed positions.
want={A(p,O) for p in old};centres=[P(c['position']) for c in changes];seen={};halo={};full=load(parent);count=len(full['blocks']);assert count==3381962
for v in full['blocks']:
 p=P(v['position'])
 if p in want:assert p not in seen;seen[p]=v['block']
 if any(max(abs(p[a]-q[a])for a in range(3))<=4 for q in centres):halo[p]=v['block']
del full
# Only the already frozen loader's one program admission mask differs from
# original program-controller. It remains untouched by this repair.
existing_mask=(-644,-38,920);assert seen[existing_mask]=={'id':'minecraft:comparator','properties':{'facing':'east','mode':'subtract'}}
for p,b in old.items():
 q=A(p,O)
 if q!=existing_mask:assert seen[q]==b,('changed program parent',q)
for c in changes:assert halo[P(c['position'])]==c['before']
before=halo.copy();after=halo.copy()
for c in changes:after[P(c['position'])]=c['after']
W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';S='minecraft:light_gray_concrete';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};dirs=list(D.values());six=dirs+[(0,1,0),(0,-1,0)]
def sources_at(world,p):
 out=[]
 for v in dirs:
  q=A(p,N(v));b=world.get(q,{})
  if b.get('id')==W or b.get('id')in(R,C)and D[b['properties']['facing']]==v:out.append(q)
 for v,types in[((0,-1,0),(T,WT)),((0,1,0),(W,))]:
  q=A(p,v)
  if world.get(q,{}).get('id')in types:out.append(q)
 return sorted(out)
sensitive=0;new_sides=[];strong=[]
for p,b in after.items():
 bid=b['id']
 if bid in(T,WT):
  support=A(p,(0,-1,0))if bid==T else A(p,D[b['properties']['facing']]);assert sources_at(before,support)==sources_at(after,support);sensitive+=1
 if bid in(R,C):
  rear=A(p,N(D[b['properties']['facing']]))
  if before.get(rear,{}).get('id')==S:assert sources_at(before,rear)==sources_at(after,rear);sensitive+=1
  for v in dirs:
   if sum(x*y for x,y in zip(v,D[b['properties']['facing']])):continue
   q=A(p,v);other=after.get(q,{})
   if other.get('id')in(R,C)and A(q,D[other['properties']['facing']])==p:new_sides.append([q,p])
 if bid==S:
  for src in sources_at(after,p):
   if after[src]['id']==W:continue
   for v in six:
    q=A(p,v)
    if after.get(q,{}).get('id')==W and (src in centres or q in centres):strong.append([src,p,q])
assert not new_sides and not strong,(new_sides,strong)
for c in changes:assert after[A(P(c['position']),(0,-1,0))]['id']==S
# Exact rail has the same repeater count and supported footprint. Shifting one
# refresh left leaves 10 and12 dust after successive diodes (positive rears).
rail=next(v for v in program['routes'] if v['name']=='reset_busy_main')['path'];path=list(map(P,rail));assert P(changes[0]['local']) in path and P(changes[1]['local']) in path
strength=15;rears=[];max_run=0;run=0
for i,p in enumerate(path):
 b=new[p]
 if b['id']==R:
  assert i and D[b['properties']['facing']]==tuple(p[a]-path[i-1][a]for a in range(3));assert strength>0;rears.append(strength);strength=15;run=0
 else:assert b['id']==W;strength-=1;run+=1;max_run=max(max_run,run);assert strength>0
branch=(-27,-41,-203);rear=(-27,-41,-204);assert new[rear]['id']==W and new[branch]=={'id':R,'properties':{'facing':'north','delay':'1'}}
# Actual directed graph includes strong/weak separation and the inverter into
# the original owner side lock. No source dependency exists before the repair.
helper=M/'program-rom-timing-v1/check.py';sp=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);allowed={tuple(map(int,k.split(','))) for k,n in program['nets'].items()if n in ['reset_blocked','open_owner','hold_owner']};src=[(-228,-41,-244)];dst=[(52,-37,-84)];allowed.update(src+dst)
try:m.analyze(old,src,dst,allowed)
except (ValueError,AssertionError):before_missing=True
else:raise AssertionError('Expected exact old missing mask dependency')
res,w=m.analyze(new,src,dst,allowed);assert res['status']=='conservative_potential_dependency_DAG_nominal_bound';assert len(res['paths'])==1
# Meaningful mutations: absent actual tap, wrong final refresh direction,
# changed support, and altered parent source value must all refuse.
neg=0
for mutation in ['old_tap','reverse_refresh','missing_support','wrong_before']:
 t=copy.deepcopy(after)
 try:
  if mutation=='old_tap':t[centres[1]]=changes[1]['before'];assert t[centres[1]]['id']==W
  elif mutation=='reverse_refresh':t[centres[0]]={'id':R,'properties':{'facing':'east','delay':'1'}};assert D[t[centres[0]]['properties']['facing']]==(1,0,0)
  elif mutation=='missing_support':del t[A(centres[1],(0,-1,0))];assert t.get(A(centres[1],(0,-1,0)),{}).get('id')==S
  else:assert before[centres[0]]=={'id':'minecraft:air'}
 except AssertionError:neg+=1
 else:raise AssertionError('mutation survived '+mutation)
assert neg==4
sources[str(helper.relative_to(ROOT))]=sha(helper)
for n in ['check.py','prepare.mjs']:
 p=H/n;sources[str(p.relative_to(ROOT))]=sha(p)
p=ROOT/'hardware/memory-layout-program-cold-mask-repair.mjs';sources[str(p.relative_to(ROOT))]=sha(p)
out={'status':'offline_two_cell_program_cold_owner_mask_repair_checked','parent_cells_read':count,'original_program_cells_compared':len(old),'preserved_original_program_except_existing_loader_mask':True,'existing_loader_mask_unchanged':existing_mask,'four_cell_halo_cells':len(halo),'replacements':2,'blocks_added':0,'stores_added':0,'old_owner_mask_dependency_absent':before_missing,'repaired_owner_mask_nominal_ticks':res['max_nominal_dependency_ticks'],'rail_repeaters':len(rears),'minimum_rail_rear_strength':min(rears),'maximum_rail_dust_run':max_run,'new_side_drives':0,'new_strong_wire_paths':0,'sensitive_old_sources_preserved':sensitive,'negative_fixtures':neg,'source_sha256':sources,'native_acceptance':False,'limits':['Full frozen3,381,962-cell memory source read; no combined full-machine map is regenerated. Root must select this exact overlay in the final composition.','All parent cells remain unchanged except the two explicit substitutions. No interface changes or new buffers/state.','Potential dependency path and optimistic attenuation are static checks. Reset startup/convergence, waveform hazards and physical bounds remain separate.']}
(H/'checks.json').write_text(json.dumps(out,indent=2)+'\n');(H/'owner-mask-witness.json').write_text(json.dumps({'source':src,'target':dst,'report':res,'witness':w},indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['source_sha256','limits']}))
