// Offline 34-bit decoded-field latch bank; no native calls or placement plans.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const K=p=>`${p.x},${p.y},${p.z}`,p=(x,y,z)=>({x,y,z}),axes=['x','y','z'];
const facing={east:'west',west:'east',north:'south',south:'north'},travel={west:[1,0],east:[-1,0],south:[0,-1],north:[0,1]};
export const FIELDS=[['rd',4],['rs',4],['rt',4],['branch_mask',3],['immediate',8],['reg_write',1],['mem_read',1],['mem_write',1],['nzp_write',1],['reg_input_mux',2],['arithmetic_mux',2],['compare',1],['pc_mux',1],['ret',1]];
export function makeDecodeLatches(){
 const cells=new Map(),edges=[],bits=[],lockPaths=[];
 const put=(x,y,z,id,properties,part)=>{const position=p(x,y,z),block={id:'minecraft:'+id,...(properties?{properties}:{})};assert(!cells.has(K(position)),'duplicate '+K(position));cells.set(K(position),{position,block,part});};
 const solid=(x,y,z,part)=>put(x,y,z,'light_gray_concrete',undefined,part);
 const dev=(x,z,id,props,part)=>{solid(x,0,z,part+'_support');put(x,1,z,id,props,part);};
 const wire=(x,z,part)=>dev(x,z,'redstone_wire',undefined,part);
 const rep=(x,z,d,part)=>dev(x,z,'repeater',{facing:facing[d],delay:'1'},part);
 const edge=(a,b,kind='directed_signal')=>edges.push({from:a,to:b,kind});
 const data=[];for(const[name,n]of FIELDS)for(let b=0;b<n;b++)data.push({field:name,field_bit:b});assert.equal(data.length,34);
 for(let i=0;i<34;i++){
   const right=i>=17,z=8*(i%17),dx=right?-1:1,d=right?'west':'east',x=right?12:0,driver=x+dx,store=x+2*dx,q=x+3*dx;
   const input=p(x-2*dx,1,z),output=p(right?17:-5,1,z-2);
   wire(input.x,z,'data_input');rep(x-dx,z,d,'data_isolator');wire(x,z,'local_data_pad');rep(driver,z,d,'normalized_data');rep(store,z,d,'storage');wire(q,z,'local_q');
   for(const[a,b]of[[input,p(x-dx,1,z)],[p(x-dx,1,z),p(x,1,z)],[p(x,1,z),p(driver,1,z)],[p(driver,1,z),p(store,1,z)],[p(store,1,z),p(q,1,z)]])edge(a,b);
   // Row pitch8 leaves separate north output and south locking corridors.
   rep(q,z-1,'north','q_isolator');edge(p(q,1,z),p(q,1,z-1));
   const outDirection=right?'east':'west',outDx=right?1:-1;
   for(let n=0;n<=6;n++){wire(q+outDx*n,z-2,'q_route');edge(n?p(q+outDx*(n-1),1,z-2):p(q,1,z-1),p(q+outDx*n,1,z-2));}
   rep(q+outDx*7,z-2,outDirection,'output_isolator');wire(output.x,z-2,'output_terminal');
   edge(p(q+outDx*6,1,z-2),p(q+outDx*7,1,z-2));edge(p(q+outDx*7,1,z-2),output);
   rep(store,z+1,'north','storage_lock');edge(p(store,1,z+1),p(store,1,z),'lock_side');
   const xs=right?[8,9,10]:[4,3,2],branch=right?7:5;
   rep(branch,z+2,d,'lock_branch');edge(p(6,1,z+2),p(branch,1,z+2));
   let prev=p(branch,1,z+2);for(const xx of xs){wire(xx,z+2,'lock_dust');edge(prev,p(xx,1,z+2));prev=p(xx,1,z+2);}edge(prev,p(store,1,z+1));
   bits.push({bit:i,...data[i],input,output,normalized_data:p(driver,1,z),storage:p(store,1,z),lock:p(store,1,z+1),q_pad:p(q,1,z),output_isolator:p(q+outDx*7,1,z-2)});
   lockPaths.push({bit:i,rail_tap:p(6,1,z+2),branch:p(branch,1,z+2),lock:p(store,1,z+1)});
 }
 // active-high DECODE_OPEN is inverted once: default low strongly closes all cells.
 wire(6,-7,'decode_open_terminal');rep(6,-6,'south','decode_open_isolator');solid(6,1,-5,'decode_open_inverter_support');solid(6,0,-5,'decode_open_inverter_floor');
 put(6,1,-4,'redstone_wall_torch',{facing:'south'},'hold_inverter');wire(6,-3,'hold_inverter_output');rep(6,-2,'south','hold_source');
 edge(p(6,1,-7),p(6,1,-6));edge(p(6,1,-6),p(6,1,-5),'strong_power_inverter');edge(p(6,1,-4),p(6,1,-3));edge(p(6,1,-3),p(6,1,-2));
 let prev=p(6,1,-2),power=15,minPower=15;
 const rail=[];
 for(let z=-1;z<=130;z++){
   if(z>=11&&(z-11)%12===0){rep(6,z,'south','hold_refresh');power=15;}
   else{wire(6,z,'hold_rail');if(cells.get(K(prev)).block.id==='minecraft:redstone_wire')power--;assert(power>0);minPower=Math.min(minPower,power);}
   edge(prev,p(6,1,z));prev=p(6,1,z);rail.push({position:prev,closed_high_power:power});
 }
 const blocks=[...cells.values()],box={from:{},to:{}},histogram={};for(const a of axes){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 for(const v of blocks)histogram[v.block.id]=(histogram[v.block.id]??0)+1;
 return {status:'complete_34bit_latch_component_geometry_native_unverified',box,blocks,bits,edges,rail,lockPaths,
   ports:{decoded_data:{direction:'input',width:34,polarity:'active_high',bit_order:'FIELDS order, each LSB-first',bits:bits.map(v=>({bit:v.bit,field:v.field,field_bit:v.field_bit,position:v.input}))},decode_open:{direction:'input',width:1,polarity:'active_high',bits:[{bit:0,position:p(6,1,-7)}]},decoded_q:{direction:'output',width:34,polarity:'active_high',bit_order:'FIELDS order, each LSB-first',bits:bits.map(v=>({bit:v.bit,field:v.field,field_bit:v.field_bit,position:v.output,high_power:15}))}},
   metrics:{blocks:blocks.length,stored_bits:34,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),minimum_hold_rail_power:minPower,histogram},
   source_sha256:{'hardware/dense-register-word.mjs':createHash('sha256').update(readFileSync(new URL('../../../hardware/dense-register-word.mjs',import.meta.url))).digest('hex')},
   inheritance:'Same normalized-driver, storage-repeater, perpendicular-lock and diode-fed lock branch as accepted dense word. Wider row pitch8 leaves isolated Q exports; clock/IO extension is new.',
   protocol:{open:'All34 D bits stable first; DECODE_OPEN high opens all locks after propagation; hold until slowest stored bit settles.',close:'DECODE_OPEN low; hold every D bit until farthest lock is closed. Only then change instruction/opcode.',reset:'No asynchronous reset clamp. With all effects suppressed, present zero instruction/zero decoder outputs, open to clear, close and wait. Default input=0 alone does not establish initialization.'},
   complete_gpu:false,native_acceptance:false,missing:['34 incoming field/control routes from instruction/opcode matrix.','34 outgoing instruction-field/control fanout routes.','Physical DECODE_OPEN producer and measured open/close/delay handshake.'],
   timing:{measured:false,hazard_free:false,positive_lock_arrival:'10 trunk refresh repeaters maximum, plus input inverter/source and local branch/lock; not a measured skew bound. Direction changes must remain blanked.'}};
}
export function checkDecodeLatches(d){
 const cells=new Map(d.blocks.map(v=>[K(v.position),v]));assert.equal(cells.size,d.blocks.length);const allowed=new Set(d.edges.map(e=>[K(e.from),K(e.to)].sort().join('|')));let supports=0,dustFaces=0,sideChecks=0;
 for(const v of d.blocks){if(v.block.id==='minecraft:light_gray_concrete')continue;const at=v.block.id==='minecraft:redstone_wall_torch'?p(v.position.x,1,v.position.z-1):p(v.position.x,0,v.position.z);assert.equal(cells.get(K(at))?.block.id,'minecraft:light_gray_concrete','support '+K(v.position));supports++;}
 for(const v of d.blocks.filter(v=>v.block.id==='minecraft:redstone_wire'))for(const[dx,dz]of Object.values(travel)){
   const q=p(v.position.x+dx,1,v.position.z+dz),other=cells.get(K(q));if(!other)continue;
   if(other.block.id!=='minecraft:light_gray_concrete'){assert(allowed.has([K(v.position),K(q)].sort().join('|')),'foreign dust contact '+K(v.position)+' '+K(q));dustFaces++;}
 }
 for(const b of d.bits){
   assert.equal(cells.get(K(b.storage)).block.id,'minecraft:repeater');assert.equal(cells.get(K(b.lock)).block.properties.facing,'south');
   assert.equal(b.lock.x,b.storage.x);assert.equal(b.lock.z,b.storage.z+1);
   assert.equal(cells.get(K(b.output_isolator)).block.id,'minecraft:repeater');
 }
 for(const v of d.blocks.filter(v=>v.block.id==='minecraft:repeater')){
   const[dx,dz]=travel[v.block.properties.facing];for(const[sx,sz]of[[dz,dx],[-dz,-dx]]){const q=p(v.position.x+sx,1,v.position.z+sz),n=cells.get(K(q));if(n?.block.id==='minecraft:repeater')assert(allowed.has([K(v.position),K(q)].sort().join('|'))&&v.part==='storage'&&n.part==='storage_lock','unexpected side lock');sideChecks++;}
 }
 assert.equal(d.bits.length,34);assert.equal(new Set(d.bits.map(v=>K(v.storage))).size,34);assert(d.metrics.minimum_hold_rail_power>0);
 return{status:'offline_geometry_support_direct_contacts_and_lock_ports_checked',...d.metrics,supports,dust_contact_faces:dustFaces,diode_side_faces:sideChecks,native_calls:0,
   limits:['No loaded dynamic timing or arbitrary input/clock races simulated.','Output routes and wide HOLD fanout are new physical derivatives, not inherited native acceptance.','External instruction/opcode/clock/fanout routes remain absent.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeDecodeLatches(),r=checkDecodeLatches(d);if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(new URL('decode-latches.json',import.meta.url))),d);else writeFileSync(new URL('decode-latches.json',import.meta.url),JSON.stringify(d)+'\n');console.log(JSON.stringify(r,null,2));}
