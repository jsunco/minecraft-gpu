"""Read-only independent review of shared core state and PC/flags geometry.

The checker never executes author generators or author electrical helpers. Its
possible-input model is a static screen for this concrete/wire/diode palette,
not Minecraft event simulation. All changes are in-memory negative controls.
"""
from pathlib import Path
from collections import defaultdict, deque, Counter
import hashlib
import json

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[2]
SOURCE = BASE / 'core-lane-colocation-v1/request-or-connected-v1'
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


# The model above is frozen by a provenance hash below. No author helpers run.
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


def stream_world(path):
    decoder = json.JSONDecoder(); import re
    result = {}
    with path.open() as f:
        buf = f.read(65536); match = re.search(r'"blocks"\s*:\s*\[', buf)
        assert match; buf = buf[match.end():]
        while True:
            buf = buf.lstrip(' \n\r\t,')
            if not buf:
                buf=f.read(65536); assert buf; continue
            if buf[0] == ']': break
            try: row,end = decoder.raw_decode(buf)
            except json.JSONDecodeError:
                more=f.read(65536); assert more; buf+=more; continue
            p=P(row['position']); assert p not in result
            result[p]=row['block']; buf=buf[end:]
    return result

pin(SOURCE/'source-manifest.json','938d3d6a3932bad8d2aff116907ac4b614c31ebcf6f950a4a4135c17e782c745')
pin(BASE/'core-shared-state-pc-review-v1/check.py')
manifest=read(SOURCE/'source-manifest.json')
for name in ['endpoint-map.json','obligations.json']:
    p=SOURCE/name;pin(p,manifest['source_sha256'][str(p.relative_to(ROOT))])
ep=read(SOURCE/'endpoint-map.json');obligations=read(SOURCE/'obligations.json')['still_unmapped_historical_endpoints']
old_path=BASE/'compact-core-guard-v1/design.json'
pin(old_path,'2da4daf7365f65628fdbbda5573a00f0a5464fbb163f20c9a6e10e7d92f7c4e1')
old=stream_world(old_path);assert len(old)==1828787
mapping={tuple(map(int,k.split(','))):v for k,v in ep['mapping'].items()}
assert len(mapping)==636892
from functools import lru_cache
@lru_cache(maxsize=None)
def incoming(p):return frozenset(inputs(old,p))
steps=[(x,y,z) for x in range(-2,3) for y in range(-2,3) for z in range(-2,3) if 0<abs(x)+abs(y)+abs(z)<=2]
@lru_cache(maxsize=None)
def outgoing(p):
    return frozenset(q for delta in steps if (q:=ADD(p,delta)) in old and not solid(old[q]) and p in incoming(q))

def walk(p,backward):
    if p not in old:return {'status':'original_position_absent','terminals':[],'vertices':0}
    pending=deque([p]);seen=set();terminals=set();unmapped_logic=set()
    while pending:
        q=pending.popleft()
        if q in seen:continue
        seen.add(q);assert len(seen)<=100000,('unbounded historical recovery',p,backward)
        if q!=p and q in mapping:terminals.add(q);continue
        kind=old[q]['id']
        if kind not in (WIRE,REP,TORCH,WALL):unmapped_logic.add(q);continue
        deps=incoming(q) if backward else outgoing(q)
        pending.extend(deps-seen)
    return {'status':'actual_mapped_boundary_recovered' if terminals else 'no_mapped_boundary','terminals':[{'old':dict(zip('xyz',q)),'new':mapping[q]['position'],'body':mapping[q]['body'],'block':old[q]} for q in sorted(terminals)],'vertices':len(seen),'unmapped_nontransport_devices':[{'position':dict(zip('xyz',q)),'block':old[q]} for q in sorted(unmapped_logic)]}
