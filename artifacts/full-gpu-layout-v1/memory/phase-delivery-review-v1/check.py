"""Read-only independent review of the shared memory phase distribution geometry.

The checker never executes author generators or author electrical helpers. Its
possible-input model is a static screen for this concrete/wire/diode palette,
not Minecraft event simulation. All changes are in-memory negative controls.
"""
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


pin(SOURCE / 'phase-delivery-source-manifest.json', '6d3af957c4563697e0d9c346b56d0255dbc4960232011a411f654b4f61ecff78')
manifest = read(SOURCE / 'phase-delivery-source-manifest.json')
for path, digest in manifest['source_sha256'].items(): pin(ROOT / path, digest)
pin(HERE.parent / 'snapshot-phase-review-v1/check.py')
d = read(SOURCE / 'phase-delivery-design.json')
parent = read(SOURCE / 'active-busy-design.json')
retention = read(HERE.parent / 'channel-retention-v1/design.json')
world, before = block_map(d), block_map(parent)
assert len(world) == 527208 and len(before) == 507085
assert all(world[p] == b for p, b in before.items())
assert store_map(world) == store_map(before)
new = set(world) - set(before)
assert len(new) == 20123
assert len(d['columns']) == 5 and len(d['connections']) == 29 and len(d['bindings']) == 24
sources = {'snapshot': 'open_owner', 'owners': 'open_address', 'payload': 'write_phase', 'barrier': 'active', 'reset': 'blocked'}
roles = {'snapshot': ('snapshot_base',), 'owners': ('owner_phase_base',), 'payload': ('payload_phase_base',), 'barrier': ('barrier_base',), 'reset': ('reset_clear_base', 'reset_set_base')}
assert {c['name'] for c in d['columns']} == set(sources)
expected_bindings = {(phase, channel, role) for phase in roles for channel in range(4) for role in roles[phase]}


def bindings(rows):
    assert {(b['phase'], b['channel'], b['role']) for b in rows} == expected_bindings
    for b in rows:
        col = next(c for c in d['columns'] if c['name'] == b['phase'])
        assert b['base'] == parent['statePorts'][str(b['channel'])][b['role']]
        assert P(b['destination']) == ADD(P(b['base']), UP)
        assert solid(world[P(b['base'])]) and world[P(b['destination'])]['id'] == TORCH
        source, pad, low = P(b['source']), P(b['sourcePad']), P(col['base'])
        assert source == ADD(pad, DOWN) and pad[0] == low[0] and pad[2] == low[2]
        assert (pad[1] - low[1]) % 4 == 0 and low[1] < pad[1] <= P(col['top'])[1]


bindings(d['bindings'])
for c in d['columns']:
    assert c['sourcePad'] == retention['masterPorts'][sources[c['name']]]
    feed = next(r for r in d['connections'] if r['name'] == 'source_to_' + c['name'])
    assert feed['sourcePad'] == c['sourcePad']
    pad = P(c['sourcePad'])
    actual_source = ADD(pad, DOWN) if solid(before[pad]) else pad
    assert P(feed['source']) == actual_source
    if solid(before[pad]): assert before[actual_source]['id'] == TORCH
    assert actual_source in inputs(world, P(feed['tap']))
    lo, hi = P(c['base']), P(c['top'])
    assert hi == ADD(lo, (0, 200, 0))
    for y in range(lo[1], hi[1] + 1):
        block = world[(lo[0], y, lo[2])]
        assert block['id'] == TORCH if (y - lo[1]) % 2 else solid(block)

expected = defaultdict(set)
for p, block in before.items():
    if not solid(block): expected[p].update(inputs(before, p))
preserved = sum(map(len, expected.values()))
for e in d['edges']:
    a, b = P(e['from']), P(e['to']); expected[b].add(a)
    if world[a]['id'] == world[b]['id'] == WIRE: expected[a].add(b)
actual = {}
for p, block in world.items():
    if block['id'] in (WIRE, REP, COMP, TORCH): assert solid(world.get(ADD(p, DOWN)))
    if not solid(block):
        found = inputs(world, p)
        assert found == expected[p], (p, 'extra', list(found - expected[p])[:4], 'lost', list(expected[p] - found)[:4])
        actual[p] = found


