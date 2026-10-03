import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const H=new URL('./',import.meta.url), ROOT=new URL('../../../../',H);
const hash=u=>createHash('sha256').update(readFileSync(u)).digest('hex');
const read=n=>JSON.parse(readFileSync(new URL(n,H)));
const parent=new URL('../lsu-quiet-connected-v1/source-manifest.json',H);
assert.equal(hash(parent),'f3a9af6368bf1613fb230d9f10d0519081f8b0a9afaad87e638701a5e9168cee');
if(process.argv.includes('--check')){
 const m=read('source-manifest.json');
 for(const[p,h]of Object.entries(m.source_sha256))assert.equal(hash(new URL(p,ROOT)),h,p);
 console.log(JSON.stringify({status:'frozen_source_pins_unchanged',manifest_sha256:hash(new URL('source-manifest.json',H)),pins:Object.keys(m.source_sha256).length}));process.exit(0);
}
const c=read('checks.json'),f=read('function-checks.json'),o=read('original-functions.json'),a=read('arrival-obligations.json'),e=read('external-approaches.json'),memory=read('external-memory-approaches.json'),program=read('external-program-approaches.json'),cold=read('cold-input-boundary.json'),t=read('timing-and-composition.json'),x=read('exact-cut-bindings.json'),ep=read('endpoint-map.json'),old=read('../lsu-quiet-connected-v1/endpoint-map.json'),cost=read('costs.json'),run=read('validation-run.json');
assert.equal(run.status,'all_required_checks_passed_against_one_unchanged_full_map');
assert.equal(run.design_sha256,hash(new URL('design.json',H)));assert.equal(run.checks.length,10);
for(const r of run.checks){assert.equal(r.exit_status,0);assert.equal(hash(new URL(r.checker,H)),r.checker_sha256);assert.equal(hash(new URL(r.output,H)),r.output_sha256);}
assert.equal(new Set(run.checks.map(r=>r.output)).size,10,'Every checker must preserve its own receipt');
assert.equal(c.status,'partial_final_exit_control_geometry_and_store_identity_passed');
assert.deepEqual([c.metrics.cells,c.metrics.parent_cells,c.metrics.logic_body_additions,c.metrics.new_transport_cells,c.metrics.original_store_identities_preserved,c.metrics.occupied_chunk_columns],[975791,967531,0,8260,1117,3404]);
assert.deepEqual([c.receivers,c.actual_dependencies,c.parent_dependencies,c.negative_checks,c.exact_cut_binding_checks],[487310,817302,809734,7,7]);
for(const k of ['unexpected','lost','unsupported'])assert.equal(c[k].length,0);
assert.equal(a.routes.length,7);assert.equal(ep.unmatched.length,0);
for(const k of ['mapping','cuts','external_raw_block_id','external_unbound_controls','external_memory_status_inputs','replacement_interface_map'])assert.deepEqual(ep[k],old[k]);
assert.equal(ep.cuts.length,982);assert.equal(x.broader_mapped_body_directed_cut_count,1984);assert.equal(x.bindings.length,7);assert.equal(c.scoped_transport_totals.scoped_control_transports,247);
assert.equal(f.status,'actual_final_exit_guard_and_delivery_match_original_with_explicit_program_boundaries');
assert.deepEqual([f.actual_nodes,f.collapsed_components,f.delayed_device_cycles,f.BDD_variables,f.exact_all_input_assignments,f.cases.length,f.negative_mutations.length,f.retained_gate_cells],[8494,1606,0,11,2048,2048,34,376]);
assert.equal(Math.min(...f.route_strengths.map(r=>r.minimum_active_repeater_rear)),4);assert.equal(f.route_strengths.length,12);
assert.equal(Object.keys(f.current_boundary_bindings).length,11);assert.equal(Object.keys(f.observed_current_pads).length,2);
assert.deepEqual([f.original.actual_nodes,f.original.collapsed_components,f.original.delayed_device_cycles,f.original.injection_mutations.length],[15212,2784,0,11]);
assert.deepEqual([f.external_program_inputs_still_unbound,f.inherited_qualified_deliveries,f.new_transports],[2,5,7]);
assert.deepEqual([o.gate.blocks.length,o.gate.cases.length,o.reports.length,o.sources.length,o.new_routes.length,o.existing_deliveries.length],[376,2048,12,11,7,5]);
assert.equal(o.sources.filter(s=>s.external_declared_input).length,2);
for(const s of o.sources){assert.equal(s.original.actual_drivers.length,s.external_declared_input?0:1);assert.equal(s.current.actual_drivers.length,s.external_declared_input?0:1);}
assert.equal(e.ports.length,8);assert.equal(e.added_geometry_cells,0);
assert.equal(memory.status,'twelve_declared_external_memory_status_inputs_remain_undriven_with_isolated_future_arrivals');
assert.equal(memory.ports.length,12);assert.equal(memory.added_geometry_cells,0);
assert.equal(program.status,'two_declared_external_program_status_inputs_remain_undriven_with_isolated_future_arrivals');
assert.equal(program.ports.length,2);assert.equal(program.added_geometry_cells,0);assert.equal(ep.external_program_status_inputs.length,2);
assert.equal(cold.actual_original_drivers.length,0);assert.equal(cold.actual_current_drivers.length,0);assert.equal(cold.future_arrival.added_geometry_cells,0);
assert.equal(t.composed_paths.length,22);assert.deepEqual([Math.min(...t.composed_paths.map(p=>p.conditional_boundary_to_receiver_ticks)),Math.max(...t.composed_paths.map(p=>p.conditional_boundary_to_receiver_ticks))],[100,304]);
assert.deepEqual(cost.added_materials,{'minecraft:light_gray_concrete':4130,'minecraft:redstone_wire':3777,'minecraft:repeater':353});
assert.equal(cost.total_cells,c.metrics.cells);assert.equal(cost.current_occupied_columns,c.metrics.occupied_chunk_columns);assert.equal(cost.route_vertices,4144);assert(cost.box_unchanged);
const pins={...JSON.parse(readFileSync(parent)).source_sha256};
for(const n of ['../lsu-quiet-connected-v1/source-manifest.json','../../control-reset-final-v1/logic.mjs',...readdirSync(H).filter(n=>/\.(mjs|json|md)$/.test(n)&&n!=='source-manifest.json')]){
 const u=new URL(n,H),key=fileURLToPath(u).slice(fileURLToPath(ROOT).length),h=hash(u);if(pins[key])assert.equal(pins[key],h,key);pins[key]=h;
}
for(const[p,h]of Object.entries(pins))assert.equal(hash(new URL(p,ROOT)),h,p);
const out={status:'frozen_partial_core_final_exit_local_dependencies_and_reset_logic_delivery',source_sha256:Object.fromEntries(Object.entries(pins).sort()),metrics:c.metrics,box:c.box,checked_receivers:c.receivers,checked_effective_inputs:c.actual_dependencies,drawn_transports:7,new_logic_body_cells:0,exact_original_retained_guard_cells:376,inherited_qualified_input_deliveries:5,new_local_predicate_deliveries:4,declared_external_program_input_fanouts:2,declared_external_program_inputs_still_undriven:2,inherited_external_memory_inputs_still_undriven:12,all_original_store_and_lock_identities:1117,inherited_RF_block_ID_lane_bit_deliveries_preserved:32,external_raw_byte_inputs_still_unbound:8,external_initialize_still_undriven:true,inherited_advance_constant_rails:7,scoped_transport_totals:c.scoped_transport_totals,original_directed_incident_cuts_retained:982,current_original_body_cut_census:1984,exact_symbolically_represented_assignments:2048,symbolic_signal_thresholds_per_node:15,current_function_nodes:f.actual_nodes,current_function_components:f.collapsed_components,current_concrete_cases:2048,current_gate_and_arrival_mutations:34,original_comparison_nodes:f.original.actual_nodes,original_comparison_components:f.original.collapsed_components,original_injection_mutations:11,delayed_device_cycles:0,actual_active_minimum_cable_rear:4,added_cable_materials:cost.added_materials,conditional_boundary_to_receiver_ticks:t.composed_paths,full_timing_acceptance:false,complete_core:false,native_acceptance:false,limits:t.limits};
writeFileSync(new URL('source-manifest.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({manifest_sha256:hash(new URL('source-manifest.json',H)),design_sha256:hash(new URL('design.json',H)),checks_sha256:hash(new URL('checks.json',H)),function_checks_sha256:hash(new URL('function-checks.json',H)),pins:Object.keys(pins).length,metrics:c.metrics}));
