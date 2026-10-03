"""Independent held-level review of the actual eight loader admission masks.

Reads the full shared assembly. This is not a state/event/native simulator.
"""
import ast
import hashlib
import json
from collections import defaultdict, deque
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[2]
SOURCE = BASE/'loader-program-colocation-v1/service-mask-memory-composition-v1'
ENGINE = BASE/'memory/typed-request-review-v1/check.py'
PINS = {}


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda: f.read(8*1024*1024), b''):
            h.update(part)
    return h.hexdigest()


def read(path):
    PINS[str(path.relative_to(ROOT))] = digest(path)
    return json.loads(path.read_text())


# Reuse only independently written electrical geometry definitions. Do not run
# the earlier artifact driver's IO, tests or mutable globals.
constants = {'P','ADD','NEG','FACING','FLIP','HORIZONTAL','UP','DOWN','NEIGHBOURS',
             'WIRE','REP','COMP','TORCH','WALL','RED','LEVER'}
functions = {'solid','vector','emits','support_drivers','inputs'}
tree = ast.parse(ENGINE.read_text())
nodes = []
for n in tree.body:
    if isinstance(n, ast.FunctionDef) and n.name in functions:
        nodes.append(n)
    elif isinstance(n, ast.Assign):
        names = {s.id for t in n.targets for s in ast.walk(t) if isinstance(s, ast.Name)}
        if names and names <= constants:
            nodes.append(n)
exec(compile(ast.Module(body=nodes,type_ignores=[]), str(ENGINE), 'exec'))
PINS[str(ENGINE.relative_to(ROOT))] = digest(ENGINE)


def compile_levels(world, outputs, roots):
    """Exact numeric dust attenuation over an acyclic non-dust dependency graph.

    Only reciprocal dust edges are collapsed. Comparator wire sides remain
    analog values, unlike the older typed-request Boolean normalization rule.
    """
    deps = {}; pending = list(outputs)
    while pending:
        p = pending.pop()
        if p in deps:
            continue
        assert p in world, ('missing source cone cell', p)
        deps[p] = set() if p in roots else inputs(world, p)
        pending.extend(deps[p]-deps.keys())
    assert roots <= deps.keys(), ('unused clamp', roots-deps.keys())
    lead = {p:p for p in deps}
    def find(p):
        while lead[p] != p:
            lead[p] = lead[lead[p]]; p = lead[p]
        return p
    for p, ds in deps.items():
        for q in ds:
            if p not in roots and q not in roots and world[p]['id']==world[q]['id']==WIRE and p in deps[q]:
                lead[find(p)] = find(q)
    groups = defaultdict(set)
    for p in deps:
        groups[find(p)].add(p)
    incoming = {g:set() for g in groups}; outgoing = defaultdict(set)
    for p, ds in deps.items():
        for q in ds:
            a,b = find(q),find(p)
            if a != b:
                incoming[b].add(a); outgoing[a].add(b)
            else:
                assert world[p]['id']==world[q]['id']==WIRE and p not in roots and q not in roots
    remaining = {g:len(ds) for g,ds in incoming.items()}
    queue = deque(g for g,n in remaining.items() if not n); order = []
    while queue:
        g = queue.popleft(); order.append(g)
        for n in outgoing[g]:
            remaining[n] -= 1
            if not remaining[n]: queue.append(n)
    assert len(order)==len(groups), ('non-dust cycle', len(order), len(groups))
    records = []
    for g in order:
        members = groups[g]; p = next(iter(members)); b=world[p]; kind=b['id']
        if len(members)>1: assert all(world[q]['id']==WIRE for q in members)
        sides=set(); rears=set(); followers=defaultdict(set)
        if kind in (REP,COMP) and p not in roots:
            direction=vector(b)
            sides={q for q in deps[p] if q[1]==p[1] and sum(abs(a-c) for a,c in zip(p,q))==1 and sum((q[i]-p[i])*direction[i] for i in range(3))==0}
            rears=deps[p]-sides
            if kind==REP: assert not sides, ('side lock in combinational review',p,sides)
        for q in members:
            for d in deps[q]:
                if d in members: followers[d].add(q)
        records.append((members,p,b,kind,sides,rears,followers))
    def evaluate(values):
        power={}; minimum=15
        for members,p,b,kind,sides,rears,followers in records:
            if p in roots: power[p]=values[p]; continue
            if kind==WIRE:
                local={q:max((max(0,power[d]-(world[d]['id']==WIRE)) for d in deps[q] if d not in members),default=0) for q in members}
                todo=deque(q for q in members if local[q])
                while todo:
                    q=todo.popleft()
                    for n in followers[q]:
                        level=max(0,local[q]-1)
                        if level>local[n]: local[n]=level; todo.append(n)
                power.update(local); continue
            high=max((power[q] for q in deps[p]),default=0)
            if kind==RED: value=15
            elif kind in (TORCH,WALL): value=0 if high else 15
            elif kind==REP:
                if high: minimum=min(minimum,high)
                value=15 if high else 0
            elif kind==COMP:
                rear=max((power[q] for q in rears),default=0); side=max((power[q] for q in sides),default=0)
                value=max(0,rear-side) if b['properties']['mode']=='subtract' else (rear if rear>=side else 0)
            else: raise AssertionError(('unsupported source cone block',p,kind))
            power[p]=value
        return {p:power[p] for p in outputs},minimum
    return evaluate, {'vertices':len(deps),'components':len(groups),'delayed_device_cycles':0}, deps