rows=[]
for e in obligations:
    source,target=P(e['source']),P(e['destination'])
    row={'name':e['name'],'historical_source':e['source'],'historical_target':e['destination'],'source_block':old.get(source),'target_block':old.get(target),'source_is_mapped':source in mapping,'target_is_mapped':target in mapping,
    'source_upstream':walk(source,True),'target_upstream':walk(target,True),'target_downstream':walk(target,False)}
    if source in mapping:row['mapped_source']=mapping[source]
    if target in mapping:row['mapped_target']=mapping[target]
    rows.append(row)
    print(json.dumps({'name':row['name'],'source':row['source_block'],'target':row['target_block'],'mapped':[row['source_is_mapped'],row['target_is_mapped']],**{k:(row[k]['status'],row[k]['vertices'],len(row[k]['terminals']),len(row[k].get('unmapped_nontransport_devices',[]))) for k in ['source_upstream','target_upstream','target_downstream']}}),flush=True)
def settled_cone(w, output, clamps, width):
    """Boolean truth vectors through the actual cone, with no author functions.

    Dust components carry OR; the independent path-strength check is separate.
    Clamp ports are explicit boundaries, not substitutes for missing GPU state.
    Repeaters in this combinational cone must have no side-lock inputs. Every
    subtractor must have a regenerating diode directly at both rear and side.
    """
    keys, pending, dep = set(), [output], {}
    while pending:
        p = pending.pop()
        if p in keys: continue
        keys.add(p)
        ds = set() if p in clamps else inputs(w, p)
        dep[p] = ds
        pending.extend(ds - keys)
    assert set(clamps) <= keys, ('unused intended source', set(clamps) - keys)
    leaders = {p: p for p in keys}
    def find(p):
        while leaders[p] != p:
            leaders[p] = leaders[leaders[p]]; p = leaders[p]
        return p
    for p in keys:
        for q in dep[p]:
            if p not in clamps and q not in clamps and w[p]['id'] == w[q]['id'] == WIRE:
                leaders[find(p)] = find(q)
    groups = defaultdict(set)
    for p in keys: groups[find(p)].add(p)
    incoming, downstream = {p: set() for p in groups}, defaultdict(set)
    for p in keys:
        for q in dep[p]:
            a, b = find(q), find(p)
            if a != b: incoming[b].add(a); downstream[a].add(b)
            else: assert w[p]['id'] == w[q]['id'] == WIRE
    remaining = {p: len(ds) for p, ds in incoming.items()}
    queue = deque(p for p, n in remaining.items() if n == 0)
    full, values, order = (1 << width) - 1, {}, []
    def either(ds):
        v = 0
        for q in ds: v |= values[find(q)]
        return v
    while queue:
        group = queue.popleft(); members = groups[group]
        if len(members) > 1:
            assert all(w[p]['id'] == WIRE and p not in clamps for p in members)
            value = either(incoming[group])
        else:
            p = next(iter(members)); block = w[p]; kind = block['id']
            if p in clamps: value = clamps[p]
            elif kind == RED: value = full
            elif kind == WIRE: value = either(incoming[group])
            elif kind in (TORCH, WALL): value = full ^ either(incoming[group])
            elif kind in (REP, COMP):
                direction = vector(block)
                side = {q for q in dep[p] if q[1] == p[1] and sum(abs(a-b) for a,b in zip(q,p)) == 1 and sum((q[i]-p[i])*direction[i] for i in range(3)) == 0}
                rear = dep[p] - side
                assert rear, ('missing rear', p)
                if kind == REP:
                    assert not side, ('unexpected stateful repeater in settled cone', p)
                    value = either(rear)
                else:
                    assert block['properties']['mode'] == 'subtract'
                    assert all(w[q]['id'] in (REP, COMP) and emits(w, q, p) for q in rear | side), ('unqualified analog source', p)
                    value = either(rear) & (full ^ either(side))
            else: raise AssertionError(('unexpected cone device', p, kind))
        values[group] = value; order.append(group)
        for q in downstream[group]:
            remaining[q] -= 1
            if remaining[q] == 0: queue.append(q)
    assert len(order) == len(groups), ('delayed dependency cycle', len(order), len(groups))
    return values[find(output)], {'actual_vertices': len(keys), 'collapsed_nodes': len(groups), 'clamped_boundary_ports': len(clamps), 'delayed_device_cycles': 0}


