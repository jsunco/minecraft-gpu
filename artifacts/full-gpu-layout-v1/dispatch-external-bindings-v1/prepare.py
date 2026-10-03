"""Classify exact old cuts; export current local ports without inventing placement."""
from pathlib import Path
import collections
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = HERE.parent
pins = {}

def read(path):
    p = BASE / path
    raw = p.read_bytes()
    pins[str(p.relative_to(ROOT))] = hashlib.sha256(raw).hexdigest()
    return json.loads(raw)

def key(p):
    return ','.join(str(p[a]) for a in 'xyz')

def eq(a, b):
    return a is not None and b is not None and key(a) == key(b)

candidate = read('dispatch-global-colocation-v6-inverted-v1/connected-candidate.json')
own = {key(v['original_position']): v for v in candidate['blocks'] if 'body' in v}
ledger = read('dispatch-reciprocal-edge-review-v1/assembly-ledger.json')
frame = read('floorplan-v3/frame-config.json')
core_map = read('core-lane-colocation-v1/request-or-connected-v1/endpoint-map.json')['mapping']
core_manifest = read('core-lane-colocation-v1/request-or-connected-v1/source-manifest.json')
assert pins['artifacts/full-gpu-layout-v1/core-lane-colocation-v1/request-or-connected-v1/source-manifest.json'] == '938d3d6a3932bad8d2aff116907ac4b614c31ebcf6f950a4a4135c17e782c745'
memory_manifest = read('memory/fabric-colocation-v2/consumer-drain-source-manifest.json')
assert pins['artifacts/full-gpu-layout-v1/memory/fabric-colocation-v2/consumer-drain-source-manifest.json'] == '8aa456d49054402d5a4882fd723cb48ba228b6ed57298f31cc599950448ae545'
declared = read('memory/fabric-colocation-v2/declared-connections.json')
read('memory/fabric-colocation-v2/boundary-census.json')
master_contract = read('master-boundary-contract-v1/contract.json')
phase = read('memory/fabric-colocation-v2/snapshot-phase-design.json')
memory_design = read('memory/fabric-colocation-v2/consumer-drain-design.json')
memory_reset = phase['phasePorts']['reset']
memory_reset_blocks = [v['block'] for v in memory_design['blocks'] if eq(v['position'], memory_reset)]
assert len(memory_reset_blocks) == 1
del memory_design
route_names = ['master-loader-control-routes-v1', 'master-control-routes-v1',
               'master-core-done-routes-v1', 'master-bank-quiet-routes-v1',
               'master-core-admission-routes-v1', 'master-core-service-routes-v1',
               'master-core-conditioning-routes-v1', 'master-dispatch-payload-routes-v1']
route_designs = {name: read(name + '/design.json') for name in route_names}
requesters = read('master-reset-requesters-v2/connected-design.json')
required_core_cells = set()

def endpoint(instance, port, position, bit=None):
    e = {'original_instance': instance, 'port': port, 'bit': bit,
         'original_master_position': position}
    if key(position) in own:
        cell = own[key(position)]
        e.update(status='exact_retained_body_cell', module='dispatch_global_requester_DCR',
                 position=cell['position'], body=cell['body'], block=cell['block'],
                 coordinate_frame='repaired_v6_local', placement='present_in_current_candidate')
    elif instance in ['core0', 'core1']:
        translation = frame['instances'][instance]['translation']
        local = {a: position[a] - translation[a] for a in 'xyz'}
        e.update(module=instance, original_core_position=local,
                 coordinate_frame='compact_core_template_local',
                 placement='core_instance_assembly_transform_unset')
        mapped = core_map.get(key(local))
        if mapped:
            e.update(status='exact_frozen_core_body_cell', **mapped)
            required_core_cells.add(key(mapped['position']))
        else:
            e.update(status='old_core_transport_port_unmapped', position=None,
                     required='Trace old shared input/fanout to actual mapped body recipients; do not interpolate a transform.')
    elif instance == 'loader' and port == 'data.reset' and eq(position, memory_reset):
        e.update(status='exact_frozen_memory_phase_body_cell', module='memory_fabric',
                 position=memory_reset, block=memory_reset_blocks[0],
                 coordinate_frame='consumer_drain_memory_local',
                 placement='memory_instance_assembly_transform_unset')
    else:
        e.update(status='producer_or_receiver_body_not_in_current_memory_freeze',
                 module='loader_program_or_memory_service', position=None,
                 placement='missing_compact_body_and_assembly_transform')
    return e

