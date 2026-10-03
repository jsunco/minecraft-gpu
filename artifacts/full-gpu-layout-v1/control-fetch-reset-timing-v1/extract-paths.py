"""Source-bound cold/reset port characterization on compact guard geometry.
Real clamp comparator boundaries are separated only for compositional timing;
this is not permission to delete their cycles in a whole-core timing proof.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'compact-core-guard-timing-v1';INF=10**8
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
for p,h in pins.items():assert sha(ROOT/p)==h,p
c=np.load(REF/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];ee=c['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores']
sources={'cold_RF_input':(380,231,-263),'front_initialize':(-100,1,-8),'epoch_intent_clear':(-332,228,445),'epoch_core_clear':(-336,228,445),'epoch_local_reset':(-324,228,445),'entry_mask':(-398,140,-175),'local_reset':(-140,1,-2),'intent_clamp_FI':(-44,1,90),'intent_clamp_R':(-44,5,90),'core_clamp0':(30,60,0),'core_clamp1':(34,60,0),'core_clamp2':(38,60,0),'core_NEXT0':(-20,1,0),'core_NEXT1':(-20,5,0),'core_NEXT2':(-20,9,0),'FI':(-38,1,90),'R':(-38,5,90),'mask_IDLE_pad':(24,1,-3),'mask_UPDATE_pad':(24,49,-3),'barrier_pending':(-406,61,-140),'barrier_candidate':(-406,65,-140),'barrier_parked':(-406,69,-140),'service_ready':(-324,140,-175),'epoch_sample_clear':(-328,228,445),'epoch_enable':(-308,181,410)}
targets={'front_initialize':(-100,1,-8),'FI_clear_side':(-44,1,89),'R_clear_side':(-44,5,89),'FI_D':(-39,1,90),'R_D':(-39,5,90),'FI_lock':(-38,1,91),'R_lock':(-38,5,91),'core0_clear_side':(31,60,0),'core1_clear_side':(35,60,0),'core2_clear_side':(39,60,0),'core0_D':(-21,1,0),'core1_D':(-21,5,0),'core2_D':(-21,9,0),'core0_current_D':(-9,1,0),'core1_current_D':(-9,5,0),'core2_current_D':(-9,9,0),'core0_current_lock':(-8,1,1),'core1_current_lock':(-8,5,1),'core2_current_lock':(-8,9,1),'next_phase_mask':(-80,1,15),'current_phase_mask':(-60,1,15),'run_init_mask':(-100,1,-1),'fetch_reset_side':(80,1,169),'mask_IDLE_receiver':(23,1,-3),'mask_UPDATE_receiver':(23,49,-3),'mask_IDLE_return':(-376,77,-185),'mask_UPDATE_return':(-370,77,-185),'pending_D':(-419,61,-140),'candidate_D':(-419,65,-140),'parked_D':(-419,69,-140),'scratch_active_D':(-569,81,-140),'FI_fetch_gate_rear':(-27,1,90),'R_IR_rear':(189,1,-52)}
sources.update({**{'core_CURRENT'+str(b):(-8,1+4*b,0)for b in range(3)},'held_IDLE_advance':(82,1,-120),'held_UPDATE_advance':(82,25,-120)})
targets.update({'IDLE_advance_D':(81,1,-120),'UPDATE_advance_D':(81,25,-120),'FI_clamp_rear':(-45,1,90),'R_clamp_rear':(-45,5,90),'barrier_idle':(-400,77,-185),'barrier_update':(-388,77,-185),'barrier_commit_complete':(-382,77,-185),'epoch_initialized':(-380,197,435)})
sources.update({'epoch_prepared':(-406,181,410),'epoch_committed':(-376,181,410),'epoch_settled':(-346,181,410)})
targets.update({'epoch_prepared_D':(-419,181,410),'epoch_enable_D':(-309,181,410),'epoch_committed_D':(-389,181,410),'epoch_settled_D':(-359,181,410),'eligible_enable':(-174,235,565),'eligible_settled':(-180,235,565)})
clamps={sources[n]for n in['intent_clamp_FI','intent_clamp_R','core_clamp0','core_clamp1','core_clamp2']}
phase_roots={(443,234,-240),(443,234,-232)}
wanted=set(sources.values())|set(targets.values())|clamps|phase_roots|{tuple(s['storage'])for s in stores}
idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
def node(p):return idx.get((tuple(p),0),idx.get((tuple(p),1)))
assert all(node(p)is not None for p in wanted),[p for p in wanted if node(p)is None]
cut={node(s['storage'])for s in stores}|{node(p)for p in clamps|phase_roots};keep=np.ones(len(pos),dtype=bool);keep[list(cut)]=False;e=ee[keep[ee[:,1]]]
g=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(len(pos),len(pos))).tocsr();count,labels=connected_components(g,directed=True,connection='strong');sizes=np.bincount(labels,minlength=count);w=np.zeros(count,dtype=np.int64);np.maximum.at(w,labels,cost);w[(sizes>1)&(w>0)]=INF;ce=np.stack([labels[e[:,0]],labels[e[:,1]]],axis=1);ce=np.unique(ce[ce[:,0]!=ce[:,1]],axis=0);g=coo_matrix((np.ones(len(ce),dtype=np.int8),(ce[:,0],ce[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in ce)
print(json.dumps({'nodes':len(pos),'edges':len(ee),'storage_cuts':len(stores),'compositional_clamp_boundaries':len(clamps)}),flush=True)
rows=[]
for name,p in sources.items():
 s=int(labels[node(p)]);reach=sorted(map(int,breadth_first_order(g,s,directed=True,return_predecessors=False)),reverse=True);lo={s:0};hi={s:0}
 for a in reach:
  if a not in hi:continue
  for bb in g.indices[g.indptr[a]:g.indptr[a+1]]:
   b=int(bb);lo[b]=min(lo.get(b,INF),lo[a]+int(w[b]));hi[b]=max(hi.get(b,-1),min(INF,hi[a]+int(w[b])))
 for target,q in targets.items():
  t=int(labels[node(q)])
  if t not in hi:continue
  rows.append({'source':name,'target':target,'nominal_min':lo[t]if lo[t]<INF else None,'nominal_max':hi[t]if hi[t]<INF else None,'unbounded':hi[t]>=INF})
 print(name,sum(r['source']==name for r in rows),flush=True)
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json']
r={'status':'actual_guard_candidate_cold_reset_compositional_arcs','sources':sources,'targets':targets,'clamp_boundaries':sorted(clamps),'rows':rows,'source_sha256':pins|{str(p.relative_to(ROOT)):sha(p)for p in files},'limits':['Five actual subtract-clamp input boundaries are separated to characterize sides and outputs. Their zero action requires a continuously high normalized side and a full capture.','Every real store input and two actual oscillator roots are cut as retained/source boundaries; no other cycle is deleted. Positive device cycles remain unbounded.','Nominal component sums only, not Minecraft scheduling bounds or full physical acceptance.'],'native_acceptance':False}
(H/'paths.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'paths':len(rows),'unbounded':sum(r['unbounded']for r in rows)}))
