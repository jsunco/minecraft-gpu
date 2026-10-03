// Offline-only additional diagnostic view/test; changes no block or frozen spec.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRegisterFileBits} from './register-file-bits.mjs';
import {makeRegisterFileBitsDiagnostics} from './register-file-bits-diagnostics.mjs';
const hashes={'register-file-bits.mjs':'36ee68055503a96221bb408b063a4302eaf5b30d65f2093519b0709a42f6a536','register-file-bits-diagnostics.mjs':'39d91d37b6038cdce6616956cdfb794cb86d897d18cbe1ff290e46e75e68549f'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export function makeRegisterFileBitsHold(design=makeRegisterFileBits()){
 for(const [name,expected]of Object.entries(hashes))assert.equal(sha(readFileSync(new URL(name,import.meta.url))),expected);
 assert.deepEqual(design,makeRegisterFileBits({origin:design.origin,id:design.id}));assert(design.id.length<=27);
 const local=[];for(let word=0;word<4;word++)for(let bit=0;bit<2;bit++){
  const position={x:design.origin.x+22+48*bit,y:design.origin.y+1+16*word,z:design.origin.z+6};
  const block=design.blocks.find(b=>['x','y','z'].every(k=>b.position[k]===position[k]));assert.deepEqual(block.block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}});
  local.push({name:`local_data${word}_${bit}`,position,property:'powered'});
 }
 const circuit={...structuredClone(design.diagnostic_circuit),id:design.id+'_hold',description:'Existing RF two-slice storage and all eight normalized local D repeaters; settled opposite-data hold',signals:[...structuredClone(design.diagnostic_circuit.signals),...local]};assert.equal(circuit.signals.length,62);
 const original=makeRegisterFileBitsDiagnostics(design).jobs.find(j=>j.name==='opposite_data_hold_200').spec,spec=structuredClone(original);spec.circuit_id=circuit.id;
 spec.cases=original.cases.flatMap(c=>{
  const value=structuredClone(c);for(const signal of local)value.expect[signal.name]=+value.inputs[`d${signal.name.at(-1)}`];
  return c.name.startsWith('hold_d')?[{...structuredClone(value),name:c.name.replace('hold_','prepare_')},value]:[value];
 });assert.equal(spec.cases.length,20);assert.equal(spec.settle_ticks,200);
 return {status:'offline_prepared_not_run',geometry_modified:false,source_modules:hashes,circuit,spec,name:'settled_local_opposite_hold_200',
  trace_acceptance:{required:true,scope:'Original fourteen jobs remain required. This additional observation view has eight real normalized D repeater probes and changes no circuitry.',hold:'For each hold_d1_200 / hold_d2_200, require an immediately preceding unchanged-input prepare phase, then every sampled state from post-input checkpoint through at least200 elapsed native ticks has all eight local D probes equal to the commanded byte bits, every storage lock1, every clamp0 and every Q unchanged. Every stored bit must face opposite actual local D in one of the two complete hold windows.',limits:'End-of-tick sampling cannot exclude within-tick glitches. Powered repeater probes are the actual local digital inputs before the storage clamp; top-of-tower values alone do not establish this gate. This is a diagnostic stimulus, not a physical instruction controller.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const output=process.argv[2];assert(output,'Usage: node hardware/register-file-bits-hold.mjs NEW_OUTPUT_DIRECTORY');const v=makeRegisterFileBitsHold();mkdirSync(output,{recursive:false});
 for(const [name,value]of Object.entries({'circuit.json':v.circuit,'test-settled_local_opposite_hold_200.json':v.spec,'trace-acceptance.json':v.trace_acceptance,'manifest.json':{status:v.status,geometry_modified:false,source_modules:v.source_modules,generator_sha256:sha(readFileSync(new URL(import.meta.url))),name:v.name,signals:62,cases:20,expectations:1240,settle_ticks:200}}))writeFileSync(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({prepared:true,native_calls:0,geometry_modified:false,signals:62,cases:20,expectations:1240}));
}
