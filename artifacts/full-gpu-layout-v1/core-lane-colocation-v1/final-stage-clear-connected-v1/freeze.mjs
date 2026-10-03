import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const H = new URL('./', import.meta.url), ROOT = new URL('../../../../', H);
const hash = u => createHash('sha256').update(readFileSync(u)).digest('hex');
const read = n => JSON.parse(readFileSync(new URL(n, H)));
const parent = new URL('../final-exit-control-connected-v1/source-manifest.json', H);
assert.equal(hash(parent), '3d8d933de15da47ea748c551dd451b27eada9b6f6f2bfbfc749e8e14526f504e');
if (process.argv.includes('--check')) {
  const m = read('source-manifest.json');
  for (const [p, h] of Object.entries(m.source_sha256)) assert.equal(hash(new URL(p, ROOT)), h, p);
  console.log(JSON.stringify({status:'frozen_source_pins_unchanged', manifest_sha256:hash(new URL('source-manifest.json', H)), pins:Object.keys(m.source_sha256).length}));
  process.exit(0);
}

const c=read('checks.json'), f=read('function-checks.json'), o=read('original-functions.json');
const a=read('arrival-obligations.json'), e=read('external-approaches.json');
const memory=read('external-memory-approaches.json'), program=read('external-program-approaches.json');
const cold=read('cold-input-boundary.json'), t=read('timing-and-composition.json');
const x=read('exact-cut-bindings.json'), census=read('cut-census.json');
const ep=read('endpoint-map.json'), old=read('../final-exit-control-connected-v1/endpoint-map.json');
const cost=read('costs.json'), run=read('validation-run.json');
const taps=read('tap-source-set-review.json'), reused=read('existing-tap-proofs.json');
assert.equal(run.status, 'all_required_checks_passed_against_one_unchanged_full_map');
assert.equal(run.design_sha256, hash(new URL('design.json', H)));
assert.equal(run.design_sha256, '3a9eefac1388c7a4df50180958548de93e85c4be3807dc0c863fb511e368e4f2');
assert.equal(run.checks.length, 12);
for (const r of run.checks) {
  assert.equal(r.exit_status, 0);
  assert.equal(hash(new URL(r.checker, H)), r.checker_sha256);
  assert.equal(hash(new URL(r.output, H)), r.output_sha256);
}
assert.equal(new Set(run.checks.map(r=>r.output)).size, 12);
assert.equal(c.status, 'partial_final_stage_clear_geometry_and_store_identity_passed');
assert.deepEqual([c.metrics.cells,c.metrics.parent_cells,c.metrics.logic_body_additions,c.metrics.new_transport_cells,c.metrics.original_store_identities_preserved,c.metrics.occupied_chunk_columns], [997299,975791,64,21444,1117,3441]);
assert.deepEqual([c.receivers,c.actual_dependencies,c.parent_dependencies,c.negative_checks,c.exact_cut_binding_checks], [498064,836930,817302,33,33]);
for (const k of ['unexpected','lost','unsupported']) assert.equal(c[k].length, 0);
assert.equal(a.routes.length, 33);
assert.equal(ep.unmatched.length, 0);
for (const k of ['cuts','external_raw_block_id','external_unbound_controls','external_memory_status_inputs','external_program_status_inputs']) assert.deepEqual(ep[k],old[k]);
for (const k of ['mapping','replacement_interface_map']) for (const [p,v] of Object.entries(old[k])) assert.deepEqual(ep[k][p],v);
assert.equal(Object.keys(ep.mapping).length - Object.keys(old.mapping).length,8);
assert.equal(ep.mapped_original_cells,Object.keys(ep.mapping).length);
assert.equal(Object.keys(ep.replacement_interface_map).length - Object.keys(old.replacement_interface_map).length,5);
assert.equal(ep.function_preserving_gate_input_roles.length,6);
assert.equal(ep.cuts.length,982);
assert.deepEqual([census.parent_cut_count,census.current_cut_count,census.new_claimed_original_nodes,census.added_current_crossings.length,census.absorbed_parent_crossings.length],[1984,2005,11474,21,0]);
assert.equal(x.broader_mapped_body_directed_cut_count,2005);
assert.equal(x.bindings.length,33);
assert.equal(c.scoped_transport_totals.scoped_control_transports,280);
assert.equal(f.status,'actual_stage_clear_guard_all_twenty_boundary_functions_and_historical_deliveries_match_original');
assert.deepEqual([f.actual_nodes,f.collapsed_components,f.delayed_device_cycles,f.BDD_variables,f.exact_all_input_assignments,f.cases.length,f.negative_mutations.length,f.retained_gate_cells],[13009,2575,0,20,1048576,296,64,628]);
assert.equal(f.signal_thresholds_per_node,15);
assert.equal(Math.min(...f.route_strengths.map(r=>r.minimum_active_repeater_rear)),4);
assert.equal(f.route_strengths.length,33);
assert.equal(Object.keys(f.current_boundary_bindings).length,20);
assert.equal(Object.keys(f.observed_current_pads).length,2);
assert.deepEqual([f.original.actual_nodes,f.original.collapsed_components,f.original.delayed_device_cycles,f.original.injection_and_subtract_mutations.length],[27774,5205,0,20]);
assert.equal(f.existing_external_initialize_still_unbound,true);
assert.deepEqual([f.actual_retained_driver_boundaries,f.new_transports],[19,33]);
assert.deepEqual([o.gate.blocks.length,o.gate.represented_assignments,o.sources.length,o.historical_taps.length,o.historical_connections.length],[628,524288,20,8,19]);
for (const s of o.sources) for (const side of ['old','current']) assert.equal(s[side+'_boundary'].drivers.length,s.name==='initialize'?0:1);
assert.equal(taps.reports.length,4);
assert.deepEqual(taps.removed_duplicate_routes,['scratch0_restore_historical_source','zero_active0_restore_historical_source','epoch_enable0_restore_historical_source']);
assert.equal(taps.retained_missing_route,'zero_stop0_restore_historical_source');
assert.equal(reused.reports.length,3);
for (const r of reused.reports) assert.deepEqual([r.conditional_low,r.conditional_high],[0,5]);
assert.equal(e.ports.length,8); assert.equal(e.added_geometry_cells,0);
assert.equal(memory.status,'twelve_declared_external_memory_status_inputs_remain_undriven_with_isolated_future_arrivals');
assert.equal(memory.ports.length,12); assert.equal(memory.added_geometry_cells,0);
assert.equal(program.status,'two_declared_external_program_status_inputs_remain_undriven_with_isolated_future_arrivals');
assert.equal(program.ports.length,2); assert.equal(program.added_geometry_cells,0);
assert.equal(cold.actual_original_drivers.length,0); assert.equal(cold.actual_current_drivers.length,0); assert.equal(cold.future_arrival.added_geometry_cells,0);
assert.equal(t.composed_paths.length,40);
assert.deepEqual([Math.min(...t.composed_paths.map(p=>p.conditional_boundary_to_receiver_ticks)),Math.max(...t.composed_paths.map(p=>p.conditional_boundary_to_receiver_ticks))],[100,354]);
assert.deepEqual(cost.added_materials,{'minecraft:light_gray_concrete':10722,'minecraft:redstone_wire':9767,'minecraft:repeater':955});
assert.deepEqual(cost.new_gate_materials,{'minecraft:comparator':1,'minecraft:light_gray_concrete':32,'minecraft:redstone_wire':18,'minecraft:repeater':13});
assert.equal(cost.new_gate_body_cells,64); assert.equal(cost.total_cells,c.metrics.cells);
assert.equal(cost.current_occupied_columns,c.metrics.occupied_chunk_columns); assert.equal(cost.route_vertices,10788); assert(cost.box_unchanged);

