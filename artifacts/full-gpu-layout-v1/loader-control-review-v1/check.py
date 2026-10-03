"""Independent bounded loader-owner layout and source-function review. Offline only."""
from pathlib import Path
from collections import defaultdict, deque, Counter
import hashlib
import json

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
ROOT = HERE.parents[2]
SOURCE = BASE / 'loader-program-colocation-v1/control-owner-v1'
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

def driven_body_roots(w,labels):
    passive={p for p in labels if w[p]['id']==WIRE};powered=set();followers=defaultdict(set)
    for p in passive:
        for q in inputs(w,p):
            if labels.get(q)==labels[p]:
                if w[q]['id']!=WIRE:powered.add(p)
                else:followers[q].add(p)
    queue=deque(powered)
    while queue:
        for q in followers[queue.popleft()]:
            if q not in powered:powered.add(q);queue.append(q)
    return {p for p in labels if not solid(w[p]) and (w[p]['id']!=WIRE or p in powered)}

def evaluate(w,target,boundary_roots,source,high, conservative_wire_loss=False):
    keys=set();deps={};roots=set();pending=[target]
    while pending:
        p=pending.pop()
        if p in keys:continue
        keys.add(p);assert p in w,('missing actual device',p)
        if p in boundary_roots and p!=target:deps[p]=set();roots.add(p);continue
        assert w[p]['id'] in (WIRE,REP,TORCH,WALL,RED),('nontransport device',p,w[p])
        deps[p]=inputs(w,p);pending.extend(deps[p]-keys)
    assert roots=={source},('wrong complete source function',target,roots,source)
    # Collapse just reciprocal dust, then evaluate a real delayed-device DAG.
    leader={p:p for p in keys}
    def find(p):
        while leader[p]!=p:leader[p]=leader[leader[p]];p=leader[p]
        return p
    for p in keys:
        for q in deps[p]:
            if p not in roots and q not in roots and w[p]['id']==w[q]['id']==WIRE:leader[find(p)]=find(q)
    groups=defaultdict(set)
    for p in keys:groups[find(p)].add(p)
    upstream={g:set() for g in groups};downstream=defaultdict(set)
    for p in keys:
        for q in deps[p]:
            a,b=find(q),find(p)
            if a!=b:upstream[b].add(a);downstream[a].add(b)
            else:assert w[p]['id']==w[q]['id']==WIRE
    remaining={g:len(v) for g,v in upstream.items()};queue=deque(g for g,v in remaining.items() if not v);values={};visited=0;minimum=15
    while queue:
        g=queue.popleft();members=groups[g];visited+=1
        if len(members)>1 or w[next(iter(members))]['id']==WIRE and next(iter(members)) not in roots:
            assert all(w[p]['id']==WIRE for p in members)
            local={p:max((max(0,values[q]-(conservative_wire_loss or w[q]['id']==WIRE)) for q in deps[p] if q not in members),default=0) for p in members}
            todo=deque(p for p in members if local[p]);followers=defaultdict(set)
            for p in members:
                for q in deps[p]:
                    if q in members:followers[q].add(p)
            while todo:
                q=todo.popleft()
                for p in followers[q]:
                    value=max(0,local[q]-1)
                    if value>local[p]:local[p]=value;todo.append(p)
            values.update(local)
        else:
            p=next(iter(members));kind=w[p]['id']
            if p in roots:value=high
            elif kind==RED:value=15
            elif kind in (TORCH,WALL):value=0 if any(values[q]>0 for q in deps[p]) else 15
            elif kind==REP:
                direction=vector(w[p]);assert all(not(q[1]==p[1] and sum(abs(a-b) for a,b in zip(q,p))==1 and sum((q[i]-p[i])*direction[i] for i in range(3))==0) for q in deps[p]),('unexpected lock',p)
                rear=max((values[q] for q in deps[p]),default=0);minimum=min(minimum,rear) if high and rear else minimum;value=15 if rear else 0
            else:raise AssertionError((p,kind))
            values[p]=value
        for child in downstream[g]:
            remaining[child]-=1
            if not remaining[child]:queue.append(child)
    assert visited==len(groups),('delayed-device cycle',target,visited,len(groups))
    return {'level':values[target],'vertices':len(keys),'device_groups':len(groups),'minimum_active_rear':minimum,'values':values}

origin=SOURCE.parent
pin(BASE/'dispatch-master-extension-review-v1/check.py')
for n in ('body-placement.json','connected-candidate.json','source-functions.json','remaining-cuts.json'):
    pin(SOURCE/n)
pin(origin/'loader-control-body.json');pin(origin/'inventory.json')
d=read(SOURCE/'connected-candidate.json');placement=read(SOURCE/'body-placement.json')
functions=read(SOURCE/'source-functions.json');body=block_map(placement);world=block_map(d)
assert len(body)==5231 and len(world)==5573 and len(d['routes'])==3
for p,b in body.items():assert world[p]==b
old_body=block_map(read(origin/'loader-control-body.json'))
old=block_map({'blocks':functions['old_comparable_blocks']})
assert len(old)==6435 and len(old_body)==5231
mapping={P(r['original_position']):P(r['position']) for r in placement['blocks']}
assert set(mapping)==set(old_body) and len(set(mapping.values()))==5231
for r in placement['blocks']:
    a=P(r['original_position']);b=P(r['position'])
    assert old[a]==old_body[a]==body[b]
    assert ADD(a,P(placement['body_transforms'][r['family']]))==b
