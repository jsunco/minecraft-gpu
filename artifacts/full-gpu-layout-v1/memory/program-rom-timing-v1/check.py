"""Potential-dependency DAG audit, not a Minecraft event or amplitude simulator.

Dust's directional weak-output restriction is conservatively relaxed horizontally.
Conductor power used by dust excludes dust sources. A positive-cost cycle refuses
the nominal DAG bound. No shortest path is presented as a latest-arrival bound.
"""
from pathlib import Path
import json,hashlib
from collections import defaultdict,deque
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

H=Path(__file__).resolve().parent;ROOT=H.parents[3]
SOURCE=H.parent/'program-rom-folded-v2/design.json'
P=lambda p:tuple(p[a] for a in 'xyz')
A=lambda p,v:tuple(p[i]+v[i] for i in range(3))
NEG=lambda v:tuple(-x for x in v)
TR={'west':(1,0,0),'east':(-1,0,0),'north':(0,0,1),'south':(0,0,-1)}
HOR=[(1,0,0),(-1,0,0),(0,0,1),(0,0,-1)];DIR=HOR+[(0,1,0),(0,-1,0)]
W='minecraft:redstone_wire';R='minecraft:repeater';C='minecraft:comparator'
T='minecraft:redstone_torch';WT='minecraft:redstone_wall_torch';S='minecraft:light_gray_concrete';RB='minecraft:redstone_block'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def build(world):
 nodes=[];index={};cost=[]
 for p,b in world.items():
  bid=b['id'];assert bid in [W,R,C,T,WT,S,RB],bid
  for mode in ['all','nonwire'] if bid==S else ['signal']:
   index[(p,mode)]=len(nodes);nodes.append((p,mode));cost.append(2*int(b.get('properties',{}).get('delay',1)) if bid==R else 2 if bid in [C,T,WT] else 0)
 edges=set()
 def edge(src,dst,mode='signal'):
  if (src,mode) in index:edges.add((index[(src,mode)],index[dst]))
 def id(p):return world.get(p,{}).get('id')
 def emitted(src,dst):
  b=world.get(src,{});bid=b.get('id')
  if bid in [R,C]:return A(src,TR[b['properties']['facing']])==dst
  if bid in [T,WT]:
   support=A(src,(0,-1,0)) if bid==T else A(src,TR[b['properties']['facing']])
   return dst!=support
  return bid in [W,RB]
 def raw(src,dst,wire_consumer=False):
  bid=id(src)
  if bid==S:edge(src,dst,'nonwire' if wire_consumer else 'all')
  elif emitted(src,dst[0]):edge(src,dst)
 for p,b in world.items():
  bid=b['id'];dst=(p,'signal')
  if bid==S:
   edge(p,(p,'all'),'nonwire')
   for v in DIR:
    q=A(p,v);qb=world.get(q,{});qid=qb.get('id')
    strong=(qid in [R,C] and emitted(q,p)) or(qid in [T,WT] and v==(0,-1,0))
    if strong:edge(q,(p,'nonwire'))
    # The wire above directly powers its support. Horizontal weak output is
    # overapproximated; the wire below does not power the block above itself.
    if qid==W and v!=(0,-1,0):edge(q,(p,'all'))
  elif bid==W:
   for v in DIR:
    q=A(p,v)
    if id(q)!=W:raw(q,dst,True)
   for v in HOR:
    q=A(p,v)
    if id(q)==W:edge(q,dst)
    if id(q)==S and id(A(p,(0,1,0)))!=S and id(A(q,(0,1,0)))==W:edge(A(q,(0,1,0)),dst)
    if id(q)!=S and id(A(q,(0,-1,0)))==W:edge(A(q,(0,-1,0)),dst)
  elif bid in [R,C]:
   travel=TR[b['properties']['facing']];raw(A(p,NEG(travel)),dst)
   for v in HOR:
    if sum(v[i]*travel[i] for i in range(3)):continue
    q=A(p,v);qid=id(q)
    if qid in [R,C] and emitted(q,p):edge(q,dst)
    elif bid==C and qid in [W,RB]:edge(q,dst)
  elif bid in [T,WT]:
   q=A(p,(0,-1,0)) if bid==T else A(p,TR[b['properties']['facing']])
   assert id(q)==S,(p,'torch support',q,id(q));edge(q,dst,'all')
 return nodes,index,np.asarray(cost,dtype=np.int32),sorted(edges)

