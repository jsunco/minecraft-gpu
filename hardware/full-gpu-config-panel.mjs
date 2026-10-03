// Physical pre-run configuration switches and their real DCR connections.
// Offline coordinate generation only. No Minecraft calls or runtime host answers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeDcr} from './full-gpu-dcr.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,S='minecraft:light_gray_concrete';
export function makeConfigPanel(){
 const parent=makeDcr(),map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),instance:'gpu/dcr'}])),switches=[],routes=[],ports={};
 function put(p,id,props,name){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(props?{properties:props}:{})},instance:'gpu/panel',part:name});}
 function dev(p,id,props,name){put({...p,y:p.y-1},'light_gray_concrete',undefined,name+'_support');put(p,id,props,name);}
 const rep=(p,f,name)=>dev(p,'repeater',{facing:f,delay:'1'},name),wire=(p,name)=>dev(p,'redstone_wire',undefined,name);
 const controls={data:'dcr_data',write:'dcr_write',reset:'reset'};
 for(const[name,port]of Object.entries(parent.ports).filter(([,p])=>p.direction==='input'))for(const b of port.bits){
  const source=P(b.position.x-2,b.position.y,b.position.z),diode=P(b.position.x-1,b.position.y,b.position.z),nameBit=controls[name]+(port.width>1?b.bit:'');
  dev(source,'lever',{face:'floor',facing:'west',powered:'false'},nameBit);rep(diode,'west',nameBit+'_drive');switches.push({name:nameBit,position:source,kind:'manual_pre_run_configuration'});
  routes.push({net:controls[name],bit:b.bit,driver_instance:'gpu/panel',sink_instance:'gpu/dcr',sink_port:name,path:[source,diode,b.position],sink_existing_receiver:b.receiver});
 }
 // Expose the same reset switch through an isolated branch for global dispatch.
 const resetSwitch=switches.find(v=>v.name==='reset').position;
 const resetDiode=P(resetSwitch.x,resetSwitch.y,resetSwitch.z-1),resetOut=P(resetSwitch.x,resetSwitch.y,resetSwitch.z-2);
 rep(resetDiode,'south','reset_export');wire(resetOut,'reset_terminal');
 const startSource=P(-12,-4,-16),startDiode=P(-11,-4,-16),startOut=P(-10,-4,-16);
 dev(startSource,'lever',{face:'floor',facing:'west',powered:'false'},'start');rep(startDiode,'west','start_drive');wire(startOut,'start_terminal');switches.push({name:'start',position:startSource,kind:'manual_kernel_launch'});
 const port=(name,bits,meaning)=>ports[name]={direction:'output',width:bits.length,bit_order:'lsb_first',polarity:'active_high',meaning,bits:bits.map((b,bit)=>({bit,...b}))};
 port('thread_count',parent.ports.thread_count.bits,'Held DCR byte; actual physical output routes included.');
 port('global_reset',[{position:resetOut,source:resetDiode,travel:P(0,0,-1)}],'Same operator reset as DCR, isolated for dispatch; global controller routes remain external.');
 port('start',[{position:startOut,source:startDiode,travel:P(1,0,0)}],'Held launch level, lowered only after done before next reset.');
 const panelPort=(name,names)=>({direction:'output',width:names.length,bit_order:'lsb_first',polarity:'active_high',bits:names.map((name,bit)=>({bit,position:switches.find(s=>s.name===name).position}))});
 const module_ports={
  'gpu/dcr':parent.ports,
  'gpu/panel':{dcr_data:panelPort('dcr_data',Array.from({length:8},(_,b)=>'dcr_data'+b)),dcr_write:panelPort('dcr_write',['dcr_write']),reset:panelPort('reset',['reset']),start:ports.start},
 };
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_connected_configuration_panel_and_dcr_native_unverified',blocks,box,ports,module_ports,switches,routes,
  metrics:{blocks:blocks.length,dcr_blocks:parent.blocks.length,panel_and_connection_blocks:blocks.length-parent.blocks.length,connected_logical_bits:10,manual_switches:switches.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},
  sources:{'hardware/full-gpu-dcr.mjs':createHash('sha256').update(readFileSync(new URL('./full-gpu-dcr.mjs',import.meta.url))).digest('hex')},
  source_preservation:'Every DCR block is unchanged. New10switch-to-DCR paths are explicit; data/write/reset are real vanilla levers, not external runtime values.',
  launch_sequence:['Keep START off; assert RESET until all future core/global reset acknowledgements settle.','Load ROM and data while no GPU request is active.','Lower RESET and wait full clamp/control release. Set all8thread bits; WRITE high, then low, then wait closed DCR and readback.','Keep WRITE low and DCR data/RESET stable; raise START and hold until physical DONE.','Lower START, then RESET before another launch.'],
  complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,missing:['Dispatcher/global reset/START sinks, ready/done/fault indicators.','Live UI labels, safe operator access and actual world placement.','Native DCR/panel initialization/reset/write/hold/launch checks.','No interlock prevents an operator from changing DCR during a kernel; stable configuration is the explicit original launch contract.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeConfigPanel();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
