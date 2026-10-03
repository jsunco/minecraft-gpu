"""Independent review of19 new dispatcher master/DCR/cold connections.

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
SOURCE = BASE / 'dispatch-global-colocation-v8-dcr-cold-v1'
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


from functools import lru_cache
pin(SOURCE/'source-manifest.json','a1a409ad844c4ef5645940830a962c1409a5351d11c87d052a90139f7064131d')
manifest=read(SOURCE/'source-manifest.json')
for name in ['dispatch-global-colocation-v6-inverted-v1/connected-candidate.json','dispatch-global-colocation-v7-internal-master-v1/connected-candidate.json','dispatch-global-colocation-v7-internal-master-v1/external-checks.json','dispatch-global-colocation-v8-dcr-cold-v1/connected-candidate.json','dispatch-global-colocation-v8-dcr-cold-v1/external-checks.json','dispatch-global-colocation-v1/reference-scope.json','dispatch-global-colocation-v1/body-placement.json','master-control-routes-v1/design.json','master-loader-control-routes-v1/design.json']:
    p=BASE/name;pin(p,manifest['source_sha256'][str(p.relative_to(ROOT))])
pin(BASE/'dispatch-polarity-repair-review-v1/source-manifest.json','09462bea6bf808fc54b609280472c75246af4494f11262bf196bc9b8deda39ff')
pin(BASE/'dispatch-polarity-repair-review-v1/check.py')
parent=read(BASE/'dispatch-global-colocation-v6-inverted-v1/connected-candidate.json')
middle=read(BASE/'dispatch-global-colocation-v7-internal-master-v1/connected-candidate.json')
d=read(SOURCE/'connected-candidate.json');world=block_map(d);before=block_map(parent)
assert len(before)==189978 and len(world)==202786 and len(d['routes'])==280
for p,b in before.items():assert world[p]==b
parent_routes={r['name']:r for r in parent['routes']};routes={r['name']:r for r in d['routes']};connections={c['name']:c for c in d['connections']}
for name,r in parent_routes.items():assert routes[name]==r
for c in parent['connections']:assert connections[c['name']]==c
assert len(routes)-len(parent_routes)==19
assert store_map(before)==store_map(world) and len(store_map(world))==187
placement=read(BASE/'dispatch-global-colocation-v1/body-placement.json');body=block_map(placement)
assert len(body)==100448
old_to_new={P(r['original_position']):P(r['position']) for r in placement['blocks']};new_to_old={v:k for k,v in old_to_new.items()};old_bodies={P(r['original_position']):r['body'] for r in placement['blocks']}
for p,b in body.items():assert before[p]==world[p]==b
# Full possible-input differential, recomputed without the author's helper.
expected={p:inputs(before,p) for p,b in before.items() if not solid(b)}
for name in set(routes)-set(parent_routes):
    path=list(map(P,routes[name]['path']));c=connections[name]
    assert path[0]==P(c['source']) and path[-1]==P(c['destination'])
    assert len(set(path))==len(path)
    for a,b in zip(path,path[1:]):
        expected.setdefault(b,set()).add(a)
        if world[a]['id']==world[b]['id']==WIRE:expected.setdefault(a,set()).add(b)
actual={};unexpected=[]
for p,b in world.items():
    if b['id'] in (WIRE,REP,COMP,TORCH):assert solid(world.get(ADD(p,DOWN))),('support',p)
    if not solid(b):
        found=inputs(world,p);wanted=expected.get(p,set())
        if found!=wanted:unexpected.append({'p':p,'extra':sorted(found-wanted),'lost':sorted(wanted-found)})
        actual[p]=found
assert not unexpected,unexpected[:8]
print(json.dumps({'full_receivers':len(actual),'full_inputs':sum(map(len,actual.values())),'parent_cells':len(before),'added_cells':len(world)-len(before)}),flush=True)

reference=read(BASE/'dispatch-global-colocation-v1/reference-scope.json')
old=block_map({'blocks':reference['blocks']+reference['foreign_context']})
for name in ['master-control-routes-v1/design.json','master-loader-control-routes-v1/design.json']:
    for r in read(BASE/name)['blocks']:
        p=P(r['position']);b=r['block'];assert p not in old or old[p]==b
        old[p]=b
for p,q in old_to_new.items():assert old[p]==body[q]
# Passive body dust is an input, not an independent held source. Derive this
# classification from same-body internal drivers, not port names.
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
old_roots=driven_body_roots(old,old_bodies);new_roots={old_to_new[p] for p in old_roots}


def evaluate(w,target,boundary_roots,source,high):
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
            local={p:max((max(0,values[q]-(w[q]['id']==WIRE)) for q in deps[p] if q not in members),default=0) for p in members}
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

rows=read(BASE/'dispatch-global-colocation-v7-internal-master-v1/external-checks.json')['matched_connections']+read(SOURCE/'external-checks.json')['matched_connections'];assert len(rows)==19
result=[];negatives=[]
for row in rows:
    name=row['name'];c=connections[name];path=list(map(P,routes[name]['path']));source=P(row['original_source']);target=P(row['original_receiver'])
    assert old_to_new[source]==P(row['source']) and old_to_new[target]==P(row['receiver'])
    assert P(row['original_cut_source']) in inputs(old,target)
    # For all nineteen this target is an undriven body wire, hence part of the
    # full transport cone. A driven receiving body would require a separate role.
    assert target not in old_roots and old[target]['id']==WIRE
    before_values=[evaluate(old,target,old_roots,source,v) for v in (0,15)]
    after_values=[evaluate(world,P(row['receiver']),new_roots,P(row['source']),v) for v in (0,15)]
    assert [v['level']>0 for v in before_values]==[False,True]
    assert [v['level'] for v in after_values]==[0,15]
    csource=P(c['source']);tap=after_values[1]['values'][csource];assert tap>0
    normalizer=P(row['normalizer']);receiver=P(row['receiver'])
    assert normalizer in actual[receiver] and world[normalizer]['id']==REP
    powered=c.get('receiver_delivery')=='strongly_powered_existing_support'
    anchor=P(c['receiving_anchor']) if powered else receiver
    assert ADD(normalizer,vector(world[normalizer]))==anchor
    if powered:
        assert anchor==ADD(receiver,DOWN) and solid(world[anchor]) and before[anchor]==world[anchor]
    result.append({'name':name,'original_source':row['original_source'],'original_receiver':row['original_receiver'],'source':row['source'],'receiver':row['receiver'],'source_port_high_assumption':15,'old_low_high':[v['level'] for v in before_values],'new_low_high':[v['level'] for v in after_values],'new_cone_vertices':after_values[1]['vertices'],'old_cone_vertices':before_values[1]['vertices'],'minimum_active_rear':after_values[1]['minimum_active_rear'],'actual_source_tap_high':tap,'powered_support_delivery':powered})
    mutations=[('reverse_arrival',normalizer),('reverse_source_isolator',P(row['source_isolator']))]
    for kind,p in mutations:
        saved=world[p];assert saved['id']==REP;world[p]={'id':REP,'properties':{**saved['properties'],'facing':FLIP[saved['properties']['facing']]}}
        refused=False
        try:refused=evaluate(world,receiver,new_roots,P(row['source']),15)['level']!=15
        except AssertionError:refused=True
        finally:world[p]=saved
        assert refused,(name,kind);negatives.append({'name':name,'kind':kind,'position':dict(zip('xyz',p)),'refused':True})
    if powered:
        saved=world.pop(anchor);refused=False
        try:refused=evaluate(world,receiver,new_roots,P(row['source']),15)['level']!=15
        except AssertionError:refused=True
        finally:world[anchor]=saved
        assert refused,(name,'remove_support');negatives.append({'name':name,'kind':'remove_powered_support','position':dict(zip('xyz',anchor)),'refused':True})
    print(json.dumps({'connection':name,'old_vertices':before_values[1]['vertices'],'new_vertices':after_values[1]['vertices'],'tap':tap}),flush=True)
assert len(negatives)==49 and sum(r['powered_support_delivery'] for r in result)==11
receipt={'status':'independent_dispatch_v7_v8_extension_geometry_and_source_function_pass','source_sha256':PINS,'exact_parent_cells':len(before),'actual_cells':len(world),'added_cells':len(world)-len(before),'preserved_parent_paths':261,'actual_paths':280,'original_stores':187,'exact_body_cells':100448,'actual_receivers':len(actual),'actual_inputs':sum(map(len,actual.values())),'new_connections':result,'complete_original_and_new_low_high_checks':76,'negative_controls':negatives,'world_mutations':0,'native_calls':0,'complete_gpu_layout':False,'native_acceptance':False,'limits':['This independent review checks the full actual input map and the nineteen new v7/v8 transport cones. Older source-function claims retain their prior independent scope.','Held producer outputs are boundary clamps at0/15. Stored state, clock generation, pulse width, update order, setup/hold, torch burnout and complete timing remain unverified.','All foreign boundaries, two-core placement, loader/program/quiet producers and full master assembly remain required.','Path/cell counts are partial, not whole-machine density or native acceptance.']}
(HERE/'independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['status','actual_cells','actual_receivers','actual_inputs','complete_original_and_new_low_high_checks']}),flush=True)
