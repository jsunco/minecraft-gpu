"""Actual static quiet gates and routed inputs; no state/event/native simulation."""
import ast
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ENGINE = ROOT/'artifacts/full-gpu-layout-v1/memory/typed-request-review-v1/check.py'
tree = ast.parse(ENGINE.read_text())
# Load only explicit electrical/graph definitions and primitive constants.
# Never execute that review's artifact-reading or artifact-writing driver.
allowed = {'P','ADD','NEG','FACING','FLIP','HORIZONTAL','UP','DOWN','NEIGHBOURS',
           'WIRE','REP','COMP','TORCH','WALL','RED','LEVER'}
nodes = []
for node in tree.body:
    if isinstance(node,(ast.Import,ast.ImportFrom,ast.FunctionDef)):
        nodes.append(node)
    elif isinstance(node,ast.Assign):
        names={n.id for target in node.targets for n in ast.walk(target) if isinstance(n,ast.Name)}
        if names and names <= allowed:
            nodes.append(node)
namespace={}
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(ENGINE),'exec'),namespace)
to_pos=namespace['P'];compile_cone=namespace['compile_cone'];inputs=namespace['inputs']
read=lambda p:json.loads(p.read_text())
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
d=read(HERE/'connected-candidate.json');base=read(HERE/'body-placement.json')
world={to_pos(c['position']):c['block'] for c in d['blocks']}
roles=[to_pos(c['source']) for c in d['connections']]
outputs=[to_pos(base['ports'][n]['bits'][0]['position']) for n in ['core0_drained','core1_drained','channel_quiet']]
logic,numeric,graph=compile_cone(world,outputs,set(roles))
values={p:namespace['variable'](i,3) for i,p in enumerate(roles)}
assert all(v==1 for v in logic(values,8).values())
results=[];minimum=15
for assignment in range(8):
    levels,low=numeric({p:15 if assignment&(1<<i) else 0 for i,p in enumerate(roles)})
    assert all((v>0)==(assignment==0) for v in levels.values())
    minimum=min(minimum,low)
    results.append({'assignment':assignment,'levels':[levels[p] for p in outputs]})
negatives=[]
for row in base['blocks']:
    if row['family']!='quiet' or row['block']['id']!=namespace['COMP']:continue
    p=to_pos(row['position']);saved=world[p]
    world[p]={**saved,'properties':{**saved['properties'],'mode':'compare'}}
    try:
        try:
            logic_bad,_,_=compile_cone(world,outputs,set(roles))
            refused=any(v!=1 for v in logic_bad(values,8).values())
        except AssertionError:refused=True
        assert refused,('comparator mutation survived',p)
        negatives.append({'position':list(p),'mutation':'subtract_to_compare','refused':True})
    finally:world[p]=saved
assert negatives
report={'status':'actual_program_quiet_body_and_transport_settled_pass','graph':graph,
        'actual_boundary_sources':[list(p) for p in roles],'outputs':[list(p) for p in outputs],
        'assignments_per_model':8,'output_bit_checks_per_model':24,
        'minimum_source_aware_positive_rear':minimum,'numeric_cases':results,'actual_gate_mutations':negatives,
        'source_sha256':{str(p.relative_to(ROOT)):digest(p) for p in [ENGINE,HERE/'body-check.py',HERE/'connected-candidate.json',HERE/'body-placement.json']},
        'limits':['Only actual original ACTIVE, final normal tail and current reset-blocked output levels are clamped. Their state/timing behavior is not simulated.',
                  'Both Boolean and source-aware numeric tests use actual devices; only reciprocal dust is collapsed. Delayed-device cycles refuse.',
                  'This is an author check of proposed geometry, not Minecraft or independent review of the whole program controller.'],
        'native_acceptance':False,'world_mutations':0}
(HERE/'body-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'graph':graph,'assignments':8,'minimum_positive_rear':minimum,'gate_mutations':len(negatives)}))
