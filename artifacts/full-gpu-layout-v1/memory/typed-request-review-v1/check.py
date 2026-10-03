"""Independent full geometry and settled typed-bank-request review. No native calls."""
from pathlib import Path
from collections import defaultdict, deque, Counter
import hashlib
import json

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent
ROOT = HERE.parents[3]
SOURCE = HERE.parent / 'fabric-colocation-v2'
P = lambda p: tuple(p[a] for a in 'xyz')
ADD = lambda p, q: tuple(a + b for a, b in zip(p, q))
NEG = lambda p: tuple(-a for a in p)
FACING = {'west': (1, 0, 0), 'east': (-1, 0, 0), 'north': (0, 0, 1), 'south': (0, 0, -1)}
FLIP = {'east': 'west', 'west': 'east', 'north': 'south', 'south': 'north'}
HORIZONTAL = tuple(FACING.values())
UP, DOWN = (0, 1, 0), (0, -1, 0)
NEIGHBOURS = HORIZONTAL + (UP, DOWN)
WIRE, REP, COMP = ('minecraft:' + s for s in ('redstone_wire', 'repeater', 'comparator'))
TORCH, WALL, RED, LEVER = ('minecraft:' + s for s in ('redstone_torch', 'redstone_wall_torch', 'redstone_block', 'lever'))
PINS = {}


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def pin(path, expected=None):
    digest = sha(path)
    assert expected is None or digest == expected, (path, digest, expected)
    PINS[str(path.relative_to(ROOT))] = digest
    return digest

def read(path):
    return json.loads(path.read_text())

def solid(block):
    return bool(block) and block['id'].endswith('_concrete')

def vector(block):
    return FACING[block['properties']['facing']]

def store_map(world):
    result = {}
    for p, block in world.items():
        if block['id'] != REP:
            continue
        direction = vector(block)
        locks = []
        for side in HORIZONTAL:
            if sum(a * b for a, b in zip(side, direction)):
                continue
            q = ADD(p, side)
            other = world.get(q)
            if other and other['id'] in (REP, COMP) and ADD(q, vector(other)) == p:
                locks.append(q)
        if locks:
            result[p] = tuple(sorted(locks))
    return result

def block_map(d):
    w = {P(r['position']): r['block'] for r in d['blocks']}
    assert len(w) == len(d['blocks'])
    return w

def stream_selected_blocks(path, wanted):
    """Read the actual large parent without materializing its unrelated bank cells."""
    decoder = json.JSONDecoder()
    result = {}
    import re
    with path.open() as f:
        buf = f.read(65536)
        m = re.search(r'"blocks"\s*:\s*\[', buf)
        assert m, 'blocks array must begin in the first64KiB'
        buf = buf[m.end():]
        count = 0
        while True:
            buf = buf.lstrip(' \n\r\t,')
            if not buf:
                buf = f.read(65536)
                assert buf
                continue
            if buf[0] == ']':
                break
            try:
                row, end = decoder.raw_decode(buf)
            except json.JSONDecodeError:
                more = f.read(65536)
                assert more
                buf += more
                continue
            count += 1
            p = P(row['position'])
            if p in wanted:
                assert p not in result
                result[p] = row['block']
            buf = buf[end:]
    assert set(result) == wanted
    return result, count

def emits(world, p, target):
    block = world.get(p)
    if not block:
        return False
    kind = block['id']
    if kind in (REP, COMP):
        return ADD(p, vector(block)) == target
    if kind in (TORCH, WALL):
        return target != ADD(p, DOWN if kind == TORCH else vector(block))
    return kind in (WIRE, RED, LEVER)

def support_drivers(world, p, wire_target):
    drivers = set()
    for direction in NEIGHBOURS:
        q = ADD(p, direction)
        block = world.get(q)
        if not block:
            continue
        if block['id'] in (REP, COMP) and emits(world, q, p):
            drivers.add(q)
        elif block['id'] in (TORCH, WALL) and direction == DOWN:
            drivers.add(q)
        elif not wire_target and block['id'] == WIRE and direction != DOWN:
            drivers.add(q)
    return drivers

