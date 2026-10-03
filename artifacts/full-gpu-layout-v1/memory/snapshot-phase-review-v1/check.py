"""Read-only independent review of the snapshot and admission-phase geometry.

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


pin(SOURCE / 'snapshot-phase-source-manifest.json', 'a90361628a17a4dbdb1161f294d7ca4dd80a06a3e78c664ea12bf313d355ac43')
manifest = read(SOURCE / 'snapshot-phase-source-manifest.json')
for path, expected in manifest['source_sha256'].items():
    pin(ROOT / path, expected)
pin(HERE.parent / 'valid-local-review-v1/check.py')
pin(HERE.parent / 'valid-local-review-v1/source-manifest.json', '3fffe237c113d9094782bdb473d92824229ad377323adb7a1e2200e6975d6ec2')
d = read(SOURCE / 'snapshot-phase-design.json')
free = read(SOURCE / 'free-snapshot-design.json')
parent = read(SOURCE / 'joined-valid-local-design.json')
retention = read(HERE.parent / 'channel-retention-v1/design.json')
raw = read(HERE.parent / 'channel-payload-v1/design.json')
sb = read(SOURCE / 'free-snapshot-body.json')
ab = read(SOURCE / 'snapshot-phase-body.json')
world, before = block_map(d), block_map(parent)
snapshot, admission = block_map(sb), block_map(ab)
assert len(world) == 501897 and len(before) == 485408
assert len(snapshot) == 642 and len(admission) == 8829
assert all(world[p] == b for p, b in before.items())
assert all(world[p] == b for p, b in snapshot.items())
assert all(world[p] == b for p, b in admission.items())
assert not (set(snapshot) & set(before) or set(admission) & (set(before) | set(snapshot)))
expected_snapshot = {ADD(P(r['position']), (0, -40, -20)): r['block'] for r in retention['blocks']
                     if retention['groups'][','.join(str(r['position'][a]) for a in 'xyz')] in ('free_request_snapshot', 'snapshot_hold')}
assert expected_snapshot == snapshot
expected_admission = {P(r['position']): r['block'] for r in retention['blocks']
                      if retention['groups'][','.join(str(r['position'][a]) for a in 'xyz')] == 'admission_sequencer'}
assert len(expected_admission) == 8829
repair = (337, -19, 332)
cold_change = (521, -31, 350)
assert expected_admission[repair] == {'id': WIRE}
assert expected_admission[cold_change] == {'id': WALL, 'properties': {'facing': 'east'}}
expected_admission[cold_change] = {'id': 'minecraft:light_gray_concrete'}
original_admission = dict(expected_admission)
expected_admission[repair] = {'id': REP, 'properties': {'facing': 'east', 'delay': '1'}}
assert expected_admission == admission
original_parent, original_parent_cells = stream_selected_blocks(HERE.parent / 'master-cold-compatible-v2/design.json', set(admission))
assert original_parent == original_admission
assert original_parent_cells == 3381962
assert ab['ports'] == d['phasePorts'] == retention['masterPorts']
old_stores = store_map(before)
new_stores = store_map(world)
expected_stores = {**old_stores, **store_map(snapshot), **store_map(admission)}
assert new_stores == expected_stores
assert len(store_map(snapshot)) == 8
added = set(world) - set(before)
for p in added:
    if world[p]['id'] in (WIRE, REP, COMP, TORCH):
        assert solid(world.get(ADD(p, DOWN))), ('unsupported', p)


def chain(nodes, w):
    assert len(set(nodes)) == len(nodes)
    power, delay, minimum = 15, 0, 15
    for i, p in enumerate(nodes):
        b = w[p]
        assert b['id'] in (WIRE, REP) and solid(w.get(ADD(p, DOWN)))
        if i:
            assert nodes[i - 1] in inputs(w, p), ('broken path', nodes[i - 1], p)
        if b['id'] == REP:
            if i:
                assert ADD(p, NEG(vector(b))) == nodes[i - 1]
                minimum = min(minimum, power)
                assert power > 0, ('dead rear', p)
            if i + 1 < len(nodes):
                assert ADD(p, vector(b)) == nodes[i + 1]
            power = 15
            delay += 2 * int(b['properties']['delay'])
        elif i and w[nodes[i - 1]]['id'] == WIRE:
            power = max(0, power - 1)
    return {'vertices': len(nodes), 'nominal_diode_ticks': delay, 'minimum_repeater_rear': minimum, 'last_power': power}


def check_binding(c):
    kind, i = c['kind'], c['consumer']
    assert kind in ('read', 'write') and 0 <= i < 8
    raw_offset = P(next(m['offset'] for m in parent['modules'] if m['name'] == 'raw_selectors'))
    assert P(c['raw_source']) == ADD(P(raw['ports'][kind + '_valid']['positions'][i]), raw_offset)
    col = next(v for v in parent['validColumns'] if v['kind'] == kind and v['consumer'] == i and v['side'] == 0)
    low, source = P(col['base']), P(c['source'])
    assert (source[0], source[2]) == (low[0], low[2])
    assert source[1] > low[1] and source[1] < P(col['top'])[1]
    assert (source[1] - low[1] + 1) % 4 == 0  # even number of actual torch inversions
    for y in range(low[1], source[1] + 1):
        b = world[(low[0], y, low[2])]
        assert b['id'] == TORCH if (y - low[1]) % 2 else solid(b)
    assert source in inputs(world, P(c['tap']))
    assert P(c['destination']) == (5 * i, -39, -54 if kind == 'read' else -50)
    assert P(c['destination']) in snapshot


assert len(free['connections']) == 16
assert {(c['kind'], c['consumer']) for c in free['connections']} == {(k, i) for k in ('read', 'write') for i in range(8)}
routes = []
route_nodes = []
for c in free['connections']:
    check_binding(c)
    nodes = [P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    routes.append({'name': c['name'], **chain(nodes, world)})
    route_nodes.append(nodes)
assert len(d['connections']) == 1
phase = d['connections'][0]
assert P(phase['source']) == P(retention['masterPorts']['open_owner'])
assert P(phase['destination']) == P(sb['ports']['open_snapshot']) == (-8, -43, -30)
phase_nodes = [P(phase['source']), P(phase['tap'])] + list(map(P, phase['path'])) + [P(phase['arrival']), P(phase['destination'])]
routes.append({'name': phase['name'], **chain(phase_nodes, world)})
route_nodes.append(phase_nodes)
assert len(free['direct']) == 8
for i, row in enumerate(free['direct']):
    assert row['consumer'] == i and P(row['source']) == (5 * i, -39, -28) and P(row['destination']) == (5 * i, -39, -27)
    assert P(row['source']) in snapshot and P(row['destination']) in before
    assert P(row['source']) in inputs(world, P(row['destination']))

# Compare the actual full composition against isolated actual bodies and the
# exact preserved parent. Claimed edges only authorize contacts; they cannot
# establish their existence or excuse any additional same-net contact.
expected = defaultdict(set)
for piece in (before, snapshot, admission):
    for p, b in piece.items():
        if not solid(b):
            expected[p].update(inputs(piece, p))
declared_count = 0
for item in (free, d):
    for e in item['edges']:
        a, b = P(e['from']), P(e['to'])
        expected[b].add(a)
        if world[a]['id'] == world[b]['id'] == WIRE:
            expected[a].add(b)
        declared_count += 1
actual = {}
for p, b in world.items():
    if not solid(b):
        found = inputs(world, p)
        assert found == expected[p], (p, 'extra', list(found - expected[p])[:5], 'lost', list(expected[p] - found)[:5])
        actual[p] = found

# Discover the old attenuation failure from blocks and actual possible inputs,
# rather than trusting the author's reported rear strength.
reset_nodes = [(x, -19, 332) for x in range(347, 324, -1)]
assert len(reset_nodes) == 23
for w in (original_admission, admission):
    for index, p in enumerate(reset_nodes[1:], 1):
        allowed = {reset_nodes[index - 1]}
        if index + 1 < len(reset_nodes) and w[p]['id'] == w[reset_nodes[index + 1]]['id'] == WIRE:
            allowed.add(reset_nodes[index + 1])
        # A diode can prevent the reverse wire dependency at its rear.
        assert inputs(w, p) == allowed, (p, inputs(w, p), allowed)
assert all(original_admission[p]['id'] == WIRE for p in reset_nodes[1:-1])
reset_repaired = chain(reset_nodes, admission)
assert reset_repaired['minimum_repeater_rear'] == 5
assert sum(admission[p]['id'] == REP for p in reset_nodes) == 3
assert sum(original_admission[p]['id'] == REP for p in reset_nodes) == 2
assert 15 - (21 - 1) < 1

# Source-specific static reachability of the OPEN network to all eight actual
# locks, with actual dust components collapsed before directed-cycle checking.
phase_keys = {p for p in snapshot if not solid(snapshot[p])} | set(phase_nodes)
start = P(phase['source'])
graph = {p: set() for p in phase_keys}
for p in phase_keys:
    for q in actual[p] & phase_keys:
        graph[q].add(p)
reached, queue = {start}, deque([start])
while queue:
    for q in graph[queue.popleft()]:
        if q not in reached:
            reached.add(q); queue.append(q)
locks = [P(r['lock']) for r in sb['stores']]
assert len(locks) == 8 and all(p in reached for p in locks)
leader = {p: p for p in reached}
def find(p):
    while leader[p] != p:
        leader[p] = leader[leader[p]]; p = leader[p]
    return p
for p in reached:
    for q in graph[p]:
        if world[p]['id'] == world[q]['id'] == WIRE:
            leader[find(p)] = find(q)
dag = {find(p): set() for p in reached}
for p in reached:
    for q in graph[p]:
        a, b = find(p), find(q)
        if a != b:
            dag[a].add(b)
        else:
            assert world[p]['id'] == world[q]['id'] == WIRE
indegree = Counter(b for neighbours in dag.values() for b in neighbours)
ready = deque(p for p in dag if not indegree[p]); ordered = []
while ready:
    p = ready.popleft(); ordered.append(p)
    for q in dag[p]:
        indegree[q] -= 1
        if not indegree[q]: ready.append(q)
assert len(ordered) == len(dag), 'positive-device cycle in the reached OPEN network'

negative = []
def refuse(label, fn):
    try: fn()
    except (AssertionError, KeyError):
        negative.append(label); return
    raise AssertionError('Corruption passed: ' + label)
for row, nodes in zip(free['connections'] + d['connections'], route_nodes):
    p = P(row['arrival']); old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    refuse(row['name'] + ':reversed_arrival', lambda nodes=nodes: chain(nodes, world))
    world[p] = old
refuse('original21wire_reset_run', lambda: chain(reset_nodes, original_admission))
refuse('wrong_read_consumer', lambda: check_binding({**free['connections'][0], 'consumer': 1}))
refuse('read_write_swap', lambda: check_binding({**free['connections'][0], 'kind': 'write'}))
pin(Path(__file__).resolve())
report = {
    'status': 'independent_snapshot_phase_static_geometry_review_pass',
    'cells': len(world), 'prior_cells_exactly_preserved': len(before), 'new_cells': len(added),
    'source_exact_snapshot_cells': len(snapshot), 'source_exact_admission_cells': len(admission),
    'actual_large_parent_cells_streamed': original_parent_cells,
    'actual_large_parent_changes': [{'position': dict(zip('xyz', repair)), 'before': original_parent[repair], 'after': admission[repair]}],
    'side_lock_stores': len(new_stores), 'prior_side_lock_stores': len(old_stores), 'added_snapshot_stores': 8,
    'raw_valid_feeds': 16, 'direct_allocator_feeds': 8, 'open_phase_cables': 1,
    'independently_screened_full_receivers': len(actual), 'actual_possible_inputs': sum(map(len, actual.values())),
    'route_vertices': sum(r['vertices'] for r in routes), 'minimum_route_rear': min(r['minimum_repeater_rear'] for r in routes),
    'open_reached_vertices': len(reached), 'open_reached_locks': len(locks), 'open_positive_device_cycles': 0,
    'repaired_reset_path': reset_repaired, 'old_reset_rear_maximum': 0, 'nominal_reset_added_ticks': 2,
    'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': [
        'Static possible-input geometry, exact bodies, even-polarity raw-valid taps, source-specific endpoints and wire attenuation only. No author generator or electrical helper executed.',
        'The full541MB cold-compatible parent was parsed and its8829 actual admission cells compared; the only change against it is the337,-19,332 refresh. The earlier521,-31,350 startup-source removal is already present in that parent.',
        'The OPEN reachability screen includes actual supports, directions and side locks, collapsing only zero-delay dust. It is not event, pulse, torch-burnout or native timing simulation.',
        'Eight claim pads, raw master sources, reset, ACTIVE/busy/commit control, bank/consumer returns and full944-cut reconciliation remain incomplete. Existing unrelated possible-input edges are preserved, not certified semantically.',
        'Parent704logicaljoins and944original electrical cuts are different accounting units. No whole-fabric completion, saving or compactness acceptance is claimed.'
    ],
    'complete_fabric': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0,
}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'routes': routes, 'corruption_refusals': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256', 'limits', 'actual_large_parent_changes')}))