def route_binding(folder, c, destination_override=None):
    source = c.get('upstream_driver', {}).get('position', c['source'])
    instance = c.get('upstream_driver', {}).get('instance', c['source_instance'])
    port = c.get('upstream_driver', {}).get('port', c['source_port'])
    dest = destination_override or c['destination']
    out = {'route_folder': folder, 'old_connection': c,
           'producer': endpoint(instance, port, source, c.get('source_bit')),
           'receiver': endpoint(c['destination_instance'], c['destination_port'], dest, c.get('destination_bit')),
           'source_function': c.get('source_semantics', c.get('semantics', 'Exact original named output ' + port)),
           'polarity_proof': 'Classify actual old transport before replacement; the declaration alone is not proof.'}
    if destination_override:
        out['receiver']['port'] += '.existing_internal_fanout_to_' + own[key(dest)]['body']
        out['receiver']['original_named_route_destination'] = c['destination']
    return out

incoming = []
for t in ledger['transfers']:
    if t['status'] != 'external_source_transfer_pending':
        continue
    folder = t['source_body'].removeprefix('foreign/')
    if folder == 'foreign_context':
        matches = [c for c in requesters['connections'] if eq(c['source'], t['source']) and eq(c['destination'], t['target'])]
        assert len(matches) == 1
        c = dict(matches[0])
        core = int(c['name'][4])
        c.update(source_instance=f'core{core}', source_port='reset_barrier.final_ACK',
                 destination_instance='requester', destination_port=f'core{core}_actual_ACK_fanout')
        b = route_binding('master-reset-requesters-v2', c)
        b['source_function'] = 'Actual final core reset ACK before requester completion storage; not requester-qualified completion.'
    else:
        matches = [c for c in route_designs[folder]['connections'] if eq(c.get('normalizer'), t['source'])]
        assert len(matches) == 1, (t, matches)
        c = matches[0]
        b = route_binding(folder, c, t['target'] if not eq(t['target'], c['destination']) else None)
    incoming.append({'transfer_index': t['transfer_index'], 'old_cut': t, **b})
assert len(incoming) == 37

direct = []
for i, cut in enumerate(ledger['direct_foreign_boundaries']):
    if i == 0:
        c = next(c for c in declared['loader']['connections'] if c['name'] == 'staged_dcr_reset_permit')
        b = {'producer': endpoint('loader', 'loader.dcr_reset_permit', c['source']),
             'receiver': endpoint('config', 'DCR.raw_reset_subtract_side', cut['target']),
             'old_connection': c, 'source_function': 'NOT(dcr_reset_permit) at comparator side; rear is raw operator reset. Preserve physical inversion before side clamp.',
             'polarity_proof': 'Actual wall-torch stage in initial-loader-warm-drain-v3/prepare.mjs; producer logic remains an explicit boundary.',
             'required_intermediate_old_geometry': [{'x': -408, 'y': -4, 'z': 599}, {'x': -407, 'y': -4, 'z': 599}, {'x': -406, 'y': -4, 'z': 599}, {'x': -406, 'y': -4, 'z': 598}, {'x': -406, 'y': -4, 'z': 597}, cut['source']]}
        bindings = [b]
    elif i in [1, 2]:
        c = next(c for c in declared['loader']['connections'] if eq(c['source'], cut['source']))
        c = dict(c, source_instance='config', source_port='config.start' if i == 1 else 'config.global_reset',
                 destination_instance='loader', destination_port='loader.raw_start' if i == 1 else 'loader.raw_reset')
        bindings = [route_binding('initial-loader-warm-drain-v3', c)]
    else:
        folder = cut['target_body'].removeprefix('foreign/')
        matches = [c for c in route_designs[folder]['connections'] if eq(c['source'], cut['source'])]
        assert matches, cut
        bindings = [route_binding(folder, c) for c in matches]
    direct.append({'direct_index': i, 'old_cut': cut, 'bindings': bindings})
