// Four physically separate striped writable banks. No channel controller implied.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeDataBank64} from './memory-layout-data-bank.mjs';
export function makeDataBacking256(){
 const source=makeDataBank64(),blocks=[],banks=[],ports={},occupied=new Set();
 for(let bank=0;bank<4;bank++){
  const origin={x:128*(bank%2),y:0,z:176*Math.floor(bank/2)},T=p=>({x:p.x+origin.x,y:p.y,z:p.z+origin.z});
  for(const v of source.blocks){const p=T(v.position),key=`${p.x},${p.y},${p.z}`;assert(!occupied.has(key));occupied.add(key);blocks.push({position:p,block:v.block,bank});}
  const pp=Object.fromEntries(Object.entries(source.ports).map(([n,p])=>[n,{...p,positions:p.positions.map(T)}]));banks.push({bank,origin,source_blocks:source.blocks.length,ports:pp});for(const[n,p]of Object.entries(pp))ports['bank'+bank+'_'+n]=p;
 }
 const box={from:{},to:{}};for(const a of['x','y','z']){box.from[a]=blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity);box.to[a]=blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity);}
 const columns=new Set(blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`));
 return{status:'offline_full256x8_writable_backing_four_banks_no_channel_fabric_yet',blocks,banks,ports,box,address_mapping:{bank:'address & 3',bank_address:'address >> 2',card:'bank_address >> 4',row:'bank_address & 15'},metrics:{blocks:blocks.length,logical_bits:2048,bytes:256,independent_backing_banks:4,ports_per_bank:{address:6,write_data:8,write_open:1,read_data:8},dimensions:Object.fromEntries(['x','y','z'].map(a=>[a,box.to[a]-box.from[a]+1])),occupied_chunk_columns:columns.size,legal_overworld_origin_y_range:[-64-box.from.y,319-box.to.y]},missing:['Four owned-channel requester selection/payload/response stores, complete request/ready/reset/drain controller and all producer/consumer routes.','Original arbitrary-channel plus bank-arbiter contract baseline remains; a fused bank-owned four-channel variant is authorized only as unselected comparison.','Complete loader/initialization sequence through these physical write ports and native read/write/retention/timing proof.'],native_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const d=makeDataBacking256();writeFileSync(join(out,'design.json'),JSON.stringify(d)+'\n');writeFileSync(join(out,'ports.json'),JSON.stringify(d.ports,null,2)+'\n');console.log(JSON.stringify(d.metrics));}
