"""Read-only independent review of the dispatcher transport and moved-body geometry.

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
SOURCE = BASE / 'dispatch-global-colocation-v6-inverted-v1'
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


pin(SOURCE / 'source-manifest.json', '5b01e63abb25bff6c9670496068e2ced3dac0dc5a1dfc186efd79bc1bf9891fb')
manifest = read(SOURCE / 'source-manifest.json')
for path, digest in manifest['source_sha256'].items(): pin(ROOT / path, digest)
pin(BASE / 'dispatch-route-review-v1/check.py')
V1 = BASE / 'dispatch-global-colocation-v1'
d = read(SOURCE / 'connected-candidate.json')
coverage = read(SOURCE / 'coverage.json')
reference = read(V1 / 'reference-scope.json')
transport = read(V1 / 'transport-cuts.json')
placement = read(V1 / 'body-placement.json')
world = block_map(d); body = block_map(placement)
old_world = {P(r['position']): r['block'] for r in reference['blocks'] + reference['foreign_context']}
assert len(world) == 189978 and len(body) == 100448
assert len(d['routes']) == len(d['connections']) == 261
old_bodies = {}; old_to_new = {}; new_to_old = {}; translations = {}
for row in placement['blocks']:
    p, old = P(row['position']), P(row['original_position'])
    assert world[p] == old_world[old] == row['block']
    delta = tuple(a - b for a, b in zip(p, old))
    name = row['body']
    assert name not in translations or translations[name] == delta
    translations[name] = delta; old_bodies[old] = name
    assert old not in old_to_new
    old_to_new[old] = p; new_to_old[p] = old
assert len(translations) == 55
assert store_map(world) == store_map(body) and len(store_map(world)) == 187
for name in translations:
    old_piece = {p: old_world[p] for p, label in old_bodies.items() if label == name}
    moved = {ADD(p, translations[name]): block for p, block in old_piece.items()}
    assert store_map(moved) == {ADD(p, translations[name]): tuple(ADD(q, translations[name]) for q in locks) for p, locks in store_map(old_piece).items()}

paths = {r['name']: list(map(P, r['path'])) for r in d['routes']}
assert len(paths) == 261
connections = {c['name']: c for c in d['connections']}
expected = defaultdict(set)
for p, block in body.items():
    if not solid(block): expected[p].update(inputs(body, p))
body_inputs = sum(map(len, expected.values()))
for c in d['connections']:
    path = paths[c['name']]
    assert path[0] == P(c['source']) and path[-1] == P(c['destination'])
    assert len(set(path)) == len(path)
    for a, b in zip(path, path[1:]):
        expected[b].add(a)
        if world[a]['id'] == world[b]['id'] == WIRE: expected[a].add(b)
actual = {}
for p, block in world.items():
    if block['id'] in (WIRE, REP, COMP, TORCH): assert solid(world.get(ADD(p, DOWN)))
    if not solid(block):
        found = inputs(world, p)
        assert found == expected[p], (p, 'extra', list(found - expected[p])[:6], 'lost', list(expected[p] - found)[:6])
        actual[p] = found


def chain(name, w):
    path = paths[name]; power, minimum, ticks = 15, 15, 0
    for i, p in enumerate(path[1:], 1):
        assert path[i - 1] in inputs(w, p), ('broken path', name, i, p)
        block = w[p]
        if block['id'] == REP:
            minimum = min(minimum, power); assert power > 0
            power = 15; ticks += 2 * int(block['properties']['delay'])
        elif block['id'] == WIRE:
            if w[path[i - 1]]['id'] == WIRE: power -= 1
            assert power > 0
        elif block['id'] in (TORCH, WALL):
            assert len(inputs(w, p)) == 1, ('non-unary new inverter', p)
            power = 15; ticks += 2
        else:
            assert i == len(path) - 1, ('non-unary transport device', p, block)
    return {'name': name, 'vertices': len(path), 'minimum_rear': minimum, 'nominal_repeater_ticks_including_terminal': ticks}


route_receipts = [chain(n, world) for n in paths]

# Recover source identity and inversion parity through actual branch paths.
# Every intermediate inverter is a real supported torch. New path parity is
# compared separately with the original transport below.
ancestry_cache = {}
def ancestor(p, seen=frozenset()):
    if p in new_to_old: return new_to_old[p], 0
    if p in ancestry_cache: return ancestry_cache[p]
    assert p not in seen, 'new branch source cycle'
    candidates = set()
    for path in paths.values():
        if p not in path[1:]: continue
        source, parity = ancestor(path[0], seen | {p})
        parity ^= sum(world[q]['id'] in (TORCH, WALL) for q in path[1:path.index(p)+1]) % 2
        candidates.add((source, parity))
    assert len(candidates) == 1, ('unresolved branch source', p, candidates)
    result = next(iter(candidates)); ancestry_cache[p] = result; return result

old_pairs = {(P(t['source']), P(t['target'])): t for t in transport['transfers']}
drawn = {}
for c in d['connections']:
    if c.get('new_junction'): continue
    source, _ = ancestor(P(c['source'])); target = new_to_old[P(c['destination'])]
    assert (source, target) in old_pairs and (source, target) not in drawn
    drawn[source, target] = c['name']
assert len(drawn) == 259
assert {(P(c['source']), P(c['target'])) for c in coverage['drawn']} == set(drawn)

# Discover passive body wire inputs independently. These zero-delay pads belong
# to bodies but must not become fictitious extra sources during old transport
# tracing. A body wire is locally driven only if a non-wire in its own body
# feeds it, or such a local drive propagates through body wire neighbours.
passive = {p for p in old_bodies if old_world[p]['id'] == WIRE}
powered, followers = set(), defaultdict(set)
for p in passive:
    for q in inputs(old_world, p):
        if old_bodies.get(q) == old_bodies[p]:
            if old_world[q]['id'] != WIRE: powered.add(p)
            else: followers[q].add(p)
queue = deque(powered)
while queue:
    for q in followers[queue.popleft()]:
        if q not in powered: powered.add(q); queue.append(q)
passive -= powered
nodes = {P(r['position']) for r in reference['blocks'] if not solid(r['block']) and (P(r['position']) not in old_bodies or P(r['position']) in passive)}
assert all(old_world[p]['id'] in (WIRE, REP, TORCH, WALL) for p in nodes)
roots = [P(r['source']) for r in transport['roots']]
assert len(set(roots)) == len(roots)
root_bit = {p: 1 << i for i, p in enumerate(roots)}
adj = defaultdict(set); incoming = {}; even = {}; odd = {}; queue = deque(); queued = set()
for p in nodes:
    incoming[p] = inputs(old_world, p)
    ext = 0
    for q in incoming[p]:
        if q in nodes: adj[q].add(p)
        else:
            assert q in root_bit, ('unknown actual old source', q, p)
            ext |= root_bit[q]
    invert = old_world[p]['id'] in (TORCH, WALL)
    even[p], odd[p] = (0, ext) if invert else (ext, 0)
    if ext: queue.append(p); queued.add(p)
while queue:
    p = queue.popleft(); queued.remove(p)
    for q in adj[p]:
        e, o = (odd[p], even[p]) if old_world[q]['id'] in (TORCH, WALL) else (even[p], odd[p])
        ne, no = even[q] | e, odd[q] | o
        if (ne, no) != (even[q], odd[q]):
            even[q], odd[q] = ne, no
            if q not in queued: queued.add(q); queue.append(q)
polarity_rows = []
for pair, name in drawn.items():
    source, target = pair; t = old_pairs[pair]
    endpoint = target if target in nodes else P(t['immediate_source'])
    assert endpoint in nodes
    mask = root_bit[source]
    e, o = even[endpoint], odd[endpoint]
    origin, parity = ancestor(paths[name][0])
    assert origin == source
    parity ^= sum(world[q]['id'] in (TORCH, WALL) for q in paths[name][1:-1]) % 2
    assert (bool(e & mask), bool(o & mask)) == (not bool(parity), bool(parity)), ('old/new path polarity mismatch', name)
    polarity_rows.append({'name': name, 'source': dict(zip('xyz', source)), 'target': dict(zip('xyz', target)), 'matching_inversion_parity': parity, 'old_total_root_count': (e | o).bit_count()})
assert sum(r['matching_inversion_parity'] for r in polarity_rows) == 5

negative = []
for name, path in paths.items():
    candidates = [p for p in reversed(path[1:-1]) if world[p]['id'] == REP]
    assert candidates, name
    p = candidates[0]; old = world[p]
    world[p] = {'id': REP, 'properties': {**old['properties'], 'facing': FLIP[old['properties']['facing']]}}
    try: chain(name, world)
    except (AssertionError, KeyError): negative.append(name)
    else: raise AssertionError('reversed diode passed: ' + name)
    finally: world[p] = old
for name, path in paths.items():
    for p in path[1:-1]:
        old_block = world[p]
        if old_block['id'] not in (TORCH, WALL): continue
        assert old_block['id'] == WALL
        world[p] = {**old_block, 'properties': {**old_block['properties'], 'facing': FLIP[old_block['properties']['facing']]}}
        try: chain(name, world)
        except (AssertionError, KeyError): negative.append(name + ':wrong_inverter_support')
        else: raise AssertionError('wrong inverter support passed')
        finally: world[p] = old_block
pin(Path(__file__).resolve())
report = {'status': 'independent_dispatch_repaired_v6_geometry_and_path_polarity_review_pass', 'cells': len(world),
    'exact_original_body_cells': len(body), 'body_groups': len(translations), 'stores': len(store_map(world)),
    'full_receivers_independently_screened': len(actual), 'preserved_body_inputs': body_inputs, 'actual_inputs': sum(map(len, actual.values())),
    'actual_routes': len(paths), 'route_vertices': sum(r['vertices'] for r in route_receipts), 'minimum_rear': min(r['minimum_rear'] for r in route_receipts),
    'original_endpoint_matches': len(drawn), 'independently_traced_original_transport_vertices': len(nodes), 'original_transport_roots': len(roots),
    'matching_old_transfer_polarities': len(polarity_rows), 'negative_transfers': sum(r['matching_inversion_parity'] for r in polarity_rows), 'drawn_transfers_with_multiple_old_roots': sum(r['old_total_root_count'] > 1 for r in polarity_rows),
    'negative_cases': len(negative), 'source_sha256': PINS,
    'limits': ['Checks the frozen repaired v6 only. Exact old bodies, support/contact map, 261 actual routes and 259 original source/receiver path polarities are independently screened without author helpers.',
               'Old transport parity follows actual block inputs with passive body wire pads. Path polarity alone does not prove a multi-source Boolean function; old and new OR truth/port roles remain separately author checked.',
               'Body route exports are conditionally assumed high15. The reported minimum is a path-sequence bound, not a replacement for the wider author structural strength screen. Full analog, event scheduling, pulse width, burnout, phase and capture timing remain open.',
               'All 661 cut crossings remain. Foreign boundaries, complete compact subsystem/machine density and native acceptance remain incomplete.'],
    'complete_connected_candidate': False, 'complete_gpu_layout': False, 'native_acceptance': False, 'world_mutations': 0}
(HERE / 'independent-review.json').write_text(json.dumps(report, indent=2) + '\n')
(HERE / 'route-witnesses.json').write_text(json.dumps({'routes': route_receipts, 'old_polarity': polarity_rows, 'corruption_refusals': negative}, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k not in ('source_sha256','limits')}))

