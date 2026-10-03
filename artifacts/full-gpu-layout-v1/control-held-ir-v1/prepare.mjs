// Pure connected held-instruction candidate. No services, native calls or world plans.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {makeOpcodeMatrix,checkOpcodeMatrix} from '../control/opcode-matrix.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,A=['x','y','z'];
const V={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]},F={east:'west',west:'east',north:'south',south:'north'};
const step=(p,d,n=1)=>P(p.x+V[d][0]*n,p.y,p.z+V[d][1]*n);
const H=b=>createHash('sha256').update(b).digest('hex');
export const FIELDS={rd:[8,9,10,11],rs:[4,5,6,7],rt:[0,1,2,3],branch_mask:[9,10,11],immediate:[0,1,2,3,4,5,6,7]};
function expand(w){const out=[P(...w[0])];for(let i=1;i<w.length;i++){const a=w[i-1],b=w[i],d=b.map((x,j)=>x-a[j]),n=Math.abs(d[0])+Math.abs(d[2]);assert(n>0&&(!d[0]||!d[2])&&(d[1]===0||Math.abs(d[1])===n));for(let j=1;j<=n;j++)out.push(P(...a.map((x,k)=>x+Math.sign(d[k])*j)));}return out;}
export function makeHeldIR(){
 const parent=makeOpcodeMatrix();checkOpcodeMatrix(parent);
 const map=new Map(parent.blocks.map(b=>[K(b.position),{...structuredClone(b),part:'opcode_matrix'}]));
 const edges=[],routes=[],cells=[],lockBranches=[],fieldBits=[],parentKeys=new Set(map.keys());
 const edge=(a,b,kind='signal')=>edges.push({from:a,to:b,kind});
 function put(p,id,properties,part){const block={id:'minecraft:'+id,...(properties?{properties}:{})},old=map.get(K(p));if(old){assert.deepEqual(old.block,block,'collision '+K(p));return;}map.set(K(p),{position:p,block,part});}
 const solid=(p,part)=>put(p,'light_gray_concrete',undefined,part);
 const dev=(p,id,props,part)=>{solid(P(p.x,p.y-1,p.z),part+'_support');put(p,id,props,part);};
 const wire=(p,part)=>dev(p,'redstone_wire',undefined,part);
 const rep=(p,d,part,delay=1)=>dev(p,'repeater',{facing:F[d],delay:String(delay)},part);
 const join=(ps,kind)=>{for(let i=1;i<ps.length;i++)edge(ps[i-1],ps[i],kind);};
 // Fixed route waypoint replay. Refresh only on flat straight cells; corners are dust.
 function route(name,w,{force={},lastRepeater=false}={}){
  const path=expand(w),refresh=[],strength=[];let power=15;
  for(let i=0;i<path.length;i++){
   const p=path[i],old=map.get(K(p));
   if(old){assert.equal(old.block.id,'minecraft:redstone_wire','route endpoint/shared dust '+name+' '+K(p));power=15;}
   else{
    const prev=path[i-1],next=path[i+1],flat=prev&&next&&prev.y===p.y&&next.y===p.y&&p.x-prev.x===next.x-p.x&&p.z-prev.z===next.z-p.z;
    const refreshNow=flat&&(power<=4||force[i]!==undefined||(lastRepeater&&i===path.length-2));
    if(refreshNow){const d=Object.keys(V).find(d=>K(step(p,d))===K(next));rep(p,d,name,force[i]??1);refresh.push(i);power=15;}
    else{wire(p,name);power--;assert(power>0,'attenuated route '+name+' '+i);}
   }
   strength.push(power);
  }
  join(path,name);routes.push({name,path,refresh_indices:refresh,minimum_high_power:Math.min(...strength),nominal_repeater_ticks:refresh.reduce((n,i)=>n+2*Number(map.get(K(path[i])).block.properties.delay),0)});return path;
 }
 // Eight mirrored pairs. The opcode cells nearest the matrix avoid route crossings.
 const idsLeft=[0,1,2,3,4,5,14,12],idsRight=[6,7,8,9,10,11,15,13];
 for(let side=0;side<2;side++)for(let row=0;row<8;row++){
  const bit=(side?idsRight:idsLeft)[row],z=-80+8*row,dx=side?-1:1,x=side?12:0,d=side?'west':'east',out=side?'east':'west';
  const input=P(x-2*dx,1,z),driver=P(x+dx,1,z),store=P(x+2*dx,1,z),q=P(x+3*dx,1,z),lock=P(store.x,1,z+1),branch=P(side?7:5,1,z+2),terminal=P(side?17:-5,1,z-2);
  wire(input,'instruction_input');rep(P(x-dx,1,z),d,'input_isolator');wire(P(x,1,z),'local_data');rep(driver,d,'normalized_data');rep(store,d,'ir_storage');wire(q,'ir_q');
  join([input,P(x-dx,1,z),P(x,1,z),driver,store,q],'ir_data_'+bit);
  rep(P(q.x,1,z-1),'north','q_isolator');edge(q,P(q.x,1,z-1));
  const path=[];for(let i=0;i<=6;i++){const p=P(q.x+(side?1:-1)*i,1,z-2);wire(p,'q_route');path.push(p);}join([P(q.x,1,z-1),...path]);
  rep(P(terminal.x-(side?1:-1),1,z-2),out,'q_export');wire(terminal,'q_terminal');edge(path.at(-1),P(terminal.x-(side?1:-1),1,z-2));edge(P(terminal.x-(side?1:-1),1,z-2),terminal);
  rep(lock,'north','ir_lock');edge(lock,store,'lock_side');
  const branchDirection=side?'east':'west';rep(branch,branchDirection,'lock_branch');const lockDust=(side?[8,9,10]:[4,3,2]).map(x=>P(x,1,z+2));lockDust.forEach(p=>wire(p,'lock_dust'));join([P(6,1,z+2),branch,...lockDust,lock]);
  lockBranches.push({bit,rail:P(6,1,z+2),branch,direction:branchDirection,first_wire:lockDust[0],lock,storage:store});
  cells.push({bit,input,driver,storage:store,lock,q,terminal,row,side});
  if(bit<12){const aliases=Object.entries(FIELDS).flatMap(([name,bs])=>bs.map((b,i)=>b===bit?{name,bit:i}:null).filter(Boolean));
   for(let j=0;j<aliases.length;j++){
    const dz=j?-2:0,pad=P(terminal.x+(side?2:-2),1,terminal.z+dz);
    if(j){rep(P(terminal.x,1,terminal.z-1),'north','field_split');wire(P(terminal.x,1,terminal.z-2),'field_split_pad');edge(terminal,P(terminal.x,1,terminal.z-1));edge(P(terminal.x,1,terminal.z-1),P(terminal.x,1,terminal.z-2));}
    rep(P(pad.x-(side?1:-1),1,pad.z),out,'field_terminal_isolator');wire(pad,'field_terminal');join([P(terminal.x,1,pad.z),P(pad.x-(side?1:-1),1,pad.z),pad]);
    fieldBits.push({...aliases[j],instruction_bit:bit,position:pad,travel:out,high_power:15});
   }
  }
 }
 cells.sort((a,b)=>a.bit-b.bit);
 // Active-high physical IR-open arrives here; inverted default-low closes every bit.
 const openPad=P(6,1,-87);wire(openPad,'ir_open_pad');rep(P(6,1,-86),'south','ir_open_isolator');solid(P(6,1,-85),'hold_inverter_support');solid(P(6,0,-85),'hold_inverter_floor');put(P(6,1,-84),'redstone_wall_torch',{facing:'south'},'hold_inverter');wire(P(6,1,-83),'hold_source_pad');rep(P(6,1,-82),'south','hold_source');join([openPad,P(6,1,-86),P(6,1,-85)],'open_inversion');join([P(6,1,-84),P(6,1,-83),P(6,1,-82)]);
 let previous=P(6,1,-82),power=15;const holdRail=[];
 for(let z=-81;z<=-22;z++){const p=P(6,1,z);if(z>=-69&&(z+69)%12===0){rep(p,'south','hold_refresh');power=15;}else{wire(p,'hold_rail');if(map.get(K(previous)).block.id==='minecraft:redstone_wire')power--;}assert(power>0);edge(previous,p);previous=p;holdRail.push({position:p,minimum_high_power:power});}
 // Non-crossing four opcode feeds. Each destination has its original isolator.
 for(const [bit,x,endz]of[[12,-8,0],[14,-12,12],[13,20,0],[15,24,12]]){
  const source=cells[bit].terminal,dest=parent.ports.opcode.bits[bit-12].position;
  route('opcode_'+(bit-12),[[source.x,1,source.z],[x,1,source.z],[x,1,endz],[dest.x,1,endz]],{lastRepeater:true});
 }
 // Three subtract gates implement A=R&!F, V=T& A, O=F&!(R|T).
 function gate(name,x,z,d,sideNames){const center=P(x,1,z),rear=step(center,d,-2),inRep=step(center,d,-1),outRep=step(center,d),outPad=step(center,d,2);
  wire(rear,name+'_rear');rep(inRep,d,name+'_input');dev(center,'comparator',{facing:F[d],mode:'subtract'},name);rep(outRep,d,name+'_output');wire(outPad,name+'_pad');join([rear,inRep,center,outRep,outPad],name);
  const sides={};for(const [label,sign]of sideNames){const pad=P(x,1,z+2*sign),diode=P(x,1,z+sign);wire(pad,name+'_'+label);rep(diode,sign<0?'south':'north',name+'_mask');join([pad,diode,center],name+'_mask');sides[label]=pad;}return{center,rear,out:outPad,sides};}
 const admitted=gate('qualified_request',70,-132,'east',[['fetch',-1]]),valid=gate('decode_valid',90,-100,'west',[['not_admitted',-1]]),open=gate('physical_ir_open',50,-100,'east',[['request',-1],['tail',1]]);
 const r=P(40,1,-140),f=P(40,1,-148);wire(r,'decode_request_terminal');wire(f,'fetch_open_request_terminal');
 route('request_to_admit',[[40,1,-140],[60,1,-140],[60,1,-132],[68,1,-132]]);
 route('request_to_open_mask',[[40,1,-140],[40,1,-110],[50,1,-110],[50,1,-102]],{lastRepeater:true});
 route('fetch_to_admit_mask',[[40,1,-148],[70,1,-148],[70,1,-134]],{lastRepeater:true});
 const fpath=expand([[40,1,-148],[32,1,-148],[32,1,-100],[48,1,-100]]),forced={};
 for(let z=-145;z<=-118;z+=3){const i=fpath.findIndex(p=>p.x===32&&p.z===z);forced[i]=4;}
 route('fetch_to_open_delayed',[[40,1,-148],[32,1,-148],[32,1,-100],[48,1,-100]],{force:forced});
 // A is inverted on a separately isolated branch to clear valid promptly on cancellation.
 route('admit_to_inverter',[[72,1,-132],[74,1,-132],[74,1,-124],[75,1,-124]]);
 rep(P(76,1,-124),'east','admit_inverter_input');solid(P(77,1,-124),'admit_inverter_support');solid(P(77,0,-124),'admit_inverter_floor');put(P(78,1,-124),'redstone_wall_torch',{facing:'east'},'not_admitted');wire(P(79,1,-124),'not_admitted_pad');join([P(75,1,-124),P(76,1,-124),P(77,1,-124)]);edge(P(78,1,-124),P(79,1,-124));
 route('not_admit_to_valid_mask',[[79,1,-124],[80,1,-124],[80,1,-110],[90,1,-110],[90,1,-102]],{lastRepeater:true});
 route('admit_to_delay',[[72,1,-132],[79,1,-132]]);
 const delay=[];for(let x=80;x<144;x++){const p=P(x,1,-132);rep(p,'east','request_delay',4);delay.push(p);}join([P(79,1,-132),...delay,P(144,1,-132)],'request_delay');wire(P(144,1,-132),'request_tail');
 route('tail_to_valid',[[144,1,-132],[144,1,-100],[92,1,-100]]);
 route('tail_to_open_mask',[[144,1,-100],[144,1,-94],[50,1,-94],[50,1,-98]],{lastRepeater:true});
 route('open_to_bank',[[52,1,-100],[56,5,-100],[56,5,-91],[6,5,-91],[6,1,-87]]);
 const ports={instruction_data:{direction:'input',width:16,bits:cells.map(c=>({bit:c.bit,position:c.input}))},fetch_open_request:{direction:'input',width:1,bits:[{bit:0,position:f}]},decode_request:{direction:'input',width:1,bits:[{bit:0,position:r}]},decode_valid:{direction:'output',width:1,bits:[{bit:0,position:valid.out,high_power:15}]},ir_open:{direction:'output',width:1,bits:[{bit:0,position:openPad}]},request_tail:{direction:'output',width:1,bits:[{bit:0,position:P(144,1,-132),high_power:15}]},controls:structuredClone(parent.ports.controls)};
 for(const[name,bs]of Object.entries(FIELDS))ports[name]={direction:'output',width:bs.length,bits:fieldBits.filter(b=>b.name===name).sort((a,b)=>a.bit-b.bit)};
 for(const v of Object.values(ports)){v.polarity='active_high';v.bit_order='LSB_first';v.geometry_status='connected_local_component_native_unverified';}
 const blocks=[...map.values()],box={from:{},to:{}},histogram={};for(const a of A){box.from[a]=Math.min(...blocks.map(b=>b.position[a]));box.to[a]=Math.max(...blocks.map(b=>b.position[a]));}for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 return{status:'connected_held_ir_component_offline_native_unverified',coordinate_frame:'local_no_site',blocks,box,ports,cells,fieldBits,lockBranches,holdRail,routes,edges,barrier:{qualified_request:admitted,valid,open,delay_cells:delay,delay_repeater_game_ticks:512,truth:{admitted:'R && !F',tail:'physical delayed admitted',valid:'T && admitted',ir_open:'F && !R && !T'},fetch_path_slow_repeaters:10},metrics:{blocks:blocks.length,opcode_matrix_blocks:parent.blocks.length,added_blocks:blocks.length-parent.blocks.length,stored_instruction_bits:16,field_terminal_bits:23,controls:11,dimensions:Object.fromEntries(A.map(a=>[a,box.to[a]-box.from[a]+1])),histogram},native_acceptance:false,complete_gpu:false,parent_positions_unchanged:parentKeys.size,missing:['Physical fetch transaction/PC/controller producers and intermodule fanout.','Measured settle/open/close margins and qualified architectural action gates.','Global reset/abort flushing producer.'],protocol:{capture:'R=0; after full prior tail return low, assert F with stable instruction. Observe all16 locks open, settle data, lower F, hold data until all16 locks closed.',decode:'After F low and IR closed, raise R and hold through V high. IR remains closed while request/tail high; all architectural effects remain gated until measured V admission.',release:'After UPDATE and all LSU/ALU responses drained, lower R. V clears on short path; tail drains. Only after complete normal request handshake may F reopen; physical R/T inhibit remains in the OPEN gate.',reset:'Suppress effects, hold F=R=0 for full observed delay drain. Then write instruction zero through F and close. Request pulses aborted before V require complete fixed-pipeline flush; no arbitrary rapid rearm promise.'},timing:{measured:false,delay_is_candidate_not_acceptance:512,native_gate:'Measure from actual last IR closure to all11 controls/23 fields settled. Nominal delay must exceed observed worst bound with margin; no current automatic timing certificate.',initialization:'Real input conditioning under invalid/action-inhibit is still required. Default block properties do not establish initial locks/torch states.',within_tick_hazards_unproved:true}};
}

