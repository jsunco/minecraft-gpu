"""Read-only independent review of the four original lane identities and IR tree.

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
SOURCE = BASE / 'core-lane-colocation-v1/four-lane-ir-fanout-v1'
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


pin(SOURCE / 'source-manifest.json', 'bdf14272904291a042bb7915937433c80a0a291a96416823701fe19f8cd6f4b2')
for path, expected in read(SOURCE / 'source-manifest.json')['source_sha256'].items():
    pin(ROOT / path, expected)
d = read(SOURCE / 'design.json')
parent = read(BASE / 'core-lane-colocation-v1/four-lane-data-v1/design.json')
ir = read(BASE / 'core-lane-colocation-v1/shared-ir-body.json')
body_source = read(BASE / 'core-lane-colocation-v1/bodies.json')
inventory = read(BASE / 'core-lane-colocation-v1/inventory.json')
wb = read(BASE / 'writeback/design.json')
alu = read(BASE / 'alu-v5/design.json')
lsu = read(BASE / 'control-lsu-v2/design.json')
world = {P(b['position']): b['block'] for b in d['blocks']}
before = {P(b['position']): b['block'] for b in parent['blocks']}
assert len(world) == len(d['blocks']) == 491889
assert len(before) == len(parent['blocks']) == 450596
for p, block in before.items():
    assert world[p] == block

# Four original lane bodies, not four copies of lane zero. Every state and
# retained side-lock relation is checked under its actual translation.
original_lanes = {}
for row in body_source['blocks']:
    lane, module = row['body'].split('/')
    shift = P(parent['transforms'][lane][module])
    p = ADD(P(row['position']), shift)
    assert p not in original_lanes
    original_lanes[p] = row['block']
    assert before[p] == row['block'], (lane, module, p)
assert len(original_lanes) == 358896
assert store_map(original_lanes) == store_map(before)
assert len(store_map(before)) == 924

assert d['ir_transform'] == {'quarter_turns': 2, 'translation': {'x': -40, 'y': 0, 'z': -40}}
assert not ir['changes'] and ir['body_cells'] == 6045 and ir['stored_bits'] == 16


def ir_position(p):
    x, y, z = P(p)
    return -x - 40, y, -z - 40


for row in ir['blocks']:
    p = ir_position(row['position'])
    block = json.loads(json.dumps(row['block']))
    if 'facing' in block.get('properties', {}):
        block['properties']['facing'] = FLIP[block['properties']['facing']]
    assert p not in before
    before[p] = block
    assert world[p] == block
assert len(before) == 456641
assert store_map(before) == store_map(world)
assert len(store_map(world)) == 940
added = set(world) - set(before)
assert len(added) == 35248
for p in added:
    block = world[p]
    assert solid(block) or block['id'] in (WIRE, REP)
    if not solid(block):
        assert solid(world.get(ADD(p, DOWN))), (p, 'unsupported new component')

# Bind all192 earlier local data cables to the original component ports.
expected_lane = {}
for lane in range(4):
    rf = read(BASE / f'register-sequencer-v1/file-address-stage/lane{lane}.json')
    reference = {x['name'].split('/')[1]: P(x['reference_translation']) for x in inventory['bodies'] if x['name'].startswith(f'lane{lane}/')}
    offsets = {m: ADD(p, P(parent['transforms'][f'lane{lane}'][m])) for m, p in reference.items()}

    def port(module, name, bit):
        if module == 'alu':
            p = next(p for p in alu['ports'] if p['name'] == name and p.get('bit', 0) == bit)
        else:
            p = {'rf': rf, 'lsu': lsu, 'writeback': wb}[module]['ports'][name]['bits'][bit]
        return ADD(P(p['position']), offsets[module])

    for operand, lsu_input in [('operand_a', 'rs'), ('operand_b', 'rt')]:
        for bit in range(8):
            expected_lane[f'lane{lane}.{operand}{bit}'] = (port('rf', operand, bit), port('alu', operand, bit), True)
            expected_lane[f'lane{lane}.lsu_{lsu_input}{bit}'] = (port('rf', operand, bit), port('lsu', lsu_input, bit), False)
    for bit in range(8):
        expected_lane[f'lane{lane}.alu_writeback{bit}'] = (port('alu', 'result', bit), port('writeback', 'alu', bit), True)
        expected_lane[f'lane{lane}.lsu_writeback{bit}'] = (port('lsu', 'result', bit), port('writeback', 'lsu', bit), False)
assert len(expected_lane) == len(parent['connections']) == 192
for c in parent['connections']:
    a, b, missing = expected_lane[c['name']]
    assert P(c['source']) == a and P(c['destination']) == b
    assert c['was_missing_in_reference'] == missing

bus_sources = {}
terminals = {}
for signal in range(10):
    bit = signal if signal < 8 else signal - 8
    field = 'immediate' if signal < 8 else 'select'
    if field == 'immediate':
        source = ir['ports']['immediate']['bits'][bit]
        assert source['instruction_bit'] == source['bit'] == bit
    else:
        source = next(p for p in ir['ports']['controls']['bits'] if p['name'] == f'reg_input_mux_{bit}')
    bus_sources[signal] = ir_position(source['position'])
    bus = d['buses'][signal]
    assert bus['field'] == field and bus['bit'] == bit and bus['signal'] == signal
    assert P(bus['source']) == bus_sources[signal]
    for lane in range(4):
        shift = (320 * (lane % 2), -10 - 4 * lane, 400 * (lane // 2) - 30)
        terminals[signal, lane] = ADD(P(wb['ports'][field]['bits'][bit]['position']), shift)


def bindings(connections):
    seen = set()
    for c in connections:
        signal = c['signal']
        bus = d['buses'][signal]
        if c['role'] == 'retained_IR_to_shared_bus':
            assert P(c['source']) == bus_sources[signal]
            assert P(c['destination']) == P(bus['header'])
            ident = (signal, 'feed')
        else:
            assert c['role'] == 'shared_bus_to_writeback'
            lane = c['lane']
            assert P(c['source']) == P(bus['outputs'][lane]['position'])
            assert P(c['destination']) == terminals[signal, lane]
            ident = (signal, lane)
        assert ident not in seen
        seen.add(ident)
    assert len(seen) == 50


bindings(d['connections'])


def validate_chain(c, w):
    nodes = [P(c['source']), P(c['tap'])] + list(map(P, c['path'])) + [P(c['arrival']), P(c['destination'])]
    assert len(set(nodes)) == len(nodes)
    assert nodes[2] == P(c['start']) and nodes[-3] == P(c['end'])
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
            assert nodes[i - 1] in inputs(w, p), (c['name'], nodes[i - 1], p)
    assert maximum <= 14
    return {'name': c['name'], 'vertices': len(nodes), 'maximum_dust_vertices': maximum, 'nominal_diode_ticks': delay}


chain_receipts = [validate_chain(c, world) for c in parent['connections'] + d['connections']]

# Independently rediscover every possible dependency touching the new wiring,
# including foreign parent receivers within two blocks of all new supports.
# An electrical relation in this palette reaches at most two coordinates.
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
adj = defaultdict(set)
old_edge_count = actual_edge_count = 0
for p in affected:
    old = inputs(before, p)
    actual = inputs(world, p)
    assert actual == old | declared[p], (p, 'unexpected', list(actual - old - declared[p])[:4], 'lost', list((old | declared[p]) - actual)[:4])
    old_edge_count += len(old)
    actual_edge_count += len(actual)
    for a in actual:
        if a in added or p in added or a in bus_sources.values():
            adj[a].add(p)

# Traverse the discovered network, not the authored edges, for reachability and
# positive high-level capacity. Stops at the actual40 receiving pads.
all_terminals = set(terminals.values())
source_set = set(bus_sources.values())
fanout = []
for signal, source in bus_sources.items():
    power = {source: 15}
    queue = deque([source])
    while queue:
        a = queue.popleft()
        for b in adj[a]:
            if b not in added and b not in all_terminals:
                continue
            kind = world[b]['id']
            assert kind in (WIRE, REP)
            level = 15 if kind == REP else power[a] - (world[a]['id'] == WIRE)
            if level > power.get(b, 0):
                power[b] = level
                if b not in all_terminals:
                    queue.append(b)
    reached = all_terminals & power.keys()
    assert reached == {terminals[signal, lane] for lane in range(4)}
    assert all(power[p] == 15 for p in reached)
    assert not (source_set - {source}) & power.keys()
    min_rear = min(power.get(ADD(p, NEG(vector(world[p]))), 0) for p in power if p in added and world[p]['id'] == REP)
    assert min_rear > 0
    fanout.append({'signal': signal, 'field': 'immediate' if signal < 8 else 'select', 'destinations': 4, 'terminal_high_power': 15, 'minimum_repeater_rear': min_rear, 'reachable_vertices': len(power)})

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
    refuse(c['name'] + ':reversed_arrival', lambda c=c: validate_chain(c, world))
    world[p] = old
for c in d['connections']:
    p = next(P(p) for p in c['path'] if world[P(p)]['id'] == REP)
    old = world.pop(p)
    refuse(c['name'] + ':missing_refresh', lambda c=c: validate_chain(c, world))
    world[p] = old
bad = [dict(c) for c in d['connections']]
bad[-1]['destination'] = bad[-2]['destination']
refuse('cross_lane_destination_swap', lambda: bindings(bad))
bad = [dict(c) for c in d['connections']]
bad[-5]['source'] = bad[-10]['source']
refuse('select_source_swap', lambda: bindings(bad))
pin(Path(__file__).resolve())
result = {
    'status': 'independent_bounded_four_lane_data_and_shared_IR_review_pass',
    'cells': len(world), 'exact_distinct_lane_body_cells': len(original_lanes),
    'prior_data_slice_cells_preserved': 450596, 'shared_IR_cells': 6045,
    'new_shared_route_cells': len(added), 'actual_stores': 940,
    'local_data_paths_bound_to_original_ports': 192, 'new_feed_drop_paths': 50,
    'original_missing_data_destinations_drawn': 136,
    'actual_cable_vertices_checked': sum(c['vertices'] for c in chain_receipts),
    'affected_receivers_independently_screened': len(affected),
    'preserved_affected_inputs': old_edge_count, 'actual_affected_inputs': actual_edge_count,
    'shared_terminal_destinations': 40,
    'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': [
        'This independent check binds every lane data cable to original identities, preserves distinct bodies and all940 side-lock stores, and checks actual supported chains.',
        'New fanout dependencies are independently rediscovered within radius2 of all additions under an explicit static possible-input model, including changes to adjacent parent inputs. Dust-shape pruning and Minecraft update/event timing are not simulated.',
        'All prior internal lane dependencies outside the affected region remain the pinned author differential; this is not a second complete original-core extraction.',
        'The177 other shared stores, control/phase/init/status wiring and IR incident routes still need geometry and timing. Whole core, full machine and native acceptance remain false.'
    ],
    'complete_core': False, 'complete_gpu_layout': False,
    'native_acceptance': False, 'world_mutations': 0,
}
(HERE / 'independent-review.json').write_text(json.dumps(result, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'chains': chain_receipts, 'fanout': fanout, 'negative_cases': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k not in ('source_sha256', 'limits')}))
