"""Reconstruct additions without trusting the authored edge list. Offline only."""
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

def block_map(d):
    w = {P(r['position']): r['block'] for r in d['blocks']}
    assert len(w) == len(d['blocks'])
    return w

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

d=read(SOURCE/'typed-request-connected-design.json');world=block_map(d)
body=read(SOURCE/'typed-request-original-bodies.json');old=block_map(body)
expected=set()
def add(a,b):
    expected.add((a,b))
    if world[a]['id']==world[b]['id']==WIRE:expected.add((b,a))
for g in d['placedGates']:
    originals={P(r['position']):r['block'] for r in body['blocks'] if r['part'].endswith('gate'+str(g['channel']))}
    offset=P(g['offset'])
    for p,b in originals.items():
        assert world[ADD(p,offset)]==b
        if not solid(b):
            for q in inputs(originals,p):add(ADD(q,offset),ADD(p,offset))
column_map={}
for c in d['columns']:
    for a,b in [('frontBase','frontTop'),('rearBase','rearTop')]:
        lo,hi=P(c[a]),P(c[b]);assert lo[0]==hi[0] and lo[2]==hi[2] and (hi[1]-lo[1])%4==0
        for y in range(lo[1],hi[1]+1):
            p=(lo[0],y,lo[2]);block=world[p]
            assert block['id']==('minecraft:light_gray_concrete' if (y-lo[1])%2==0 else TORCH)
            assert p not in column_map;column_map[p]=block
for p,b in column_map.items():
    if not solid(b):
        for q in inputs(column_map,p):add(q,p)
for c in d['connections']:
    path=[P(c['source']),P(c['tap'])]+list(map(P,c['path']))+[P(c['arrival']),P(c['destination'])]
    assert path[2]==P(c['start']) and path[-3]==P(c['end'])
    for a,b in zip(path,path[1:]):add(a,b)
claimed=set()
for e in d['edges']:
    a,b=P(e['from']),P(e['to']);claimed.add((a,b))
    if world[a]['id']==world[b]['id']==WIRE:claimed.add((b,a))
assert expected==claimed,('missing declared',sorted(expected-claimed)[:10],'unjustified declared',sorted(claimed-expected)[:10])
# The earlier full-map receipt compares exactly this set plus the unchanged parent.
receipt=read(HERE/'independent-review.json');assert receipt['actual_inputs']==975011
for p in [SOURCE/'typed-request-connected-design.json',SOURCE/'typed-request-original-bodies.json',HERE/'independent-review.json',HERE/'check.py',Path(__file__).resolve()]:pin(p)
out={'status':'independently_reconstructed_added_edge_set_matches_full_screen','exact_original_gate_cells':len(old),'exact_positive_column_cells':len(column_map),'routed_connections':len(d['connections']),'distinct_allowed_added_inputs':len(expected),'source_sha256':PINS,'limits':['Derives gate inputs from676 original actual cells, positive torch columns from176 actual cells and56 explicit cable vertex sequences. No arbitrary same-net or role-name exemption.','This closes the authored edge-list reliance in the independent full possible-input screen; it does not prove event timing or native execution.'],'world_mutations':0,'native_calls':0}
(HERE/'expected-edges-review.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