def variable(n, count):
    return sum(1 << assignment for assignment in range(1 << count) if assignment & (1 << n))



functions=[]
negative=[]
semantic_inputs={}
for r in rows:
    target=P(r['historical_target']);seen=set();pending=[target];roots=set()
    while pending:
        p=pending.pop()
        if p in seen:continue
        seen.add(p)
        if p!=target and p in mapping:roots.add(p);continue
        assert old[p]['id'] in (WIRE,REP,COMP,TORCH,WALL,RED),('unclassified device',p,old[p])
        pending.extend(incoming(p)-seen)
    roots=sorted(roots);assert len(roots)<=4,('unexpected full original cone',r['name'],roots)
    width=1<<len(roots);clamps={p:variable(i,len(roots)) for i,p in enumerate(roots)}
    value,evidence=settled_cone(old,target,clamps,width)
    entry={'name':r['name'],'original_target':r['historical_target'],'roots':[{'old':dict(zip('xyz',p)),'new':mapping[p]['position'],'body':mapping[p]['body']} for p in roots],'truth_table_lsb_assignment_first':[bool(value&(1<<i)) for i in range(width)],**evidence}
    expected_truth = ([True] if 'full_cycle_advance_' in r['name'] else [False,False,False,True] if r['name']=='qualified_phase_to_owner_kind_open' else [True,False] if r['name'] in ('owner_capture_to_kind_phase_mask','rf_ack_low_to_owner_release') else [False,True])
    assert entry['truth_table_lsb_assignment_first']==expected_truth,('original function changed',r['name'])
    semantic_inputs[r['name']] = (target,clamps,width,value)
    functions.append(entry);print(json.dumps(entry),flush=True)
for r in rows:
    if 'full_cycle_advance_' not in r['name']:continue
    pos=P(r['historical_source']);block=old.pop(pos);assert block['id']==RED
    target,clamps,width,wanted=semantic_inputs[r['name']]
    try:
        got,_=settled_cone(old,target,clamps,width)
        assert got==wanted
    except(AssertionError,KeyError):negative.append({'name':r['name'],'mutation':'deleted original constant block','position':dict(zip('xyz',pos))})
    else:raise AssertionError('deleted original constant accepted')
    finally:old[pos]=block
pos=(660,253,-353);block=old[pos];assert block['id']==REP
old[pos]={**block,'properties':{**block['properties'],'facing':FLIP[block['properties']['facing']]}}
target,clamps,width,wanted=semantic_inputs['qualified_phase_to_owner_kind_open']
try:
    got,_=settled_cone(old,target,clamps,width)
    assert got==wanted
except(AssertionError,KeyError):negative.append({'name':'qualified_phase_to_owner_kind_open','mutation':'reversed original capture mask diode','position':dict(zip('xyz',pos))})
else:raise AssertionError('reversed original capture mask accepted')
finally:old[pos]=block
assert len(negative)==8


pin(Path(__file__).resolve())
report={'status':'historical_endpoint_actual_geometry_classification_only','original_actual_cells':len(old),'rows':rows,'actual_original_settled_functions':functions,'actual_block_mutations':negative,'source_sha256':PINS,'limits':['No old label is accepted as a live signal. This recovers actual mapped boundaries around historical coordinates only.','Actual original settled truth is recovered at mapped output boundaries; no new route/current equivalence, phase/event timing or physical execution is certified.','Bidirectional dust may return to the same terminal. Such reciprocal appearances must be resolved before choosing producers or consumers.'],'complete_core':False,'complete_gpu_layout':False,'world_mutations':0}
(HERE/'classification.json').write_text(json.dumps(report,indent=2)+'\n')