d=read(SOURCE/'composed-delta.json'); refold=read(SOURCE/'refolded-mask-placement.json')
union_receipt=read(SOURCE/'latest-union-checks.json')
assert union_receipt['source_sha256'][str((SOURCE/'composed-delta.json').relative_to(ROOT))]==PINS[str((SOURCE/'composed-delta.json').relative_to(ROOT))]
assert union_receipt['metrics']['memory_cells']==1371782
memory=read(BASE/'memory/fabric-colocation-v2/channel3-write-data-design.json')
world={P(r['position']):r['block'] for r in memory['blocks']}; assert len(world)==1371782
del memory
panels=read(BASE/'loader-bank-panels-v1/delta.json')
program=read(BASE/'program-service-composition-v1/new-program-obstacles.json')
program_cable=read(BASE/'program-service-composition-v1/cable-delta.json')
for patch in d['replacements']:
    p=P(patch['position']); assert world[p]==patch['before']; world[p]=patch['after']
for rows in [panels['blocks'],program['blocks'],program_cable['blocks'],d['placed_loader'],d['placed_masks'],d['new_cells']]:
    for r in rows:
        p=P(r['position']); assert p not in world, ('overlap',p); world[p]=r['block']
assert len(world)==union_receipt['metrics']['total_cells']==1700444
old_census=read(BASE/'loader-program-colocation-v1/service-witness-input-bindings-v1/endpoint-candidates.json')
old_world={P(r['position']):r['block'] for r in old_census['old_neighbor_blocks']}
old_scope=read(BASE/'loader-program-colocation-v1/reference-scope.json')
for row in old_scope['blocks']:
    p=P(row['position'])
    if p in old_world: assert old_world[p]==row['block']
    old_world[p]=row['block']
del old_scope
assert len(refold['mapping'])==96
for r in refold['mapping']:
    assert old_world[P(r['original'])]==r['before']
    assert world[P(r['current'])]==r['after']
ports=refold['maskPorts']; assert len(ports)==8
feed=next(c for c in d['connections'] if c['kind']=='mask_common_feed')
runtime=P(feed['root']); requests=[(5*i,-39,-28) for i in range(8)]
targets=[P(m[key]) for m in ports for key in ['receiver','source','witness_receiver']]
roots={runtime,*requests}
for i,m in enumerate(ports):
    assert P(m['receiver'])==(5*i,-39,-26)
    assert P(m['source'])==(5*i-1,-39,-26)
    assert world[requests[i]]['id']==REP
    rear_wire=(5*i,-39,-27)
    assert world[rear_wire]['id']==WIRE
    assert inputs(world,rear_wire)=={requests[i]}
    assert inputs(world,P(m['receiver']))=={rear_wire,P(m['source'])}
