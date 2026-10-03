// Source-bound integration inventory. No native access and no implicit geometry.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),base='artifacts/full-gpu-layout-v1/';
const hashes={},read=p=>{const raw=readFileSync(root+p);hashes[p]=createHash('sha256').update(raw).digest('hex');return JSON.parse(raw);};
const graph=read(base+'control/interface.json'),instances=new Map(graph.instances.map(i=>[i.id,i]));
assert.equal(instances.size,graph.instances.length);
const driven=new Map(),used=new Set(),branches=[];
function endpoint(ep,width,direction){const instance=instances.get(ep.instance);assert(instance,'Missing instance '+ep.instance);const p=graph.module_types[instance.type].ports.find(p=>p.name===ep.port);assert(p,'Missing port '+ep.port);assert.equal(p.direction,direction);const slice=ep.slice??{lsb:0,width:p.width};assert.equal(slice.width,width);assert(Number.isSafeInteger(slice.lsb)&&slice.lsb>=0&&slice.lsb+width<=p.width);return Array.from({length:width},(_,bit)=>`${ep.instance}:${ep.port}:${slice.lsb+bit}`);}
for(const net of graph.nets){const source=endpoint(net.driver,net.width,'out');source.forEach(k=>used.add(k));for(const sink of net.sinks){const dest=endpoint(sink,net.width,'in');for(let b=0;b<net.width;b++){assert(!driven.has(dest[b]),'Multiple drivers '+dest[b]);driven.set(dest[b],source[b]);}branches.push({net:net.id,width:net.width,driver:net.driver,sink,physical_route:null,route_blocks:null});}}
let inputBits=0;for(const i of graph.instances)for(const p of graph.module_types[i.type].ports)if(p.direction==='in')for(let bit=0;bit<p.width;bit++){assert(driven.has(`${i.id}:${p.name}:${bit}`),'Undriven logical input');inputBits++;}
const aliases={register_file:{ra:'read_address',wa:'write_address',d:'write_data',block:'block_id',we:'write_enable',assign:'assign_block',capture_a:'capture_a',capture_b:'capture_b',A:'operand_a',B:'operand_b'},writeback_mux:{alu:'alu',lsu:'lsu',immediate:'immediate',select:'select',wb:'wb'}};
const config=read(base+'config-panel/design.json');
const programReview=read(base+'memory/program-controller-v1/independent-review.json'),programManifestPath=base+'memory/program-controller-v1/source-manifest.json',programManifest=read(programManifestPath);
assert.equal(programReview.manifest_sha256,hashes[programManifestPath]);for(const[p,h]of Object.entries(programManifest.pins??programManifest.source_sha256??{}))assert.equal(createHash('sha256').update(readFileSync(root+p)).digest('hex'),h,'Program source drift '+p);
assert.equal(programReview.status,'independently_cleared_offline_static_connected_program_controller');
const bindings=[],unbound=[];let boundedPorts=0,boundedBits=0,componentSubtotal=0;
for(const i of graph.instances){const path=i.type==='register_file'?base+`registers/lane${i.lane_id}.json`:i.type==='writeback_mux'?base+'writeback/design.json':['dcr','panel'].includes(i.type)?base+'config-panel/design.json':i.type==='program_memory'?base+'memory/program-controller-v1/design.json':null;
 if(!path){unbound.push({id:i.id,type:i.type,reason:'No complete local candidate with every logical boundary port is bound here.'});continue;}
 const d=read(path);if(i.type==='program_memory')assert.equal(d.status,'offline_connected_program_controller_candidate_not_native_verified');else assert.equal(d.complete_component_geometry,true);const physicalPorts=i.type==='program_memory'?Object.fromEntries(Object.entries(d.ports).map(([n,p])=>[n,{...p,polarity:'active_high',bits:p.positions.map((position,bit)=>({bit,position})),polarity_basis:'Source-pinned external interface and independent program-controller protocol review; electrical pads preserve published port order.'}])):d.module_ports?.[i.id]??d.ports,ownedBlocks=d.module_ports?d.blocks.filter(b=>b.instance===i.id):d.blocks;const mapped=[];
 for(const p of graph.module_types[i.type].ports){const name=aliases[i.type]?.[p.name]??p.name,physical=physicalPorts[name];assert(physical,'Missing alias '+p.name);assert.equal(physical.width,p.width);assert.equal(physical.direction,p.direction==='in'?'input':'output');assert.equal(physical.polarity,'active_high');assert.equal(physical.bits.length,p.width);if(i.type==='program_memory'){const cells=new Map(d.blocks.map(v=>[`${v.position.x},${v.position.y},${v.position.z}`,v]));for(const b of physical.bits)assert(cells.has(`${b.position.x},${b.position.y},${b.position.z}`),'Missing program boundary pad');}
  mapped.push({logical_port:p.name,physical_port:name,width:p.width,local_bits:physical.bits,world_placement:null});boundedPorts++;boundedBits+=p.width;
 }
 bindings.push({instance:i.id,type:i.type,geometry:path,geometry_sha256:hashes[path],local_box:d.box,blocks:ownedBlocks.length,ports:mapped,boundary_geometry_complete:true,...(i.type==='program_memory'?{evidence:base+'memory/program-controller-v1/independent-review.json',density_selection:false,timing_acceptance:false}:{}),native_acceptance:false});componentSubtotal+=ownedBlocks.length;
}
for(const branch of branches.filter(b=>b.driver.instance==='gpu/panel'&&b.sink.instance==='gpu/dcr')){
 const paths=config.routes.filter(r=>r.sink_port===branch.sink.port);assert.equal(paths.length,branch.width);for(const p of paths){assert.equal(p.net,branch.driver.port);assert.deepEqual(p.path[0],config.module_ports['gpu/panel'][branch.driver.port].bits[p.bit].position);assert.deepEqual(p.path.at(-1),config.module_ports['gpu/dcr'][branch.sink.port].bits[p.bit].position);}
 branch.physical_route={assembly:base+'config-panel/design.json',coordinate_frame:'component_local',bit_paths:paths};branch.route_blocks={counted_in:'gpu/panel',additional:0};
}
const routed=branches.filter(b=>b.physical_route).length;
const memoryRam=read(base+'memory/ram16x8.json'),memoryRom=read(base+'memory/rom16x16.json'),opcode=read(base+'control-held-ir-v1/design.json'),decode=read(base+'control/decode-latches.json'),alu=read(base+'alu-v5/design.json');
const rom=read(base+'memory/program-controller-v1/design.json'),incrementer=read(base+'pc-incrementer/design.json');
const components=[
 {name:'configuration panel and held DCR with ten connected inputs',copies:1,each:config.blocks.length,subtotal:config.blocks.length,status:'connected_component_geometry_only',boundary_bound:true},
 {name:'two shared PC incrementers',copies:2,each:incrementer.blocks.length,subtotal:2*incrementer.blocks.length,status:'complete_combinational_geometry_external_PC_routes_missing',boundary_bound:false},
 {name:'eight register files with physical terminal adapters',copies:8,each:bindings.find(b=>b.type==='register_file').blocks,subtotal:bindings.filter(b=>b.type==='register_file').reduce((n,b)=>n+b.blocks,0),status:'complete_component_geometry_only',boundary_bound:true},
 {name:'eight writeback selectors',copies:8,each:bindings.find(b=>b.type==='writeback_mux').blocks,subtotal:bindings.filter(b=>b.type==='writeback_mux').reduce((n,b)=>n+b.blocks,0),status:'complete_component_geometry_only',boundary_bound:true},
 {name:'sixteen16x8 data cards',copies:16,each:memoryRam.blocks.length,subtotal:16*memoryRam.blocks.length,status:'complete_card_geometry_missing_memory_fabric',boundary_bound:false},
 {name:'full256x16 program subsystem candidate with owner/capture/reset/ready and consumer returns',copies:1,each:rom.blocks.length,subtotal:rom.blocks.length,status:'local_boundary_and_internal_geometry_complete_native_timing_and_density_unaccepted',boundary_bound:true},
 {name:'two held-instruction/decode assemblies including opcode matrices',copies:2,each:opcode.blocks.length,subtotal:2*opcode.blocks.length,status:'held_instruction_decode_geometry_missing_full_fetch_scheduler',boundary_bound:false},
];
for(const p of ['hardware/full-gpu-layout-inventory.mjs','hardware/full-gpu-register-bank.mjs','hardware/full-gpu-writeback.mjs','hardware/gpu-layout-assembly.mjs','hardware/full-gpu-config-panel.mjs','hardware/full-gpu-dcr.mjs','hardware/full-gpu-pc-incrementer.mjs'])hashes[p]=createHash('sha256').update(readFileSync(root+p)).digest('hex');
const report={status:'logical_graph_and_partial_physical_bindings_not_a_complete_layout',scope:graph.scope,
 logical:{module_instances:instances.size,net_bundles:graph.nets.length,point_to_point_bundles:branches.length,driven_input_bits:inputBits,used_output_bits:used.size,every_logical_input_has_exactly_one_driver:true,meaning:'Connectivity/width inventory; opaque modules still require physical circuits and protocol correctness. Binding a reviewed candidate boundary is not density selection, measured timing or native acceptance.'},
 physical:{bound_complete_components:bindings.length,bound_ports:boundedPorts,bound_port_bits:boundedBits,bound_component_blocks:componentSubtotal,bindings,unbound_modules:unbound,component_repetition_inventory:components,
 known_component_subtotal_excluding_all_missing_parts:components.reduce((n,c)=>n+c.subtotal,0),
 alternatives:[{name:'34-bit decoded-field/control latch baseline percore',blocks_each:decode.blocks.length,copies:2,selection:'BLOCKED direction defect; see control/ERRATA.md. Unselected historical candidate, not usable or counted. Held instruction/decode assembly replaces this and opcode subtotal.',full_component_geometry:false}],
 incomplete_candidates:[
  {name:'serial lane ALU v5 with repaired direct status drivers',generated_blocks:alu.blocks.length,physical_state_bits:alu.physical_state_bits,physical_control_bits:alu.physical_control_bits,missing:alu.remaining,selection:'Not selected or replicated as complete; per-core controls and external routes still missing.'},
  ...[
   ['independent cold decoder scanner with actual phase source','startup-scan-v1/clock/design.json','10543blocks/14stores: count0..31,hold32,delayedREADY and actual clock routes. Decoder overrides/clamps/blanking/admission and measured closure still missing.'],
   ['retained shared RF owner and core commit partial connection','control-commit-v2/design.json','689241blocks/67connections, including normal PC/flags, CMP, ACK/drain and stickyfault. Reset init-zero/OPEN, startup, OTHER/LSU/dispatch and full merge remain unfinished. Nested RF/ALU references must be merged once.'],
   ['four ALU lanes with partial shared fanout','alu-four-lane-fanout-v3/status-design.json','401197blocks,35/41command types and140real destinations. Six qualified OPEN commands, high-level inputs and fault/controller return remain incomplete. Earlier6/41matched-scope comparison does not compare this larger scope.'],

   ['four register files with actual actions, addresses, writeback and block-ID paths','register-startup-v1/distribution-v1/design.json','280585blocks including actual decoder scan override, shared clock, zero clamps and a retained permission/action window. Underlying264528 override independently reviewed1dcafe6f; new distribution author checked, remote closure/global admission and upstream fields/data remain missing. No native acceptance.'],
   ['core/fetch/held-instruction with PC and four-lane NZP/branch paths','control-front-pc-v2/design.json','64522blocks/53stores/37newconnections with heldIR mask/BR, actual PC/NZP/target-agreement routing; CMP data, qualified OPEN/commit/fault and reset/drain integration missing.'],
   ['shared ALU commands with all26retained state bits and internal feedback','alu-control/initialized-feedback-v1/design.json','91313blocks with macro/bit/round feedback, qualified NEXT/CURRENT clocks and common initialization; cold admission/conditioning, external action phase, lane fanout and real closures missing.'],
   ['one lane file with selected write-data routes','register-sequencer-v1/file-write-stage/lane0.json','Full13048file plus262source selector and8real strength15 input routes; all external producers and four-filefanout remain missing.'],
   ['original-order channel retained admission with actual raw LSU payload fanout','memory/channel-payload-v1/design.json','418540blocks including grant/snapshot/ownership/admission and544payload+16valid routes; full backend lifecycle/bank routing/consumer returns and release-within-scan compatibility remain missing. Large staggered fanout is unselected.'],
   ['one unselected bank controller','memory/data-channel-v1/design.json','One117071bank-owned channel with localcontrols/consumerreturns; originalchannelretiming/fourbankfanout unaccepted.'],
   ['dispatch thread-count arithmetic','dispatch-count/design.json','Actualceil(T/4) for all256input values; allocation counters, partial masks, core reuse and done missing.'],
   ['unselected four owned data-bank datapaths','memory/data-fabric-v1/design.json','All256bytes and four owner/payload/response datapaths; original channel arbitration/control/consumer fanout and matched comparison missing.']
  ].map(([name,path,scope])=>{const d=read(base+path);return{name,geometry:base+path,geometry_sha256:hashes[base+path],generated_blocks:d.blocks.length,scope,included_in_known_component_subtotal:false,nesting:'Includes parent components; never add all revisions or partial inventories together.',selection:'Partial or unselected; native acceptance false.'};})
 ],
 route_branches:branches,complete_inter_module_routes:routed,complete_gpu_block_count:null,complete_gpu_dimensions:null,required_ticking_columns:null},
 native_calls:0,native_acceptance:false,complete_gpu_layout:false,sources:hashes,
 next_gate:'Finish functional physical submodules, choose source-preserving refinements, bind every boundary, then place and route every listed connection. Final totals remain unknown until that exists.'};
writeFileSync(root+base+'integration-inventory.json',JSON.stringify(report,null,2)+'\n');
const summary={status:report.status,logical:report.logical,physical:{bound_components:bindings.length,bound_port_bits:boundedBits,bound_component_blocks:componentSubtotal,known_component_subtotal:report.physical.known_component_subtotal_excluding_all_missing_parts,unbound_modules:unbound.length,complete_inter_module_routes:routed,complete_gpu_blocks:null},complete_gpu_layout:false,native_acceptance:false};
writeFileSync(root+base+'integration-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
