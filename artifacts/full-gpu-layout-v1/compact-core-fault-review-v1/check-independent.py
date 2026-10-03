"""Independent exact-map, storage-bijection and selected-frame review. Offline only.

Writes only this review directory. Does not execute the author's mutating checker.
The full electrical differential is source-reviewed and bound separately; the
bounded independent interface checks below are not an event simulator.
"""
from pathlib import Path
from collections import Counter, defaultdict
import gc, hashlib, json

H=Path(__file__).resolve().parent; ROOT=H.parents[2]; B=H.parent
F=B/'compact-core-fault-v1'; PARENT=B/'control-reset-master-compatible-v3/design.json'
P=lambda p:tuple(p[a] for a in 'xyz')
A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
HOR=tuple(TR.values()); U=(0,1,0); DN=(0,-1,0)
R='minecraft:repeater'; C='minecraft:comparator'; W='minecraft:redstone_wire'
cache={}; sources={}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for x in iter(lambda:f.read(8*1024*1024),b''):h.update(x)
 return h.hexdigest()
def load(p):return json.load(p.open())
def block(b):
 v=(b['id'],tuple(sorted(b.get('properties',{}).items())))
 return cache.setdefault(v,v)
def facing(b):return TR[dict(b[1])['facing']]
def solid(b):return b is not None and b[0].endswith('_concrete')
def world(rows):
 out={}
 for r in rows:
  k=P(r['position']);assert k not in out,k;out[k]=block(r['block'])
 return out
def stores(w):
 out={}
 for p,b in w.items():
  if b[0]!=R:continue
  v=facing(b);ls=[]
  for side in HOR:
   if sum(a*b for a,b in zip(v,side)):continue
   q=A(p,side);t=w.get(q)
   if t and t[0] in (R,C) and A(q,facing(t))==p:ls.append(q)
  if ls:out[p]={'rear':A(p,tuple(-i for i in v)),'output':A(p,v),'locks':sorted(ls),'block':b}
 return out
def pin(p,expected=None):
 actual=sha(p)
 if expected:assert actual==expected,(str(p),actual,expected)
 sources[str(p.relative_to(ROOT))]=actual
 return actual

manifest=load(F/'source-manifest.json')
pin(F/'source-manifest.json','f61eb16a13c6340a877cbde316a2edd66e3bd37c5a22adc70827117af87181e0')
cfg=load(H/'machine-config.json');e=load(F/'extraction.json');d=load(F/'trial-design.json')
material=load(F/'materialization.json');checks=load(F/'checks.json')
for n in ['README.md','check.mjs','inspect.mjs','prepare-base.mjs','layout.mjs','route.mjs','materialize.mjs','foreign-obstacles.mjs','extraction.json','trial-design.json','checks.json','materialization.json','ownership-checks.json','foreign-obstacles.json']:
 p=F/n;pin(p,manifest['source_sha256'][str(p.relative_to(ROOT))])
pin(PARENT,e['source_sha256'][str(PARENT.relative_to(ROOT))])
pin(F/'design.json','ae1269e63feb5c394c87e0f6eb44f29a618ab67d8988ce33742aa4b077bf5db1')
delta=P(d['candidate']['translation']);assert delta==(-594,-176,720)
cluster=world(e['cluster_cells']);removed=world(d['removed']);added=world(d['blocks'])
assert (len(cluster),len(removed),len(added))==(324,38884,15428)
old=load(PARENT);old_ports=old['ports'];oldbox=old['box'];oldmetrics=old['metrics']
before=world(old.pop('blocks'));del old;gc.collect()
assert len(before)==1877243
for p,b in removed.items():assert before[p]==b
for p,b in cluster.items():assert before[p]==b and added[A(p,delta)]==b
oldstores=stores(before);assert len(oldstores)==1117
expected=before
for p in removed:del expected[p]
for p,b in added.items():assert p not in expected,p;expected[p]=b
new=load(F/'design.json');new_ports=new['ports'];newbox=new['box'];newmetrics=new['metrics']
rows=new.pop('blocks');assert len(rows)==1853787
for row in rows:assert expected.pop(P(row['position']))==block(row['block'])
assert not expected
after=world(rows);del rows,new,expected,before;gc.collect()
newstores=stores(after);assert len(newstores)==1117
moved_stores=[]
for p,s in oldstores.items():
 q=A(p,delta) if p in cluster else p
 expected_s={k:(A(v,delta) if p in cluster else v) for k,v in s.items() if k in ('rear','output')}
 expected_s['locks']=[A(v,delta) if p in cluster else v for v in s['locks']]
 expected_s['block']=s['block'];assert newstores[q]==expected_s,(p,q)
 if p!=q:moved_stores.append({'from':p,'to':q,'rear':expected_s['rear'],'locks':expected_s['locks']})
