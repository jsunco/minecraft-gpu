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

pin(SOURCE / 'active-claims-source-manifest.json', '629c3cd00e09422fe5d5fc8f0c433cc93eeb42e204ba185e9849958e81ae7fdb')
manifest = read(SOURCE / 'active-claims-source-manifest.json')
for path, digest in manifest['source_sha256'].items(): pin(ROOT / path, digest)
pin(HERE.parent / 'phase-delivery-review-v1/check.py')
owner = read(SOURCE / 'owner-commit-design.json')
claims = read(SOURCE / 'active-claims-design.json')
parent = read(SOURCE / 'phase-delivery-design.json')
state = read(SOURCE / 'active-busy-design.json')['statePorts']
snapshot = read(SOURCE / 'free-snapshot-design.json')['snapshotPorts']
retention = read(HERE.parent / 'channel-retention-v1/design.json')
world, before, owner_world = block_map(claims), block_map(parent), block_map(owner)
assert (len(world), len(before), len(owner_world)) == (566595, 527208, 531851)
assert all(world[p] == b for p, b in before.items())
assert all(world[p] == b for p, b in owner_world.items())
assert store_map(world) == store_map(before)
assert len(store_map(world)) == 144
assert parent['box'] == owner['box'] == claims['box']
assert {(g['channel'], g['consumer']) for g in claims['gates']} == {(c, i) for c in range(4) for i in range(8)}
assert {o['channel'] for o in owner['channels']} == set(range(4))
assert {c['consumer'] for c in claims['collectors']} == set(range(8))
assert len(owner['connections']) == 9 and len(claims['connections']) == 76
owner_rows = {(r['channel'], r['consumer']): r for r in owner['owners']}
def validate_gate_source(g):
    row = owner_rows[g['channel'], g['consumer']]
    assert g['owner_source'] == row['positive']
    assert g['inactive_source'] == state[str(g['channel'])]['inactive']

for g in claims['gates']:
    validate_gate_source(g)
    row = owner_rows[g['channel'], g['consumer']]
    assert g['owner_source'] == row['positive']
    assert g['inactive_source'] == state[str(g['channel'])]['inactive']
    p, rear, side = map(lambda k: P(g[k]), ('gate', 'rear', 'side'))
    assert world[p]['id'] == COMP and world[p]['properties']['mode'] == 'subtract'
    assert rear == ADD(p, NEG(vector(world[p])))
    assert world[rear]['id'] == REP and world[side]['id'] == REP
    assert emits(world, rear, p) and emits(world, side, p)
for row in owner['channels']:
    assert row['set'] == state[str(row['channel'])]['set']
for row in claims['collectors']:
    assert row['snapshot'] == snapshot['claimed_' + str(row['consumer'])]
phase_source = P(retention['masterPorts']['open_response'])
assert P(owner['columns'][0]['sourcePad']) == phase_source

expected = defaultdict(set)
for p, block in before.items():
    if not solid(block): expected[p].update(inputs(before, p))
preserved = sum(map(len, expected.values()))
for d in (owner, claims):
    for e in d['edges']:
        a, b = P(e['from']), P(e['to']); expected[b].add(a)
        if world[a]['id'] == world[b]['id'] == WIRE: expected[a].add(b)
actual = {}
for p, block in world.items():
    if block['id'] in (WIRE, REP, COMP, TORCH): assert solid(world.get(ADD(p, DOWN))), ('support', p)
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


connections = owner['connections'] + claims['connections']
routes = [chain(c, world) for c in connections]


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

semantic = []
for ch in range(4):
    full = (1 << 512) - 1
    clamps = {P(owner_rows[ch, i]['source']): full ^ variable(i, 9) for i in range(8)}
    clamps[phase_source] = variable(8, 9)
    endpoint = P(next(r for r in owner['channels'] if r['channel'] == ch)['set'])
    got, evidence = settled_cone(world, endpoint, clamps, 512)
    wanted = variable(8, 9) & sum(1 << a for a in range(512) if a & 255)
    assert got == wanted, ('owner SET truth', ch, (got ^ wanted).bit_count())
    semantic.append({'kind': 'owner_phase_SET', 'channel': ch, 'assignments': 512, **evidence})
