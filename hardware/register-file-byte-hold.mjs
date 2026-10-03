// Offline-only observation/stimulus extension. No geometry or frozen job changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRegisterFileByte,makeRegisterFileByteTests} from './register-file-byte.mjs';
const sources={
 'register-file-byte.mjs':'0c873b3076e3067d227e911367bb86aa43f53275f1e995c2fc4d933178932070',
 'register-file-bits.mjs':'36ee68055503a96221bb408b063a4302eaf5b30d65f2093519b0709a42f6a536',
};
const sha=b=>createHash('sha256').update(b).digest('hex');
export function makeRegisterFileByteHold(design=makeRegisterFileByte()){
 for(const [file,hash]of Object.entries(sources))assert.equal(sha(readFileSync(new URL(file,import.meta.url))),hash,'Frozen source changed');
 assert.deepEqual(design,makeRegisterFileByte({origin:design.origin,id:design.id}),'Require canonical frozen byte geometry');
 const original=makeRegisterFileByteTests(design),jobs=[],circuits=[];
 for(let pair=0;pair<4;pair++){
  const bits=[pair*2,pair*2+1],local=[];
  for(let word=0;word<4;word++)for(const bit of bits){
   const position={x:design.origin.x+22+48*bit,y:design.origin.y+1+16*word,z:design.origin.z+6};
   const block=design.blocks.find(b=>['x','y','z'].every(k=>b.position[k]===position[k]));
   assert.deepEqual(block?.block,{id:'minecraft:repeater',properties:{facing:'west',delay:'1'}},'Expected actual normalized D repeater');
   local.push({name:`local_data${word}_${bit}`,position,property:'powered'});
  }
  // Original reset/hold diagnostic views remain required. This separate view
  // trades their eight read-inhibit probes for the eight local data repeaters.
  const inherited=design.diagnostic_circuits[pair].signals.filter(s=>!/^far_(rs|rt)_inhibit/.test(s.name));
  assert.equal(inherited.length,56);
  const circuit={...structuredClone(design.diagnostic_circuits[pair]),id:`${design.id}_hold${pair}`,description:`Conditional byte RF settled local-D hold for slices ${bits.join(',')}`,signals:[...structuredClone(inherited),...local]};
  assert.equal(circuit.signals.length,64);assert.equal(new Set(circuit.signals.map(s=>s.name)).size,64);
  const source=original.jobs.find(j=>j.name===`diagnostic_hold_pair${pair}`).spec;
  const cases=source.cases.flatMap(c=>{
   const value=structuredClone(c);value.expect=Object.fromEntries(inherited.map(s=>[s.name,c.expect[s.name]]));
   for(const probe of local)value.expect[probe.name]=+value.inputs[`d${probe.name.split('_').at(-1)}`];
   return /^hold_d(?:55|aa)_200$/.test(c.name)?[{...structuredClone(value),name:c.name.replace('hold_','prepare_')},value]:[value];
  });
  const spec={...structuredClone(source),circuit_id:circuit.id,cases};assert.equal(spec.inputs.length,16);assert.equal(cases.length,20);assert.equal(spec.settle_ticks,200);
  for(const name of ['hold_d55_200','hold_daa_200']){const index=cases.findIndex(c=>c.name===name);assert.equal(cases[index-1].name,name.replace('hold_','prepare_'));assert.deepEqual(cases[index].inputs,cases[index-1].inputs);}
  circuits.push(circuit);jobs.push({name:`settled_local_hold_pair${pair}`,view:`local_hold_pair${pair}`,selected_bits:bits,spec});
 }
 return {status:'conditional_offline_prepared_not_run',geometry_modified:false,source_modules:sources,circuits,jobs,
  trace_acceptance:{required:true,original_jobs_required:34,new_jobs_required:4,total_jobs:38,total_phases:690,total_expectations:19462,
   prerequisites:'All15 native two-slice jobs, including its new actual local-D hold extension, must pass before byte placement. All34 original byte jobs remain required unchanged. This extension does not repair or replace a failing physical circuit.',
   hold_window:'For hold_d55_200 and hold_daa_200, require an immediately preceding same-address/same-data/same-control prepare phase with identical full16-input map. At every sampled state from the prepare assertion through the hold endpoint, all8 selected local D probes must match the commanded bits, all8 selected locks must remain1, all8 clamps0, and all8 Q values must retain their prepared values. Require at least200 elapsed sampled native ticks after the hold post-input checkpoint; missing ticks, unknown states, or shorter durations fail.',
   coverage:'The preloaded words85,170,85,170 and unchanged D55/DAA hold intervals give every selected cell actual opposite local D in one complete interval. Require both holds in each of4views, covering all32 stored bits collectively. These views cannot observe all32 locks,clamps,Q and localD simultaneously within64probes.',
   ordering:'Keep normal prepare/write/close discipline, with unchanged D/WA while closing. Prove selected local locks high with positive sampled margin before later D/WA changes. On closed reset release, each local lock must rise strictly before its clamp falls and Q must stay0; same-tick edges are inconclusive and fail. Preserve original diagnostic reset-release gates.',
   final:'Each job explicitly resets/releases and restores16source controls; freshly observe cleared storage/locked state and all16 actual off lever structures afterward. Native trace completion/restoration/source evidence and independent full-stage analysis remain required.',
   scope:'Original byte hold jobs prove retention during200 commanded-data ticks; distribution delay occupies part of that interval. This additional prepared view can test200 already-settled opposite local-D ticks only after native traces pass. End-of-tick sampling cannot exclude within-tick glitches, and exact sequential input-write timestamps are unavailable. No native timing, full13-word lane, operand-controller, or GPU completion is claimed.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const output=process.argv[2];assert(output,'Usage: node hardware/register-file-byte-hold.mjs NEW_DIRECTORY');const value=makeRegisterFileByteHold();mkdirSync(output,{recursive:false});
 const files={'test-manifest.json':{status:value.status,geometry_modified:false,jobs:value.jobs},'trace-acceptance.json':value.trace_acceptance,...Object.fromEntries(value.circuits.map((c,i)=>[`circuit-${i}.json`,c])),...Object.fromEntries(value.jobs.map(j=>[`test-${j.name}.json`,j.spec]))};
 for(const [name,v]of Object.entries(files))writeFileSync(join(output,name),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 const manifest={status:value.status,geometry_modified:false,native_calls:0,generator_sha256:sha(readFileSync(new URL(import.meta.url))),source_modules:sources,jobs:4,phases:80,expectations:5120,signals_per_view:64,inputs:16,requested_ticks_per_job:4000,files:Object.fromEntries(Object.keys(files).map(n=>[n,sha(readFileSync(join(output,n)))]))};
 writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({jobs:4,phases:80,expectations:5120,geometry_modified:false,native_calls:0}));
}
