"""Independent bounded review of28 inherited bank attenuation repairs.

The checker never executes author generators or author electrical helpers. Its
possible-input model is a static screen for this concrete/wire/diode palette,
not Minecraft event simulation. All changes are in-memory negative controls.
"""
from pathlib import Path
from collections import defaultdict, deque, Counter
import hashlib
import json

HERE = Path(__file__).resolve().parent
BASE = HERE.parents[1]
ROOT = HERE.parents[3]
SOURCE = BASE / 'memory/fabric-colocation-v2'
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

from itertools import zip_longest
import re

def stream_rows(path):
    decoder=json.JSONDecoder()
    with path.open() as f:
        buf=f.read(65536);match=re.search(r'"blocks"\s*:\s*\[',buf);assert match
        buf=buf[match.end():]
        while True:
            buf=buf.lstrip(' \n\r\t,')
            if not buf:buf=f.read(65536);assert buf;continue
            if buf[0]==']':return
            try:row,end=decoder.raw_decode(buf)
            except json.JSONDecodeError:
                more=f.read(65536);assert more;buf+=more;continue
            yield row;buf=buf[end:]

def select(path,wanted):
    m={};count=0
    for row in stream_rows(path):
        count+=1;p=P(row['position'])
        if p in wanted:assert p not in m;m[p]=row['block']
    return m,count

def near(p,radius):
    return {ADD(p,(x,y,z)) for x in range(-radius,radius+1) for y in range(-radius,radius+1) for z in range(-radius,radius+1) if abs(x)+abs(y)+abs(z)<=radius}

pin(SOURCE/'bank-tail-connected-source-manifest.json','8fcf09202aa06fe5d5ac45ef67fb9dedca1226c3f2fb46091a322e08dbedeae4')
manifest=read(SOURCE/'bank-tail-connected-source-manifest.json')
for n in ['bank-tail-attenuation-repair.json','bank-tail-bodies.json','bank-tail-repaired-bodies.json','bank-tail-connected-design.json']:
    p=SOURCE/n;pin(p,manifest['source_sha256'][str(p.relative_to(ROOT))])
pin(BASE/'core-historical-endpoints-review-v1/classify.py')
report=read(SOURCE/'bank-tail-attenuation-repair.json');repairs=report['repairs'];assert len(repairs)==28
bypos={P(r['position']):r for r in repairs};assert len(bypos)==28
changes=[];pairs=0
for left,right in zip_longest(stream_rows(SOURCE/'bank-tail-bodies.json'),stream_rows(SOURCE/'bank-tail-repaired-bodies.json')):
    assert left is not None and right is not None
    p=P(left['position']);assert p==P(right['position'])
    assert left.get('original_position')==right.get('original_position')
    pairs+=1
    if left['block']!=right['block']:
        assert p in bypos,(p,'undeclared change');r=bypos[p];assert left['block']==r['before'] and right['block']==r['after'];assert P(left['original_position'])==P(r['original_position'])
        changes.append(p)
assert len(changes)==28 and pairs==507048
print(json.dumps({'exact_body_comparison':pairs,'only_changes':28}),flush=True)
# Every potentially affected receiver lies at Manhattan distance<=2; another
# radius2 includes every possible driver/support read by our independent model.
impact=set().union(*(near(p,2) for p in bypos));wanted=set().union(*(near(p,4) for p in bypos))
for r in repairs:
    for p in r['original_path']+[r['old_zero_power_receiver']]:wanted|=near(P(p),2)
for r in report['retained_inactive_rears']:
    for p in r['actual_source_free_wire_cone']:wanted|=near(P(p),2)
current,total=select(SOURCE/'bank-tail-connected-design.json',wanted);assert total==1148582
before={p:dict(b) for p,b in current.items()}
for p,r in bypos.items():assert current[p]==r['after'];before[p]=r['before']
old_path=BASE/'memory/master-cold-compatible-v2/design.json';pin(old_path,'364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f')
old_positions={P(r['original_position']) for r in repairs};old,count=select(old_path,old_positions);assert len(old)==28
for r in repairs:assert old[P(r['original_position'])]==r['before']
print(json.dumps({'current_actual_cells':total,'old_actual_cells':count,'bounded_context_cells':len(current)}),flush=True)
old_edges={(q,p) for p in impact for q in inputs(before,p)}
new_edges={(q,p) for p in impact for q in inputs(current,p)}
expected_removed={(P(e['from']),P(e['to'])) for e in report['removed_reverse_wire_edges']}
assert len(expected_removed)==56 and old_edges-new_edges==expected_removed
assert not new_edges-old_edges
for p in impact:
    if current.get(p,{}).get('id') in (WIRE,REP,COMP,TORCH):assert solid(current.get(ADD(p,DOWN))),('support',p)

def cone(world,target,source=None):
    pending=[target];seen=set();deps={}
    while pending:
        p=pending.pop()
        if p in seen:continue
        seen.add(p);assert p in world,(p,'outside complete bounded context')
        if p==source:deps[p]=set();continue
        assert world[p]['id'] in (WIRE,REP),(p,'unexpected device')
        ds=inputs(world,p);deps[p]=ds;pending.extend(ds-seen)
    if source is not None:assert source in seen
    return seen,deps

