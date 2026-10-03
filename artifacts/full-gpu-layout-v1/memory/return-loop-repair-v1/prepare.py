"""Source-bound, in-place return-entry repair. No native or frozen-file writes."""
from pathlib import Path
import json, hashlib, gc

H = Path(__file__).resolve().parent
ROOT = H.parents[3]
P = lambda p: tuple(p[a] for a in 'xyz')
POS = lambda p: dict(zip('xyz', p))
KEY = lambda p: ','.join(map(str, p))
SHA = lambda p: hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()
W, R, S = ('minecraft:' + n for n in ['redstone_wire', 'repeater', 'light_gray_concrete'])
PARENT = H.parent / 'master-cold-compatible-v2/design.json'
AUDIT = H.parent / 'channel-colocation-v1/original-feedback-audit.json'
TRIAL = H.parent / 'channel-colocation-v1/trial-design.json'
CONFIG = ROOT / 'artifacts/full-gpu-layout-v1/machine-candidate-v1/config.json'

def save(name, obj):
    (H / name).write_text(json.dumps(obj, separators=(',', ':')) + '\n')

def main():
    assert SHA(PARENT) == '364c11e6e3c7e6deafbd8f279b1e95d6baed949a64a2e4f2cb4592c1bca1207f'
    assert SHA(TRIAL) == '82807b31ecf540b7f65fff558ac9e0c30ef7b59b72c7fbe52c65e4e63ec78448'
    audit = json.load(AUDIT.open())
    entries = [r for r in audit['witnesses'] if r['name'].startswith(('response1', 'response2', 'response3', 'ready1', 'ready2', 'ready3'))]
    assert len(entries) == 27 and sum(r['feedback_found'] for r in entries) == 25
    parent = json.load(PARENT.open())
    assert len(parent['blocks']) == 3381962
    world = {P(v['position']): v for v in parent['blocks']}
    changes = []
    for r in entries:
        if not r['feedback_found']:
            continue
        p, o = P(r['driver']), P(r['output'])
        assert o == (p[0], p[1], p[2]+1)
        assert world[p]['block'] == {'id': R, 'properties': {'facing': 'north', 'delay': '1'}}
        assert world[o]['block'] == {'id': W}
        for pos, block in [(p, {'id': W}), (o, {'id': R, 'properties': {'facing': 'west', 'delay': '1'}})]:
            changes.append({'name': r['name'], 'position': POS(pos), 'before': world[pos]['block'], 'after': block})
    assert len(changes) == 50
    # A full entry neighbourhood includes both unresolved channel-3 entries.
    local = set()
    for r in entries:
        x, y, z = P(r['driver'])
        local.update((x+dx, y+dy, z+dz) for dx in range(-7, 8) for dy in range(-3, 4) for dz in range(-7, 8))
    local_rows = [world[p] for p in sorted(local) if p in world]
    changed_halo = set()
    for r in changes:
        x, y, z = P(r['position'])
        changed_halo.update((x+dx, y+dy, z+dz) for dx in range(-3, 4) for dy in range(-3, 4) for dz in range(-3, 4))
    affected_rows = [world[p] for p in sorted(changed_halo) if p in world]
    # Complete selected retained-Q and untyped READY cables, including supports,
    # their source taps, descending paths, and actual receiver dust terminals.
    wanted = {r['net'] for r in entries}
    # The old generator assigns its delayed READY planar paths the final
    # `actual_typed_ready_field_joins` group. Exact net identity, not that stale
    # group label, identifies every physical segment of each selected cable.
    cable = [v for v in parent['blocks'] if parent['groups'].get(KEY(P(v['position'])), '').startswith('actual_') and parent['nets'].get(KEY(P(v['position']))) in wanted]
    binds = [r for r in parent['return_bindings'] if r['channel'] in [1, 2, 3] and r['kind'] in ['retained_response', 'backend_ready']]
    assert len(binds) == 27
    cable_keys = {P(v['position']) for v in cable}
    for r in binds:
        for n in ['source', 'destination']:
            p = P(r[n]); cable_keys.add(p)
            if (p[0], p[1]-1, p[2]) in world:
                cable_keys.add((p[0], p[1]-1, p[2]))
    cable_rows = [world[p] for p in sorted(cable_keys)]
    routes = [r for r in parent['return_routes'] if any(r['name'].startswith(e['name']+'_') for e in entries)]
    ports_hash = hashlib.sha256(json.dumps(parent['ports'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    save('parent-slices.json', {'entries': entries, 'entry_blocks': local_rows, 'affected_blocks': affected_rows, 'routes': routes, 'bindings': binds, 'cable_blocks': cable_rows, 'parent_port_semantic_sha256': ports_hash})
    save('delta.json', {'status': 'offline_return_entry_repair_candidate', 'parent_path': str(PARENT.relative_to(ROOT)), 'parent_sha256': SHA(PARENT), 'substitutions': changes, 'added_blocks': [], 'removed_blocks': [], 'metrics': {'substitutions': 50, 'repaired_entries': 25, 'unchanged_investigated_entries': 2, 'block_delta': 0, 'repeater_delta': 0, 'storage_delta': 0}, 'native_acceptance': False})
    del world, parent, cable, cable_rows, local_rows, affected_rows
    gc.collect()
    # Preserve a concrete selected-frame snapshot; hash every actual design and
    # inspect its translated cells, rather than assuming a bounding box is empty.
    raw = CONFIG.read_bytes(); (H / 'selected-config.json').write_bytes(raw)
    config = json.loads(raw); foreign = []; inventory = []; source_pins = {str(PARENT.relative_to(ROOT)): SHA(PARENT), str(AUDIT.relative_to(ROOT)): SHA(AUDIT), str(TRIAL.relative_to(ROOT)): SHA(TRIAL)}
    for instance in config['instances']:
        if instance['name'] == 'memory':
            assert instance['path'] == str(PARENT.relative_to(ROOT)) and instance['sha256'] == SHA(PARENT)
            continue
        f = ROOT / instance['path']; assert SHA(f) == instance['sha256']
        source_pins[instance['path']] = instance['sha256']
        d = json.load(f.open()); off = P(instance['translation']); hits = []
        for row in d['blocks']:
            p = tuple(a+b for a,b in zip(P(row['position']), off))
            if p in changed_halo:
                hits.append({'position': POS(p), 'block': row['block'], 'instance': instance['name']})
        foreign.extend(hits)
        inventory.append({'instance': instance['name'], 'path': instance['path'], 'sha256': instance['sha256'], 'translation': instance['translation'], 'cells_checked': len(d['blocks']), 'halo_cells': len(hits)})
        del d; gc.collect()
    trial = json.load(TRIAL.open()); conflicts = []
    for kind, rows in [('removed', trial['removed']), ('added', trial['blocks'])]:
        for row in rows:
            if P(row['position']) in changed_halo:
                conflicts.append({'kind': kind, 'row': row})
    assert not conflicts, 'Channel-0 replacement shares changed-cell halo'
    save('foreign-check.json', {'selected_config_sha256': hashlib.sha256(raw).hexdigest(), 'instances': inventory, 'foreign_blocks': foreign, 'channel0_design_sha256': SHA(TRIAL), 'channel0_removed': len(trial['removed']), 'channel0_added': len(trial['blocks']), 'channel0_changed_halo_conflicts': conflicts, 'halo_chebyshev_radius': 3, 'source_sha256': source_pins, 'native_acceptance': False})
    print(json.dumps({'substitutions':len(changes), 'selected_foreign_cells_checked':sum(r['cells_checked'] for r in inventory), 'foreign_halo_cells':len(foreign), 'channel0_conflicts':len(conflicts)}))

if __name__ == '__main__':
    main()
