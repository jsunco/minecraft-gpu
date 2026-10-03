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

pin(SOURCE/'source-manifest.json','7d8fc20d6228946fae1688c0321532ff89aa8d4e05334f61d8169d5979f99111')
manifest=read(SOURCE/'source-manifest.json')
for name,digest in manifest['source_sha256'].items():pin(ROOT/name,digest)
pin(BASE/'core-historical-endpoints-review-v1/source-manifest.json','a262687149db6cf169e9970c7cc882fb2aa50fd9d2839757096432ff8da4a815')
pin(BASE/'core-historical-endpoints-review-v1/classification.json')
pin(BASE/'core-shared-state-pc-review-v1/check.py')
classification=read(BASE/'core-historical-endpoints-review-v1/classification.json')
old_path=BASE/'compact-core-guard-v1/design.json'
pin(old_path,'2da4daf7365f65628fdbbda5573a00f0a5464fbb163f20c9a6e10e7d92f7c4e1')
old=stream_world(old_path);assert len(old)==1828787
parent=read(SOURCE/'design.json');before=block_map(parent);world=dict(before)
assert len(before)==840755
recipes=[];additions={};edges=[]
for row in classification['rows']:
    if 'full_cycle_advance_' not in row['name']:continue
    target=P(row['historical_target']);source=P(row['historical_source']);newtarget=P(row['mapped_target']['position']);delta=tuple(b-a for a,b in zip(target,newtarget))
    seen=set();pending=[target]
    while pending:
        q=pending.pop()
        if q in seen:continue
        seen.add(q);pending.extend(inputs(old,q)-seen)
    assert len(seen)==4 and source in seen and old[source]['id']==RED
    assert all(old[q]['id'] in (WIRE,REP,RED) for q in seen)
    positions=set(seen)
    for q in seen:
        if old[q]['id'] in (WIRE,REP):positions.add(ADD(q,DOWN))
    add=[];kept=[]
    for q in sorted(positions):
        new=ADD(q,delta);block=old[q]
        if new in world:
            assert world[new]==block,('constant recipe collision',row['name'],q,new,world[new],block)
            kept.append(new)
        else:
            entry={'position':dict(zip('xyz',new)),'block':block,'original_position':dict(zip('xyz',q)),'provenance':row['name']}
            additions[new]=entry;world[new]=block;add.append(new)
    expected_edges=[]
    for q in seen:
        for driver in inputs(old,q):
            assert driver in seen
            edge={'from':dict(zip('xyz',ADD(driver,delta))),'to':dict(zip('xyz',ADD(q,delta)))}
            edges.append(edge);expected_edges.append(edge)
    recipes.append({'name':row['name'],'original_source':row['historical_source'],'source':dict(zip('xyz',ADD(source,delta))),'original_target':row['historical_target'],'target':row['mapped_target']['position'],'original_active_cone':[dict(zip('xyz',q)) for q in sorted(seen)],'translated_active_cone':[dict(zip('xyz',ADD(q,delta))) for q in sorted(seen)],'added_cells':len(add),'shared_parent_cells':len(kept),'edges':expected_edges})
assert len(recipes)==7
assert all(world[p]==b for p,b in before.items())
assert store_map(world)==store_map(before) and len(store_map(world))==1117
expected=defaultdict(set)
for p,b in before.items():
    if not solid(b):expected[p].update(inputs(before,p))
preserved=sum(map(len,expected.values()))
for edge in edges:expected[P(edge['to'])].add(P(edge['from']))
actual={}
for p,b in world.items():
    if b['id'] in (WIRE,REP,COMP,TORCH):assert solid(world.get(ADD(p,DOWN))),('unsupported',p)
    if not solid(b):
        found=inputs(world,p)
        assert found==expected[p],(p,'unexpected',list(found-expected[p])[:5],'lost',list(expected[p]-found)[:5])
        actual[p]=found
