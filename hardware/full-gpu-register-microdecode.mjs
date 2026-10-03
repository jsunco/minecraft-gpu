// Physical control-word OR matrix over the32-state decoder. Offline only.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {makeStateDecoder} from './full-gpu-state-decoder.mjs';
import {step} from '../artifacts/full-gpu-layout-v1/register-sequencer-v1/microprogram.mjs';
const P=(x,y,z)=>({x,y,z}),K=p=>`${p.x},${p.y},${p.z}`,F={east:'west',west:'east',north:'south',south:'north'};
export const GROUPS={prime_ff:[1],ra_counter:[3,4],ra_rs:[21,22,23],ra_rt:[24,25,26],wa_counter:[6,7,8,9],writeback_source:[27,28,29],assign_source:[10,11,12,30],open_gpr_reset:[7],open_gpr_normal:[28],open_assign:[11],open_a_reset:[14],open_b_reset:[17],open_a_normal:[22],open_b_normal:[25],reset_ack:[19],event_ack:[31],counter_increment_intent:[4,9],counter_zero:[0,5],boot_set:[0],boot_clear:[19],branch_sweep:[4],branch_zero:[9],branch_reset_wait:[19],branch_idle:[20],branch_assign_finish:[30],branch_event_wait:[31]};
const branchStates=new Set([4,9,19,20,30,31]);
export function makeRegisterMicrodecode({uniformOutputs=false}={}){
 const parent=makeStateDecoder(),map=new Map(parent.blocks.map(v=>[K(v.position),structuredClone(v)])),groups=structuredClone(GROUPS),rows=[],columns=[];let part='';
 for(let bit=0;bit<5;bit++)groups['fixed_next_'+bit]=Array.from({length:32},(_,s)=>s).filter(s=>!branchStates.has(s)&&(step(s,false,0,{lanes:0,reset:false,req:false,kind:0,rs:0,rt:0,rd:0,reg_write:false}).state>>bit&1));
 // Identical truth columns share physical storage-free sources and terminal.
 const unique=new Map();for(const[name,states]of Object.entries(groups)){const signature=states.join(',');if(!unique.has(signature))unique.set(signature,{states,names:[]});unique.get(signature).names.push(name);}
 function put(p,id,properties){assert(!map.has(K(p)),'Collision '+K(p));map.set(K(p),{position:p,block:{id:'minecraft:'+id,...(properties?{properties}:{})},part});}
 const solid=p=>put(p,'light_gray_concrete'),dev=(p,id,props)=>{solid({...p,y:p.y-1});put(p,id,props);},wire=p=>dev(p,'redstone_wire'),rep=(p,d)=>dev(p,'repeater',{facing:F[d],delay:'1'});
 const ports={state:parent.ports.state};
 for(const [j,group] of [...unique.values()].entries()){
  const x=20+4*j,firstY=uniformOutputs?1:1+8*Math.min(...group.states),lastY=uniformOutputs?249:1+8*Math.max(...group.states),outputY=lastY+3;part='microcolumn_'+j;
  for(let y=firstY;y<=lastY+2;y++){if(y%2)solid(P(x,y,4));else put(P(x,y,4),'redstone_torch');}solid(P(x,firstY-1,4));put(P(x,outputY,4),'redstone_torch');rep(P(x,outputY,3),'north');wire(P(x,outputY,2));
  const port={direction:'output',width:1,polarity:'active_high',bit_order:'lsb_first',bits:[{bit:0,position:P(x,outputY,2),source:P(x,outputY,3),travel:P(0,0,-1)}]};
  for(const name of group.names)ports[name]=structuredClone(port);
  columns.push({x,z:4,names:group.names,states:group.states,first_y:firstY,last_y:lastY,output_y:outputY,terminal:P(x,outputY,2)});
 }
 for(let state=0;state<32;state++){
  const selected=columns.filter(c=>c.states.includes(state));if(!selected.length)continue;const y=1+8*state,maxX=Math.max(...selected.map(c=>c.x));part='microstate_row_'+state;
  const path=[P(15,y,6)];for(let x=16;x<=maxX;x++){if((x-18)%12===0)rep(P(x,y,6),'east');else wire(P(x,y,6));path.push(P(x,y,6));}
  for(const c of selected)rep(P(c.x,y,5),'north');rows.push({state,path,taps:selected.map(c=>P(c.x,y,5))});
 }
 const blocks=[...map.values()],box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=Math.min(...blocks.map(v=>v.position[a]));box.to[a]=Math.max(...blocks.map(v=>v.position[a]));}
 return{status:'offline_register_control_decode_matrix_native_unverified',uniformOutputs,blocks,ports,columns,rows,box,metrics:{blocks:blocks.length,decoder_blocks:parent.blocks.length,matrix_additions:blocks.length-parent.blocks.length,semantic_controls:Object.keys(groups).length,physical_shared_columns:columns.length,dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1]))},groups,source:{state_decoder:createHash('sha256').update(readFileSync(new URL('./full-gpu-state-decoder.mjs',import.meta.url))).digest('hex'),microprogram:createHash('sha256').update(readFileSync(new URL('../artifacts/full-gpu-layout-v1/register-sequencer-v1/microprogram.mjs',import.meta.url))).digest('hex')},complete_component_geometry:true,complete_gpu_layout:false,native_acceptance:false,missing:['Conditional next-state/boot/address sources; fivefixed_next outputs intentionally exclude6branchingstates.','The decoded OPEN intents are never direct architectural gates: require phaseA, initialized/blanking, mode/lane/regwrite qualification and actual fanout.','Counter source selectors and address/data paths, state feedback, phase clock and initialization conditioning sweep.','Every control-row return has unmeasured variable torch-column delay; stable/close timing cannot be inferred from counts.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeRegisterMicrodecode();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');console.log(JSON.stringify(d.metrics));}
