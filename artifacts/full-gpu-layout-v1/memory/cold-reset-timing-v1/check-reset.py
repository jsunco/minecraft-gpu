"""Actual reset/normal-tail dependency paths with explicit SR/store boundaries."""
from pathlib import Path
import json,hashlib,importlib.util
from collections import defaultdict
H=Path(__file__).resolve().parent;ROOT=H.parents[3];M=H.parent;helper=M/'program-rom-timing-v1/check.py'
s=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
sources={};reports={};witnesses={}
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def load(p):sources[str(p.relative_to(ROOT))]=sha(p);return json.loads(p.read_text())
build=m.build
class Graph:
 def __init__(self,name,d,cuts=(),keep=None):
  self.name=name;self.d=d;self.world={m.P(v['position']):v['block'] for v in d['blocks'] if keep is None or keep(v)}
  self.nodes,self.idx,self.cost,self.edges=build(self.world);self.edges=[(a,b) for a,b in self.edges if self.nodes[b][0] not in set(cuts)]
 def run(self,name,src,dst,allowed=None,expected_missing=()):
  # Analyze only actual source-to-target dependencies. Unrelated retained or
  # input loops are not settling obligations of this event. Relevant cycles
  # still refuse the bound. No position or hardware edge is invented.
  adj=defaultdict(list);rev=defaultdict(list)
  for a,b in self.edges:adj[a].append(b);rev[b].append(a)
  def reach(ps,graph):
   seen={self.idx[(p,'nonwire' if self.world[p]['id']==m.S else 'signal')] for p in ps};stack=list(seen)
   while stack:
    for v in graph[stack.pop()]:
     if v not in seen:seen.add(v);stack.append(v)
   return seen
  cone=reach(src,adj)&reach(dst,rev);edges=[(a,b) for a,b in self.edges if a in cone and b in cone]
  m.build=lambda _:(self.nodes,self.idx,self.cost,edges)
  r,w=m.analyze(self.world,src,dst,allowed,require_all=False)
  assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(self.name,name,r)
  missing=[i for i in range(len(dst)) if i not in {q['data_bit'] for q in r['paths']}]
  assert missing==list(expected_missing),(self.name,name,'missing target',[(i,dst[i]) for i in missing])
  r['missing_target_indices']=missing
  r.update(source_positions=src,target_positions=dst);reports[self.name+'/'+name]=r;witnesses[self.name+'/'+name]=w
  print(self.name+'/'+name,len(r['paths']),min(q['potential_dependency_nominal_min_ticks'] for q in r['paths']),r['max_nominal_dependency_ticks'],flush=True)
