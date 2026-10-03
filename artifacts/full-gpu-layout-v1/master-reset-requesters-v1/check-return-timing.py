"""Actual geometric dependency sums for the loader's late-owner return.
Not native timing. Store inputs are cut; the owner's one positive feedback
branch is explicitly opened only to audit SET propagation into the retained Q.
"""
from pathlib import Path
import json,hashlib,importlib.util
from collections import defaultdict,deque
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];helper=B/'memory/program-rom-timing-v1/check.py'
sp=importlib.util.spec_from_file_location('physical',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
d=json.loads((H/'return-audit-slice.json').read_text());world={m.P(v['position']):v['block']for v in d['blocks']}
concrete_colors={b['id'] for b in world.values() if b['id'].endswith('_concrete')}
assert concrete_colors <= {'minecraft:light_gray_concrete','minecraft:cyan_concrete','minecraft:orange_concrete'}, concrete_colors
world={p:({'id':m.S} if b['id'] in concrete_colors else b) for p,b in world.items()}
nodes,ix,cost,edges=m.build(world);cut={ix[(m.P(v['position']),'signal')]for v in d['stores']}
feedback=tuple(ix[(m.P(d['owner_feedback_cut'][v]),'signal')]for v in['from','to']);assert feedback in edges
edges=[(a,b)for a,b in edges if b not in cut and(a,b)!=feedback]
out=defaultdict(list)
for a,b in edges:out[a].append(b)
reachable={ix[(m.P(v['position']),'signal')]for v in d['sources']};q=list(reachable)
for a in q:
 for b in out[a]:
  if b not in reachable:reachable.add(b);q.append(b)
edges=[(a,b)for a,b in edges if a in reachable and b in reachable]
u=np.asarray([a for a,b in edges]);v=np.asarray([b for a,b in edges]);count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
sizes=np.bincount(labels,minlength=count);bad=[i for i in reachable if cost[i]>0 and sizes[labels[i]]>1]
assert not bad,('positive-cost dependency cycle',[nodes[i]for i in bad[:10]])
weights=np.zeros(count,dtype=np.int32);adj=defaultdict(set);indegree=np.zeros(count,dtype=np.int32);witness={}
for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
for a,b in edges:
 ca,cb=int(labels[a]),int(labels[b])
 if ca!=cb and cb not in adj[ca]:adj[ca].add(cb);indegree[cb]+=1;witness[(ca,cb)]=(a,b)
q=deque(np.flatnonzero(indegree==0));order=[]
while q:
 a=int(q.popleft());order.append(a)
 for b in adj[a]:
  indegree[b]-=1
  if indegree[b]==0:q.append(b)
assert len(order)==count
rows=[]
for s in d['sources']:
 start=int(labels[ix[(m.P(s['position']),'signal')]]);dist=np.full(count,-1,dtype=np.int32);dist[start]=0;prev={}
 for a in order:
  if dist[a]<0:continue
  for b in adj[a]:
   n=int(dist[a]+weights[b])
   if n>dist[b]:dist[b]=n;prev[b]=a
 for t in d['targets']:
  end=int(labels[ix[(m.P(t['position']),'signal')]])
  if dist[end]<0:continue
  chain=[];cursor=end
  while cursor!=start:
   before=prev[cursor];a,b=witness[(before,cursor)]
   if weights[cursor]:chain.append({'position':nodes[b][0],'cost':int(weights[cursor]),'block':world[nodes[b][0]]})
   cursor=before
  chain.reverse();assert sum(v['cost']for v in chain)==int(dist[end])
  rows.append({'source':s['name'],'target':t['name'],'nominal_max_ticks':int(dist[end]),'scheduled_devices':chain})
find=lambda a,b:next(v['nominal_max_ticks']for v in rows if v['source']==a and v['target']==b)
assert find('loader_owner_set','loader_owner_Q')>0
feedback_cycle=find('owner_feedback_first_repeater','loader_owner_Q')+2
# The direct loader cable must be indispensable; no global FSM shortcut.
blocked=(ix[((-555,78,542),'signal')],ix[((-555,78,543),'signal')]);assert blocked in edges
for s in d['sources'][:2]:
 seen={ix[(m.P(s['position']),'signal')]};todo=list(seen)
 for a in todo:
  for b in out[a]:
   if (a,b)!=blocked and b not in seen:seen.add(b);todo.append(b)
 assert all(ix[(m.P(t['position']),'signal')]not in seen for t in d['targets'][:2])
timing=json.loads((H/'nominal-timing-checks.json').read_text());physical=json.loads((H/'physical-phase-timing.json').read_text());cases=[]
for core in range(2):
 a=next(v for v in timing['banks']if v['core']==core and v['name']=='A_held_commands')
 b=next(v for v in timing['banks']if v['core']==core and v['name']=='scalar_B_samples')
 # Latest completion departure after the A bank closes, plus four ticks for
 # storage/normalizer, compared with the following B demand closure, minus
 # four explicit ticks for input normalizer/storage setup. Physical bounds
 # and the SR feedback settling assumption remain separate obligations.
 a_lock=next(v['latest']for v in physical['phase_lock_paths']if v['store']==f'core{core}_A_held_commands_state_2')
 b_lock=next(v['earliest']for v in physical['phase_lock_paths']if v['store']==f'core{core}_scalar_B_samples_state_0')
 deadline=timing['clock']['a_to_b_gap_ticks']+timing['clock']['phase_b_width_ticks']+b_lock-a_lock-8
 assert deadline==timing['clock']['a_to_b_gap_ticks']+timing['clock']['phase_b_width_ticks']+b['first_lock_ticks']-a['last_lock_ticks']-8
 path=find('core'+str(core)+'_held_completion','core'+str(core)+'_demand_data_rear')
 cases.append({'core':core,'nominal_completion_to_latest_owner_return':path,'nominal_B_sample_deadline':deadline,'owner_feedback_cycle_allowance':feedback_cycle,'nominal_margin_before_feedback_allowance':deadline-path,'nominal_margin':deadline-path-feedback_cycle})
report={'status':'actual_geometry_loader_completion_return_nominal_audit','paths':rows,'cases':cases,'nominal_deadline_pass':all(v['nominal_margin']>0 for v in cases),'physical_cells':len(world),'storage_cuts':len(cut),'direct_return_cut_refusals':2,'solid_concrete_color_equivalence':sorted(concrete_colors),'positive_device_cycles':0,'owner_feedback_cut':d['owner_feedback_cut'],'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in[Path(__file__).resolve(),helper,H/'return-audit-slice.json',H/'nominal-timing-checks.json',H/'physical-phase-timing.json']},'numeric_physical_bounds_established':False,'native_acceptance':False,'limits':['The longest potential dependency follows actual diode/torch/support/dust geometry, with conservative horizontal dust shape. No logic sensitization prunes paths.','The cross-coupled owner feedback is deliberately cut at positive Q toward its feedback leg; SET-to-Q settling and feedback establishment require their own bounded SR/event obligation.','A late owner accepted just before held completion is withdrawn must return RESET before the following B demand capture closes. A nominal positive margin is necessary, not physical proof.','The direct loader reset return includes actual loader matrix, master loader-reset cable, global command gates and new requester sampler input route. It never substitutes the sampled global controller response.']}
(H/'loader-return-timing.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in['status','cases','nominal_deadline_pass','physical_cells']}));assert report['nominal_deadline_pass']
