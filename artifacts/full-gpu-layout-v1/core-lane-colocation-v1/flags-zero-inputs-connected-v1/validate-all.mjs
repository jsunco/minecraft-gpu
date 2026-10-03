import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const H=new URL('./',import.meta.url),hash=n=>createHash('sha256').update(readFileSync(new URL(n,H))).digest('hex');
const before=hash('design.json'),checks=[];
const required=[
 ['sources','original-functions'],
 ['repair-lock-approaches','lock-repair',[],['repaired-parent-design.json','lock-repair-arrivals.json']],
 ['cut-census','cut-census',[],['exact-cut-bindings.json']],
 ['check','checks',[],['cut-ledger.json']],
 ['arrival-obligations','arrival-obligations'],
 ['function-check','function-checks'],
 ['lock-repair-functions','lock-repair-functions',['--final']],
 ['timing-and-composition','timing-and-composition'],
 ['lock-repair-timing','lock-repair-timing'],
 ['costs','costs'],
 ['external-approaches','external-approaches'],
 ['external-memory-approaches','external-memory-approaches'],
 ['external-program-approaches','external-program-approaches'],
 ['cold-input-boundary','cold-input-boundary']
];
for(const[name,output,args=[],additional=[]]of required){
 const fd=openSync(new URL(name+'.log',H),'w');
 const r=spawnSync(process.execPath,['--max-old-space-size=8192',fileURLToPath(new URL(name+'.mjs',H)),...args],{stdio:['ignore',fd,fd]});closeSync(fd);
 assert.equal(r.status,0,'Validation failed '+name);assert.equal(hash('design.json'),before);
 checks.push({name,checker:name+'.mjs',checker_sha256:hash(name+'.mjs'),arguments:args,output:output+'.json',output_sha256:hash(output+'.json'),additional_outputs:Object.fromEntries(additional.map(n=>[n,hash(n)])),exit_status:0});
 console.log(JSON.stringify({passed:name}));
}
const out={status:'all_required_checks_passed_against_one_unchanged_full_map',design_sha256:before,checks,native_acceptance:false,complete_core:false};
writeFileSync(new URL('validation-run.json',H),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,design_sha256:before,checks:checks.length}));
