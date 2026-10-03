"""Local program-control nominal propagation graph; no Minecraft timing bounds."""
import json,heapq,hashlib,sys
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
p=H.parent/'program-controller-v1/design.json';d=json.loads(p.read_text());P=lambda p:tuple(p[a]for a in'xyz');A=lambda a,b:tuple(x+y for x,y in zip(a,b));K=lambda p:','.join(map(str,p))
m={P(v['position']):v['block']for v in d['blocks']};nets=d['nets'];dirs=[(1,0,0),(-1,0,0),(0,0,1),(0,0,-1)];D={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)};S='minecraft:light_gray_concrete';W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator';T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch'
at=lambda p:m.get(p,{}).get('id');net=lambda p:nets.get(K(p));neg=lambda a:tuple(-v for v in a)
def cost(p):
 b=m[p];return 2*int(b.get('properties',{}).get('delay',1))if b['id']==R else 2 if b['id']in(C,T,WT)else 0
# This restricted local graph uses vanilla receiver directions and named known
# nets. It does not treat a wire as a directionless diode or solid as a repeater.
def outgoing(p):
 b=m[p];id=b['id'];out=[]
 if id==W:
  for v in dirs:
   q=A(p,v);bid=at(q)
   if bid==W:out.append(q)
   if bid in(R,C)and A(q,neg(D[m[q]['properties']['facing']]))==p:out.append(q)
   if bid==S:out.append(q)
   for dy in(-1,1):
    t=A(q,(0,dy,0))
    if at(t)==W and not(dy>0 and A(p,(0,1,0))in m or dy<0 and A(t,(0,1,0))in m):out.append(t)
  q=A(p,(0,-1,0))
  if at(q)==S:out.append(q)
 elif id in(R,C):
  q=A(p,D[b['properties']['facing']])
  if q in m:out.append(q)
 elif id==S:
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v);bid=at(q)
   if bid==WT and A(q,D[m[q]['properties']['facing']])==p:out.append(q)
   elif bid==T and v==(0,1,0):out.append(q)
   elif bid in(R,C)and A(q,neg(D[m[q]['properties']['facing']]))==p:out.append(q)
   elif bid==W:out.append(q)
 elif id in(T,WT):
  support=A(p,(0,-1,0))if id==T else A(p,D[b['properties']['facing']])
  for v in dirs+[(0,1,0),(0,-1,0)]:
   q=A(p,v)
   if q!=support and at(q)==W:out.append(q)
  q=A(p,(0,1,0))
  if at(q)==S:out.append(q)
 return out

def measure(name,src,dst,allowed):
 assert src in m and dst in m;assert net(src)in allowed and net(dst)in allowed
 heap=[(0,src)];dist={src:0};prev={}
 while heap:
  c,p=heapq.heappop(heap)
  if dist[p]!=c:continue
  if p==dst:break
  for q in outgoing(p):
   if net(q)not in allowed:continue
   n=c+cost(q)
   if n<dist.get(q,10**10):dist[q]=n;prev[q]=p;heapq.heappush(heap,(n,q))
 assert dst in dist,(name,src,dst,allowed)
 path=[dst]
 while path[-1]!=src:path.append(prev[path[-1]])
 path.reverse();return {'name':name,'source':src,'destination':dst,'nominal_ticks':dist[dst],'path':path,'devices':[[v,m[v]['id'],cost(v)]for v in path if cost(v)]}
rows=[]
# T5 and final tail share one actual one-way slow chain; side-mask closure and
# READY propagation are compared from this common real source.
src=(19,-45,-172)
for b in range(16):
 y=283 if b%2 else 279;z=-60-2*b
 rows.append(measure('t5_to_response_lock_'+str(b),src,(75,y,z+1),{'active_delayed_flush','open_response','hold_response'}))
 for c,dst in enumerate([(89,y+10,z),(87,y+10,z-2)]):rows.append(measure('response_q_to_data_'+str(c)+'_'+str(b),(75,y,z),dst,{'response'+str(b)}))
for c,dst in enumerate([(100,287,-92),(112,287,-92)]):rows.append(measure('t5_to_owned_ready_'+str(c),src,dst,{'active_delayed_flush','ready','consumer_ready'+str(c)}))
# Capture overlap comparison starts at actual T1/T2 taps and ends at real locks.
rows.append(measure('t1_to_owner_closed',(-29,-45,-180),(52,-37,-84),{'active_delayed_flush','open_owner','hold_owner'}))
for b,y in enumerate([-4,-8,-12,-16,-25,-21,-33,-29]):rows.append(measure('t2_to_address_lock_'+str(b),(-13,-45,-180),(69,y,-69),{'active_delayed_flush','open_address','hold_address'}))
for b,y in enumerate([-4,-8,-12,-16,-25,-21,-33,-29]):
 for branch,x in enumerate([63,73]):rows.append(measure('owner_q_to_address_mask_'+str(branch)+'_'+str(b),(53,-37,-85),(x,y,-75),{'owner','not_owner_'+str(b)}))
lock=max(r['nominal_ticks']for r in rows if r['name'].startswith('t5_to_response_lock_'));data=max(r['nominal_ticks']for r in rows if r['name'].startswith('response_q_to_data_'));ready=min(r['nominal_ticks']for r in rows if r['name'].startswith('t5_to_owned_ready_'))
owner_close=next(r['nominal_ticks']for r in rows if r['name']=='t1_to_owner_closed');owner_mask=max(r['nominal_ticks']for r in rows if r['name'].startswith('owner_q_to_address_mask_'));address_open=min(r['nominal_ticks']for r in rows if r['name'].startswith('t2_to_address_lock_'))
report={'status':'conditional_program_producer_nominal_graph','source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest(),str(Path(__file__).relative_to(ROOT)):hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},'paths':rows,'from_actual_t5_max_response_lock_ticks':lock,'response_q_to_both_data_max_ticks':data,'from_actual_t5_min_owned_ready_ticks':ready,'conditional_q_closed_then_data_before_ready_margin_ticks':ready-lock-data,'t1_owner_lock_close_ticks':owner_close,'owner_q_address_mask_max_ticks':owner_mask,'t2_earliest_address_unlock_ticks':address_open,'t1_to_t2_nominal_coil_gap':120,'conditional_owner_close_to_address_mask_setup_ticks':120+address_open-owner_close-owner_mask,'numeric_physical_bounds_established':False,'native_acceptance':False,'limits':['Shortest named-net propagation paths with fixed2tick comparator/torch and2*delay repeater costs; neither scheduled-event worst bounds nor asynchronous pulse proof.','The comparison assumes response Q has reached the correct ROM result by actual lock closure, no pending incorrect update, and owner/type/reset hold throughout.','A remote ready sample cannot establish local ROM settlement, closure, source-held payload or clean reset.']}
print(json.dumps({k:v for k,v in report.items()if k not in['paths','source_sha256']}))
if '--save'in sys.argv:(H/'checks.json').write_text(json.dumps(report,indent=2)+'\n')
