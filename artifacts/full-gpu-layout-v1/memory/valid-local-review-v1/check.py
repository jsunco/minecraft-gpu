"""Read-only independent review of the matching-valid fanout and rerouted local memory cables.

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


pin(SOURCE / 'joined-valid-local-source-manifest.json', 'd63e42876d6ec2d8ef2adff0b7dc8b954fb29dd35cf67fe5972b35e2820e0eeb')
manifest = read(SOURCE / 'joined-valid-local-source-manifest.json')
for path, expected in manifest['source_sha256'].items():
    pin(ROOT / path, expected)
pin(BASE / 'core-four-lane-data-review-v1/check.py')
pin(BASE / 'memory/raw-shared-review-v1/source-manifest.json', '9d2a2c4bae35fec993b5b85bd9ede544b1f17540063b5a7cc140e146ee51723d')
pin(BASE / 'memory/owner-valid-v1/design.json')
lookup = read(BASE / 'memory/owner-valid-v1/design.json')
raw = read(BASE / 'memory/channel-payload-v1/design.json')
d = read(SOURCE / 'joined-valid-local-design.json')
parent = read(SOURCE / 'raw-shared-design.json')
world = {P(b['position']): b['block'] for b in d['blocks']}
before = {P(b['position']): b['block'] for b in parent['blocks']}
assert len(world) == len(d['blocks']) == 485408
assert len(before) == len(parent['blocks']) == 406076
for p, block in before.items():
    assert world[p] == block
assert store_map(before) == store_map(world)
stores = len(store_map(world))
added = set(world) - set(before)
assert len(added) == 79332
assert d['bindings'] == parent['bindings'] and d['columns'] == parent['columns']
assert d['direct'] == parent['direct'] and len(d['direct']) == 32
for row in d['direct']:
    assert P(row['source']) in inputs(world, P(row['destination']))
offset = {m['name']: P(m['offset']) for m in d['modules']}
for channel in range(4):
    for row in lookup['blocks']:
        assert world[ADD(P(row['position']), offset[f'owner_valid_{channel}'])] == row['block']
for p in added:
    block = world[p]
    assert solid(block) or block['id'] in (WIRE, REP, TORCH)
    if not solid(block):
        assert solid(world.get(ADD(p, DOWN)))


def valid_bindings(rows):
    seen = set()
    for row in rows:
        kind, consumer, channel = row['kind'], row['consumer'], row['channel']
        assert kind in ('read', 'write') and 0 <= consumer < 8 and 0 <= channel < 4
        key = kind, consumer, channel
        assert key not in seen
        seen.add(key)
        source = ADD(P(raw['ports'][kind + '_valid']['positions'][consumer]), offset['raw_selectors'])
        target = ADD(P(lookup['ports'][kind + '_valid']['positions'][consumer]), offset[f'owner_valid_{channel}'])
        assert P(row['source']) == source and P(row['destination']) == target
        assert world[source]['id'] == world[target]['id'] == WIRE
        # These are intentionally external inputs, not invented runtime values.
        assert not inputs(before, source)
        arrival = P(row['arrival'])
        assert world[arrival]['id'] == REP and ADD(arrival, vector(world[arrival])) == target
    assert len(seen) == 64


valid_bindings(d['validBindings'])
expected_locals = {c['name']: c for c in parent['localConnections']}
assert len(expected_locals) == len(d['connections']) == 64
for c in d['connections']:
    previous = expected_locals[c['name']]
    for key in ('source', 'destination', 'source_direction', 'arrival_direction', 'channel'):
        assert c[key] == previous[key]


def chain(nodes, w):
    assert len(set(nodes)) == len(nodes)
    run = maximum = delay = 0
    for i, p in enumerate(nodes):
        block = w[p]
        assert block['id'] in (WIRE, REP) and solid(w.get(ADD(p, DOWN)))
        if block['id'] == REP:
            assert 0 < i < len(nodes) - 1
            assert ADD(p, vector(block)) == nodes[i + 1]
            assert ADD(p, NEG(vector(block))) == nodes[i - 1]
            delay += 2 * int(block['properties']['delay'])
            run = 0
        else:
            run += 1
            maximum = max(maximum, run)
        if i:
            assert nodes[i - 1] in inputs(w, p), (nodes[i - 1], p)
    assert maximum <= 14
    return {'vertices': len(nodes), 'maximum_dust_vertices': maximum, 'nominal_diode_ticks': delay}


local_receipts = []
for c in d['connections']:
    nodes = [P(c['source']), P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    local_receipts.append({'name': c['name'], **chain(nodes, world)})
valid_receipts = []
for c in d['validBindings']:
    # The first node is the existing even-polarity column output solid's tap
    # repeater; validate its incoming torch dependency separately below.
    path = list(map(P, c['path'])) + list(reversed(list(map(P, c['tail']))))[1:]
    nodes = [P(c['tap'])] + path + [P(c['arrival']), P(c['destination'])]
    assert nodes[0] in inputs(world, nodes[1])
    assert ADD(nodes[0], vector(world[nodes[0]])) == nodes[1]
    valid_receipts.append({'name': c['name'], **chain(nodes[1:], world)})

# Independently rediscover the changed possible-input neighbourhood, including
# support-mediated connections into retained bodies and old payload cables.
affected = set()
for p in added:
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            for dz in range(-2, 3):
                q = ADD(p, (dx, dy, dz))
                if q in world and not solid(world[q]):
                    affected.add(q)
declared = defaultdict(set)
for e in d['edges']:
    a, b = P(e['from']), P(e['to'])
    declared[b].add(a)
    if world[a]['id'] == world[b]['id'] == WIRE:
        declared[a].add(b)
actual_inputs = {}
old_inputs_count = actual_inputs_count = 0
for p in affected:
    old = inputs(before, p)
    actual = inputs(world, p)
    assert actual == old | declared[p], (p, 'extra', list(actual - old - declared[p])[:4], 'lost', list((old | declared[p]) - actual)[:4])
    actual_inputs[p] = actual
    old_inputs_count += len(old)
    actual_inputs_count += len(actual)

part_positions = defaultdict(set)
for row in d['blocks']:
    if not solid(row['block']):
        part_positions[row.get('part')].add(P(row['position']))


def check_valid_tree(kind, consumer, w):
    rows = [r for r in d['validBindings'] if r['kind'] == kind and r['consumer'] == consumer]
    assert len(rows) == 4
    source = P(rows[0]['source'])
    targets = {P(r['destination']) for r in rows}
    keys = part_positions[f'matching_{kind}_valid_{consumer}'] | {source} | targets
    # Rediscover for each invocation so negative controls cannot use cached edges.
    graph = {p: set() for p in keys}
    for p in keys:
        for q in inputs(w, p) & keys:
            graph[q].add(p)
    state = {(source, 0)}
    todo = deque([(source, 0)])
    while todo:
        p, parity = todo.popleft()
        for q in graph[p]:
            new = q, parity ^ (w[q]['id'] == TORCH)
            if new not in state:
                state.add(new)
                todo.append(new)
    assert {p for p, bit in state} == keys, ('unreachable valid network', kind, consumer)
    assert all((p, 0) in state and (p, 1) not in state for p in targets)

    # Collapse only connected zero-delay dust. A directed cycle containing a
    # real repeater or torch must fail, even when it returns to the same net.
    leader = {p: p for p in keys}

    def find(p):
        while p != leader[p]:
            leader[p] = leader[leader[p]]
            p = leader[p]
        return p

    for p in keys:
        for q in graph[p]:
            if w[p]['id'] == w[q]['id'] == WIRE:
                leader[find(p)] = find(q)
    groups = {find(p) for p in keys}
    dag = {p: set() for p in groups}
    delay = {p: 0 for p in groups}
    for p in keys:
        a = find(p)
        delay[a] = 2 * int(w[p].get('properties', {}).get('delay', 1)) if w[p]['id'] == REP else (2 if w[p]['id'] == TORCH else delay[a])
        for q in graph[p]:
            b = find(q)
            if a != b:
                dag[a].add(b)
            else:
                assert w[p]['id'] == w[q]['id'] == WIRE
    indegree = Counter(b for adj in dag.values() for b in adj)
    ready = deque(p for p in groups if indegree[p] == 0)
    order = []
    while ready:
        p = ready.popleft()
        order.append(p)
        for q in dag[p]:
            indegree[q] -= 1
            if not indegree[q]:
                ready.append(q)
    assert len(order) == len(groups), ('positive device cycle', kind, consumer)
    source_group = find(source)
    earliest = {source_group: 0}
    latest = {source_group: 0}
    for p in order:
        if p not in latest:
            continue
        for q in dag[p]:
            earliest[q] = min(earliest.get(q, float('inf')), earliest[p] + delay[q])
            latest[q] = max(latest.get(q, 0), latest[p] + delay[q])
    return {'kind': kind, 'consumer': consumer, 'vertices': len(keys), 'delay_groups': len(groups), 'positive_device_cycles': 0, 'destinations': [{'channel': r['channel'], 'nominal_min_ticks': earliest[find(P(r['destination']))], 'nominal_max_ticks': latest[find(P(r['destination']))], 'inverted': False} for r in rows]}


valid_trees = [check_valid_tree(kind, consumer, world) for kind in ('read', 'write') for consumer in range(8)]
for c in d['validColumns']:
    low, high = P(c['base']), P(c['top'])
    assert high == ADD(low, (0, 212, 0))
    for n in range(213):
        block = world[ADD(low, (0, n, 0))]
        assert (block['id'] == TORCH) if n % 2 else solid(block)
assert len(d['validColumns']) == 32

negative = []


def refuse(label, fn):
    try:
        fn()
    except (AssertionError, KeyError):
        negative.append(label)
        return
    raise AssertionError('Corruption passed: ' + label)


for kind in ('read', 'write'):
    for consumer in range(8):
        row = next(r for r in d['validBindings'] if r['kind'] == kind and r['consumer'] == consumer)
        p = P(row['arrival'])
        old = world[p]
        world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
        refuse(f'{kind}{consumer}:reversed_terminal', lambda kind=kind, consumer=consumer: check_valid_tree(kind, consumer, world))
        world[p] = old
        col = next(c for c in d['validColumns'] if c['kind'] == kind and c['consumer'] == consumer)
        p = ADD(P(col['base']), (0, 1, 0))
        old = world[p]
        world[p] = {'id': WIRE}
        refuse(f'{kind}{consumer}:missing_inverter', lambda kind=kind, consumer=consumer: check_valid_tree(kind, consumer, world))
        world[p] = old
bad = [dict(r) for r in d['validBindings']]
bad[0]['consumer'] = 1
refuse('wrong_consumer_binding', lambda: valid_bindings(bad))
bad = [dict(r) for r in d['validBindings']]
bad[0]['kind'] = 'write'
refuse('read_write_binding_swap', lambda: valid_bindings(bad))
pin(Path(__file__).resolve())
report = {
    'status': 'independent_bounded_valid_local_geometry_review_pass',
    'cells': len(world), 'prior_raw_payload_cells_preserved': len(before),
    'added_valid_and_local_cells': len(added), 'preserved_side_lock_stores': stores,
    'unchanged_payload_destinations': 544, 'unchanged_adjacent_grants': 32,
    'rerouted_local_cables': 64, 'new_matching_valid_inputs': 16, 'new_valid_destinations': 64,
    'affected_receivers_independently_screened': len(affected),
    'preserved_affected_inputs': old_inputs_count, 'actual_affected_inputs': actual_inputs_count,
    'actual_local_and_receiving_chain_vertices': sum(r['vertices'] for r in local_receipts + valid_receipts),
    'checked_valid_trees': 16, 'positive_device_cycles': 0,
    'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': [
        'Preserves the exact prior raw-payload map and all its side-lock identities; all544 old payload bindings and32 adjacent grants are unchanged.',
        'Binds64 new validity endpoints directly to original consumer/kind/channel ports and checks all64 rerouted local cable bindings against the immutable partial parent.',
        'Independently rediscovers possible inputs in radius2 of all79332 additions, including old receivers and supports. New valid networks have even output polarity and no delayed-device cycles under this static concrete/wire/diode/torch model.',
        'All16 raw VALID source pads remain externally undriven. Graph reachability/nominal delay assumes the future master supplies the specified value and sufficient strength. No runtime eligibility is supplied by this checker.',
        'Old payload graph outside the changed neighbourhood remains covered by the previous bounded review and author check. Dust-shape pruning, events, burnout, pulse widths and physical timing are unverified.',
        '704 logical connections are not704 of944 immediate cut edges; full cut reconciliation, snapshot/claim/OPEN/bank/consumer/reset/tail geometry, complete timing and native acceptance remain open.'
    ], 'complete_fabric': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0,
}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'local_cables': local_receipts, 'valid_receiving_chains': valid_receipts, 'valid_trees': valid_trees, 'corruption_refusals': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256', 'limits')}))