export function checkHeldIR(d){
 const m=new Map(d.blocks.map(b=>[K(b.position),b]));assert.equal(m.size,d.blocks.length);const parent=makeOpcodeMatrix();for(const b of parent.blocks)assert.deepEqual(m.get(K(b.position)).block,b.block);
 const allowed=new Set(d.edges.map(e=>[K(e.from),K(e.to)].sort().join('|'))),newCells=d.blocks.filter(b=>b.part!=='opcode_matrix');let supportChecks=0,contacts=0,sideChecks=0;
 const attachment={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]};
 for(const b of newCells){if(b.block.id.endsWith('_concrete'))continue;let p=P(b.position.x,b.position.y-1,b.position.z);if(b.block.id==='minecraft:redstone_wall_torch'){const [x,z]=attachment[b.block.properties.facing];p=P(b.position.x+x,b.position.y,b.position.z+z);}assert.equal(m.get(K(p))?.block.id,'minecraft:light_gray_concrete','support '+K(b.position));supportChecks++;}
 for(const b of newCells.filter(b=>b.block.id==='minecraft:redstone_wire'))for(const[dx,dz]of Object.values(V))for(const dy of [-1,0,1]){
  const p=P(b.position.x+dx,b.position.y+dy,b.position.z+dz),v=m.get(K(p));if(!v||v.block.id.endsWith('_concrete'))continue;if(dy&&v.block.id!=='minecraft:redstone_wire')continue;
  if(dy===1&&m.has(K(P(b.position.x,b.position.y+1,b.position.z))))continue;if(dy===-1&&m.has(K(P(p.x,p.y+1,p.z))))continue;
  assert(allowed.has([K(b.position),K(p)].sort().join('|')),'unexpected dust contact '+K(b.position)+' '+K(p));contacts++;
 }
 for(const b of newCells.filter(b=>['minecraft:repeater','minecraft:comparator'].includes(b.block.id))){const d=Object.keys(F).find(d=>F[d]===b.block.properties.facing),[x,z]=V[d];for(const[dx,dz]of[[z,x],[-z,-x]]){const p=P(b.position.x+dx,b.position.y,b.position.z+dz),v=m.get(K(p));if(v&&['minecraft:repeater','minecraft:comparator'].includes(v.block.id))assert(allowed.has([K(b.position),K(p)].sort().join('|')),'unplanned side input '+K(b.position));sideChecks++;}}
 for(const b of d.lockBranches){assert.equal(K(step(b.branch,b.direction,-1)),K(b.rail));assert.equal(K(step(b.branch,b.direction)),K(b.first_wire));assert.equal(m.get(K(b.branch)).block.properties.facing,F[b.direction]);assert.equal(m.get(K(b.lock)).block.properties.facing,'south');assert.equal(K(step(b.lock,'north')),K(b.storage));}
 const gateDirections={qualified_request:'east',decode_valid:'west',physical_ir_open:'east'};
 for(const g of [d.barrier.qualified_request,d.barrier.valid,d.barrier.open]){
  const b=m.get(K(g.center)),dir=gateDirections[b.part];assert.equal(b.block.id,'minecraft:comparator');assert.equal(b.block.properties.mode,'subtract');assert.equal(b.block.properties.facing,F[dir]);
  for(const offset of [-1,1])assert.equal(m.get(K(step(g.center,dir,offset))).block.properties.facing,F[dir]);
  for(const pad of Object.values(g.sides)){const toward=pad.z<g.center.z?'south':'north',p=step(pad,toward);assert.equal(K(step(p,toward)),K(g.center));assert.equal(m.get(K(p)).block.properties.facing,F[toward]);}
 }
 for(let i=0;i<d.barrier.delay_cells.length;i++){const p=d.barrier.delay_cells[i],b=m.get(K(p));assert.equal(b.block.properties.facing,'west');assert.equal(b.block.properties.delay,'4');if(i)assert.equal(K(step(d.barrier.delay_cells[i-1],'east')),K(p));}
 for(const r of d.routes){assert(r.minimum_high_power>0);for(const i of r.refresh_indices){const p=r.path[i],next=r.path[i+1],dir=Object.keys(F).find(d=>F[d]===m.get(K(p)).block.properties.facing);assert.equal(K(step(p,dir)),K(next),'route diode backwards');}}
 assert.equal(d.cells.length,16);assert.equal(d.fieldBits.length,23);assert.equal(d.barrier.delay_cells.length,64);assert.equal(d.barrier.fetch_path_slow_repeaters,10);
 let oracleFields=0;for(let word=0;word<65536;word++)for(const[name,bits]of Object.entries(FIELDS)){const routed=d.ports[name].bits.reduce((n,b)=>n+((word>>>b.instruction_bit)&1)*2**b.bit,0);const source=name==='immediate'?word&255:name==='branch_mask'?(word>>>9)&7:(word>>>{rt:0,rs:4,rd:8}[name])&15;assert.equal(routed,source);oracleFields++;}
 const routeDelay=n=>d.routes.find(r=>r.name===n).nominal_repeater_ticks;
 // Component nominal tick sums only; wires/neighbor scheduling/actual loading are unmeasured.
 const fToOpen=routeDelay('fetch_to_open_delayed')+6;
 const fToValidClear=routeDelay('fetch_to_admit_mask')+6+routeDelay('admit_to_inverter')+4+routeDelay('not_admit_to_valid_mask')+6;
 const tToValidClear=routeDelay('tail_to_valid')+6;
 const tailRoute=d.routes.find(r=>r.name==='tail_to_valid'),branchIndex=tailRoute.path.findIndex(p=>K(p)==='144,1,-100');
 const tailBranchDelay=tailRoute.refresh_indices.filter(i=>i<branchIndex).reduce((n,i)=>n+2*Number(m.get(K(tailRoute.path[i])).block.properties.delay),0);
 const tToOpen=tailBranchDelay+routeDelay('tail_to_open_mask')+6;
 assert(fToOpen>fToValidClear);assert(tToOpen>tToValidClear);
 let truthCases=0;for(const R of [0,1])for(const F of [0,1])for(const T of [0,1]){const a=Math.max(15*R-15*F,0),v=Math.max(15*T-(a?0:15),0),o=Math.max(15*F-Math.max(15*R,15*T),0);assert(!(v&&o));assert.equal(!!v,!!(R&&!F&&T));assert.equal(!!o,!!(F&&!R&&!T));truthCases++;}
 return{status:'offline_geometry_direction_and_field_checks_passed',...d.metrics,parent_cells_unchanged:parent.blocks.length,supportChecks,new_dust_contacts:contacts,diode_side_faces:sideChecks,lock_branches_direction_checked:16,field_word_cases:oracleFields,barrier_static_cases:truthCases,nominal_only:{F_to_open:fToOpen,F_to_valid_clear:fToValidClear,T_to_valid_clear:tToValidClear,T_to_open:tToOpen,qualifier_delay:512},native_calls:0,service_constructors:0,limits:['No dynamic Minecraft simulation/native result.','Nominal delay and source-derived gate truth do not prove loaded settle or hazard freedom.','Request must complete then drain; aborted short requests require reset flush.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=makeHeldIR(),report=checkHeldIR(d);if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(new URL('design.json',import.meta.url))),d);else{writeFileSync(new URL('design.json',import.meta.url),JSON.stringify(d)+'\n');writeFileSync(new URL('offline-check.json',import.meta.url),JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));}
