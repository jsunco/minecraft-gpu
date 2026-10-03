"""Matched complete-backend comparison. No native/scheduled-event claim."""
from pathlib import Path
import json,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];O=H.with_name('channel-backend-control-v1');read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
a,b=read(O/'design.json'),read(H/'design.json');P=lambda p:tuple(p[k]for k in'xyz');K=lambda p:','.join(map(str,p));A=lambda a,b:tuple(x+y for x,y in zip(a,b));D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};W='minecraft:redstone_wire';S='minecraft:light_gray_concrete';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';ma={P(x['position']):x['block']for x in a['blocks']};mb={P(x['position']):x['block']for x in b['blocks']}
for n in ['ports','variables','terms','gates','states','delays','response','feedback','columns','input_columns','outputs']:assert a[n]==b[n],n
preserved=0
for p,v in ma.items():
 if a['groups'][K(p)]!='state_and_tail_feedback':assert mb.get(p)==v,('old non-feedback cell',p);preserved+=1
for p,v in mb.items():
 if b['groups'][K(p)]!='state_and_tail_feedback':assert ma.get(p)==v,('new non-feedback cell',p)
ra={r['name']:r for r in a['routes']};rb={r['name']:r for r in b['routes']};assert ra.keys()==rb.keys();changes=[]
for n,x in ra.items():
 y=rb[n]
 if x==y:continue
 assert n.endswith('_feedback_high'),n
 assert x['path'][0]==y['path'][0]and x['path'][-1]==y['path'][-1]
 assert len(y['path'])<len(x['path'])
 changes.append({'route':n,'old_path_cells':len(x['path']),'new_path_cells':len(y['path']),'old_refresh_delay_ticks':2*len(x['refresh']),'new_refresh_delay_ticks':2*len(y['refresh'])})
assert len(changes)==7
# Every changed wire step has real headroom; preserved controls cannot gain
# power via a changed strong support or a new torch-support source.
def sources(m,p):
 result=[]
 for dv in D.values():
  q=A(p,tuple(-v for v in dv));v=m.get(q,{})
  if v.get('id')==W or v.get('id')in(R,C)and D[v['properties']['facing']]==dv:result.append(q)
 for dv,ids in [((0,-1,0),(T,WT)),((0,1,0),(W,))]:
  q=A(p,dv)
  if m.get(q,{}).get('id')in ids:result.append(q)
 return sorted(result)
def audit(m):
 for n in [x['route']for x in changes]:
  path=rb[n]['path']
  for i,p in enumerate(path):
   q=P(p);v=m.get(q,{});assert v.get('id')in(W,R)
   assert m.get(A(q,(0,-1,0)),{}).get('id')==S
   if v['id']==R:
    dv=D[v['properties']['facing']]
    if i:assert P(path[i-1])==A(q,tuple(-x for x in dv))
    if i+1<len(path):assert P(path[i+1])==A(q,dv)
   if i and path[i-1]['y']!=p['y']:
    low=min((P(path[i-1]),q),key=lambda q:q[1]);assert A(low,(0,1,0))not in m
 for p,v in ma.items():
  if a['groups'][K(p)]=='state_and_tail_feedback':continue
  if v['id']in(T,WT):
   s=A(p,(0,-1,0))if v['id']==T else A(p,D[v['properties']['facing']]);assert sources(ma,s)==sources(m,s),('old torch source changed',p)
  if v['id']in(R,C):
   s=A(p,tuple(-x for x in D[v['properties']['facing']]))
   if ma.get(s,{}).get('id')==S:assert sources(ma,s)==sources(m,s),('old solid rear changed',p)
audit(mb)
negative=0
for row in changes[:3]:
 r=rb[row['route']];p=P(r['refresh'][0]);bad=dict(mb);bad[p]={'id':R,'properties':{'facing':'east'if mb[p]['properties']['facing']!='east'else'west','delay':'1'}}
 try:audit(bad)
 except AssertionError:negative+=1
 else:raise AssertionError('reversed refresh accepted')
sources_list=[O/'source-manifest.json',O/'design.json',ROOT/'hardware/memory-layout-channel-backend-control.mjs',ROOT/'hardware/memory-layout-channel-backend-compact-v1.mjs',H/'design.json',Path(__file__)]
out={'status':'matched_complete_backend_routing_compaction_checked','old_complete_cells':len(ma),'new_complete_cells':len(mb),'saved_cells':len(ma)-len(mb),'saved_fraction':(len(ma)-len(mb))/len(ma),'old_box':a['box'],'new_box':b['box'],'preserved_nonfeedback_cells':preserved,'unchanged_retained_bits':10,'unchanged_slow_repeaters':768,'same_ports':True,'same_logic':True,'changed_complete_routes':changes,'headroom_direction_negative_cases':negative,'source_sha256':{str(p.relative_to(ROOT)):sha(p)for p in sources_list},'timing':'Seven nominal data/feedback delays are shorter; prior temporal certificates are NOT inherited. Recompute actual setup/close/tail constraints before composition.','native_acceptance':False,'selected':False};(H/'comparison.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items()if k not in['source_sha256','changed_complete_routes']}))
