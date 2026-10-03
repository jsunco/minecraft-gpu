// Sparse offline coordinate assembly. Never applies the result to Minecraft.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const axes=['x','y','z'],K=p=>axes.map(k=>p[k]).join(','),directions=['north','east','south','west'];
export function rotatePosition(p,quarters){let {x,y,z}=p;for(let i=0;i<quarters;i++)[x,z]=[-z,x];return{x:x||0,y:y||0,z:z||0};}
export function transformBlock(block,quarters){const next=structuredClone(block);if(!next.properties)return next;const before=block.properties,out={...before};
 for(const name of directions)delete out[name];
 for(const[name,value]of Object.entries(before)){if(directions.includes(name))out[directions[(directions.indexOf(name)+quarters)%4]]=value;else if(name==='facing'&&directions.includes(value))out[name]=directions[(directions.indexOf(value)+quarters)%4];else if(name==='axis'&&quarters%2&&['x','z'].includes(value))out[name]=value==='x'?'z':'x';}
 next.properties=out;return next;
}
export function materializeInstance(d,{id,translation,quarter_turns=0}){
 assert(Number.isInteger(quarter_turns)&&quarter_turns>=0&&quarter_turns<4);assert(axes.every(a=>Number.isSafeInteger(translation[a])));
 const at=p=>{const q=rotatePosition(p,quarter_turns);return Object.fromEntries(axes.map(a=>[a,q[a]+translation[a]]));};
 const blocks=d.blocks.map(v=>({position:at(v.position),block:transformBlock(v.block,quarter_turns),instance:id}));
 // Port metadata contains several physical coordinates, not just its terminal.
 // Travel is a direction vector; all other {x,y,z} values are positions.
 const point=value=>value&&typeof value==='object'&&axes.every(a=>Number.isSafeInteger(value[a]));
 const portBit=b=>Object.fromEntries(Object.entries(b).map(([key,value])=>[key,
  key==='travel'&&typeof value==='string'&&directions.includes(value)?directions[(directions.indexOf(value)+quarter_turns)%4]:
  point(value)?(key==='travel'?rotatePosition(value,quarter_turns):at(value)):structuredClone(value)]));
 const ports=Object.fromEntries(Object.entries(d.ports).map(([name,p])=>[name,{...p,bits:p.bits.map(portBit)}]));
 return{id,blocks,ports,source_native_acceptance:d.native_acceptance===true,geometry_status:'materialized_offline_no_external_routes'};
}
export function assemble(instances){const cells=new Map(),histogram={};let portBits=0;for(const i of instances){for(const v of i.blocks){assert(!cells.has(K(v.position)),'Component collision '+K(v.position));assert(v.position.y>=-64&&v.position.y<=319,'Build-height violation');cells.set(K(v.position),v);histogram[v.block.id]=(histogram[v.block.id]??0)+1;}portBits+=Object.values(i.ports).reduce((n,p)=>n+p.width,0);}
 const blocks=[...cells.values()],box={from:Object.fromEntries(axes.map(a=>[a,blocks.reduce((n,v)=>Math.min(n,v.position[a]),Infinity)])),to:Object.fromEntries(axes.map(a=>[a,blocks.reduce((n,v)=>Math.max(n,v.position[a]),-Infinity)]))};
 const chunks=[...new Set(blocks.map(v=>`${Math.floor(v.position.x/16)},${Math.floor(v.position.z/16)}`))].sort();
 return{status:'partial_offline_geometry_not_complete_gpu',box,blocks,instances:instances.map(({blocks,...i})=>({...i,block_count:blocks.length})),metrics:{blocks:blocks.length,histogram,actual_occupied_chunk_columns:chunks.length,occupied_chunk_columns:chunks,port_bits:portBits},external_wire_routes:[],complete_gpu_layout:false,native_acceptance:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=process.argv[2];assert(out);mkdirSync(out,{recursive:true});const instances=[];
 for(let core=0;core<2;core++)for(let lane=0;lane<4;lane++){
  const d=JSON.parse(readFileSync(new URL(`../artifacts/full-gpu-layout-v1/registers/lane${lane}.json`,import.meta.url)));
  // Candidate positions only. core0/lane1 preserves original parent coordinates.
  instances.push(materializeInstance(d,{id:`gpu/core${core}/lane${lane}/registers`,translation:{x:1+128*core+64*(lane%2),y:-60,z:1+64*Math.floor(lane/2)}}));
 }
 const a=assemble(instances);a.placement_status='Provisional register positions only; ALU/memory/control geometry and every intermodule route still absent. Not a world plan or reserved site.';
 writeFileSync(join(out,'register-array.partial.json'),JSON.stringify(a)+'\n');writeFileSync(join(out,'register-array-summary.json'),JSON.stringify({status:a.status,box:a.box,metrics:a.metrics,placement_status:a.placement_status,complete_gpu_layout:false,native_acceptance:false},null,2)+'\n');
 console.log(JSON.stringify({status:a.status,blocks:a.metrics.blocks,port_bits:a.metrics.port_bits,box:a.box,occupied_chunks:a.metrics.actual_occupied_chunk_columns}));
}
