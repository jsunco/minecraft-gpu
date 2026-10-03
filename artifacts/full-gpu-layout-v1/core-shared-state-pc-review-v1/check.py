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
SOURCE = BASE / 'core-lane-colocation-v1/pc-flags-connected-v1'
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


pin(SOURCE / 'source-manifest.json', 'ff9c414d6d520fbba932566adf5857973f33e613496a55edba89b44afb13cc1e')
manifest = read(SOURCE / 'source-manifest.json')
for path, digest in manifest['source_sha256'].items(): pin(ROOT / path, digest)
pin(BASE / 'dispatch-route-review-v1/check.py')
d = read(SOURCE / 'design.json')
placed = read(SOURCE.parent / 'shared-logic-placement-v1/body-placement.json')
parent = read(SOURCE.parent / 'rf-conditioning-v1/design.json')
ep = read(SOURCE / 'endpoint-map.json')
world, body, before = block_map(d), block_map(placed), block_map(parent)
assert (len(world), len(body), len(before)) == (825017, 792325, 712169)
assert all(world[p] == b for p,b in body.items())
assert all(body[p] == b for p,b in before.items())
new_bodies = [r for r in placed['blocks'] if r.get('placement_island')]
assert len(new_bodies) == 80156
assert len(placed['placements']) == 106
mapping = {tuple(map(int,k.split(','))): P(v['position']) for k,v in ep['mapping'].items()}
assert len(mapping) == 636892 and len(set(mapping.values())) == len(mapping)

# Stream the actual guarded source into a coordinate map without retaining its
# original giant JSON block list. This is an actual geometry read, not execution
# of the author's endpoint assertions.
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
original_path = BASE/'compact-core-guard-v1/design.json'
pin(original_path, '2da4daf7365f65628fdbbda5573a00f0a5464fbb163f20c9a6e10e7d92f7c4e1')
old = stream_world(original_path)
assert len(old) == 1828787
placements={p['name']:p for p in placed['placements']}
for row in new_bodies:
    source,p=P(row['original_position']),P(row['position'])
    placement=placements[row['placement_island']]
    assert p == ADD(source,P(placement['delta']))
    assert mapping[source] == p
    assert old[source] == row['block'] == world[p], ('new body source mismatch', source, p)
old_stores, new_stores=store_map(old),store_map(world)
assert len(old_stores)==len(new_stores)==1117
mapped_stores={mapping[p]:tuple(sorted(mapping[q] for q in locks)) for p,locks in old_stores.items()}
assert mapped_stores==new_stores
assert store_map(body)==new_stores

expected=defaultdict(set)
for p,b in body.items():
    if not solid(b): expected[p].update(inputs(body,p))
prior=sum(map(len,expected.values()))
for e in d['edges']:
    a,b=P(e['from']),P(e['to']); expected[b].add(a)
    if world[a]['id']==world[b]['id']==WIRE: expected[a].add(b)
actual={}
for p,b in world.items():
    if b['id'] in (WIRE,REP,COMP,TORCH): assert solid(world.get(ADD(p,DOWN)))
    if not solid(b):
        found=inputs(world,p)
        assert found==expected[p], (p,'extra',list(found-expected[p])[:4],'lost',list(expected[p]-found)[:4])
        actual[p]=found

# Independently trace actual old transport. The signal value at a mapped source
# is a boundary value; inversion is applied on entry to an intervening torch,
# never by re-inverting a source just because its output block is a torch.
def old_sources(target):
    queue=deque([(target,0)]);seen={(target,0)};found=set();torch=set()
    while queue:
        p,parity=queue.popleft()
        ds=inputs(old,p)
        if p!=target:
            kind=old[p]['id']
            if kind in (TORCH,WALL):
                assert len(ds)==1, ('non-unary old transport',p,ds)
                torch.add(p); parity ^= 1
            elif kind==REP:
                v=vector(old[p])
                assert not any(q[1]==p[1] and sum(abs(a-b) for a,b in zip(p,q))==1 and sum((q[i]-p[i])*v[i] for i in range(3))==0 for q in ds), ('side input on old transport',p)
            else: assert kind==WIRE, ('unplaced old logic',p,kind)
        for q in ds:
            if q==target: continue
            if q in mapping: found.add((q,parity));continue
            s=(q,parity)
            if s not in seen:seen.add(s);queue.append(s)
    return found,len(seen),len(torch)


def path_check(path,high,w):
    assert len(path)==len(set(path));power=high;minimum=15;ticks=0
    for i,p in enumerate(path[1:],1):
        prev=path[i-1]; assert prev in inputs(w,p), ('missing path edge',prev,p)
        b=w[p]
        if b['id']==REP:
            minimum=min(minimum,power);assert power>0
            power=15;ticks+=2*int(b['properties']['delay'])
        else:
            assert b['id']==WIRE
            if w[prev]['id']==WIRE:power-=1
            assert power>0
    return {'arrival_high':power,'minimum_rear':minimum,'nominal_diode_ticks':ticks,'vertices':len(path)}

