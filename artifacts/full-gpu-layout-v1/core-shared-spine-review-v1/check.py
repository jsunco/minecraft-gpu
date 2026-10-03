"""Read-only independent review of the relocated shared controllers and sixteen IR cables.

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
SOURCE = BASE / 'core-lane-colocation-v1/shared-spine-v1'
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


pin(SOURCE / 'source-manifest.json', '6ad8e7909cb41cf3e2420cd7c32d50c59d884c0cac2235cc9db40129d29aa46d')
for path, digest in read(SOURCE / 'source-manifest.json')['source_sha256'].items():
    pin(ROOT / path, digest)
pin(BASE / 'core-four-lane-data-review-v1/source-manifest.json', '08241fe5dabd3f08dab4114b5f381763236fdb98b6671d73aad989423c58f3d9')
pin(BASE / 'core-four-lane-data-review-v1/check.py')
extraction = read(SOURCE / 'bodies.json')
assert not extraction['absent'] and len(extraction['changes']) == 10
assert len(extraction['crossings']) == 146
targets = {P(r['original_position']): r['block'] for g in extraction['groups'] for r in g['blocks']}
assert len(targets) == 180120
core = read(BASE / 'compact-core-guard-v1/design.json')
matched = set()
for row in core['blocks']:
    p = P(row['position'])
    if p in targets:
        assert row['block'] == targets[p]
        matched.add(p)
assert matched == targets.keys()
del core, matched, targets

parent = read(BASE / 'core-lane-colocation-v1/four-lane-ir-fanout-v1/design.json')
d = read(SOURCE / 'design.json')
world = {P(r['position']): r['block'] for r in d['blocks']}
prior = {P(r['position']): r['block'] for r in parent['blocks']}
assert len(world) == len(d['blocks']) == 685953
assert len(prior) == 491889
groups = {}
group_ports = {}
prior_stores = store_map(prior)
assert len(prior_stores) == 940
expected_stores = dict(prior_stores)
body_owner = {p: 'prior_data' for p in prior}
all_bodies = dict(prior)
internal_edge_count = 0
for group in extraction['groups']:
    name = group['name']
    shift, origin = P(group['translation']), P(group['origin'])
    seed = read(BASE / group['path'])
    assert group['ports'] == seed['ports']
    seed_blocks = {P(r['position']): r['block'] for r in seed['blocks']}
    local = {}
    differences = []
    for row in group['blocks']:
        p = P(row['position'])
        assert P(row['original_position']) == ADD(p, origin)
        if row['block'] != seed_blocks[p]:
            differences.append(ADD(p, origin))
        moved = ADD(p, shift)
        assert moved not in all_bodies
        local[moved] = row['block']
        all_bodies[moved] = row['block']
        body_owner[moved] = name
    assert len(local) == len(seed_blocks)
    expected_changes = {P(c['position']) for c in extraction['changes'] if c['body'] == name}
    assert set(differences) == expected_changes
    groups[name] = local
    group_ports[name] = (seed['ports'], shift)
    local_stores = store_map(local)
    assert len(local_stores) == group['expected_stores']
    expected_stores.update(local_stores)
    expected_internal = defaultdict(set)
    for edge in group['internal']:
        expected_internal[ADD(P(edge['to']), shift)].add(ADD(P(edge['from']), shift))
    for p, block in local.items():
        if not solid(block):
            assert inputs(local, p) == expected_internal[p]
            internal_edge_count += len(expected_internal[p])
assert len(all_bodies) == 672009
for p, block in all_bodies.items():
    assert world[p] == block
assert store_map(world) == expected_stores and len(expected_stores) == 986
added = set(world) - set(all_bodies)
assert len(added) == 13944
for p in added:
    assert solid(world[p]) or world[p]['id'] in (WIRE, REP)
    if not solid(world[p]):
        assert solid(world.get(ADD(p, DOWN)))

# Original held-IR ports were independently reviewed and remain byte-for-byte
# preserved. Derive each source/destination instead of trusting route names.
ir = parent['ports']['shared_ir']
expected = {}
ports, shift = group_ports['rf_control']
for field in ('rs', 'rt', 'rd'):
    for bit in range(4):
        expected[f'IR_{field}{bit}_to_RF'] = P(ir[field]['bits'][bit]['position']), ADD(P(ports[field]['bits'][bit]['position']), shift)
source = next(p for p in ir['controls']['bits'] if p['name'] == 'reg_write')
expected['IR_reg_write_to_RF'] = P(source['position']), ADD(P(ports['reg_write']['bits'][0]['position']), shift)
ports, shift = group_ports['alu_control']
for port, instruction_field in [('mode0', 'arithmetic_mux_0'), ('mode1', 'arithmetic_mux_1'), ('compare', 'compare')]:
    source = next(p for p in ir['controls']['bits'] if p['name'] == instruction_field)
    expected[f'IR_{instruction_field}_to_ALU'] = P(source['position']), ADD(P(ports[port]['bits'][0]['position']), shift)


def bindings(connections):
    assert len(connections) == 16 and {c['name'] for c in connections} == expected.keys()
    for c in connections:
        assert (P(c['source']), P(c['destination'])) == expected[c['name']]


bindings(d['connections'])


def chain(c, w):
    nodes = [P(c['source']), P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    assert len(set(nodes)) == len(nodes)
    drivers = inputs(w, nodes[0])
    assert len(drivers) == 1 and w[next(iter(drivers))]['id'] == REP
    run = maximum = delay = 0
    for i, p in enumerate(nodes):
        block = w[p]
        assert block['id'] in (WIRE, REP) and solid(w.get(ADD(p, DOWN)))
        if block['id'] == REP:
            assert 0 < i < len(nodes) - 1
            assert ADD(p, vector(block)) == nodes[i + 1]
            assert ADD(p, NEG(vector(block))) == nodes[i - 1]
            run = 0
            delay += 2 * int(block['properties']['delay'])
        else:
            run += 1
            maximum = max(maximum, run)
        if i:
            assert nodes[i - 1] in inputs(w, p)
    assert maximum <= 14
    return {'name': c['name'], 'vertices': len(nodes), 'maximum_dust_vertices': maximum, 'minimum_nominal_rear': 16 - maximum, 'nominal_diode_ticks': delay}


routes = [chain(c, world) for c in d['connections']]
declared = defaultdict(set)
for e in d['edges']:
    a, b = P(e['from']), P(e['to'])
    declared[b].add(a)
    if world[a]['id'] == world[b]['id'] == WIRE:
        declared[a].add(b)
baselines = {'prior_data': prior, **groups}
old_count = actual_count = receivers = 0
for p, block in world.items():
    if solid(block):
        continue
    receivers += 1
    own = baselines.get(body_owner.get(p), {})
    old = inputs(own, p)
    actual = inputs(world, p)
    assert actual == old | declared[p], (p, 'extra', list(actual - old - declared[p])[:4], 'lost', list((old | declared[p]) - actual)[:4])
    old_count += len(old)
    actual_count += len(actual)

negative = []


def refuse(label, fn):
    try:
        fn()
    except (AssertionError, KeyError):
        negative.append(label)
        return
    raise AssertionError('Corruption passed: ' + label)


for c in d['connections']:
    p = P(c['arrival'])
    old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    refuse(c['name'] + ':reversed_arrival', lambda c=c: chain(c, world))
    world[p] = old
    p = next(P(p) for p in c['path'] if world[P(p)]['id'] == REP)
    old = world.pop(p)
    refuse(c['name'] + ':missing_refresh', lambda c=c: chain(c, world))
    world[p] = old
bad = [dict(c) for c in d['connections']]
bad[0]['source'] = bad[1]['source']
refuse('instruction_field_source_swap', lambda: bindings(bad))
pin(Path(__file__).resolve())
report = {
    'status': 'independent_bounded_shared_controller_relocation_review_pass',
    'cells': len(world), 'prior_lane_IR_cells_preserved': len(prior),
    'controller_cells_matched_to_actual_guard_reference': 180120,
    'retained_current_substitutions': 10, 'unchanged_controller_internal_edges': internal_edge_count,
    'new_cable_cells': len(added), 'actual_stores': len(expected_stores),
    'remaining_shared_stores': 131, 'new_IR_field_control_connections': len(routes),
    'cable_vertices': sum(r['vertices'] for r in routes),
    'receivers_independently_screened': receivers, 'preserved_inputs': old_count,
    'actual_inputs': actual_count, 'negative_cases': len(negative),
    'source_sha256': PINS,
    'limits': [
        'Independently compares all180120 controller cells to their actual current guard-reference positions, preserves the ten existing substitutions and986 store/lock identities, binds16 IR field/control endpoints to original component ports and checks every new supported cable chain.',
        'The complete candidate is screened for possible input changes against the exact prior data map and isolated actual controller bodies. This is an explicit static model; no dust-shape pruning, event ordering, pulse or burnout behavior is simulated.',
        'The146 original controller cut crossings remain the author extraction; completeness of that foreign-context cut is not independently re-extracted here.',
        '131 shared stores, extensive controller-to-lane commands, phase/reset/admission/status/IR incident geometry and timing remain absent. No complete-core, saving, whole-layout or native acceptance.'
    ], 'complete_core': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0,
}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'routes': routes, 'corruption_refusals': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256', 'limits')}))