evaluate,graph,deps=compile_levels(world,targets,roots)
supports=0
for p in deps:
    b=world[p]
    if b['id']==WALL: support=ADD(p,vector(b))
    elif b['id'] in (WIRE,REP,COMP,TORCH,LEVER): support=ADD(p,DOWN)
    else: continue
    assert solid(world.get(support)),('unsupported cone cell',p)
    supports+=1
minimum=15; output_checks=0; results=[]
for inhibit in range(2):
    for request in range(256):
        levels={runtime:15*inhibit,**{p:15*(request>>i&1) for i,p in enumerate(requests)}}
        observed,low=evaluate(levels); minimum=min(minimum,low)
        for i,m in enumerate(ports):
            assert observed[P(m['receiver'])]==(0 if inhibit else 15*(request>>i&1))
            assert observed[P(m['source'])]==15*inhibit
            assert observed[P(m['witness_receiver'])]==15*inhibit
            output_checks+=3
        results.append({'inhibit':inhibit,'requests':request,'levels':[observed[p] for p in targets]})
# Low nonzero signal at the actual runtime-block export must still be restored
# before the masks. This does not assert the sequential loader's behavior.
attenuated_cases=0
for high in range(1,16):
    for request in (0,0x55,0xaa,0xff):
        got,_=evaluate({runtime:high,**{p:15*(request>>i&1) for i,p in enumerate(requests)}})
        for m in ports:
            assert [got[P(m[k])] for k in ['receiver','source','witness_receiver']]==[0,15,15]
        attenuated_cases+=1
old_cases=0
for i in range(8):
    target=(5*i,1,-6); req=(5*i,1,-7); mask=(5*i+2,1,-6)
    original,_,_=compile_levels(old_world,[target],{req,mask})
    for req_high in range(2):
        for mask_high in range(2):
            got,_=original({req:req_high*15,mask:mask_high*15})
            assert got[target]==15*(req_high and not mask_high); old_cases+=1
negative=[]
high={p:15 for p in roots}
for m in ports:
    p=P(m['receiver']); saved=world[p]
    world[p]={**saved,'properties':{**saved['properties'],'mode':'compare'}}
    bad,_,_=compile_levels(world,targets,roots); got,_=bad(high)
    assert got[p]==15
    negative.append({'kind':'actual_subtract_to_compare','position':p,'wrong_output':got[p]})
    world[p]=saved
for c in d['connections']:
    p=P(c['normalizer']); saved=world[p]
    world[p]={**saved,'properties':{**saved['properties'],'facing':FLIP[saved['properties']['facing']]}}
    assert p not in inputs(world,P(c['destination']))
    negative.append({'kind':'actual_arrival_reversed','position':p})
    world[p]=saved
PINS[str(Path(__file__).relative_to(ROOT))]=digest(Path(__file__))
for name,h in PINS.items(): assert digest(ROOT/name)==h, ('source changed during review',name)
report={'status':'independent_actual_eight_mask_source_cones_pass','complete_assembly_cells':len(world),
        'graph':graph,'supported_cone_devices':supports,'preserved_original_mask_cells':96,
        'comparator_replacements':8,'source_boundaries':[list(p) for p in sorted(roots)],
        'digital_cases':512,'digital_output_checks':output_checks,'attenuated_runtime_export_cases':attenuated_cases,
        'original_gate_cases':old_cases,'source_aware_positive_repeater_rear_minimum':minimum,
        'actual_block_mutations':negative,'source_sha256':PINS,
        'scope':'Independent numeric graph evaluation over actual full-assembly block coordinates. Earlier author whole-input union check remains separate evidence.',
        'limits':['Runtime-block and eight retained request rear outputs are held boundaries. No loader/owner state transitions are executed.',
                  'Reciprocal dust attenuation is modeled; non-dust cycles refuse. Iterations are not Minecraft ticks.',
                  'This review does not independently screen every assembly receiver or certify pulse widths, reset/drain freshness, full timing, whole GPU density or native operation.'],
        'world_mutations':0,'native_acceptance':False,'complete_gpu_layout':False}
(HERE/'independent-review.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['source_sha256','actual_block_mutations','limits','source_boundaries']}))