def inputs(world, p):
    """Possible sources with diode direction, steps, support power and locks.

    The model deliberately does not infer dust-shape pruning or event order.
    No new path is credited through a weakly powered solid into another wire.
    """
    block = world.get(p)
    if not block or solid(block):
        return set()
    result = set()

    def rear(q, wire_target=False):
        if solid(world.get(q)):
            result.update(support_drivers(world, q, wire_target))
        elif emits(world, q, p):
            result.add(q)

    kind = block['id']
    if kind == WIRE:
        for side in NEIGHBOURS:
            q = ADD(p, side)
            if world.get(q, {}).get('id') != WIRE:
                rear(q, True)
        for side in HORIZONTAL:
            q = ADD(p, side)
            if world.get(q, {}).get('id') == WIRE:
                result.add(q)
            hi, lo = ADD(q, UP), ADD(q, DOWN)
            if solid(world.get(q)) and not solid(world.get(ADD(p, UP))) and world.get(hi, {}).get('id') == WIRE:
                result.add(hi)
            if not solid(world.get(q)) and world.get(lo, {}).get('id') == WIRE:
                result.add(lo)
    elif kind in (REP, COMP):
        direction = vector(block)
        rear(ADD(p, NEG(direction)))
        for side in HORIZONTAL:
            if sum(a * b for a, b in zip(side, direction)):
                continue
            q = ADD(p, side)
            other = world.get(q, {}).get('id')
            if other in (REP, COMP) and emits(world, q, p):
                result.add(q)
            elif kind == COMP and other in (WIRE, RED):
                result.add(q)
    elif kind in (TORCH, WALL):
        support = ADD(p, DOWN if kind == TORCH else vector(block))
        assert solid(world.get(support)), (p, 'unsupported torch')
        result.update(support_drivers(world, support, False))
    return result

