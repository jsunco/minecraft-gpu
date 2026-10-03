"""Offline cost analysis of saved designs; no routing or selection mutation."""
from pathlib import Path
from collections import Counter,defaultdict
import json,hashlib,gc
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2]
def load(p):return json.load(p.open())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
 return h.hexdigest()
sources={}
def pin(p,expected=None):
 s=sha(p)
 if expected:assert s==expected,(str(p),s,expected)
 sources[str(p.relative_to(ROOT))]=s
 return s
P=lambda p:tuple(p[a] for a in 'xyz')
A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
R='minecraft:repeater';C='minecraft:comparator';W='minecraft:redstone_wire'
ref=load(B/'density-reference-v1/inventory.json');pin(B/'density-reference-v1/inventory.json')
saved=load(B/'compact-core-fault-review-v1/selected-counts.json');pin(B/'compact-core-fault-review-v1/selected-counts.json')
cfg=load(H/'selected-config.json');pin(H/'selected-config.json')
counts={s['path']:s['physical_blocks'] for s in saved['sources']}
counts[str(B.relative_to(ROOT))+'/memory/master-cold-compatible-v2/design.json']=3381962
counts[str(B.relative_to(ROOT))+'/compact-core-fault-v1/design.json']=1853787
tally=sum(counts[c['path']] for c in cfg['instances']);assert tally==10015941

# The historical route profiler already checked active current points. Here
# hash each route source, deduplicate actual path/support coordinates, and group
# them without adding overlapping route lengths into alleged material savings.
profile=load(B/'density-reference-v1/core-route-profile.json');pin(B/'density-reference-v1/core-route-profile.json')
files={};sets=defaultdict(set);allpoints=set();sum_points=0;excess=0
for r in profile['candidates']:
 f=B/r['route_file']
 if str(f) not in files:pin(f,r['route_file_sha256']);files[str(f)]=load(f)
 v=files[str(f)][r['name']];path=v if isinstance(v,list) else v['path']
 s=';'.join(','.join(str(p[a]) for a in 'xyz') for p in path)
 assert hashlib.sha256(s.encode()).hexdigest()==r['path_sha256']
 assert len(path)==r['points']
 points={P(p) for p in path};cells=points|{A(p,(0,-1,0)) for p in points}
 sets[r['route_file']].update(cells);allpoints.update(cells)
 sum_points+=len(path);excess+=r['excess_over_geometric_lower_bound']
route_profile={'unique_paths':len(profile['candidates']),'unique_path_and_support_coordinates':len(allpoints),'summed_path_points_overlap_not_removed':sum_points,'summed_excess_steps_not_savings':excess,'largest_nonadditive_groups':sorted([{'source':k,'unique_path_support_cells':len(v)} for k,v in sets.items()],key=lambda x:-x['unique_path_support_cells'])[:15]}
core_path=B/'control-reset-master-compatible-v3/design.json';pin(core_path,profile['core_sha256'])
core=load(core_path);wanted=set(allpoints);route_materials=Counter()
for row in core['blocks']:
 p=P(row['position'])
 if p in wanted:wanted.remove(p);route_materials[row['block']['id']]+=1
assert not wanted
route_profile['actual_occupied_coordinates_verified']=len(allpoints)
route_profile['actual_materials_in_profiled_routes']=dict(route_materials)
del core,wanted;gc.collect()

# Actual memory cell classification and side-lock inventory. This counts the
# entire selected cold-v2 map once, not every historical nested parent.
mem=next(c for c in cfg['instances'] if c['name']=='memory');pin(ROOT/mem['path'],mem['sha256'])
d=load(ROOT/mem['path']);rows=d.pop('blocks');groups=Counter(d.get('groups',{}).values())
materials=Counter(r['block']['id'] for r in rows)
cache={};world={}
for r in rows:
 b=r['block'];v=(b['id'],b.get('properties',{}).get('facing'));v=cache.setdefault(v,v);world[P(r['position'])]=v
assert len(world)==len(rows)==3381962
stores=[]
for p,b in world.items():
 if b[0]!=R:continue
 v=TR[b[1]]
 for side in TR.values():
  if sum(a*b for a,b in zip(v,side)):continue
  q=A(p,side);qb=world.get(q)
  if qb and qb[0] in (R,C) and A(q,TR[qb[1]])==p:stores.append(p);break
store_groups=Counter(d.get('groups',{}).get(','.join(map(str,p)),'unclassified_program_or_loader') for p in stores)
actual_memory={'blocks':len(rows),'actual_side_locked_repeaters':len(stores),'side_locked_repeaters_by_authored_group':dict(store_groups),'materials':dict(materials),'largest_groups':groups.most_common(35),'note':'Side-lock count includes data and sampled payload/control banks. Asynchronous SR loops and retained pulse/event pipelines are a separate state class, not silently counted as no state.'}
del rows,world,d;gc.collect()

pin(Path(__file__))
out={'status':'source_based_compaction_priorities_not_a_new_layout','latest_snapshot_config_sha256':sha(H/'selected-config.json'),'latest_selected_component_tally':tally,'latest_unique_cell_inventory_recomputed':False,'historical_unique_cells':ref['actual_unique_cells'],'historical_unique_inventory_config_sha256':ref['config_sha256'],'historical_occupied_chunks':ref['occupied_chunk_columns'],'memory':actual_memory,'core_route_profile':route_profile,'source_sha256':sources,'native_calls':0,'world_mutations':0,'replacement_size':None}
(H/'analysis.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'tally':tally,'memory_stores':len(stores),'core_profile':route_profile}))
