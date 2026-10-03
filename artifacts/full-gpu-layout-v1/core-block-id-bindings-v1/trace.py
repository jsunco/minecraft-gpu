"""Original shared block-ID fanout recovery. No placed route is claimed.

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
SOURCE = BASE / 'core-lane-colocation-v1/held-ack-connected-v1'
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

from functools import lru_cache
pin(SOURCE/'source-manifest.json','7d8fc20d6228946fae1688c0321532ff89aa8d4e05334f61d8169d5979f99111')
pin(BASE/'core-historical-endpoints-review-v1/classify.py')
manifest=read(SOURCE/'source-manifest.json')
path=SOURCE/'endpoint-map.json';pin(path,manifest['source_sha256'][str(path.relative_to(ROOT))])
ep=read(path);mapping={tuple(map(int,k.split(','))):v for k,v in ep['mapping'].items()}
old_path=BASE/'compact-core-guard-v1/design.json';pin(old_path,'2da4daf7365f65628fdbbda5573a00f0a5464fbb163f20c9a6e10e7d92f7c4e1')
old=stream_world(old_path);assert len(old)==1828787
print('loaded actual original',len(old),flush=True)
@lru_cache(maxsize=None)
def incoming(p):return frozenset(inputs(old,p))
steps=[(x,y,z) for x in range(-2,3) for y in range(-2,3) for z in range(-2,3) if 0<abs(x)+abs(y)+abs(z)<=2]
@lru_cache(maxsize=None)
def outgoing(p):
    return frozenset(q for delta in steps if (q:=ADD(p,delta)) in old and not solid(old[q]) and p in incoming(q))
rows=[]
for bit in range(8):
    start=(360,87+4*bit,250);assert start in old and start not in mapping
    queue=deque([start]);seen=set();terminals=set();unsupported=set()
    while queue:
        p=queue.popleft()
        if p in seen:continue
        seen.add(p);assert len(seen)<100000
        if p!=start and p in mapping:terminals.add(p);continue
        if old[p]['id'] not in (WIRE,REP,COMP,TORCH,WALL):unsupported.add(p);continue
        queue.extend(outgoing(p)-seen)
    terminals=[{'original':dict(zip('xyz',p)),**mapping[p],'old_block':old[p]} for p in sorted(terminals)]
    row={'bit':bit,'old_input':dict(zip('xyz',start)),'source_block':old[start], 'actual_visited_vertices':len(seen),'terminals':terminals,'unsupported':[{'position':dict(zip('xyz',p)),'block':old[p]} for p in unsupported], 'unmapped_comparators':[{'position':dict(zip('xyz',p)),'block':old[p],'inputs':[dict(zip('xyz',q)) for q in incoming(p)]} for p in sorted(seen) if p not in mapping and old[p]['id']==COMP]}
    rows.append(row); print(json.dumps(row),flush=True)
(HERE/'exploration.json').write_text(json.dumps({'rows':rows,'source_sha256':PINS},indent=2)+'\n')

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
            elif kind == RED: value = full
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
functions=[]
for row in rows:
    start=P(row['old_input'])
    for endpoint in row['terminals']:
        target=P(endpoint['original']);queue=deque([target]);seen=set();roots=set()
        while queue:
            p=queue.popleft()
            if p in seen:continue
            seen.add(p);assert len(seen)<20000,('cone escaped',row['bit'],endpoint)
            if p==start or (p!=target and p in mapping):roots.add(p);continue
            assert old[p]['id'] in (WIRE,REP,COMP,TORCH,WALL,RED),(p,old[p])
            queue.extend(incoming(p)-seen)
        roots=sorted(roots);assert start in roots;assert len(roots)<=4,('too many roots',roots)
        n=len(roots);clamps={p:variable(i,n) for i,p in enumerate(roots)}
        value,evidence=settled_cone(old,target,clamps,1<<n)
        result={'bit':row['bit'],'lane':endpoint['body'],'target':endpoint,'roots':[{'original':dict(zip('xyz',p)),'block':old[p],'current_endpoint':mapping.get(p),'kind':'external_raw_block_id' if p==start else 'current_internal_body'} for p in roots], 'truth_table':[bool(value&(1<<i)) for i in range(1<<n)],**evidence}
        functions.append(result);print(json.dumps({'function':result}),flush=True)
(HERE/'functions.json').write_text(json.dumps(functions,indent=2)+'\n')
expected_truth=[bool(prime or (data and assign and not boot)) for boot in (0,1) for assign in (0,1) for prime in (0,1) for data in (0,1)]
roots_meta=[((920,65,2),'PRIME_FF'),((944,297,2),'ASSIGN_SOURCE'),((1148,274,-50),'HELD_BOOT')]
labels={p:label for p,label in roots_meta}
for result in functions:
    bit=result['bit'];roots=[P(v['original']) for v in result['roots']]
    assert roots==[(360,87+4*bit,250)]+[p for p,label in roots_meta]
    assert result['truth_table']==expected_truth
    for item in result['roots']:item['meaning']='RAW_BLOCK_ID_'+str(bit) if item['kind']=='external_raw_block_id' else labels[P(item['original'])]
# Match source labels to the actual original RF controller's public ports and
# explicit held boot input in its source-bound block-control generator.
rf_path=BASE/'register-sequencer-v1/controller-addresses/design.json';pin(rf_path)
rf=read(rf_path);assert P(rf['ports']['prime_ff']['bits'][0]['position'])==(20,12,2)
assert P(rf['ports']['assign_source']['bits'][0]['position'])==(44,244,2)
pin(ROOT/'hardware/full-gpu-register-four-files-block-control.mjs')
assert 'boot=P(248,221,-50)' in (ROOT/'hardware/full-gpu-register-four-files-block-control.mjs').read_text()
del rf
current_path=SOURCE/'design.json';pin(current_path,manifest['source_sha256'][str(current_path.relative_to(ROOT))])
wanted={P(r['target']['position']) for r in functions}|{P(mapping[p]['position']) for p,label in roots_meta}
current,total=stream_selected_blocks(current_path,wanted);assert total==840755
for result in functions:assert current[P(result['target']['position'])]==result['target']['old_block']
for p,label in roots_meta:assert current[P(mapping[p]['position'])]==old[p]
negatives=[]
def refuse(label,position,change,result):
    before=old[position];old[position]=change
    roots=[P(v['original']) for v in result['roots']];clamps={p:variable(i,4) for i,p in enumerate(roots)}
    failed=False
    try:
        value,_=settled_cone(old,P(result['target']['original']),clamps,16)
        failed=[bool(value&(1<<i)) for i in range(16)]!=expected_truth
    except (AssertionError,KeyError) as error:
        failed=True
    finally:old[position]=before
    assert failed,('corruption accepted',label,position)
    negatives.append({'mutation':label,'actual_position':dict(zip('xyz',position)),'before':before,'after':change,'receiver':result['target']['original'],'refused':True})
for result in functions:
    target=P(result['target']['original']);arrivals=[p for p in incoming(target) if old[p]['id']==REP and p not in mapping]
    assert len(arrivals)==1,('unexpected terminal arrivals',target,arrivals)
    p=arrivals[0];block=json.loads(json.dumps(old[p]));block['properties']['facing']=FLIP[block['properties']['facing']]
    refuse('reverse_final_lane_arrival',p,block,result)
for bit in range(8):
    result=next(r for r in functions if r['bit']==bit)
    p=(362,87+4*bit,250);block=json.loads(json.dumps(old[p]));assert block['properties']['mode']=='subtract';block['properties']['mode']='compare';refuse('remove_subtract_mask_function',p,block,result)
    p=(361,87+4*bit,250);block=json.loads(json.dumps(old[p]));assert block['id']==REP;block['properties']['facing']=FLIP[block['properties']['facing']];refuse('reverse_raw_data_arrival',p,block,result)
assert len(negatives)==48
proof={'status':'original_block_id_fanout_and_full_settled_function_recovered','source_sha256':PINS,'original_actual_cells':len(old),'current_actual_cells':total,'shared_byte_ports':8,'distinct_lane_receivers':len(functions),'core_instances_required':['core0','core1'],'instance_transforms_unset':True,'two_core_external_byte_port_obligations':16,'two_core_lane_bit_receivers':64,'function':'PRIME_FF OR (RAW_BLOCK_ID[bit] AND ASSIGN_SOURCE AND NOT HELD_BOOT)','functions':functions,'settled_boolean_assignment_checks':len(functions)*16,'negative_controls':negatives,'new_geometry_cells':0,'new_routes':0,'native_calls':0,'world_mutations':0,'complete_connected_core':False,'native_acceptance':False,'limits':['This recovers original functions and current exact receiver pads only; all replacement mask/fill/fanout geometry and its cost remain required.','All four boundary values are clamped for settled combinational checking. Their state, phase and waveform generation is not established.','No waveform, propagation bound, pulse, setup/hold, Minecraft or density acceptance.','Core0 and core1 must remain distinct physical instances; no assembly transform is assigned.']}
(HERE/'bindings.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'final':'pass','receivers':32,'truth_assignments':512,'negative_controls':48}),flush=True)
