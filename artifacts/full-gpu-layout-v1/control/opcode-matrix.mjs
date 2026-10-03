// Pure whole-layout component. No native or service imports; no test-world plans.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeAddressDecoder4} from '../../../hardware/address-decoder4.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const H=x=>createHash('sha256').update(x).digest('hex'),K=p=>`${p.x},${p.y},${p.z}`;
const axes=['x','y','z'],dirs={east:[1,0],west:[-1,0],north:[0,-1],south:[0,1]},facing={east:'west',west:'east',north:'south',south:'north'};
const p=(x,y,z)=>({x,y,z}),shift=(a,dx=0,dy=0,dz=0)=>p(a.x+dx,a.y+dy,a.z+dz);
export const OUTPUTS=[
 ['reg_write',[3,4,5,6,7,9]],['mem_read',[7]],['mem_write',[8]],['nzp_write',[2]],
 ['reg_input_mux_0',[7]],['reg_input_mux_1',[9]],['arithmetic_mux_0',[4,6]],
 ['arithmetic_mux_1',[5,6]],['compare',[2]],['pc_mux',[1]],['ret',[15]]
];

export function makeOpcodeMatrix(){
 const parent=makeAddressDecoder4({origin:p(0,0,0),id:'gpu_opcode_source'});
 const map=new Map(parent.blocks.map(v=>[K(v.position),{...structuredClone(v),part:'one_hot_parent'}]));
 const parentMap=new Map([...map].map(([k,v])=>[k,structuredClone(v.block)]));
 const connections=[],replacements=[],inputBits=[],outputBits=[],towers=[],rows=[];
 function put(x,y,z,id,properties,part){const position=p(x,y,z),block={id:'minecraft:'+id,...(properties?{properties}:{})};const old=map.get(K(position));if(old){assert.deepEqual(old.block,block,'collision '+K(position));return;}map.set(K(position),{position,block,part});}
 const solid=(x,y,z,part)=>put(x,y,z,'light_gray_concrete',undefined,part);
 function device(x,y,z,id,props,part){solid(x,y-1,z,part+'_support');put(x,y,z,id,props,part);}
 const wire=(x,y,z,part)=>device(x,y,z,'redstone_wire',undefined,part);
 const rep=(x,y,z,d,part)=>device(x,y,z,'repeater',{facing:facing[d],delay:'1'},part);
 // Replace exactly the four old fixture sources; preserve their support/receiver.
 for(let bit=0;bit<4;bit++){
   const pos=parent.inputs[bit].position,sign=pos.x<0?-1:1,d=sign<0?'east':'west';
   const old=map.get(K(pos));assert.equal(old.block.id,'minecraft:lever');
   replacements.push({position:pos,from:old.block,to:{id:'minecraft:redstone_wire'}});
   old.block={id:'minecraft:redstone_wire'};old.part='opcode_source_pad';
   rep(pos.x+sign,pos.y,pos.z,d,'opcode_input_isolator');wire(pos.x+2*sign,pos.y,pos.z,'opcode_input_terminal');
   inputBits.push({bit,position:p(pos.x+2*sign,pos.y,pos.z),source_pad:pos,isolator:p(pos.x+sign,pos.y,pos.z),travel:d,high_power:15});
 }
 // y=1+8*opcode is the same positive polarity on every tower injection plane.
 for(let j=0;j<OUTPUTS.length;j++){
   const [name,ops]=OUTPUTS[j],x=14+4*j,z=4;
   for(let y=1;y<=123;y++)if(y%2)solid(x,y,z,'control_or_support');else put(x,y,z,'redstone_torch',undefined,'control_or_inverter');
   solid(x,0,z,'control_or_base');put(x,124,z,'redstone_torch',undefined,'control_or_final_positive');
   rep(x,124,z-1,'north','control_output_isolator');wire(x,124,z-2,'control_output_terminal');
   outputBits.push({name,position:p(x,124,z-2),isolator:p(x,124,z-1),source:p(x,124,z),travel:'north',high_power:15});
   towers.push({name,x,z,ops,positive_injection_y:ops.map(op=>1+8*op),final_positive_torch_y:124});
 }
 for(let op=0;op<16;op++){
   const selected=OUTPUTS.map(([name,ops],j)=>({name,ops,j})).filter(c=>c.ops.includes(op));
   if(!selected.length)continue;
   const y=1+8*op,maxX=14+4*Math.max(...selected.map(c=>c.j));let previous=p(9,y,6),power=15,delay=0,least=15,devices=[];
   for(let x=10;x<=maxX;x++){
     if(x>=12&&(x-12)%12===0){rep(x,y,6,'east','opcode_row_refresh');power=15;delay+=2;}
     else{wire(x,y,6,'opcode_row_wire');if(previous.x!==9&&map.get(K(previous)).block.id==='minecraft:redstone_wire')power--;least=Math.min(least,power);assert(power>0);}
     connections.push({from:previous,to:p(x,y,6),kind:'opcode_row'});previous=p(x,y,6);devices.push({position:previous,high_power:power,added_nominal_ticks:delay});
   }
   for(const col of selected){
     const x=14+4*col.j;rep(x,y,5,'north','control_or_tap');
     connections.push({from:p(x,y,6),to:p(x,y,5),kind:'isolated_branch'},{from:p(x,y,5),to:p(x,y,4),kind:'strong_power_positive_or_injection'});
   }
   rows.push({opcode:op,y,last_x:maxX,minimum_dust_power:least,devices,taps:selected.map(c=>({name:c.name,position:p(14+4*c.j,y,5)}))});
 }
 const blocks=[...map.values()],box={from:{},to:{}};
 for(const a of axes){box.from[a]=Math.min(...blocks.map(b=>b.position[a]));box.to[a]=Math.max(...blocks.map(b=>b.position[a]));}
 const histogram={};for(const b of blocks)histogram[b.block.id]=(histogram[b.block.id]??0)+1;
 const touched=new Set(replacements.map(x=>K(x.position)));
 for(const [k,v]of parentMap)if(!touched.has(k))assert.deepEqual(map.get(k).block,v,'parent changed '+k);
 return{status:'complete_opcode_to_control_geometry_offline_unverified',coordinate_frame:'local_only_no_site',box,blocks,
   metrics:{blocks:blocks.length,parent_blocks:parent.blocks.length,additions:blocks.length-parent.blocks.length,source_replacements:4,dimensions:Object.fromEntries(axes.map(a=>[a,box.to[a]-box.from[a]+1])),histogram},
   ports:{opcode:{direction:'input',width:4,polarity:'active_high',bit_order:'LSB_first',bits:inputBits,stable:'Held until all output fields settle and the DECODE latch closes.'},
          controls:{direction:'output',width:11,polarity:'active_high',bit_order:OUTPUTS.map(v=>v[0]),bits:outputBits,stable:'Combinational. Never open an architectural write directly from these outputs.'}},
   rows,towers,connections,replacements,
   source_sha256:{'hardware/address-decoder4.mjs':H(readFileSync(root+'hardware/address-decoder4.mjs')),'hardware/register-file.mjs':H(readFileSync(root+'hardware/register-file.mjs'))},
   complete_gpu:false,native_acceptance:false,
   missing:['Instruction16 response latch and physical four-bit opcode wiring.','23 decoded field wires +34-bit combined output latches and DECODE clock/non-overlap.','All downstream control fanout and routing; only terminal ports are complete.'],
   timing:{measured:false,initialization:'Prime all16 opcodes with every architectural action inhibited; previous decoder placement needed real input transitions.',hazard_free:false,nominal_added_path:'Refresher count*2 + tap2 + remaining torch inversions from injection to y124 + output diode2; different opcodes have different delay. Measure worst-case rise/fall/settling before DECODE latch.',torch_burnout:'Do not clock opcode input rapidly from a free-running high-rate loop. Component timing and all16 conditioned transitions remain native gates.'}};
}