for consumer in range(8):
    full = (1 << 256) - 1
    clamps = {P(owner_rows[ch, consumer]['source']): full ^ variable(ch, 8) for ch in range(4)}
    clamps.update({P(state[str(ch)]['inactive']): full ^ variable(ch + 4, 8) for ch in range(4)})
    endpoint = P(snapshot['claimed_' + str(consumer)])
    got, evidence = settled_cone(world, endpoint, clamps, 256)
    wanted = sum(1 << a for a in range(256) if (a & 15) & ((a >> 4) & 15))
    assert got == wanted, ('claim truth', consumer, (got ^ wanted).bit_count())
    semantic.append({'kind': 'consumer_claim', 'consumer': consumer, 'assignments': 256, **evidence})

negative = []
for c in connections:
    p = P(c['arrival']); old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    try: chain(c, world)
    except (AssertionError, KeyError): negative.append(c['name'] + ':reverse')
    else: raise AssertionError('corruption passed ' + c['name'])
    finally: world[p] = old
# Wrong channel metadata is independently refused by the same binding check.
for g in claims['gates']:
    bad = {**g, 'inactive_source': state[str((g['channel'] + 1) % 4)]['inactive']}
    try: validate_gate_source(bad)
    except AssertionError: negative.append('wrong_inactive_channel_' + str(g['channel']) + '_' + str(g['consumer']))
    else: raise AssertionError('wrong-channel metadata accepted')

def reversed_mask_refused(name, p, output, clamps, width, wanted):
    old = world[p]
    assert old['id'] == REP
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    try:
        got, _ = settled_cone(world, output, clamps, width)
        assert got == wanted, 'settled truth differs after mask corruption'
    except (AssertionError, KeyError): negative.append(name)
    else: raise AssertionError('mask corruption accepted: ' + name)
    finally: world[p] = old

for g in claims['gates']:
    consumer = g['consumer']; full = (1 << 256) - 1
    clamps = {P(owner_rows[ch, consumer]['source']): full ^ variable(ch, 8) for ch in range(4)}
    clamps.update({P(state[str(ch)]['inactive']): full ^ variable(ch + 4, 8) for ch in range(4)})
    wanted = sum(1 << a for a in range(256) if (a & 15) & ((a >> 4) & 15))
    reversed_mask_refused('inactive_mask_' + str(g['channel']) + '_' + str(consumer), P(g['side']), P(snapshot['claimed_' + str(consumer)]), clamps, 256, wanted)
for c in owner['channels']:
    ch = c['channel']; full = (1 << 512) - 1
    clamps = {P(owner_rows[ch, i]['source']): full ^ variable(i, 9) for i in range(8)}
    clamps[phase_source] = variable(8, 9)
    wanted = variable(8, 9) & sum(1 << a for a in range(512) if a & 255)
    reversed_mask_refused('commit_mask_' + str(ch), P(c['not_commit']), P(c['set']), clamps, 512, wanted)
pin(Path(__file__).resolve())
report = {'status': 'independent_memory_owner_commit_and_claim_geometry_settled_logic_pass',
    'cells': len(world), 'parent_cells_preserved': len(before), 'added_cells': len(world) - len(before),
    'side_lock_stores_preserved': len(store_map(world)), 'new_state': 0,
    'full_receivers_independently_screened': len(actual), 'preserved_inputs': preserved,
    'actual_inputs': sum(map(len, actual.values())), 'actual_cables': len(routes),
    'route_vertices': sum(r['vertices'] for r in routes), 'minimum_rear': min(r['minimum_rear'] for r in routes),
    'settled_cones': semantic, 'settled_assignments': sum(r['assignments'] for r in semantic),
    'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': ['Static inputs, support, direction, cable attenuation and settled combinational logic only. No event simulation, pulse width, rise/fall skew, setup/hold, burnout or cold/retirement proof.',
               'Truth boundaries are 32 actual inverted retained-owner exports, the actual admission commit export, and four actual inactive exports. The owner stores and ACTIVE SR dynamics themselves are not simulated by clamping these boundary signals.',
               'Wire components carry Boolean OR only after separate cable strength checking. Regenerating diodes qualify every comparator rear and side within these cones. This does not validate arbitrary analog circuits.',
               'All original parent cells/stores preserved; missing bank/consumer/loading/master routes and the 944-cut ledger remain required. No complete fabric, GPU, compactness selection or native acceptance.'],
    'complete_fabric': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'routes': routes, 'negative_cases': negative}, indent=2) + '\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('source_sha256','limits','settled_cones')}))