def chain(c, w):
    nodes = [P(c['source']), P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    assert len(nodes) == len(set(nodes))
    power, minimum, delay = 15, 15, 0
    for i, p in enumerate(nodes[1:], 1):
        b = w[p]
        assert nodes[i - 1] in inputs(w, p), ('broken edge', nodes[i - 1], p)
        if b['id'] == REP:
            minimum = min(minimum, power); assert power > 0
            power = 15; delay += 2 * int(b['properties']['delay'])
        elif b['id'] == WIRE:
            if w[nodes[i - 1]]['id'] == WIRE: power -= 1
            assert power > 0
        else:
            assert i == len(nodes) - 1 and b['id'] == TORCH
    return {'name': c['name'], 'vertices': len(nodes), 'minimum_rear': minimum, 'nominal_cable_diode_ticks': delay}


route_receipts = [chain(c, world) for c in d['connections']]
part_keys = defaultdict(set)
for row in d['blocks']:
    if not solid(row['block']): part_keys[row.get('part')].add(P(row['position']))


def tree(column, w):
    phase = column['name']
    rows = [b for b in d['bindings'] if b['phase'] == phase]
    source = P(next(c for c in d['connections'] if c['name'] == 'source_to_' + phase)['source'])
    keys = part_keys['shared_phase_' + phase] | {source} | {P(b['destination']) for b in rows}
    graph = {p: set() for p in keys}
    for p in keys:
        for q in inputs(w, p) & keys: graph[q].add(p)
    reached, queue = {(source, 0)}, deque([(source, 0)])
    while queue:
        p, parity = queue.popleft()
        for q in graph[p]:
            state = q, parity ^ (w[q]['id'] == TORCH)
            if state not in reached: reached.add(state); queue.append(state)
    assert {p for p, _ in reached} == keys, ('unreachable tree body', phase)
    for b in rows:
        assert (P(b['arrival']), 0) in reached and (P(b['arrival']), 1) not in reached
        assert (P(b['destination']), 1) in reached and (P(b['destination']), 0) not in reached
    leaders = {p: p for p in keys}
    def find(p):
        while leaders[p] != p: leaders[p] = leaders[leaders[p]]; p = leaders[p]
        return p
    for p in keys:
        for q in graph[p]:
            if w[p]['id'] == w[q]['id'] == WIRE: leaders[find(p)] = find(q)
    dag = {find(p): set() for p in keys}
    for p in keys:
        for q in graph[p]:
            a, b = find(p), find(q)
            if a == b: assert w[p]['id'] == w[q]['id'] == WIRE
            else: dag[a].add(b)
    indegree = Counter(q for adj in dag.values() for q in adj)
    queue = deque(p for p in dag if not indegree[p]); count = 0
    while queue:
        p = queue.popleft(); count += 1
        for q in dag[p]:
            indegree[q] -= 1
            if not indegree[q]: queue.append(q)
    assert count == len(dag), ('delayed-device cycle', phase)
    return {'phase': phase, 'vertices': len(keys), 'recipients': len(rows), 'positive_arrivals': len(rows), 'first_receiving_torch_inversions': len(rows), 'delayed_device_cycles': 0}


trees = [tree(c, world) for c in d['columns']]
negative = []
def refuse(name, fn):
    try: fn()
    except (AssertionError, KeyError): negative.append(name); return
    raise AssertionError('Corruption passed: ' + name)
for c in d['connections']:
    p = P(c['arrival']); old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    refuse(c['name'] + ':reverse', lambda c=c: chain(c, world)); world[p] = old
for c in d['columns']:
    p = ADD(P(c['base']), UP); old = world[p]; world[p] = {'id': WIRE}
    refuse(c['name'] + ':missing_inversion', lambda c=c: tree(c, world)); world[p] = old
bad = [dict(b) for b in d['bindings']]; bad[0]['channel'] = 1
refuse('wrong_channel', lambda: bindings(bad))
bad = [dict(b) for b in d['bindings']]; bad[0]['role'] = 'owner_phase_base'
refuse('wrong_phase_role', lambda: bindings(bad))
pin(Path(__file__).resolve())
report = {'status': 'independent_shared_memory_phase_geometry_pass', 'cells': len(world), 'parent_cells_preserved': len(before),
    'added_cells': len(new), 'side_lock_stores_preserved': len(store_map(world)), 'new_state': 0,
    'full_receivers_independently_screened': len(actual), 'preserved_inputs': preserved, 'actual_inputs': sum(map(len, actual.values())),
    'actual_cables': len(route_receipts), 'route_vertices': sum(c['vertices'] for c in route_receipts), 'minimum_rear': min(c['minimum_rear'] for c in route_receipts),
    'shared_phase_trees': trees, 'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': ['Exact preserved507085-cell parent and new20123-cell phase distribution only; active/busy body semantics remain under their earlier author checks.',
               'Five phase sources bind to original admission ports and24 destination bases bind to the current actual channel state bodies. The first receiving torch deliberately inverts the positive normalized arrival.',
               'Full static possible-input differential and actual phase-tree parity/support/direction/attenuation checks do not prove pulse widths, scheduling, burnout, setup/hold or complete controller sequencing.',
               'Commit/claim producers, master/reset deliveries, bank/consumer/tails/loading and full944cut closure remain incomplete. No wholefabric saving or fullmachine acceptance claimed.'],
    'complete_fabric': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'routes': route_receipts, 'negative_cases': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256','limits')}))
