"""Separate the opening event from the later same-chain closing event."""
from pathlib import Path
import importlib.util,json
H=Path(__file__).resolve().parent;p=H/'check.py';spec=importlib.util.spec_from_file_location('dag',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
f=H.parent/'program-controller-v1/design.json';c=H.parent/'program-capture-v1/design.json';d=json.loads(f.read_text());capture=json.loads(c.read_text());world={m.P(v['position']):v['block'] for v in d['blocks']};stages={s['name']:m.P(s['position']) for s in d['stages']};reports={};witnesses={}
for bank,opening,closing in [('address','t2','t3'),('response','t4','t5')]:
 nets={'active_delayed_flush','open_'+bank,'hold_'+bank}
 allowed={tuple(map(int,k.split(','))) for k,v in d['nets'].items() if v in nets}
 # The later tap is held inactive for this opening-event calculation. The
 # closing event has its own full graph and timing in controller-checks.json.
 # Without this cut, the source also propagates down the real delay chain to
 # the later close, so its longest path describes closure, not opening.
 allowed.remove(stages[closing])
 cells=sorted((s for s in capture['stores'] if s['name']==bank),key=lambda s:s['bit'])
 out,w=m.analyze(world,[stages[opening]],[m.P(s['lock']) for s in cells],allowed)
 reports[bank]={**out,'source_stage':opening,'later_closing_stage_held_inactive':closing};witnesses[bank]=w
out={'status':'conditional_separate_opening_event_nominal_paths','banks':reports,'source_sha256':{str(q.relative_to(m.ROOT)):m.sha(q) for q in [p,f,c,Path(__file__).resolve()]},'native_acceptance':False,'numeric_physical_bounds_established':False,'world_mutations':0,'limits':['The later closing tap is a stated event boundary, not a proposed circuit modification. Its independent arrival must follow actual lock opening by the required margin.','ACTIVE and reset-busy masks are stable and every previous control tail has drained. No physical delay bound is established.']}
(H/'opening-checks.json').write_text(json.dumps(out,indent=2)+'\n');(H/'opening-witnesses.json').write_text(json.dumps(witnesses)+'\n')
print(json.dumps({k:v['max_nominal_dependency_ticks'] for k,v in reports.items()}))