assert len(d['connections'])==45
known={};routes=[];truth=[]
for c in d['connections']:
    os,ot=P(c['original_source']),P(c['original_destination'])
    src,dst=P(c['source']),P(c['destination'])
    assert mapping[os]==src and mapping[ot]==dst
    found,nodes,torches=old_sources(ot)
    assert found=={(os,0)}, ('actual old function is not unary positive',c['name'],found)
    truth.append({'name':c['name'],'old_actual_transport_vertices':nodes,'old_unary_torches':torches,'unique_positive_source':True})
    path=list(map(P,c['path']));assert path[0]==P(c['actual_source']) and path[-1]==dst
    assert inputs(world,P(c['source_isolator']))=={path[0]}
    assert inputs(world,P(c['arrival']))=={path[-3]}
    route=c.get('parent_route')
    if route and not route.startswith('frozen_IR_fanout/'):
        previous=known[route];pp=list(map(P,previous['path']))
        if c.get('source_is_driving_route_destination'):
            assert previous['original_destination']==c['original_source']
            assert P(previous['destination'])==src
            assert inputs(world,src)=={P(previous['arrival'])}
        else:assert previous['original_source']==c['original_source']
        assert path[0] in pp
        power=path_check(pp[:pp.index(path[0])+1],previous['source_high'],world)['arrival_high']
    elif c.get('ancestry_path'):
        ancestry=list(map(P,c['ancestry_path']));assert ancestry[0]==src and ancestry[-1]==path[0]
        power=path_check(ancestry,15,world)['arrival_high']
    elif c.get('source_dust_path'):
        ancestry=list(map(P,c['source_dust_path']));assert ancestry[0]==src and ancestry[-1]==path[0]
        assert all(world[p]['id']==WIRE for p in ancestry)
        power=path_check(ancestry,15,world)['arrival_high']
    else:assert path[0]==src;power=15
    assert power==c['source_high']
    result=path_check(path,power,world);assert result['arrival_high']==15
    routes.append({'name':c['name'],**result});known[c['name']]=c

negative=[]
for c in d['connections']:
    p=P(c['arrival']);b=world[p]
    world[p]={'id':REP,'properties':{**b['properties'],'facing':FLIP[b['properties']['facing']]}}
    try:path_check(list(map(P,c['path'])),c['source_high'],world)
    except (AssertionError,KeyError):negative.append(c['name']+':reversed_arrival')
    else:raise AssertionError('reversed arrival accepted')
    finally:world[p]=b
# Test retained store/lock identity, not merely the aggregate store count.
first=next(iter(new_stores));lock=new_stores[first][0];b=world[lock]
world[lock]={'id':b['id'],'properties':{**b['properties'],'facing':FLIP[b['properties']['facing']]}}
assert store_map(world)!=mapped_stores;world[lock]=b;negative.append('wrong_lock_orientation')
pin(Path(__file__).resolve())
report={'status':'independent_core_shared_body_store_and_pc_flags_geometry_pass','cells':len(world),'parent_cells_preserved':len(before),
'new_body_cells_exact_original':len(new_bodies),'new_body_groups':len(placements),'new_cable_support_cells':len(world)-len(body),
'actual_original_cells_streamed':len(old),'all_original_store_lock_identities':len(new_stores),'receivers':len(actual),'preserved_body_inputs':prior,
'actual_inputs':sum(map(len,actual.values())),'routes':len(routes),'route_vertices':sum(r['vertices'] for r in routes),'minimum_rear':min(r['minimum_rear'] for r in routes),
'independent_old_unary_positive_functions':len(truth),'negative_cases':len(negative),'source_sha256':PINS,
'limits':['All 1117 original store and side-lock identities are mapped from the actual guarded source; all 80156 newly placed body cells are exact translated source cells. Older non-store body semantics remain under their own earlier receipts.',
'Full static possible-input/support and 45 real route/ancestry/polarity checks only. Source outputs are assumed asserted high15; borrowed wire power is recomputed. This is not full body analog, event, pulse-width, clock, cold-init, setup/hold or native proof.',
'All 982 directed incident cuts remain in the author ledger. This review does not assert all core ports connected, full core logic complete, eight-lane machine complete, or density admission.'],
'complete_core':False,'complete_gpu_layout':False,'native_acceptance':False,'world_mutations':0}
(HERE/'independent-review.json').write_text(json.dumps(report,indent=2)+'\n')
(HERE/'route-witnesses.json').write_text(json.dumps({'routes':routes,'old_transport_functions':truth,'negative_cases':negative},indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('source_sha256','limits')}))
