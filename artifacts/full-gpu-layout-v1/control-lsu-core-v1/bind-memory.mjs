// Pure saved-map interface binding; this file neither draws nor executes memory I/O.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),hash=p=>createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex');
const files=['design.json','../memory/channel-payload-v1/design.json','../memory/consumer-drain-v1/design.json','../memory/consumer-drain-v1/source-manifest.json'];
assert.equal(hash(files[3]),'1e51d5d5cb077427a7c7d27588fcab3cc7cd2829f16665dc55a2bd703e051406');
const d=read(files[0]),memory=read(files[1]),drain=read(files[2]),nets=[];
for(let core=0;core<2;core++)for(let lane=0;lane<4;lane++){
 const i=core*4+lane,lsu=d.ports.lsus[lane],instance=`gpu/core${core}/lane${lane}/lsu`;
 for(const name of ['read_valid','write_valid','read_address','write_address','write_data']){
  const width=lsu[name].width,positions=memory.ports[name].positions.slice(width*i,width*(i+1));assert.equal(positions.length,width);
  for(let b=0;b<width;b++){
   const expected=name==='read_valid'?{x:618,y:1+4*i,z:-26}:name==='write_valid'?{x:626,y:1+4*i,z:-26}:name==='read_address'?{x:612,y:1+4*i,z:-7+8*b}:name==='write_address'?{x:612,y:1+4*i,z:-5+8*b}:{x:610,y:1+4*i,z:58+8*b};
   assert.deepEqual(positions[b],expected,name+' '+i+' '+b);
  }
  nets.push({driver:{instance,port:name},sinks:[{instance:'gpu/data_memory',port:name,slice:{lsb:width*i,width}}],width,polarity:'active_high',bit_order:'lsb_first',protocol:'lsu_retained_level_v2',driver_frame:'core_template',driver_positions:lsu[name].bits.map(b=>b.position),sink_frame:'memory_local',sink_positions:positions,route:null,geometry_status:'both_boundaries_drawn_interconnect_unrouted'});
 }
 assert.deepEqual(drain.ports.consumer_drained.positions[i],{x:600+4*i,y:243+4*i,z:181});
 nets.push({driver:{instance:'gpu/data_memory',port:'consumer_drained',slice:{lsb:i,width:1}},sinks:[{instance,port:'drained'}],width:1,polarity:'active_high',bit_order:'lsb_first',protocol:'lsu_retained_level_v2',driver_frame:'memory_local',driver_positions:[drain.ports.consumer_drained.positions[i]],sink_frame:'core_template',sink_positions:lsu.drained.bits.map(b=>b.position),route:null,geometry_status:'both_boundaries_drawn_interconnect_unrouted'});
 for(const name of ['read_ready','write_ready','read_data'])nets.push({driver:{instance:'gpu/data_memory',port:name,slice:{lsb:lsu[name].width*i,width:lsu[name].width}},sinks:[{instance,port:name}],width:lsu[name].width,polarity:'active_high',bit_order:'lsb_first',protocol:'lsu_retained_level_v2',driver_positions:null,sink_frame:'core_template',sink_positions:lsu[name].bits.map(b=>b.position),route:null,geometry_status:'memory_return_producer_pending'});
}
const result={status:'source_bound_pending_memory_interconnect',source_sha256:Object.fromEntries(files.map(p=>[p,hash(p)])),nets,core_template_instantiation:'The drawn attachment is one four-lane template; core1 requires its own rigidly placed copy. No second core or global memory route is counted here.',completion_rule:'Close response before dropping matching valid; then both ready inputs low AND consumer_drained high.',drain_rule:'No channel holds consumer i while ACTIVE or actual backend_busy/tail is high.',reset_rule:'Per-core reset drains and clears local LSU storage; it never drives memory-global reset or backing RAM.',native_acceptance:false};
if(process.argv.includes('--check'))assert.deepEqual(result,read('memory-bindings.json'));else writeFileSync(new URL('memory-bindings.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({nets:nets.length,physical_interconnects:0,consumer_indices:8}));