export function checkOpcodeMatrix(d){
 const cells=new Map(d.blocks.map(v=>[K(v.position),v]));assert.equal(cells.size,d.blocks.length);
 let supportChecks=0;const attachment={east:[-1,0],west:[1,0],north:[0,1],south:[0,-1]};
 for(const v of d.blocks){const b=v.block;if(b.id==='minecraft:light_gray_concrete')continue;let pos=shift(v.position,0,-1,0);if(b.id==='minecraft:redstone_wall_torch'){const[x,z]=attachment[b.properties.facing];pos=shift(v.position,x,0,z);}assert.equal(cells.get(K(pos))?.block.id,'minecraft:light_gray_concrete','support '+K(v.position));supportChecks++;}
 // Enumerate all new dust contacts to non-support components. Parent contacts are
 // checked separately by preservation, not called a complete redstone simulator.
 const intended=new Set(d.connections.filter(x=>x.kind!=='strong_power_positive_or_injection').map(c=>[K(c.from),K(c.to)].sort().join('|')));
 for(const bit of d.ports.opcode.bits){intended.add([K(bit.position),K(bit.isolator)].sort().join('|'));intended.add([K(bit.source_pad),K(bit.isolator)].sort().join('|'));const[dx,dz]=dirs[bit.travel];intended.add([K(bit.source_pad),K(shift(bit.source_pad,dx,0,dz))].sort().join('|'));}
 for(const bit of d.ports.controls.bits)intended.add([K(bit.position),K(bit.isolator)].sort().join('|'));
 const newWire=d.blocks.filter(v=>v.block.id==='minecraft:redstone_wire'&&v.part!=='one_hot_parent');
 for(const v of newWire)for(const [dx,dz]of Object.values(dirs)){
   const n=cells.get(K(shift(v.position,dx,0,dz)));if(n&&n.block.id!=='minecraft:light_gray_concrete')assert(intended.has([K(v.position),K(n.position)].sort().join('|')),'foreign new dust contact '+K(v.position)+' > '+K(n.position));
   for(const dy of [-1,1]){const target=shift(v.position,dx,dy,dz),t=cells.get(K(target));if(t?.block.id!=='minecraft:redstone_wire')continue;if(dy===1&&cells.has(K(shift(v.position,0,1,0))))continue;if(dy===-1&&cells.has(K(shift(target,0,1,0))))continue;assert.fail('unplanned new dust slope '+K(v.position)+' > '+K(target));}
 }
 let sideChecks=0;
 for(const v of d.blocks.filter(v=>v.block.id==='minecraft:repeater'&&v.part!=='one_hot_parent')){
   const[dx,dz]=dirs[Object.keys(facing).find(k=>facing[k]===v.block.properties.facing)];
   for(const off of [[dz,dx],[-dz,-dx]]){const n=cells.get(K(shift(v.position,off[0],0,off[1])));assert(!n||!['minecraft:repeater','minecraft:comparator'].includes(n.block.id),'side diode can lock '+K(v.position));sideChecks++;}
 }
 let oracleBits=0;
 for(let op=0;op<16;op++)for(const tower of d.towers){
   // Source-derived positive-polarity tower recurrence, independent of output
   // gate list comparison: each odd block can be powered from below or the tap.
   let lowerTorch=false,lastTorch=false;
   for(let y=1;y<=123;y+=2){const injection=tower.ops.some(o=>y===1+8*o&&o===op);const blockPowered=lowerTorch||injection;lastTorch=!blockPowered;lowerTorch=lastTorch;}
   assert.equal(Number(lastTorch),Number(OUTPUTS.find(v=>v[0]===tower.name)[1].includes(op)),'OR polarity '+tower.name);oracleBits++;
 }
 assert(d.rows.every(r=>r.minimum_dust_power>0));assert.equal(d.ports.opcode.bits.length,4);assert.equal(d.ports.controls.bits.length,11);
 return {status:'offline_geometry_contacts_and_static_polarity_checked',...d.metrics,supportChecks,new_dust_cells_checked:newWire.length,diode_side_checks:sideChecks,static_opcode_control_bits:oracleBits,native_calls:0,
   limits:['Not a general Minecraft electrical simulator.','Support/block-power faces and dynamic multi-input/torch scheduling still require independent review and native characterization.','No physical output latches or downstream action-enable routes included.']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const d=makeOpcodeMatrix(),report=checkOpcodeMatrix(d);
 if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(new URL('opcode-matrix.json',import.meta.url))),d);
 else writeFileSync(new URL('opcode-matrix.json',import.meta.url),JSON.stringify(d)+'\n');
 console.log(JSON.stringify(report,null,2));
}