def analyze(world,sources,targets,allowed_positions=None,require_all=True):
 nodes,index,cost,edges=build(world)
 if allowed_positions is not None:
  assert all(p in allowed_positions for p in sources+targets)
  edges=[(a,b) for a,b in edges if nodes[a][0] in allowed_positions and nodes[b][0] in allowed_positions]
 u=np.array([e[0] for e in edges]);v=np.array([e[1] for e in edges])
 count,labels=connected_components(coo_matrix((np.ones(len(edges),dtype=np.int8),(u,v)),shape=(len(nodes),len(nodes))).tocsr(),directed=True,connection='strong')
 sizes=np.bincount(labels,minlength=count);bad=[i for i in range(len(nodes)) if cost[i]>0 and sizes[labels[i]]>1]
 if bad:
  members=defaultdict(list)
  for i in bad[:20]:members[int(labels[i])].append({'position':nodes[i][0],'mode':nodes[i][1],'cost':int(cost[i])})
  return {'status':'positive_device_cycles_refuse_nominal_bound','positive_device_cycle_nodes':len(bad),'examples':dict(members),'native_acceptance':False},None
 # Every surviving nonzero-cost node is its own component. Collapsing zero-cost
 # wire loops cannot increase or suppress a scheduled-device dependency.
 weights=np.zeros(count,dtype=np.int32)
 for i,c in enumerate(cost):weights[labels[i]]=max(weights[labels[i]],c)
 dag=defaultdict(set);indegree=np.zeros(count,dtype=np.int32);witness={}
 for a,b in edges:
  ca,cb=int(labels[a]),int(labels[b])
  if ca!=cb and cb not in dag[ca]:dag[ca].add(cb);indegree[cb]+=1;witness[(ca,cb)]=(a,b)
 queue=deque(np.flatnonzero(indegree==0));order=[]
 while queue:
  a=int(queue.popleft());order.append(a)
  for b in dag[a]:
   indegree[b]-=1
   if indegree[b]==0:queue.append(b)
 assert len(order)==count
 rows=[];best_witness=[]
 for bit,src in enumerate(sources):
  source_mode='nonwire' if world[src]['id']==S else 'signal'
  start=int(labels[index[(src,source_mode)]]);dist=np.full(count,-1000000,dtype=np.int32);earliest=np.full(count,1000000,dtype=np.int32);parent={};dist[start]=0;earliest[start]=0
  for a in order:
   if dist[a]<0:continue
   for b in dag[a]:
    earliest[b]=min(earliest[b],earliest[a]+weights[b])
    candidate=int(dist[a]+weights[b])
    if candidate>dist[b]:dist[b]=candidate;parent[b]=a
  for output,dst in enumerate(targets):
   target_mode='nonwire' if world[dst]['id']==S else 'signal'
   end=int(labels[index[(dst,target_mode)]])
   if dist[end]<0:
    assert not require_all,(bit,output,'no dependency path')
    continue
   rows.append({'address_bit':bit,'data_bit':output,'potential_dependency_nominal_max_ticks':int(dist[end]),'potential_dependency_nominal_min_ticks':int(earliest[end])})
   chain=[];cursor=end
   while cursor!=start:
    before=parent[cursor];a,b=witness[(before,cursor)]
    if weights[cursor]:chain.append({'position':nodes[b][0],'block':world[nodes[b][0]],'cost':int(weights[cursor])})
    cursor=before
   chain.reverse();assert sum(q['cost'] for q in chain)==dist[end]
   best_witness.append({'address_bit':bit,'data_bit':output,'scheduled_devices':chain})
 out={'status':'conservative_potential_dependency_DAG_nominal_bound','nodes':len(nodes),'edges':len(edges),'condensation_components':count,'positive_device_cycles':0,'paths':rows,'max_nominal_dependency_ticks':max(q['potential_dependency_nominal_max_ticks'] for q in rows),'native_acceptance':False,'numeric_physical_bounds_established':False}
 return out,best_witness