# Follow the actual one-source constant cone, including strength restoration.
def constant_value(w,target,source):
    visiting=set();done={}
    def value(p):
        if p in done:return done[p]
        assert p not in visiting,('unexpected constant feedback',p)
        visiting.add(p);block=w.get(p);assert block
        if block['id']==RED:assert p==source;result=15
        else:
            ds=inputs(w,p);assert ds,('missing constant driver',p)
            vals=[value(q)-(1 if block['id']==WIRE and w[q]['id']==WIRE else 0) for q in ds]
            if block['id']==REP:assert max(vals)>0;result=15
            else:assert block['id']==WIRE;result=max(vals)
        visiting.remove(p);assert result>0;done[p]=result;return result
    result=value(target);return result,len(done)
negative=[];strength=[]
for r in recipes:
    source,target=P(r['source']),P(r['target']);result,n=constant_value(world,target,source);assert result>0
    strength.append({'name':r['name'],'actual_source':r['source'],'actual_target':r['target'],'target_high':result,'active_vertices':n})
    b=world.pop(source)
    try:constant_value(world,target,source)
    except(AssertionError,KeyError):negative.append(r['name']+':source_removed')
    else:raise AssertionError('missing constant source accepted')
    finally:world[source]=b
    for q in map(P,r['translated_active_cone']):
        b=world[q]
        if b['id']!=REP:continue
        world[q]={**b,'properties':{**b['properties'],'facing':FLIP[b['properties']['facing']]}}
        try:constant_value(world,target,source)
        except(AssertionError,KeyError):negative.append(r['name']+':diode_reversed')
        else:raise AssertionError('reversed constant diode accepted')
        finally:world[q]=b
assert len(negative)==14
newblocks=parent['blocks']+list(additions.values());assert len(newblocks)==len(world)
box={key:dict(zip('xyz',values)) for key,values in [('from',tuple(min(p[i] for p in world) for i in range(3))),('to',tuple(max(p[i] for p in world) for i in range(3)))]}
columns=len({(p[0]//16,p[2]//16) for p in world})
pin(Path(__file__).resolve())
d={'status':'seven_original_advance_constants_connected_offline','blocks':newblocks,'added':list(additions.values()),'constant_recipes':recipes,'edges':edges,'ports':parent.get('ports',{}),'box':box,'metrics':{'cells':len(world),'parent_cells':len(before),'added_cells':len(additions),'stores':1117,'constant_sources':7,'occupied_chunk_columns':columns},'complete_core':False,'native_acceptance':False}
(HERE/'design.json').write_text(json.dumps(d,indent=2)+'\n')
report={'status':'source_exact_constant_geometry_and_full_input_check_pass','cells':len(world),'parent_cells_preserved':len(before),'added_cells':len(additions),'constant_sources':7,'original_active_cells_per_cone':4,'side_lock_stores_preserved':1117,'receivers':len(actual),'preserved_inputs':preserved,'actual_inputs':sum(map(len,actual.values())),'box':box,'occupied_chunk_columns':columns,'strength':strength,'actual_corruption_refusals':negative,'source_sha256':PINS,'limits':['Only seven original constant-feed cones are newly connected. Original source/support/diode states are translated exactly and the full parent remains unchanged.','No complete body timing, cold initialization/event order, state-machine acceptance or full-core connectivity is proven.','Other fourteen-entry obligations remain separate; no software supplies a running constant or GPU state. All newly drawn sources are actual vanilla redstone blocks.'],'complete_core':False,'complete_gpu_layout':False,'native_acceptance':False,'world_mutations':0}
(HERE/'checks.json').write_text(json.dumps(report,indent=2)+'\n')
(HERE/'placement-recipe.json').write_text(json.dumps({'constants':recipes,'additions':list(additions.values()),'before_sha256':sha(SOURCE/'design.json')},indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('source_sha256','limits','strength','actual_corruption_refusals')}))
