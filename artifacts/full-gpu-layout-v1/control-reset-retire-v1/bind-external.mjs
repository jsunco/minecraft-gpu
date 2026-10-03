import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url))),sha=n=>createHash('sha256').update(readFileSync(new URL(n,import.meta.url))).digest('hex');
const path='../memory/program-quiet-v1/source-manifest.json',manifest=read(path),pin='af29fb59aacf6d8ba4939bd65f1fb5eb661a311c8f7a430eb9d894a11311fb75';assert.equal(sha(path),pin);
assert.equal(sha('../memory/program-quiet-v1/design.json'),manifest.files['artifacts/full-gpu-layout-v1/memory/program-quiet-v1/design.json']);
const memory=read('../memory/program-quiet-v1/design.json'),d=read('design.json'),nets=[];
for(let core=0;core<2;core++){
 const name='core'+core+'_drained',p=memory.ports[name],sink=d.ports.reset_barrier.program_quiet;
 assert.equal(p.direction,'output');assert.equal(p.width,1);assert.equal(sink.direction,'input');
 assert.deepEqual(p.bits[0].position,{x:-381+4*core,y:-58,z:-255});
 nets.push({name:'program_quiet_to_core'+core,driver:{instance:'gpu/program_memory',port:name},sinks:[{instance:'gpu/core'+core,port:'reset_barrier.program_quiet'}],width:1,polarity:'active_high',bit_order:'LSB_first',protocol:'program_shared_quiet_v1',source_frame:'program-quiet-v1.local',source_position:p.bits[0].position,sink_frame:'core-template.local',sink_position:sink.bits[0].position,physical_route:null,meaning:'Conservative shared-channel quiet, plus each own READY-low at the core guard; no old owner-bit shortcut.'});
}
const missing=['rf_quiet','lsu_quiet','abort_safe','release_complete'].map(name=>({port:name,position:d.ports.reset_barrier[name].bits[0].position,geometry_status:'receiver_exists_producer_and_global_route_pending'}));
const result={status:'source_bound_reset_boundary_mapping_only',program_manifest_sha256:pin,nets,missing,physical_routes_added:0,native_acceptance:false,limits:['The two core copies and global placement are not materialized by this binding file.','Shared program quiet does not prove measured far-bank closure. Own ready-low remains a separate real input.','service_ready is not reset_ack, and none of these pending guards is synthesized by host runtime code.']};
if(process.argv.includes('--check'))assert.deepEqual(result,read('external-bindings.json'));else writeFileSync(new URL('external-bindings.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({bound_program_quiet_inputs:nets.length,pending_guard_producers:missing.length,physical_routes_added:0}));
