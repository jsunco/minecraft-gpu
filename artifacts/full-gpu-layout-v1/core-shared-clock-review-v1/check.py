"""Read-only independent review of the shared clock and RF cadence geometry.

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
SOURCE = BASE / 'core-lane-colocation-v1/shared-clock-v1'
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


pin(SOURCE / 'source-manifest.json', '4af03564caa111f11c06438e05e30e4160aea61ebffb4d9bafc2a0f49fd1822e')
manifest = read(SOURCE / 'source-manifest.json')
for path, expected in manifest['source_sha256'].items(): pin(ROOT / path, expected)
pin(BASE / 'memory/snapshot-phase-review-v1/check.py')
pin(BASE / 'core-shared-spine-review-v1/source-manifest.json', '5798a3372e2da1d73b04ebb160b4aeb3b55bfba107a1093909f14dac35872971')
d = read(SOURCE / 'design.json')
parent = read(SOURCE.parent / 'shared-spine-v1/design.json')
inventory = read(SOURCE.parent / 'shared-state-inventory-v1/bodies.json')
group = next(g for g in inventory['groups'] if g['name'] == 'shared_clock_scanner')
seed = read(BASE / 'startup-scan-v1/clock/design.json')
old_body = block_map(group)
actual_source, source_cells = stream_selected_blocks(BASE / 'compact-core-guard-v1/design.json', set(old_body))
assert actual_source == old_body and len(old_body) == 10543
assert source_cells == 1828787
delta, origin = (320, -193, -162), (620, 40, -410)
assert P(d['clock_transform']['delta']) == delta and P(d['clock_transform']['translation']) == origin
clock = {ADD(p, delta): b for p, b in old_body.items()}
world, before = block_map(d), block_map(parent)
assert len(world) == 700113 and len(before) == 685953
assert not set(clock) & set(before)
assert all(world[p] == b for p, b in {**before, **clock}.items())
old_stores, clock_stores, new_stores = store_map(before), store_map(clock), store_map(world)
assert len(old_stores) == 986 and len(clock_stores) == 14 and len(new_stores) == 1000
assert new_stores == {**old_stores, **clock_stores}
for name, port in seed['ports'].items():
    transformed = d['ports']['shared_clock'][name]
    assert transformed['width'] == port['width'] and transformed['direction'] == port['direction']
    for a, b in zip(port['bits'], transformed['bits']):
        assert a['bit'] == b['bit'] and ADD(P(a['position']), origin) == P(b['position'])
        if 'source' in a: assert ADD(P(a['source']), origin) == P(b['source'])
assert d['ports']['rf_control'] == parent['ports']['rf_control']
expected = defaultdict(set)
for piece in (before, clock):
    for p, b in piece.items():
        if not solid(b): expected[p].update(inputs(piece, p))
preserved = sum(map(len, expected.values()))
for e in d['edges']:
    a, b = P(e['from']), P(e['to'])
    expected[b].add(a)
    if world[a]['id'] == world[b]['id'] == WIRE: expected[a].add(b)
actual = {}
for p, b in world.items():
    if b['id'] in (WIRE, REP, COMP, TORCH): assert solid(world.get(ADD(p, DOWN)))
    if not solid(b):
        found = inputs(world, p)
        assert found == expected[p], (p, 'extra', list(found - expected[p])[:5], 'lost', list(expected[p] - found)[:5])
        actual[p] = found


def cable(row, w):
    phase = 'a' if row['name'] == 'shared_phase_a_to_RF' else 'b'
    assert P(row['source']) == ADD(P(seed['ports']['phase_' + phase]['bits'][0]['position']), origin)
    assert row['destination'] == parent['ports']['rf_control']['phase_' + phase]['bits'][0]['position']
    nodes = [P(row['source']), P(row['tap'])] + list(map(P, row['path'])) + [P(row['arrival']), P(row['destination'])]
    assert len(set(nodes)) == len(nodes)
    power, minimum, ticks = 15, 15, 0
    for i, p in enumerate(nodes[1:], 1):
        b = w[p]
        assert nodes[i - 1] in inputs(w, p), ('broken actual cable edge', nodes[i - 1], p)
        if b['id'] == REP:
            minimum = min(minimum, power); assert power > 0
            power = 15; ticks += 2 * int(b['properties']['delay'])
        else:
            assert b['id'] == WIRE
            if w[nodes[i - 1]]['id'] == WIRE: power -= 1
            assert power > 0
    return {'phase': phase, 'vertices': len(nodes), 'minimum_rear': minimum, 'arrival_power': power, 'nominal_cable_ticks': ticks}


assert {c['name'] for c in d['connections']} == {'shared_phase_a_to_RF', 'shared_phase_b_to_RF'}
routes = [cable(c, world) for c in d['connections']]
constant = d['constant']
assert world[P(constant['source'])] == {'id': RED}
assert constant['destination'] == parent['ports']['rf_control']['bank_permit']['bits'][0]['position']
assert inputs(world, P(constant['driver'])) == {P(constant['source'])}
assert P(constant['driver']) in inputs(world, P(constant['destination']))

# Recompute source-specific clock reach. Cutting incoming storage edges here
# prevents the question from following stored DATA feedback as a clock route.
# It is explicitly not a proof of actual data/clock timing.
def clock_reach(w, phase):
    adj = defaultdict(set)
    for p, b in clock.items():
        if p in clock_stores or solid(b): continue
        for q in inputs(w, p): adj[q].add(p)
    start = ADD(P(seed['ports']['phase_' + phase]['bits'][0]['position']), origin)
    found, queue = {start}, deque([start])
    while queue:
        for p in adj[queue.popleft()]:
            if p not in found: found.add(p); queue.append(p)
    return found


# Original scanner layout identifies NEXT at localx2 and CURRENT atlocalx14;
# READY follows the same pair at localx-40/-28. These are actual old positions.
phase_locks = {k: set() for k in ('a', 'b')}
for p, locks in store_map(old_body).items():
    assert p[0] in (302, 314, 260, 272)
    phase_locks['a' if p[0] in (302, 260) else 'b'].update(ADD(q, delta) for q in locks)
assert all(len(v) == 7 for v in phase_locks.values())
for phase in ('a', 'b'):
    reached = clock_reach(world, phase)
    assert phase_locks[phase] <= reached
    assert not phase_locks['b' if phase == 'a' else 'a'] & reached
negative = []
def refuse(name, fn):
    try: fn()
    except (AssertionError, KeyError): negative.append(name); return
    raise AssertionError('corruption passed: ' + name)
for row in d['connections']:
    p = P(row['arrival']); old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    refuse(row['name'] + ':reversed_arrival', lambda row=row: cable(row, world)); world[p] = old
for local, wrong, phase in [((-11, -2, 3), 'east', 'a'), ((4, -2, 0), 'south', 'b')]:
    p = ADD(local, origin); old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': wrong}}
    assert not phase_locks[phase] <= clock_reach(world, phase)
    negative.append('original_entry_diode_' + phase); world[p] = old
refuse('phase_swap', lambda: cable({**d['connections'][0], 'source': d['connections'][1]['source']}, world))
pin(Path(__file__).resolve())
report = {
    'status': 'independent_shared_clock_RF_geometry_review_pass', 'cells': len(world), 'prior_cells_preserved': len(before),
    'source_exact_clock_cells': len(clock), 'actual_guard_parent_cells_streamed': source_cells,
    'new_cable_and_permit_cells': len(world) - len(before) - len(clock), 'stores': len(new_stores), 'remaining_shared_stores': 117,
    'independently_screened_full_receivers': len(actual), 'preserved_inputs': preserved, 'actual_inputs': sum(map(len, actual.values())),
    'routes': routes, 'scanner_locks_reached_each_phase': 7, 'opposite_phase_locks_reached': 0, 'negative_cases': len(negative),
    'source_sha256': PINS,
    'limits': [
        'Exact10543-cell source comparison against actual1828787-cell guarded core, translation/facing/storage preservation and full possible-input differential. No author helper executes.',
        'Scanner source-to-lock queries cut incoming retained DATA edges. This only distinguishes structural phase reach and is not an event or data/setup/hold proof.',
        'The bank-permit constant preserves controller bank cadence; it does not provide architectural action permission. Conditioning/action-window/reset and other117shared stores remain open.',
        'Cable sums156/160 exclude source and destination local logic and future loads. Complete non-overlap, pulse width, burnout, cold initialization and native execution remain unverified.'
    ], 'complete_core': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0,
}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'corruption-refusals.json').write_text(json.dumps(negative, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256', 'limits')}))