# Program: two SRs, 25 side-locked payload bits. Later legal-frame translation
# changes coordinates only; the root cold cable report separately binds its pad.
p=load(M/'program-controller-v1/design.json');pc=load(M/'program-capture-v1/design.json');sr=[(-59,-49,-180),(-49,-49,-180),(-239,-49,-240),(-229,-49,-240)]
g=Graph('program',p,sr+[m.P(v['storage']) for v in pc['stores']]);reset=m.P(p['ports']['reset']['positions'][0]);blocked=(-228,-41,-244)
g.run('raw_reset_to_blocked',[reset],[blocked])
g.run('blocked_to_active_support_and_set_mask',[blocked],[(-60,-49,-180),(-46,-49,-181)])
g.run('blocked_to_all_lock_and_ready_outputs',[blocked],[m.P(v['lock']) for v in pc['stores']]+[m.P(q) for q in p['ports']['read_ready']['positions']],expected_missing=[0])
g.run('ACTIVE_to_normal_tail',[(-58,-49,-180)],[(-50,-45,-168)])
g.run('ACTIVE_to_lock_and_ready_outputs',[(-58,-49,-180)],[m.P(v['lock']) for v in pc['stores']]+[m.P(q) for q in p['ports']['read_ready']['positions']])
g.run('RESET_F_to_reset_tail',[(-238,-49,-240)],[(-230,-45,-228)])
g.run('reset_tail_to_blocked',[(-230,-45,-228)],[blocked])
# Bank0: sampled eligibility repair, 512 RAM cells, original payload/response.
b=load(M/'bank-sampled-admission-v1/bank.json');o=load(M/'data-owner-v1/design.json');owned=load(M/'data-owned-bank-v1/design.json');off=m.P(owned['owner_offset']);stores=[m.A(m.P(v['storage']),off) for v in o['stores']]+[m.P(v['storage']) for v in owned['responses']]+[m.P(v['storage']) for v in b['snapshots']]
ramlocks=[(10 if bit>=4 else 2,1+8*w+140*t,8*(bit%4)+64*c+1) for c in range(2) for t in range(2) for w in range(16) for bit in range(8)]
ramstores=[(q[0],q[1],q[2]-1) for q in ramlocks]
# RAM motifs have an opposite storage facing at x10; both are still side locked.
bm={m.P(v['position']):v['block'] for v in b['blocks']}
for q in ramstores:assert bm[q]['id']==m.R,q
bsr=[(1,-49,-450),(11,-49,-450),(-259,-49,-510),(-249,-49,-510)]
g=Graph('bank',b,bsr+stores+ramstores);reset=m.P(b['ports']['reset']['positions'][0]);blocked=(-248,-41,-514)
g.run('raw_reset_to_blocked',[reset],[blocked])
g.run('blocked_to_active_support_and_set_mask',[blocked],[(0,-49,-450),(14,-49,-451)])
locks=[m.A(m.P(v['lock']),off) for v in o['stores']]+[m.P(v['lock']) for v in owned['responses']]+[m.P(v['lock']) for v in b['snapshots']]+ramlocks
g.run('blocked_to_all_store_locks',[blocked],locks)
g.run('blocked_to_all_typed_ready',[blocked],[m.P(q) for n in ['read_ready','write_ready'] for q in b['ports'][n]['positions']])
g.run('ACTIVE_to_normal_tail',[(2,-49,-450)],[(10,-45,-438)])
g.run('ACTIVE_to_lock_and_ready_outputs',[(2,-49,-450)],locks+[m.P(q) for n in ['read_ready','write_ready'] for q in b['ports'][n]['positions']])
g.run('RESET_F_to_reset_tail',[(-258,-49,-510)],[(-250,-45,-498)])
g.run('reset_tail_to_blocked',[(-250,-45,-498)],[blocked])
# Global admission/retention and all four ACTIVE states, preserving every input
# to the side-lock distribution but cutting every stored bit and SR output.
d=load(M/'channel-retention-v1/design.json');cuts=[m.P(v['storage']) for v in d['stores']+d['snapshots']+d['busySnapshots']]
cuts += [(301,-31,350),(311,-31,350),(521,-31,350),(531,-31,350)]
cuts += [(48+128*c+1,1+80*c,172) for c in range(4)]+[(60+128*c-1,1+80*c,172) for c in range(4)]
g=Graph('global',d,cuts);reset=m.P(d['ports']['reset']['positions'][0]);blocked=m.P(d['masterPorts']['blocked'])
g.run('raw_reset_to_blocked',[reset],[blocked])
g.run('blocked_to_all_active_supports_and_set_masks',[blocked],[(48+128*c,1+80*c,172) for c in range(4)]+[(62+128*c,1+80*c,171) for c in range(4)])
g.run('raw_reset_to_all_snapshot_owner_payload_locks',[reset],[m.P(v['lock']) for v in d['stores']+d['snapshots']+d['busySnapshots']])
g.run('blocked_to_backend_fanout_tap',[blocked],[(-20,-31,234)])
g.run('ACTIVE_to_normal_tail',[(302,-31,350)],[(310,-27,362)])
g.run('ACTIVE_to_capture_and_commit_endpoints',[(302,-31,350)],[m.P(v['lock']) for v in d['stores']+d['snapshots']+d['busySnapshots']]+[m.P(v['set']) for v in d['activeStates']])
g.run('RESET_F_to_reset_tail',[(522,-31,350)],[(530,-27,362)])
g.run('reset_tail_to_blocked',[(530,-27,362)],[blocked])
# Backend: two SRs and eight response stores. No READY-low alias for tail.
bk=load(M/'channel-backend-control-v1/design.json');cuts=[m.P(v[k]) for v in bk['states'] for k in ['positive','negative']]+[m.P(v['storage']) for v in bk['response']]
g=Graph('backend',bk,cuts);reset=m.P(bk['ports']['reset_blocked']['positions'][0]);targets=[m.P(v['positive_support']) for v in bk['states']]+[m.P(v['set']) for v in bk['states']]
g.run('blocked_to_SR_clear_supports_and_set_inputs',[reset],targets)
g.run('blocked_to_response_locks_and_outputs',[reset],[m.P(v['lock']) for v in bk['response']]+[m.P(bk['ports'][n]['positions'][0]) for n in ['bank_request','consumer_ready','retire','backend_busy']],expected_missing=[11])
for n,prefix in [('bank_ready','ready_delay'),('retiring','retiring_delay')]:
 src=m.P(bk['ports'][n]['positions'][0]) if n=='bank_ready' else m.P(next(v for v in bk['states'] if v['name']=='retiring')['positive'])
 taps=[m.P(v['tap']) for v in bk['delays'] if v['name']==prefix];assert len(taps)==3,(n,bk['delays'])
 g.run(n+'_to_delayed_taps',[src],taps)
sources[str(helper.relative_to(ROOT))]=sha(helper);sources[str(Path(__file__).resolve().relative_to(ROOT))]=sha(Path(__file__).resolve())
out={'status':'offline_actual_reset_and_tail_nominal_paths','reports':reports,'source_sha256':sources,'limits':['SR feedback and all side-locked stores are explicit state cuts; these DAG sums alone do not prove SR convergence.','SR support targets include the physical incoming reset diode, but not an invented instantaneous SR output change.','Reset closes/masks protocol and RAM write gates; it intentionally does not overwrite backing RAM or retained payload/data bits.','Raw reset may be withdrawn only with a composed cold/drain admission protocol; neither one low tail endpoint nor a timer is an unconditional quiet proof.','Costs are potential nominal dependency sums, not event simulation or physical bounds.'],'native_acceptance':False,'numeric_physical_bounds_established':False}
(H/'paths.json').write_text(json.dumps(out,indent=2)+'\n');(H/'witnesses.json').write_text(json.dumps(witnesses)+'\n')
