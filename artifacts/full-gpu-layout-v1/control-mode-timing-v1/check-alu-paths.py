"""Actual ALU retained control loops and macro/phase→lane dependency bounds."""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'control-complete-timing-v1';INF=10**8
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(REF/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores'];meta=json.loads((B/'control-nextpc-v1/pc-storage.json').read_text());phase=json.loads((REF/'phase-checks.json').read_text())['phase_paths'];transfer=json.loads((REF/'pc-transfer-checks.json').read_text());assert transfer['minimum_nominal_setup']==26
wanted={(443,234,-240),(443,234,-232)}|{tuple(s[k])for s in stores for k in['storage','data_rear']}|{tuple(p)for s in stores for p in s['lock_sources']};idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
move=lambda p:(p['x'],p['y']+240,p['z']-12)
store_index={tuple(s['storage']):i for i,s in enumerate(stores)};bits=[{'bit':b['bit'],'next':store_index[move(b['next_store'])],'current':store_index[move(b['current_store'])]}for b in meta['bits']];assert len(bits)==8
cuts={node(s['storage'])for s in stores}|{node(p)for p in[(443,234,-240),(443,234,-232)]};keep=np.ones(len(pos),dtype=np.bool_);keep[list(cuts)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();count,labels=connected_components(g,directed=True,connection='strong');del g
sizes=np.bincount(labels,minlength=count);weight=np.zeros(count,dtype=np.int64);np.maximum.at(weight,labels,cost);weight[(sizes>1)&(weight>0)]=INF
e=np.stack([labels[edges[:,0]],labels[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e),'Require verified reverse-topological SCC ordering';del e
print(json.dumps({'graph_nodes':len(pos),'storage_cuts':len(stores),'scc_count':count}),flush=True)

times={(r['store_index'],r['phase']):r for r in phase}
groups={
 'phase':{'next':[(1402,237,-30),(1402,245,-30)],'current':[(1414,237,-30),(1414,245,-30)]},
 'macro':{'next':[(1650,235+4*b,120)for b in range(5)],'current':[(1662,235+4*b,120)for b in range(5)]},
 'bit':{'next':[(1402,263+8*b,-30)for b in range(3)],'current':[(1414,263+8*b,-30)for b in range(3)]},
 'round':{'next':[(1488,263+8*b,-30)for b in range(3)],'current':[(1500,263+8*b,-30)for b in range(3)]}}
for v in groups.values():
 for name in ['next','current']:v[name]=[store_index[p]for p in v[name]]
# Reverse retained-source proof uses uncondensed graph and the same exact store/clock cuts.
back=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,1],edges[:,0])),shape=(len(pos),len(pos))).tocsr();stored_nodes={node(s['storage']):i for i,s in enumerate(stores)};clock_nodes={node((443,234,-240)),node((443,234,-232))}
def run(srcs,phase_name,bound):
 dist={};origin={};pred={};reach=set()
 for n in srcs:
  t=times[(n,phase_name)];root=int(labels[node(stores[n]['storage'])]);dist[root]=t['nominal_max_ticks']+2+(544 if phase_name=='A' else 540 if bound=='close' else 0);origin[root]=n;reach.update(map(int,breadth_first_order(g,root,directed=True,return_predecessors=False)))
 for a in sorted(reach,reverse=True):
  if a not in dist:continue
  for q in g.indices[g.indptr[a]:g.indptr[a+1]]:
   q=int(q);v=min(INF,dist[a]+int(weight[q]))
   if v>dist.get(q,-1):dist[q]=v;origin[q]=origin[a];pred[q]=a
 return dist,origin,pred
transfer_rows=[];feedback_rows=[];lane_rows=[];negative_witnesses=[]
for name,v in groups.items():
 d,o,pr=run(v['next'],'A','close')
 for ni,ci in zip(v['next'],v['current']):
  n=node(stores[ci]['data_rear']);up=set(map(int,breadth_first_order(back,n,directed=True,return_predecessors=False)));assert {stored_nodes[x]for x in up&set(stored_nodes)}=={ni};assert not up&clock_nodes
  q=int(labels[n]);arrival=d[q];margin=1584+times[(ci,'B')]['nominal_min_ticks']-arrival
  assert margin>0 and arrival<INF
  transfer_rows.append({'group':name,'source_storage':stores[ni]['storage'],'target_storage':stores[ci]['storage'],'source_only_paired_NEXT':True,'nominal_setup_before_B':margin})
 print(json.dumps({'held_transfer_group':name,'minimum':min(r['nominal_setup_before_B']for r in transfer_rows if r['group']==name)}),flush=True)