def level(world,target,source=None,high=0):
    keys,deps=cone(world,target,source)
    for p in keys:
        if world[p]['id']==REP and p!=source:
            direction=vector(world[p]);side={q for q in deps[p] if q[1]==p[1] and sum(abs(a-b) for a,b in zip(q,p))==1 and sum((q[i]-p[i])*direction[i] for i in range(3))==0};assert not side,('unexpected state',p)
    # Numeric monotone relaxation from zero for this wire/repeater cone only.
    # Forbid delayed cycles separately: every diode predecessor traversal must
    # stop at a different upstream diode or the one declared boundary.
    graph={p:set() for p in keys if world[p]['id']==REP}
    for p in graph:
        if p==source:continue
        pending=list(deps[p]);seen=set()
        while pending:
            q=pending.pop()
            if q in seen:continue
            seen.add(q)
            if world[q]['id']==REP:graph[p].add(q);continue
            pending.extend(deps[q]-seen)
    visiting=set();finished=set()
    def visit(p):
        if p in finished:return
        assert p not in visiting,('delayed cycle',p)
        visiting.add(p)
        for q in graph[p]:visit(q)
        visiting.remove(p);finished.add(p)
    for p in graph:visit(p)
    values={p:0 for p in keys}
    for iteration in range(2000):
        next_values={}
        for p in keys:
            if p==source:value=high
            elif world[p]['id']==REP:value=15 if any(values[q]>0 for q in deps[p]) else 0
            else:value=max((max(0,values[q]-(world[q]['id']==WIRE)) for q in deps[p]),default=0)
            next_values[p]=value
        if values==next_values:return values[target],len(keys)
        values=next_values
    raise AssertionError('no settled point')
results=[];negative=[]
for r in repairs:
    p=P(r['position']);source=P(r['normalized_source']);target=P(r['old_zero_power_receiver']);path=[P(v) for v in r['original_path']]
    assert path[0]==source and current[source]['id']==REP and before[target]['id']==REP
    assert len(path)-1==r['old_dust_cells'] and 16<=r['old_dust_cells']<=19
    assert all(before[q]['id']==WIRE for q in path[1:])
    assert all(a in inputs(before,b) for a,b in zip(path,path[1:]+[target]))
    i=r['refresh_index'];assert path[i]==p
    assert path[i+1]==ADD(p,vector(current[p])) and path[i-1]==ADD(p,NEG(vector(current[p])))
    assert current[p]['properties']['delay']=='1'
    oldhi,n=level(before,target,source,15);newlo,_=level(current,target,source,0);newhi,_=level(current,target,source,15)
    assert (oldhi,newlo,newhi)==(0,0,15)
    reverse=json.loads(json.dumps(current[p]));reverse['properties']['facing']=FLIP[reverse['properties']['facing']];bad=dict(current);bad[p]=reverse
    refused=False
    try:refused=level(bad,target,source,15)[0]!=15
    except AssertionError:refused=True
    assert refused
    negative.append({'position':r['position'],'mutation':'reverse_added_refresh','refused':True})
    results.append({'bank':r['bank'],'net':r['net'],'position':r['position'],'original_position':r['original_position'],'source':r['normalized_source'],'target':r['old_zero_power_receiver'],'before_high':oldhi,'after_low':newlo,'after_high':newhi,'actual_cone_cells':n,'added_nominal_ticks':2})
inactive=[]
for r in report['retained_inactive_rears']:
    target=P(r['position']);keys,deps=cone(current,target)
    assert all(p==target or current[p]['id']==WIRE for p in keys)
    assert keys=={P(p) for p in r['actual_source_free_wire_cone']}
    value,n=level(current,target);assert value==0
    inactive.append({'position':r['position'],'actual_source_free_cells':n,'level':value})
assert len(inactive)==364
receipt={'status':'independent_bounded_bank_refresh_and_inactive_cone_review_pass','source_sha256':PINS,'exact_copied_cells_compared':pairs,'only_body_changes':len(changes),'actual_final_map_cells':total,'actual_original_source_cells':count,'bounded_final_context_cells':len(current),'affected_receivers_checked':len([p for p in impact if p in current and not solid(current[p])]),'only_removed_dependencies':56,'added_dependencies':0,'repairs':results,'cases':84,'reversed_refresh_mutations':negative,'source_free_inactive_rears':inactive,'new_geometry_generated':False,'world_mutations':0,'native_calls':0,'complete_gpu_layout':False,'native_acceptance':False,'limits':['This independently verifies the28 material changes, their source0/15 behavior, local full input differential and364 source-free inactive rear cones. It does not independently repeat the full bank restoration,25cables,tail-to-drain or retained-state proof.','Boundary source levels are deliberate test clamps; upstream timing/state/phase generation is unproven.','Each replacement adds two nominal ticks; complete owner/payload/capture/withdrawal/type/READY timing must be rebound.','No event simulation, pulse/setup/hold or physical Minecraft acceptance.']}
(HERE/'independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'pass','copied_cells':pairs,'repairs':28,'cases':84,'mutations':28,'inactive_cones':364}),flush=True)