// Keep the refused draft and its actual source-ancestry evidence as immutable history.
function ownFiles(dir=H,prefix='') {
  return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const n=prefix+e.name;
    if(e.isDirectory()) return ownFiles(new URL(e.name+'/',dir),n+'/');
    return n!=='source-manifest.json' && (/\.(mjs|json|md)$/.test(n) || (n.startsWith('history/') && n.endsWith('.log'))) ? [n] : [];
  });
}
const pins={...JSON.parse(readFileSync(parent)).source_sha256};
for (const n of ['../final-exit-control-connected-v1/source-manifest.json','../../control-reset-final-v1/design.json','../../control-reset-final-v1/logic.mjs','../../control-lsu-v2/matrix.mjs',...ownFiles()]) {
  const u=new URL(n,H),key=fileURLToPath(u).slice(fileURLToPath(ROOT).length),h=hash(u);
  if(pins[key]) assert.equal(pins[key],h,key);
  pins[key]=h;
}
for (const [p,h] of Object.entries(pins)) assert.equal(hash(new URL(p,ROOT)),h,p);
const out={
  status:'frozen_partial_core_stage_clear_NOR19_and_actual_delivered_mask_predicates',
  source_sha256:Object.fromEntries(Object.entries(pins).sort()), metrics:c.metrics,box:c.box,
  checked_receivers:c.receivers,checked_effective_inputs:c.actual_dependencies,drawn_transports:33,
  new_logic_and_interface_body_cells:64,exact_original_retained_guard_cells:628,
  new_exact_original_stub_and_support_mappings:8,new_function_preserving_replacement_interfaces:5,
  new_functional_gate_input_roles:6,original_historical_tap_identities:8,
  parent_feedback_paths_reused:3,unnecessary_feedback_routes_removed:3,
  all_original_store_and_lock_identities:1117,inherited_RF_block_ID_lane_bit_deliveries_preserved:32,
  external_raw_byte_inputs_still_unbound:8,inherited_external_memory_inputs_still_undriven:12,
  inherited_external_program_inputs_still_undriven:2,external_initialize_still_undriven:true,
  inherited_advance_constant_rails:7,scoped_transport_totals:c.scoped_transport_totals,
  original_directed_incident_cuts_retained:982,current_original_body_cut_census:2005,
  new_original_network_nodes_claimed_for_function_preserving_replacements:11474,
  added_original_body_crossings:21,absorbed_parent_crossings:0,
  exact_symbolically_represented_assignments:1048576,symbolic_signal_thresholds_per_node:15,
  actual_retained_driver_boundaries:19,current_function_nodes:f.actual_nodes,current_function_components:f.collapsed_components,
  current_concrete_cases:296,current_gate_and_arrival_mutations:64,
  original_comparison_nodes:f.original.actual_nodes,original_comparison_components:f.original.collapsed_components,original_injection_mutations:20,
  delayed_device_cycles:0,actual_active_minimum_cable_rear:4,added_cable_materials:cost.added_materials,new_gate_materials:cost.new_gate_materials,
  conditional_boundary_to_receiver_ticks:t.composed_paths,
  rejected_draft_sha256:'6acef3236f51988b37cad1e0dc1dcfd0f97a27b2e4959e489a1381268684c7be',
  full_timing_acceptance:false,complete_core:false,native_acceptance:false,limits:t.limits
};
writeFileSync(new URL('source-manifest.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({manifest_sha256:hash(new URL('source-manifest.json',H)),design_sha256:hash(new URL('design.json',H)),checks_sha256:hash(new URL('checks.json',H)),function_checks_sha256:hash(new URL('function-checks.json',H)),pins:Object.keys(pins).length,metrics:c.metrics}));