source_path=BASE/'memory/master-cold-compatible-v2/design.json'
pin(source_path,'364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f')
source_blocks,source_count=stream_selected_blocks(source_path,set(old))
assert source_count==3381962 and source_blocks==old
print(json.dumps({'actual_original_source_cells_scanned':source_count,'matching_old_scope_cells':len(old),'body_cells':len(body)}),flush=True)
expected={mapping[p]:{mapping[q] for q in inputs(old_body,p)} for p,b in old_body.items() if not solid(b)}
connections={c['name']:c for c in d['connections']};routes={r['name']:r for r in d['routes']}
for r in d['routes']:
    path=list(map(P,r['path']));c=connections[r['name']]
    assert path[0]==P(c['source']) and path[-1]==P(c['destination']) and len(set(path))==len(path)
    for a,b in zip(path,path[1:]):
        expected.setdefault(b,set()).add(a)
        if world[a]['id']==world[b]['id']==WIRE:expected.setdefault(a,set()).add(b)
actual={};supported=0
for p,b in world.items():
    if b['id'] in (WIRE,REP,COMP,TORCH):assert solid(world.get(ADD(p,DOWN)));supported+=1
    if b['id']==WALL:assert solid(world.get(ADD(p,vector(b))));supported+=1
    if not solid(b):
        actual[p]=inputs(world,p)
        assert actual[p]==expected.get(p,set()),(p,'extra',actual[p]-expected.get(p,set()),'lost',expected.get(p,set())-actual[p])
assert store_map(old)==store_map(old_body)=={} and store_map(world)=={}
# The retained owner is an SR torch bit, not a side-locked repeater store.
labels={P(r['original_position']):r['body'] for r in placement['blocks']}
roots=driven_body_roots(old,labels);new_roots={mapping[p] for p in roots}
checks=[];negatives=[]
for row in functions['selected']:
    name='local_'+row['name'];c=connections[name];receiver=P(c['destination']);producer=P(c['source'])
    assert mapping[P(row['source'])]==producer and mapping[P(row['target'])]==receiver
    before=[evaluate(old,P(row['target']),roots,P(row['source']),v) for v in (0,15)]
    after=[evaluate(world,receiver,new_roots,producer,v) for v in (0,15)]
    assert [v['level']>0 for v in before]==[False,True]
    assert [v['level'] for v in after]==[0,15]
    checks.append({'name':name,'old_levels':[v['level'] for v in before],'new_levels':[v['level'] for v in after],'old_vertices':before[1]['vertices'],'new_vertices':after[1]['vertices'],'minimum_conditional_rear':after[1]['minimum_active_rear']})
    for field in ('source_isolator','normalizer'):
        p=P(c[field]);saved=world[p];assert saved['id']==REP
        world[p]={'id':REP,'properties':{**saved['properties'],'facing':FLIP[saved['properties']['facing']]}}
        try:
            try:refused=evaluate(world,receiver,new_roots,producer,15)['level']!=15
            except AssertionError:refused=True
        finally:world[p]=saved
        assert refused;negatives.append({'name':name,'mutation':'reverse_'+field,'refused':True})
    p=P(c['receiving_anchor']);assert p==ADD(receiver,DOWN) and solid(world[p]);saved=world.pop(p)
    try:
        try:refused=evaluate(world,receiver,new_roots,producer,15)['level']!=15
        except AssertionError:refused=True
    finally:world[p]=saved
    assert refused;negatives.append({'name':name,'mutation':'remove_receiver_support','refused':True})
def cost(w):
    lo=tuple(min(p[i] for p in w) for i in range(3));hi=tuple(max(p[i] for p in w) for i in range(3))
    return {'cells':len(w),'dimensions':[hi[i]-lo[i]+1 for i in range(3)],'occupied_columns':len({(p[0]//16,p[2]//16) for p in w})}
assert cost(old)['occupied_columns']==37 and cost(world)['occupied_columns']==17
receipt={'status':'independent_loader_owner_geometry_source_functions_pass','source_sha256':PINS,'actual_source_cells_scanned':source_count,'exact_body_cells':len(body),'exact_comparable_old_cells':len(old),'actual_cells':len(world),'actual_receivers':len(actual),'actual_inputs':sum(map(len,actual.values())),'supported_devices':supported,'paths':3,'path_vertices':sum(len(r['path']) for r in d['routes']),'settled_old_and_new_cases':12,'new_connections':checks,'negative_controls':negatives,'old_matched_scope':cost(old),'current_matched_scope':cost(world),'saved_matched_scope_cells':len(old)-len(world),'world_mutations':0,'native_calls':0,'complete_gpu_layout':False,'native_acceptance':False,'limits':['The original full cold-compatible source is streamed; all 6435 old comparable cells and all 5231 translated bodies match actual blocks. No author electrical helpers or generators execute.','This checks three actual transport functions and the full static possible-input map, not the loader matrix truth, SR state convergence, scheduling or timing.','Only the exact body plus three routed joins is compared. ROM, payload/loading panels, quiet/service/master wires and 22 incident cut entries remain outside this placed scope.','Source-aware held-high strength is conditional: wire-to-wire loses one, regenerated repeater/support supply is fifteen. It is not an in-game measurement.','Local cell/column reductions are not full-loader, whole-machine compactness or vanilla ticking admission.']}
(HERE/'independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ('status','actual_cells','actual_receivers','actual_inputs','settled_old_and_new_cases','saved_matched_scope_cells')}),flush=True)
