import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {makeRegisterFileBits} from './register-file-bits.mjs';

// Separate test preparation: this module adds no geometry and never connects to Minecraft.
export function makeRegisterFileBitsDiagnostics(design){
  const current=makeRegisterFileBits({origin:design.origin,id:design.id});
  for(const field of ['blocks','inputs','circuit','diagnostic_circuit'])if(JSON.stringify(design[field])!==JSON.stringify(current[field]))throw Error(`Design field ${field} does not match the current frozen generator; regenerate or review its provenance`);
  const encode=(d,we,reset,wa,rs,rt)=>({wa0:!!(wa&1),wa1:!!(wa&2),rs0:!!(rs&1),rs1:!!(rs&2),rt0:!!(rt&1),rt1:!!(rt&2),d0:!!(d&1),d1:!!(d&2),write_enable:!!we,reset:!!reset});
  function job(name,settleTicks,body){
    const stored=[0,0,0,0],cases=[];
    const add=(label,d,we,reset,wa=0,rs=0,rt=0)=>{
      const inputs=encode(d,we,reset,wa,rs,rt);if(reset)stored.fill(0);else if(we)stored[wa]=d;
      const expect={};
      for(let word=0;word<4;word++){
        for(let bit=0;bit<2;bit++){expect[`q${word}_${bit}`]=(stored[word]>>bit)&1;expect[`locks${word}_${bit}`]=+(reset?false:!(we&&wa===word));expect[`clamps${word}_${bit}`]=+!!reset;}
        expect[`far_write${word}`]=+(!!we&&wa===word);expect[`far_reset${word}`]=+!!reset;
        expect[`far_rs_inhibit${word}`]=+(rs!==word);expect[`far_rt_inhibit${word}`]=+(rt!==word);
      }
      for(let bit=0;bit<2;bit++){expect[`rs${bit}`]=(stored[rs]>>bit)&1;expect[`rt${bit}`]=(stored[rt]>>bit)&1;}
      for(const {name}of design.inputs)expect[`top_${name}`]=+inputs[name];
      cases.push({name:label,inputs,expect});
    };
    const write=(word,value,tag)=>{add(`${tag}_prepare`,value,0,0,word,word,word);add(`${tag}_write`,value,1,0,word,word,word);add(`${tag}_close`,value,0,0,word,word,word);};
    add('reset_initial',3,0,1);add('release_initial_high_data',3,0,0);body({add,write});add('finish_reset',0,0,1);add('finish_release',0,0,0);
    if(cases.length>24||cases.length*settleTicks>6000)throw Error('diagnostic job exceeds bounded budget');
    return {name,spec:{circuit_id:design.diagnostic_circuit.id,inputs:design.inputs,cases,settle_ticks:settleTicks,timeout_ms:300000,stop_on_failure:true,restore_inputs:true,trace:true}};
  }
  const reset=job('reset_release_diagnostic',160,({add,write})=>{
    write(0,1,'dirty_near');write(3,2,'dirty_far');
    add('reset_closed_d3',3,0,1,3,0,3);add('release_closed_d3',3,0,0,3,0,3);add('hold_closed_d0',0,0,0,3,0,3);
    add('reset_open_d3',3,1,1,2,2,2);add('release_open_d3',3,1,0,2,2,2);add('close_after_open_release',3,0,0,2,2,2);add('hold_after_open_release',0,0,0,0,2,2);
  });
  const hold=job('opposite_data_hold_200',200,({add,write})=>{
    [1,2,1,2].forEach((value,word)=>write(word,value,`preload_${word}`));
    add('hold_d1_200',1,0,0,0,0,3);add('hold_d2_200',2,0,0,3,3,0);
  });
  return {status:'prepared_not_run',geometry_sha256:createHash('sha256').update(readFileSync(new URL('./register-file-bits.mjs',import.meta.url))).digest('hex'),circuit:design.diagnostic_circuit,jobs:[reset,hold],
    trace_acceptance:{required:true,signals:'All54 diagnostic signals; near/far Q, lock, clamp and distribution endpoints',closed_release:'For every bit, verify lock reaches true before clamp becomes false during release_closed_d3, and Q remains0 throughout; use complete end-of-tick traces with no gaps',open_release:'Q may track D after RESET releases while WE remains high; verify only word2 becomes3, then locks close and Q holds3 against D0',hold:'During each200tick hold case all eight stored bits must remain unchanged. D1 andD2 give opposite data to each stored polarity in at least one interval',limits:'Settled assertions are necessary but do not automatically check transient timing; trace analysis is required. End-of-tick traces cannot rule out within-tick pulses.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [output,designPath]=process.argv.slice(2);if(!output)throw Error('Usage: node hardware/register-file-bits-diagnostics.mjs OUTPUT_DIRECTORY [design.json]');
  const design=designPath?JSON.parse(readFileSync(designPath,'utf8')):makeRegisterFileBits(),suite=makeRegisterFileBitsDiagnostics(design);mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'diagnostic-circuit.json'),JSON.stringify(suite.circuit,null,2)+'\n');writeFileSync(join(output,'trace-acceptance.json'),JSON.stringify(suite.trace_acceptance,null,2)+'\n');
  for(const job of suite.jobs)writeFileSync(join(output,`test-${job.name}.json`),JSON.stringify(job.spec,null,2)+'\n');
  writeFileSync(join(output,'manifest.json'),JSON.stringify({status:suite.status,geometry_sha256:suite.geometry_sha256,world_modified:false,jobs:suite.jobs.map(j=>({name:j.name,cases:j.spec.cases.length,settle_ticks:j.spec.settle_ticks}))},null,2)+'\n');
  console.log(JSON.stringify({status:suite.status,world_modified:false,jobs:suite.jobs.map(j=>({name:j.name,cases:j.spec.cases.length,settle_ticks:j.spec.settle_ticks}))}));
}