assert len(moved_stores)==2
assert newbox==oldbox
assert newmetrics['retained_bits']==oldmetrics['retained_bits']==1117

oldroutes={r['name']:r for r in e['connections']};newroutes={r['name']:r for r in d['connections']}
assert len(oldroutes)==len(newroutes)==15 and oldroutes.keys()==newroutes.keys()
preserved=set();route_report=[];interface_moves={p:A(p,delta) for p in cluster}
for name,r in oldroutes.items():
 n=newroutes[name]
 for key,flag in [('source','source_moves_with_cluster'),('destination','destination_moves_with_cluster')]:
  p=P(r[key]);wanted=A(p,delta) if r[flag] else p
  assert P(n[key])==wanted,(name,key)
  if r[flag]:interface_moves[p]=wanted
 for a,b in [('source','tap'),('arrival','destination')]:
  assert tuple(P(r[b])[i]-P(r[a])[i] for i in range(3))==tuple(P(n[b])[i]-P(n[a])[i] for i in range(3))
 protected=[]
 if name in e['protected_source_prefixes']:protected=[r['tap'],r['path'][0]]
 if name in e['protected_destination_suffixes']:protected=[r['arrival'],r['path'][-1]]
 for raw in protected:
  for p in [P(raw),A(P(raw),DN)]:assert p not in removed and p not in added;preserved.add(p)
 nodes=[P(n['source']),P(n['tap'])]+list(map(P,n['path']))+[P(n['arrival']),P(n['destination'])]
 run=mx=delay=0
 for i,p in enumerate(nodes):
  b=after[p];assert b[0] in (W,R)
  if b[0]==R:
   assert i not in (0,len(nodes)-1)
   assert A(p,facing(b))==nodes[i+1] and A(p,tuple(-v for v in facing(b)))==nodes[i-1],(name,p)
   delay+=2*int(dict(b[1])['delay']);run=0
  elif 0<i<len(nodes)-1:run+=1;mx=max(mx,run)
  if i and after[nodes[i-1]][0]==b[0]==W:
   q=nodes[i-1];assert abs(p[0]-q[0])+abs(p[2]-q[2])==1 and abs(p[1]-q[1])<=1
   if p[1]!=q[1]:
    low=q if q[1]<p[1] else p;assert not solid(after.get(A(low,U)))
  if 0<i<len(nodes)-1:assert solid(after.get(A(p,DN)))
 assert mx<=11
 expected_r=next(v for v in checks['routes'] if v['name']==name)
 assert delay==expected_r['nominal_ticks_including_tap'] and mx==expected_r['maximum_wire_run']
 route_report.append({'name':name,'points':len(n['path']),'nominal_diode_ticks':delay,'max_dust':mx})
assert len(preserved)==12

port_moves=[];unchanged_nested_positions_without_cells=[]
def portwalk(a,b,path='ports'):
 if isinstance(a,dict):
  if all(isinstance(a.get(k),int) for k in 'xyz'):
   p=P(a);q=interface_moves.get(p,p);assert P(b)==q
   if p!=q:port_moves.append({'path':path,'from':a,'to':b})
   if p!=q:assert q in after
   elif p not in after:unchanged_nested_positions_without_cells.append({'path':path,'position':a})
  else:
   assert a.keys()==b.keys()
   for k in a:portwalk(a[k],b[k],path+'.'+k)
 elif isinstance(a,list):
  assert len(a)==len(b)
  for i,(x,y) in enumerate(zip(a,b)):portwalk(x,y,path+'.'+str(i))
 else:assert a==b
