"""Actual-cell channel-0 SR-boundary retirement paths; no event/native claim."""
from pathlib import Path
import json,importlib.util,hashlib,sys
H=Path(__file__).resolve().parent;ROOT=H.parents[3];B=H.parent/'channel-colocation-v1';helper=H.parent/'program-rom-timing-v1/check.py'
spec=importlib.util.spec_from_file_location('dag',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
legacy='--legacy' in sys.argv;design=H.parent/'channel-backend-control-v1/design.json' if legacy else B/'local-qualified.json'
d=json.load(open(design));world={m.P(v['position']):v['block'] for v in d['blocks']};built=m.build(world);m.build=lambda _:built
P=m.P; states={s['name']:s for s in d['states']};statecuts={P(s[k]) for s in d['states'] for k in ['positive','negative']}
ports={k:[P(v) for v in p['positions']] for k,p in d['ports'].items()};taps={n:[P(v['tap']) for v in d['delays'] if v['name']==n] for n in ['ready_delay','retiring_delay']};tapcuts=set(sum(taps.values(),[]));q={n:P(s['positive']) for n,s in states.items()}
reports={};witnesses={}
def run(name,src,dst,keep_taps=False):
 a=set(world)-statecuts
 if not keep_taps:a-=tapcuts
 a.update(src+dst)
 r,w=m.analyze(world,src,dst,a,require_all=name!='response_Q_to_output')
 assert r['status']=='conservative_potential_dependency_DAG_nominal_bound',(name,r)
 r.update(source_positions=src,target_positions=dst);reports[name]=r;witnesses[name]=w
 print(name,min(v['potential_dependency_nominal_min_ticks'] for v in r['paths']),r['max_nominal_dependency_ticks'],flush=True)
for src in ['owner_valid','active','reset_blocked']:
 run(src+'_to_retiring_set',ports[src],[P(states['retiring']['set'])])
for src in ['bank_ready']:
 run(src+'_to_retiring_set_direct',ports[src],[P(states['retiring']['set'])])
run('ready_t3_to_retiring_set',[taps['ready_delay'][2]],[P(states['retiring']['set'])])
for n in ['bank_request','consumer_ready','backend_busy','retire']:
 run('RETIRING_Q_to_'+n,[q['retiring']],ports[n])
run('RETIRING_Q_to_three_taps',[q['retiring']],taps['retiring_delay'],True)
run('retiring_t1_to_CAPTURED_clear',[taps['retiring_delay'][0]],[P(states['captured']['clear'])])
run('retiring_t3_to_RETIRE',[taps['retiring_delay'][2]],ports['retire'])
run('retiring_t3_to_BUSY',[taps['retiring_delay'][2]],ports['backend_busy'])
for n in ['bank_request','consumer_ready','backend_busy','retire']:
 run('CAPTURED_Q_to_'+n,[q['captured']],ports[n])
run('bank_READY_direct_to_BUSY',ports['bank_ready'],ports['backend_busy'])
run('response_Q_to_output',[P(v['storage']) for v in d['response']],[P(v['output']) for v in d['response']])
if not legacy:
 for n in ['retire','backend_busy']:
  run('downstream_BANK_BUSY_to_'+n,ports['downstream_bank_busy'],ports[n])
run('ACTIVE_fall_to_RETIRING_clear',ports['active'],[P(states['retiring']['clear'])])
run('reset_to_state_clear',ports['reset_blocked'],[P(s['clear']) for s in states.values()])
run('reset_to_response_locks',ports['reset_blocked'],[P(v['lock']) for v in d['response']])
# Response Q is retained whenever OPEN is low; this is geometry, not a pulse simulation.
report={'status':'actual_channel0_SR_boundary_nominal_paths','paths':reports,'state_boundaries':states,'bank_tail_qualification':d.get('bank_tail_qualification'),'source_sha256':{str(p.relative_to(ROOT)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in [helper,design,Path(__file__).resolve()]},'limits':['All SR outputs are explicit retained-state cuts; neither state transition settling nor arbitrary startup is assumed proven.','Other delay taps are held state/event boundaries for direct-path queries; RETIRING-to-taps includes the complete physical delay chains.','These are nominal fixed device sums over potential dependencies, not measured physical bounds or dynamic gate simulation.'],'native_acceptance':False}
(H/('legacy-local-paths.json' if legacy else 'local-paths.json')).write_text(json.dumps(report,indent=2)+'\n');(H/('legacy-local-witnesses.json' if legacy else 'local-witnesses.json')).write_text(json.dumps(witnesses)+'\n')
