"""Actual-cell normal return transport on the exact repaired inspection recipe."""
from pathlib import Path
import json,importlib.util,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[3];M=H.parent;helper=M/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);orig=m.build
P=m.P;reports={};proofs={};sources={}
def load(name):
 p=H/(name+'-slice.json');sources[str(p.relative_to(ROOT))]=hashlib.file_digest(p.open('rb'),'sha256').hexdigest();return json.load(open(p))
def run(name,parts,src,dst,require_all=False):
 world={P(v['position']):v['block'] for d in parts for v in d['blocks']};allowed={tuple(p) for d in parts for p in d['allowed_positions']};allowed.update(src+dst)
 built=orig(world);m.build=lambda _:built
 r,w=m.analyze(world,src,dst,allowed,require_all=require_all)
 (H/(name+'-diagnostic.json')).write_text(json.dumps(r,indent=2)+'\n')
 assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r)
 r.update(source_positions=src,target_positions=dst);reports[name]=r;proofs[name]=w
 print(name,len(r['paths']),min(v['potential_dependency_nominal_min_ticks'] for v in r['paths']),r['max_nominal_dependency_ticks'],flush=True)
 return r
bt=load('bank_tail');tr=load('tail_return');co=load('consumer');ma=load('matching');lu=load('lookup')
# The three-patch failure remains saved; the fourth source-bound delta repairs it.
patchpath=M/'return-feedback-extension-v2/delta.json';sources[str(patchpath.relative_to(ROOT))]=hashlib.file_digest(patchpath.open('rb'),'sha256').hexdigest();patch=json.load(open(patchpath))
cm={P(v['position']):v['block'] for v in co['blocks']};ca=set(map(tuple,co['allowed_positions']))
for c in patch['changes']:
 p=P(c['position']);assert cm.get(p)==c['before']
 if c['after'] is None:del cm[p];ca.discard(p)
 else:cm[p]=c['after'];ca.add(p)
co['blocks']=[{'position':dict(zip('xyz',p)),'block':b} for p,b in cm.items()];co['allowed_positions']=list(ca)

# All original bank-state/tail/retained-owner producers, through their real qualifier.
src=[P(v['source']) for v in bt['metadata']['bindings']];dst=[P(p) for p in bt['metadata']['ports']['bank_owned_busy']['positions']]
r=run('bank_state_to_owned_BUSY',[bt],src,dst);assert len(r['paths'])==64
# Channel0 collector survives; its output connects to the relocated local qualifier via the separately rederived 182-tick cable.
src=[P(v['source']) for v in tr['metadata']['bindings'] if v['kind']=='collector_input'];dst=[P(p) for p in tr['metadata']['ports']['downstream_bank_busy']['positions']]
r=run('owned_BUSY_to_channel_collector',[tr],src,dst);assert len(r['paths'])==16
# All8 consumers receive the retained response and separately type-qualified READY.
bind=co['metadata']['return_bindings'];ports=co['metadata']['ports']
src=[P(v['source']) for v in bind if v['channel']==0 and v['kind'] in ['retained_response','backend_ready']]
dst=[P(v) for n in ['read_ready','write_ready','read_data'] for v in ports[n]['positions']]
r=run('channel0_Q_and_READY_to_consumers',[co],src,dst);assert len(r['paths'])==80
# Exact retained-owner + retained-type lookup, no opposite pending request alias.
src=sorted({P(v['source']) for v in ma['metadata']['bindings'] if v['name'] in ['read_valid','write_valid']})
dst=[P(v['ports']['owner_valid']['positions'][0]) for v in lu['metadata']['selectors']]
r=run('raw_VALID_fanout_to_matching_owner_VALID',[ma,lu],src,dst);assert len(r['paths'])==64
out={'status':'conditional_repaired_transport_nominal_paths','paths':reports,'source_sha256':{**sources,**{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [helper,Path(__file__).resolve()]}},'limits':['Sources are explicit retained state or externally held request boundaries; no raw arbitration transition is declared safe by a graph path.','Every tested cable uses actual post-patch cells, not historical route-array delay sums.','Potential dependencies include both polarities; these paths must be combined with stated mode/stability premises.','Finite nominal sums require source-held inputs and a functioning vanilla schedule; they are not measured physical upper/lower bounds.'],'native_acceptance':False}
(H/'transport-paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'transport-witnesses.json').write_text(json.dumps(proofs)+'\n')
