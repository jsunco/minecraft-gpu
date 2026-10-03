"""Actual-block timing arcs of the FETCH/IR protocol's explicit logical elements.
Cuts are element input boundaries for compositional characterization, not a
claim that the full asynchronous dependency cycle has been proved harmless.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components,breadth_first_order
H=Path(__file__).resolve().parent;B=H.parent;ROOT=H.parents[2];REF=B/'compact-core-fault-timing-v1';INF=10**8
pins=json.loads((REF/'actual-graph-cache-pins.json').read_text())
for p,h in pins.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,p
c=np.load(REF/'actual-graph-cache.npz');pos=c['positions'];modes=c['modes'];cost=c['cost'];edges=c['edges'];stores=json.loads((REF/'storage-discovery.json').read_text())['stores'];P=lambda p:tuple(p[a]for a in 'xyz')
fetch=json.loads((B/'control-fetch-v1/design.json').read_text());ir=json.loads((B/'control-held-ir-v1/design.json').read_text());front=json.loads((B/'control-front-v1/design.json').read_text())
shift=lambda p,t:tuple(p[a]+t[i]for i,a in enumerate('xyz'))
centers={g['name']:shift(g['center'],(80,0,170))for g in fetch['gates']};centers|={'fetch_tail_gate':(-26,1,90),'IR_admit':(190,1,-52),'IR_valid':(210,1,-20),'IR_open':(170,1,-20)}
sources={'FI':(-38,1,90),'R':(-38,5,90),'READY':(120,1,136),'RESET':(80,1,168),'captured':(105,1,154),**centers}
targets={}
for g in fetch['gates']:
 x,y,z=shift(g['center'],(80,0,170));targets[g['name']+'_rear']=(x-1,y,z);targets[g['name']+'_side']=(x,y,z-1)
targets|={'fetch_tail_gate_rear':(-27,1,90),'fetch_tail_gate_side':(-26,1,89),'IR_admit_rear':(189,1,-52),'IR_admit_side':(190,1,-53),'IR_valid_rear':(211,1,-20),'IR_valid_side':(210,1,-21),'IR_open_rear':(169,1,-20),'IR_open_side_R':(170,1,-21),'IR_open_side_T':(170,1,-19),'captured_D':(104,1,154),'captured_lock':(105,1,153),'IR_tail_output':(264,1,-52),'fetch_complete_guard_D':(81,5,-120),'decode_valid_guard_D':(81,9,-120)}
for cell in ir['cells']:targets['IR_lock_'+str(cell['bit'])]=shift(cell['lock'],(120,0,80))
# Include every actual delay cell, so a low endpoint is not used as proof that
# stale pulses in an earlier branch have disappeared.
for delay in fetch['delays']:
 for i,p in enumerate(delay['cells']):targets['pipeline_'+delay['name']+'_'+str(i)]=shift(p,(80,0,170))
for i,p in enumerate(ir['barrier']['delay_cells']):targets['pipeline_IR_request_'+str(i)]=shift(p,(120,0,80))
# Source and target boundaries must be the exact preserved actual gate/store cells.
world={P(r['position']):r['block']for r in json.loads((B/'compact-core-fault-v1/design.json').read_text())['blocks']}
matched=0
for d,t in [(fetch,(80,0,170)),(ir,(120,0,80))]:
 for r in d['blocks']:assert world[shift(r['position'],t)]==r['block'];matched+=1
for n,p in centers.items():assert world[p]['id']=='minecraft:comparator'and world[p]['properties']['mode']=='subtract',n
for n in ['FI','R','captured']:assert world[sources[n]]['id']=='minecraft:repeater',n
wanted=set(sources.values())|set(targets.values())|{tuple(s['storage'])for s in stores}|{(443,234,-240),(443,234,-232)}
idx={(tuple(map(int,p)),int(modes[i])):i for i,p in enumerate(pos)if tuple(map(int,p))in wanted}
node=lambda p:idx.get((tuple(p),0),idx.get((tuple(p),1)))
assert all(node(p)is not None for p in wanted)
cut={node(tuple(s['storage']))for s in stores}|{node(p)for p in centers.values()}|{node((443,234,-240)),node((443,234,-232))};keep=np.ones(len(pos),dtype=bool);keep[list(cut)]=False;edges=edges[keep[edges[:,1]]]
g=coo_matrix((np.ones(len(edges),dtype=np.int8),(edges[:,0],edges[:,1])),shape=(len(pos),len(pos))).tocsr();count,lab=connected_components(g,directed=True,connection='strong');sizes=np.bincount(lab,minlength=count);w=np.zeros(count,dtype=np.int64);np.maximum.at(w,lab,cost);w[(sizes>1)&(w>0)]=INF;e=np.stack([lab[edges[:,0]],lab[edges[:,1]]],axis=1);e=np.unique(e[e[:,0]!=e[:,1]],axis=0);dag=coo_matrix((np.ones(len(e),dtype=np.int8),(e[:,0],e[:,1])),shape=(count,count)).tocsr();assert all(a>b for a,b in e)
rows=[]
for name,p in sources.items():
 s=int(lab[node(p)]);reach=set(map(int,breadth_first_order(dag,s,directed=True,return_predecessors=False)));lo={s:0};hi={s:0}
 for a in sorted(reach,reverse=True):
  if a not in hi:continue
  for bb in dag.indices[dag.indptr[a]:dag.indptr[a+1]]:
   b=int(bb);hi[b]=max(hi.get(b,-1),min(INF,hi[a]+int(w[b])));lo[b]=min(lo.get(b,INF),lo[a]+int(w[b]))
 for target,q in targets.items():
  t=int(lab[node(q)])
  if t not in hi:continue
  rows.append({'source':name,'source_position':p,'target':target,'target_position':q,'nominal_min':lo[t],'nominal_max':None if hi[t]>=INF else hi[t],'unbounded':hi[t]>=INF})
files=[Path(__file__).resolve(),REF/'actual-graph-cache.npz',REF/'actual-graph-cache-pins.json',REF/'storage-discovery.json',REF/'phase-checks.json',B/'control-fetch-v1/design.json',B/'control-held-ir-v1/design.json',B/'control-front-v1/design.json']
r={'status':'actual_FETCH_IR_compositional_port_arcs','matched_fetch_IR_cells':matched,'sources':sources,'targets':targets,'element_cut_boundaries':centers,'rows':rows,'source_sha256':pins|{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()for p in files},'limits':['The ten real subtract-comparator boundaries are separated to characterize their input arcs. They are not unconditionally deleted in the complete circuit proof.','Functional signs and delay-state induction must be composed explicitly before an SCC zero premise is earned.','All discovered storage inputs and actual A/B roots are separately cut as retained/source boundaries. Positive device cycles elsewhere remain unbounded.','Nominal delays only; actual component event-order/amplitude/pulse obligations remain.'],'native_acceptance':False,'full_timing_acceptance':False}
(H/'arcs.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'matched_cells':matched,'arcs':len(rows),'unbounded':sum(x['unbounded']for x in rows)}))