# The above actual-held-source proof earns B-opening+2 seed only for these13 CURRENT roots.
for name,v in groups.items():
 d,o,pr=run(v['current'],'B','opening')
 targets=[(n,'own_feedback',1576)for n in v['next']]
 if name=='phase':targets.extend((n,'ADVANCE_phase_to_control_NEXT_enable',1576)for gname in['macro','bit','round']for n in groups[gname]['next'])
 if name in ['phase','macro']:
  lane_ids=[]
  for ox,oy in [(1800,78),(1984,78),(1800,202),(1984,202)]:
   ls=[n for n,s in enumerate(stores)if (ox<=s['storage'][0]<=ox+98 and s['storage'][1] in[oy+1,oy+37] and -36<=s['storage'][2]<=96)]
   assert len(ls)==57,(ox,oy,len(ls));lane_ids.extend(ls)
  assert len(set(lane_ids))==228
  targets.extend((n,'lane_phase_settle'if name=='phase'else'lane_macro_first_NEXT',1576 if name=='phase'else 1576+3160)for n in lane_ids)
 for n,role,budget in targets:
  t=times[(n,'A')]
  for kind,target in [('D',stores[n]['data_rear'])]+[('lock',p)for p in stores[n]['lock_sources']]:
   q=int(labels[node(target)])
   if q not in d:continue
   arrival=d[q];margin=None if arrival>=INF else budget+t['nominal_min_ticks']-arrival
   row={'group':name,'role':role,'source_storage':stores[o[q]]['storage'],'target_storage':stores[n]['storage'],'target_kind':kind,'source_B_latest_lock_arrival':times[(o[q],'B')]['nominal_max_ticks'],'target_A_earliest_lock_arrival':t['nominal_min_ticks'],'nominal_budget_to_target_epoch':budget,'nominal_latest_from_B':None if arrival>=INF else arrival,'unbounded_positive_cycle':arrival>=INF,'nominal_margin':margin}
   (feedback_rows if role=='own_feedback'else lane_rows).append(row)
   if margin is None or margin<=0:
    ch=[q]
    while ch[-1]in pr:ch.append(pr[ch[-1]])
    negative_witnesses.append({'row':row,'components':list(reversed(ch))})
 print(json.dumps({'current_group':name,'rows':len(feedback_rows)+len(lane_rows)}),flush=True)
# Important same-half-cycle qualifier: phase NEXT==0 must settle before macro/loop CURRENT OPEN.
d,o,pr=run(groups['phase']['next'],'A','close');enable_rows=[]
for name in ['macro','bit','round']:
 for n in groups[name]['current']:
  for target in stores[n]['lock_sources']:
   q=int(labels[node(target)]);assert q in d;arrival=d[q];margin=None if arrival>=INF else 1584+times[(n,'B')]['nominal_min_ticks']-arrival
   enable_rows.append({'group':name,'source_storage':stores[o[q]]['storage'],'target_storage':stores[n]['storage'],'target_lock':target,'nominal_latest_from_A':None if arrival>=INF else arrival,'nominal_margin_before_B':margin,'unbounded_positive_cycle':arrival>=INF})
summary=lambda rows:{'rows':len(rows),'unbounded':sum(r['unbounded_positive_cycle']for r in rows),'nonpositive_finite':sum(r['nominal_margin']is not None and r['nominal_margin']<=0 for r in rows),'minimum_finite':min((r['nominal_margin']for r in rows if r['nominal_margin']is not None),default=None)}
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',B/'alu-control/microprogram.mjs',B/'alu-control/initialized-feedback-v1/design.json']
r={'status':'conditional_actual_ALU_control_dependency_bounds','held_transfers':transfer_rows,'own_feedback':{'summary':summary(feedback_rows),'rows':feedback_rows},'macro_lane':{'summary':summary([r for r in lane_rows if r['group']=='macro']),'rows':[r for r in lane_rows if r['group']=='macro']},'phase_lane':{'summary':summary([r for r in lane_rows if r['role']=='lane_phase_settle']),'rows':[r for r in lane_rows if r['role']=='lane_phase_settle']},'phase_control':{'summary':summary([r for r in lane_rows if r['role']=='ADVANCE_phase_to_control_NEXT_enable']),'rows':[r for r in lane_rows if r['role']=='ADVANCE_phase_to_control_NEXT_enable']},'NEXT_phase_to_CURRENT_enable':enable_rows,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['Macro first NEXT adds one full3160-tick PREP epoch; this report alone does not establish physical state-sequence qualification. Separate microprogram/qualifier binding required.','All13 CURRENT roots have exact paired NEXT-only data and positive nominal NEXT→CURRENT setup. A complete qualified B transfer is still required.','No mode edges cut. Infinite positive SCCs remain unbounded; geometric phase min/max paths may represent incompatible masks.','Cold initialize, arbitrary pending events, rise/fall asymmetry and measured world behavior not proved.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'alu-control-checks.json').write_text(json.dumps(r,indent=2)+'\n');(H/'alu-negative-witnesses.json').write_text(json.dumps(negative_witnesses,indent=2)+'\n');print(json.dumps({k:r[k]['summary']for k in ['own_feedback','macro_lane','phase_lane']}));print(json.dumps({'phase_next_enable_min':min(x['nominal_margin_before_B']for x in enable_rows if x['nominal_margin_before_B']is not None)}))