portwalk(old_ports,new_ports);assert port_moves==material['port_moves'];assert len(port_moves)==6
print(json.dumps({'checkpoint':'exact_full_map_storage_ports_routes_pass','stores':1117,'moved_stores':2}),flush=True)
del after;gc.collect()

# Reconstruct the obstacle slice from the exact saved instance transforms.
# Every recorded row must be present, and every qualifying selected-source row
# must be recorded. This closes both direction and omission risks independently.
foreign=load(F/'foreign-obstacles.json');pin(H/'machine-config.json',foreign['config_sha256'])
assert {v['path']:v['sha256'] for v in cfg['instances']}==foreign['source_sha256']
cores={v['name']:v for v in cfg['instances'] if v['name'] in ('core0','core1')}
assert set(cores)=={'core0','core1'}
assert P(cores['core0']['translation'])==(-400,0,-1552) and P(cores['core1']['translation'])==(-400,0,-3072)
bounds=foreign['bounds'];low=P(bounds['from']);high=P(bounds['to'])
saved=defaultdict(dict)
for r in foreign.pop('blocks'):
 key=(r['instance'],r['relative_to_core']);p=P(r['position']);assert p not in saved[key];saved[key][p]=block(r['block'])
foreign_count=sum(map(len,saved.values()));assert foreign_count==1084255
del foreign;gc.collect()
groups=defaultdict(list)
for instance in cfg['instances']:groups[instance['path']].append(instance)
inventory=[];foreign_verified=0
for path,instances in groups.items():
 pin(ROOT/path,instances[0]['sha256']);obj=load(ROOT/path);rows=obj.pop('blocks')
 parts=Counter(r.get('part','<none>') for r in rows)
 inventory.append({'path':path,'instances':[i['name'] for i in instances], 'sha256':instances[0]['sha256'],'physical_blocks':len(rows),'instance_blocks':len(rows)*len(instances),'box':obj.get('box'),'metrics':obj.get('metrics'),'parts':parts.most_common(24)})
 for inst in instances:
  for cname,core in cores.items():
   if inst['name']==cname:continue
   shift=tuple(inst['translation'][a]-core['translation'][a] for a in 'xyz');wanted=saved.pop((inst['name'],cname),{})
   count=0
   for r in rows:
    p=A(P(r['position']),shift)
    if all(low[i]<=p[i]<=high[i] for i in range(3)):
     assert wanted.pop(p)==block(r['block']),(path,cname,p)
     assert p not in removed,(path,cname,'foreign removal')
     count+=1
   assert not wanted,(path,cname,len(wanted));foreign_verified+=count
 del rows,obj;gc.collect()
 print(json.dumps({'checkpoint':'selected_source_checked','path':path,'foreign_rows_verified':foreign_verified}),flush=True)
assert not saved and foreign_verified==foreign_count
for f in checks['frames']:
 assert not f['unexpected_new_dependencies'] and not f['changed_survivor_dependencies']
 assert f['audited_receivers']==30040
pin(Path(__file__))
report={'status':'independent_exact_maps_frames_stores_and_interfaces_passed','parent_cells':1877243,'candidate_cells':1853787,'removed':38884,'added':15428,'saved':23456,'rigid_cluster_cells':324,'store_bijection':1117,'moved_stores':moved_stores,'shared_prefix_suffix_cells':12,'ports_rebound':port_moves,'unchanged_historical_nested_port_positions_without_cells':unchanged_nested_positions_without_cells,'routes':route_report,'foreign_rows_independently_regenerated':foreign_verified,'selected_config_sha256':sha(H/'machine-config.json'),'source_sha256':sources,'full_electrical_differential':'Author source and exact saved report inspected; not independently repeated in this checker. See review limits.','native_acceptance':False,'whole_gpu_acceptance':False}
(H/'independent-checks.json').write_text(json.dumps(report,indent=2)+'\n')
(H/'selected-counts.json').write_text(json.dumps({'config_sha256':sha(H/'machine-config.json'),'sources':inventory,'sum_instance_cells_before_overlap_audit':sum(v['instance_blocks'] for v in inventory)},indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['status','candidate_cells','store_bijection','foreign_rows_independently_regenerated']}))