def fixtures():
 # A wire must not self-amplify through its solid support into another wire.
 w={(0,1,0):{'id':W},(0,0,0):{'id':S},(1,0,0):{'id':W},(1,-1,0):{'id':S}}
 nodes,idx,cost,edges=build(w);assert (idx[((0,0,0),'all')],idx[((1,0,0),'signal')]) not in edges
 # Only the non-wire/strong conductor state can reach that adjacent dust.
 assert (idx[((0,0,0),'nonwire')],idx[((1,0,0),'signal')]) in edges
 # A directional diode drives a conductor; reversed geometry does not.
 w[(-1,0,0)]={'id':R,'properties':{'facing':'west','delay':'1'}};w[(-1,-1,0)]={'id':S}
 _,idx,_,edges=build(w);assert(idx[((-1,0,0),'signal')],idx[((0,0,0),'nonwire')])in edges
 w[(-1,0,0)]['properties']['facing']='east';_,idx,_,edges=build(w);assert(idx[((-1,0,0),'signal')],idx[((0,0,0),'nonwire')])not in edges
 # Delay and orientation mutations must affect a complete physical route.
 chain={(x,0,0):{'id':S} for x in range(3)}
 chain.update({(0,1,0):{'id':W},(1,1,0):{'id':R,'properties':{'facing':'west','delay':'1'}},(2,1,0):{'id':W}})
 result,_=analyze(chain,[(0,1,0)],[(2,1,0)]);assert result['max_nominal_dependency_ticks']==2
 chain[(1,1,0)]['properties']['delay']='4';result,_=analyze(chain,[(0,1,0)],[(2,1,0)]);assert result['max_nominal_dependency_ticks']==8
 chain[(1,1,0)]['properties']['facing']='east'
 try:analyze(chain,[(0,1,0)],[(2,1,0)])
 except AssertionError:pass
 else:raise AssertionError('Reversed physical diode accepted')
 # A real geometric feedback loop through a repeater has positive cost and
 # must refuse a finite combinational settling bound.
 chain[(1,1,0)]['properties']['facing']='west'
 for x in range(3):chain[(x,0,1)]={'id':S};chain[(x,1,1)]={'id':W}
 result,_=analyze(chain,[(0,1,0)],[(2,1,0)]);assert result['status']=='positive_device_cycles_refuse_nominal_bound'
 return 8

if __name__=='__main__':
 d=json.loads(SOURCE.read_text());world={P(v['position']):v['block'] for v in d['blocks']}
 out,witnesses=analyze(world,list(map(P,d['ports']['address']['positions'])),list(map(P,d['ports']['read_data']['positions'])))
 out.update(fixture_checks=fixtures(),source_sha256={str(p.relative_to(ROOT)):sha(p) for p in [SOURCE,Path(__file__).resolve()]},assumptions=['Fixed nominal costs: repeater2*delay, comparator/torch2, dust/conductor0. No scheduled-event, amplitude, tick-order or pulse simulation.','Horizontal dust weak outputs are overapproximated independent of visual shape. Comparator side effects and repeater side locks are dependencies; no value-based pruning.','Dust through conductive support does not amplify into dust; nonwire strong sources are tracked separately.','All program configuration values are treated as stable external initialization. Address-dependent paths through comparator gates are included even when the frozen image is zero.'],world_mutations=0)
 (H/'checks.json').write_text(json.dumps(out,indent=2)+'\n')
 if witnesses is not None:(H/'witnesses.json').write_text(json.dumps(witnesses)+'\n')
 print(json.dumps({k:v for k,v in out.items() if k not in ['paths','source_sha256','assumptions']}))