def chain(c, w):
    nodes = [P(c['source']), P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    assert len(nodes) == len(set(nodes))
    power, minimum, delay = 15, 15, 0
    for i, p in enumerate(nodes[1:], 1):
        b = w[p]
        assert nodes[i - 1] in inputs(w, p), ('broken edge', c['name'], nodes[i - 1], p)
        if b['id'] == REP:
            minimum = min(minimum, power); assert power > 0
            power = 15; delay += 2 * int(b['properties']['delay'])
        elif b['id'] == WIRE:
            if w[nodes[i - 1]]['id'] == WIRE: power -= 1
            assert power > 0
        else:
            assert i == len(nodes) - 1 and b['id'] == TORCH
    return {'name': c['name'], 'vertices': len(nodes), 'minimum_rear': minimum, 'nominal_cable_diode_ticks': delay}

def variable(n, count):
    return sum(1 << assignment for assignment in range(1 << count) if assignment & (1 << n))


def compile_cone(w, outputs, clamps):
    keys=set();pending=list(outputs);deps={}
    while pending:
        p=pending.pop()
        if p in keys:continue
        assert p in w,('missing cone cell',p)
        keys.add(p);ds=set() if p in clamps else inputs(w,p);deps[p]=ds;pending.extend(ds-keys)
    assert set(clamps)<=keys,('unused required boundary',set(clamps)-keys)
    lead={p:p for p in keys}
    def find(p):
        while lead[p]!=p:lead[p]=lead[lead[p]];p=lead[p]
        return p
    for p in keys:
        for q in deps[p]:
            if p not in clamps and q not in clamps and w[p]['id']==w[q]['id']==WIRE and p in deps[q]:lead[find(p)]=find(q)
    groups=defaultdict(set)
    for p in keys:groups[find(p)].add(p)
    incoming={g:set() for g in groups};outgoing=defaultdict(set)
    for p in keys:
        for q in deps[p]:
            a,b=find(q),find(p)
            if a!=b:incoming[b].add(a);outgoing[a].add(b)
            else:assert w[p]['id']==w[q]['id']==WIRE and p not in clamps and q not in clamps
    remain={g:len(v) for g,v in incoming.items()};queue=deque(g for g,n in remain.items() if not n);order=[]
    while queue:
        g=queue.popleft();order.append(g)
        for nxt in outgoing[g]:
            remain[nxt]-=1
            if not remain[nxt]:queue.append(nxt)
    assert len(order)==len(groups),('delayed device cycle',len(order),len(groups))
    records=[]
    for g in order:
        members=groups[g];p=next(iter(members));kind=w[p]['id']
        if len(members)>1:assert all(w[q]['id']==WIRE for q in members)
        side=set();rear=set();followers=defaultdict(set)
        if kind in (REP,COMP) and p not in clamps:
            direction=vector(w[p])
            side={q for q in deps[p] if q[1]==p[1] and sum(abs(a-b) for a,b in zip(q,p))==1 and sum((q[i]-p[i])*direction[i] for i in range(3))==0}
            rear=deps[p]-side
            if kind==REP:assert not side,('unexpected unlocked transport side input',p,side)
            else:
                assert w[p]['properties']['mode']=='subtract',('not subtract',p)
                assert rear and all(w[q]['id'] in (REP,COMP) and emits(w,q,p) for q in rear|side),('analog comparator input not regenerated',p)
        for q in members:
            for d in deps[q]:
                if d in members:followers[d].add(q)
        records.append((g,members,p,kind,side,rear,followers))
    def logic(values,width):
        result={};full=(1<<width)-1
        def either(xs):
            v=0
            for q in xs:v|=result[find(q)]
            return v
        for g,members,p,kind,side,rear,_ in records:
            if p in clamps:v=values[p]
            elif kind==RED:v=full
            elif kind in (WIRE,REP):v=either(incoming[g])
            elif kind in (TORCH,WALL):v=full^either(incoming[g])
            elif kind==COMP:v=either(rear)&(full^either(side))
            else:raise AssertionError(('unsupported device',p,kind))
            result[g]=v
        return {p:result[find(p)] for p in outputs}
    def numeric(values):
        result={};minimum=15
        for g,members,p,kind,side,rear,followers in records:
            if p in clamps:result[p]=values[p];continue
            if kind==WIRE:
                local={q:max((max(0,result[d]-(w[d]['id']==WIRE)) for d in deps[q] if d not in members),default=0) for q in members}
                queue=deque(q for q in members if local[q])
                while queue:
                    q=queue.popleft()
                    for nxt in followers[q]:
                        v=max(0,local[q]-1)
                        if v>local[nxt]:local[nxt]=v;queue.append(nxt)
                result.update(local);continue
            high=max((result[q] for q in deps[p]),default=0)
            if kind==RED:v=15
            elif kind in (TORCH,WALL):v=0 if high else 15
            elif kind==REP:
                if high:minimum=min(minimum,high)
                v=15 if high else 0
            elif kind==COMP:v=max(0,max((result[q] for q in rear),default=0)-max((result[q] for q in side),default=0))
            else:raise AssertionError(('unsupported numeric',p,kind))
            result[p]=v
        return {p:result[p] for p in outputs},minimum
    return logic,numeric,{'actual_vertices':len(keys),'components':len(groups),'delayed_cycles':0}

pin(SOURCE/'typed-request-connected-source-manifest.json','015615770108f09fc455cf870ccc07f99e4dcdbeff70a353b6748fcdea3f5d5f')
manifest=read(SOURCE/'typed-request-connected-source-manifest.json')
for name in ('typed-request-connected-design.json','bank-tail-connected-design.json','typed-request-original-bodies.json','typed-request-current-sources.json','typed-request-cut-ledger.json','next-bank-input-bindings.json'):
    p=SOURCE/name;pin(p,manifest['source_sha256'][str(p.relative_to(ROOT))])
pin(HERE.parent/'consumer-drain-review-v1/check.py')
pin(HERE.parent/'consumer-drain-review-v1/source-manifest.json')
d=read(SOURCE/'typed-request-connected-design.json');world=block_map(d);del d['blocks']
parent=read(SOURCE/'bank-tail-connected-design.json');before=block_map(parent);del parent['blocks']
assert len(before)==1148582 and len(world)==1191454
assert all(world.get(p)==b for p,b in before.items())
old_stores=store_map(before);assert store_map(world)==old_stores
body=read(SOURCE/'typed-request-original-bodies.json');sources=read(SOURCE/'typed-request-current-sources.json')
actual_old_path=BASE/'memory/master-cold-compatible-v2/design.json';pin(actual_old_path,'364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f')
old_gates=block_map(body);assert len(old_gates)==676
real_gate_records,old_count=stream_selected_blocks(actual_old_path,set(old_gates));assert old_count==3381962 and real_gate_records==old_gates
for g in d['placedGates']:
    original_rows=[r for r in body['blocks'] if r['part'].endswith('gate'+str(g['channel']))]
    assert len(original_rows)==169
    for r in original_rows:assert world[ADD(P(r['position']),P(g['offset']))]==r['block']
print(json.dumps({'stage':'exact_parent_and_original_gates','cells':len(world),'original_gate_cells':len(old_gates),'side_lock_stores':len(old_stores)}),flush=True)
added_expected=defaultdict(set)
for e in d['edges']:
    a,b=P(e['from']),P(e['to']);added_expected[b].add(a)
    if world[a]['id']==world[b]['id']==WIRE:added_expected[a].add(b)
receivers=preserved=count=0
for p,b in world.items():
    if b['id'] in (WIRE,REP,COMP,TORCH):assert solid(world.get(ADD(p,DOWN))),('support',p)
    if not solid(b):
        prior=inputs(before,p);want=prior|added_expected.get(p,set());found=inputs(world,p)
        assert found==want,(p,'extra',found-want,'lost',want-found)
        receivers+=1;count+=len(found);preserved+=len(prior)
assert (receivers,preserved,count)==(594096,936189,975011)
print(json.dumps({'stage':'full_inputs','receivers':receivers,'preserved':preserved,'actual':count}),flush=True)
connections=d['connections'];assert len(connections)==56
routes=[chain(c,world) for c in connections]
semantic=[];minimum=15;variables=[variable(i,6) for i in range(6)];full=(1<<64)-1
wanted_request=variables[0]
for v in variables[1:5]:wanted_request&=full^v
for ch in range(4):
    row=sources['channels'][ch];assert [r['name'] for r in row['request_roles']]==['active','captured','retiring','retiring_t3','reset_blocked']
    roles=[P(r['position']) for r in row['request_roles']]+[P(row['retained_type_storage'])]
    assert roles[-1] in old_stores
    branches=[c for c in connections if c['kind']=='typed_bank_valid' and c['channel']==ch]
    assert {(c['bank'],c['access']) for c in branches}=={(b,a) for b in range(4) for a in ('read_valid','write_valid')}
    outs=[P(c['destination']) for c in branches];clamps=dict(zip(roles,variables));logic,numeric,evidence=compile_cone(world,outs,set(clamps))
    values=logic(clamps,64)
    for c in branches:
        wanted=wanted_request&(variables[5] if c['access']=='write_valid' else full^variables[5])
        assert values[P(c['destination'])]==wanted
    for assignment in range(64):
        outputs,low=numeric({p:15 if assignment&(1<<i) else 0 for i,p in enumerate(roles)});minimum=min(minimum,low)
        req=(assignment&31)==1;typ=bool(assignment&32)
        for c in branches:assert (outputs[P(c['destination'])]>0)==(req and (typ if c['access']=='write_valid' else not typ)),(ch,assignment,c['name'],outputs[P(c['destination'])])
    semantic.append({'channel':ch,'assignments':64,'bank_outputs':8,'numeric_cases':64,**evidence})
    print(json.dumps({'stage':'settled_channel',**semantic[-1]}),flush=True)
negatives=[]
for c in connections:
    p=P(c['arrival']);saved=world[p];assert saved['id']==REP
    world[p]={**saved,'properties':{**saved['properties'],'facing':FLIP[saved['properties']['facing']]}}
    try:
        try:chain(c,world)
        except (AssertionError,KeyError):negatives.append({'route':c['name'],'mutation':'reverse_arrival','refused':True})
        else:raise AssertionError(('arrival corruption survived',c['name']))
    finally:world[p]=saved
for g in d['placedGates']:
    ch=g['channel'];row=sources['channels'][ch];roles=[P(r['position']) for r in row['request_roles']]+[P(row['retained_type_storage'])];clamps=dict(zip(roles,variables));branches=[c for c in connections if c['kind']=='typed_bank_valid' and c['channel']==ch];outs=[P(c['destination']) for c in branches]
    for r in body['blocks']:
        if not r['part'].endswith('gate'+str(ch)) or r['block']['id']!=COMP:continue
        p=ADD(P(r['position']),P(g['offset']));direction=vector(world[p]);sides=[q for q in inputs(world,p) if q[1]==p[1] and sum(abs(a-b) for a,b in zip(q,p))==1 and sum((q[i]-p[i])*direction[i] for i in range(3))==0];assert len(sides)==1
        q=sides[0];saved=world[q];assert saved['id']==REP;world[q]={**saved,'properties':{**saved['properties'],'facing':FLIP[saved['properties']['facing']]}}
        try:
            refused=False
            try:
                logic,_,_=compile_cone(world,outs,set(clamps));values=logic(clamps,64)
                for c in branches:
                    wanted=wanted_request&(variables[5] if c['access']=='write_valid' else full^variables[5])
                    if values[P(c['destination'])]!=wanted:refused=True
            except(AssertionError,KeyError):refused=True
            assert refused,('typed literal corruption survived',ch,p)
            negatives.append({'channel':ch,'gate':p,'mutation':'reverse_actual_literal_mask','refused':True})
        finally:world[q]=saved
assert len(negatives)==72
report={'status':'independent_typed_request_full_geometry_and_settled_functions_pass','source_sha256':PINS,'exact_parent_cells':len(before),'actual_cells':len(world),'actual_original_gate_cells':len(old_gates),'actual_reference_cells_scanned':old_count,'side_lock_stores_preserved':len(old_stores),'receivers':receivers,'preserved_inputs':preserved,'actual_inputs':count,'cables':56,'mid_path_vertices':sum(len(c['path']) for c in connections),'complete_chain_vertices':sum(r['vertices'] for r in routes),'minimum_conditional_route_rear':min(r['minimum_rear'] for r in routes),'minimum_positive_numeric_cone_rear':minimum,'semantic_channels':semantic,'expanded_assignments':256,'output_bit_checks_per_model':2048,'actual_block_mutations':negatives,'world_mutations':0,'native_calls':0,'complete_gpu_layout':False,'native_acceptance':False,'limits':['Full parent identity and current possible-input/support screen, actual original 676 gate cells, all56 paths and256 settled boundary assignments at32 bank receivers only.','The actual five backend role exports and held type storage outputs are boundary clamps. Source storage, phase sequencing, event order, pulse width and bank capture are not executed or proven.','Boolean and source-aware numeric evaluations are independent settled models, not native Minecraft measurements. Only reciprocal dust is collapsed; any delayed-device cycle is refused.','All384 address/data transports, READY/response/loader/master paths, full cold/drain/timing/compactness and final native acceptance remain open.']}
(HERE/'independent-review.json').write_text(json.dumps(report,indent=2)+'\n');(HERE/'route-witnesses.json').write_text(json.dumps(routes,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('status','actual_cells','receivers','actual_inputs','expanded_assignments','output_bit_checks_per_model')}),flush=True)