assert len(direct) == 48

# A cut into one old shared transport must not hide its downstream branches.
# Retain named fanouts including global cold to memory, ALU permit, and current
# requester recipients, even when their route tap lies beyond the initial cut.
owned_output_keys = {key(b['producer']['original_master_position'])
                     for b in incoming + [b for r in direct for b in r['bindings']]
                     if b['producer']['status'] == 'exact_retained_body_cell'}
fanouts = []
for net in master_contract['required_connections']:
    sources, targets = net['driver']['positions'], net['sink']['positions']
    if not any(key(p) in owned_output_keys for p in sources):
        continue
    assert len(sources) == len(targets), net['name']
    for bit, (src, dst) in enumerate(zip(sources, targets)):
        if key(src) not in owned_output_keys:
            continue
        fanouts.append({'name': net['name'], 'bit': bit,
                        'producer': endpoint(net['driver']['instance'], net['driver']['port'], src, bit),
                        'receiver': endpoint(net['sink']['instance'], net['sink']['port'], dst, bit),
                        'status': 'named_master_fanout_retained_no_new_route_credit'})

core_design = read('core-lane-colocation-v1/request-or-connected-v1/design.json')
core_blocks = {key(v['position']): v['block'] for v in core_design['blocks'] if key(v['position']) in required_core_cells}
assert set(core_blocks) == required_core_cells
for row in incoming + [b for r in direct for b in r['bindings']] + fanouts:
    for side in ['producer', 'receiver']:
        e = row[side]
        if e['status'] == 'exact_frozen_core_body_cell':
            e['block'] = core_blocks[key(e['position'])]

selected = [r for r in incoming if r['route_folder'] == 'master-control-routes-v1']
assert len(selected) == 7
assert all(r['producer']['status'] == r['receiver']['status'] == 'exact_retained_body_cell' for r in selected)
for row in selected:
    row['selected_for_bounded_routing'] = True
stats = {'incoming_rows': len(incoming), 'direct_boundary_rows': len(direct),
         'incoming_producer_status': dict(collections.Counter(r['producer']['status'] for r in incoming)),
         'direct_receiver_status': dict(collections.Counter(b['receiver']['status'] for r in direct for b in r['bindings'])),
         'selected_local_master_control_connections': len(selected)}
source = ROOT / 'artifacts/full-gpu-layout-v1/initial-loader-warm-drain-v3/prepare.mjs'
pins[str(source.relative_to(ROOT))] = hashlib.sha256(source.read_bytes()).hexdigest()
pins[str(Path(__file__).relative_to(ROOT))] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
out = {'status': 'exact_foreign_cut_producer_and_latest_available_port_contract', 'metrics': stats,
       'incoming': incoming, 'direct': direct,
       'additional_master_fanout_obligations': fanouts,
       'selected_local_group': [r['old_connection']['name'] for r in selected],
       'source_sha256': pins,
       'limits': ['Named producer functions and exact endpoint identities are not transport truth or timing proof. Selected routing first requires actual old geometry/function classification.',
                  'Core coordinates are template-local. Core0/core1 remain distinct instances with unset assembly transforms; coordinates must never be treated as already placed alongside dispatch.',
                  'The memory refold has no current loader/program/quiet/service producer placement. DCR is already retained in the dispatcher candidate and is not duplicated.',
                  'Sixteen block-id target rows are old shared-core transport ports, absent from the current body map; actual lane fanout must be traced before binding.',
                  'All 85 original foreign cut rows remain explicit. Multiple downstream consumers under one direct cut are retained separately. No cut is marked routed by this contract.'],
       'native_acceptance': False, 'complete_connected_candidate': False}
(HERE / 'bindings.json').write_text(json.dumps(out, indent=2) + '\n')
print(json.dumps(stats))
